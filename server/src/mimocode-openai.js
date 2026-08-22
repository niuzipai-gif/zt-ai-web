import crypto from 'node:crypto'
import { CHAT_MODELS } from './contracts/chat.js'

export const MODEL_CATALOG = Object.freeze({
  'zt-minimax-m3': Object.freeze({ provider: 'minimax', label: 'MiniMax M3' }),
  'zt-deepseek-v4-flash': Object.freeze({ provider: 'deepseek', label: 'DeepSeek V4 Flash' }),
})

export function isPrivateDesktopRuntimeRequest(origin) {
  return !origin
}

function textFromContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(part => part && ['text', 'input_text', 'output_text'].includes(part.type))
    .map(part => String(part.text ?? part.input_text ?? part.output_text ?? ''))
    .join('\n')
}

function modelRecord(model) {
  const id = String(model || 'zt-minimax-m3')
  const record = MODEL_CATALOG[id]
  if (!record) throw new Error('不支持该桌面 Agent 模型')
  return { id, ...record }
}

function normalizeTools(tools) {
  return (Array.isArray(tools) ? tools : [])
    .filter(tool => tool?.type === 'function' && typeof (tool.name ?? tool.function?.name) === 'string')
    .slice(0, 64)
    .map(tool => {
      const definition = tool.function && typeof tool.function === 'object' ? tool.function : tool
      return {
        type: 'function',
        function: {
          name: String(definition.name || '').slice(0, 128),
          description: String(definition.description || '').slice(0, 4_000),
          parameters: definition.parameters && typeof definition.parameters === 'object' ? definition.parameters : { type: 'object', properties: {} },
        },
      }
    })
}

function normalizeInput(input) {
  if (typeof input === 'string') return [{ role: 'user', content: input }]
  if (!Array.isArray(input)) return []
  const messages = []
  const pendingToolCalls = []
  for (const item of input.slice(-80)) {
    if (!item || typeof item !== 'object') continue
    if (item.type === 'function_call') {
      const callId = String(item.call_id || item.callId || crypto.randomUUID())
      const name = String(item.name || '')
      if (name) pendingToolCalls.push({ id: callId, type: 'function', function: { name, arguments: String(item.arguments || '{}') } })
      continue
    }
    if (item.type === 'function_call_output') {
      const callId = String(item.call_id || item.callId || '')
      if (callId) messages.push({ role: 'tool', tool_call_id: callId, content: textFromContent(item.output) || String(item.output || '') })
      continue
    }
    if (item.type === 'message') {
      const content = textFromContent(item.content)
      const role = item.role === 'assistant' ? 'assistant' : item.role === 'system' ? 'system' : 'user'
      if (!content && role !== 'assistant') continue
      if (role === 'assistant' && pendingToolCalls.length) {
        messages.push({ role, content, tool_calls: pendingToolCalls.splice(0) })
      } else if (content || role === 'assistant') messages.push({ role, content })
    }
  }
  if (pendingToolCalls.length) {
    const last = messages.at(-1)
    if (last?.role === 'assistant' && !last.tool_calls) last.tool_calls = pendingToolCalls.splice(0)
    else messages.push({ role: 'assistant', content: '', tool_calls: pendingToolCalls.splice(0) })
  }
  return messages
}

function systemMessage(systemPrompt, instructions) {
  return [String(systemPrompt || '').trim(), String(instructions || '').trim()].filter(Boolean).join('\n\n')
}

export function normalizeMiMoResponseRequest(request = {}, { systemPrompt = '' } = {}) {
  const model = modelRecord(request.model)
  const messages = normalizeInput(request.input)
  if (!messages.some(message => message.role === 'user') && !messages.some(message => message.role === 'tool')) throw new Error('Agent 请求缺少输入内容')
  const system = systemMessage(systemPrompt, request.instructions)
  return {
    model: model.provider,
    modelId: model.id,
    messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
    tools: normalizeTools(request.tools),
  }
}

function normalizeLegacyRequest(request = {}, { systemPrompt = '' } = {}) {
  const model = modelRecord(request.model)
  const messages = (Array.isArray(request.messages) ? request.messages : [])
    .slice(-80)
    .filter(message => message && ['system', 'user', 'assistant', 'tool'].includes(message.role))
    .map(message => ({
      role: message.role,
      content: textFromContent(message.content),
      ...(message.tool_call_id ? { tool_call_id: String(message.tool_call_id) } : {}),
      ...(Array.isArray(message.tool_calls) ? { tool_calls: message.tool_calls } : {}),
    }))
  if (!messages.some(message => message.role === 'user') && !messages.some(message => message.role === 'tool')) throw new Error('Agent 请求缺少输入内容')
  const system = systemMessage(systemPrompt, '')
  return { model: model.provider, modelId: model.id, messages: system ? [{ role: 'system', content: system }, ...messages] : messages, tools: normalizeTools(request.tools) }
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`
}

function responseEnvelope(responseId, status, { output = [], createdAt, completedAt = null, model = 'zt-minimax-m3' } = {}) {
  return {
    id: responseId,
    object: 'response',
    created_at: createdAt,
    completed_at: status === 'completed' ? completedAt ?? createdAt : null,
    status,
    error: null,
    incomplete_details: null,
    input: [],
    instructions: null,
    max_output_tokens: null,
    model,
    output,
    parallel_tool_calls: true,
    previous_response_id: null,
    reasoning: { effort: null, summary: null },
    store: false,
    temperature: 0.3,
    text: { format: { type: 'text' } },
    tool_choice: 'auto',
    tools: [],
    top_p: 1,
    truncation: 'disabled',
    usage: status === 'completed'
      ? { input_tokens: 0, input_tokens_details: { cached_tokens: 0 }, output_tokens: 0, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 0 }
      : null,
    user: null,
    metadata: {},
  }
}

function responseEvent(type, data) {
  return { type, data: { ...data, type } }
}

export async function* streamResponseEvents({ request, systemPrompt, streamChat, responseId = id('resp') }) {
  const normalized = normalizeMiMoResponseRequest(request, { systemPrompt })
  const output = []
  let message = null
  let text = ''
  let outputIndex = 0
  const createdAt = Math.floor(Date.now() / 1_000)
  let sequenceNumber = 0
  const event = (type, data) => responseEvent(type, { ...data, sequence_number: ++sequenceNumber })
  yield event('response.created', { response: responseEnvelope(responseId, 'in_progress', { createdAt, model: normalized.modelId }) })

  for await (const item of streamChat(normalized)) {
    if (item?.type === 'text' && item.text) {
      if (!message) {
        message = { id: id('msg'), type: 'message', status: 'in_progress', role: 'assistant', content: [] }
        yield event('response.output_item.added', { output_index: outputIndex, item: message })
      }
      const delta = String(item.text)
      text += delta
      yield event('response.output_text.delta', { item_id: message.id, output_index: outputIndex, content_index: 0, delta })
      continue
    }
    if (item?.type === 'tool_call' && item.name) {
      const tool = {
        id: id('fc'),
        type: 'function_call',
        status: 'in_progress',
        call_id: String(item.id || id('call')),
        name: String(item.name),
        arguments: '',
      }
      yield event('response.output_item.added', { output_index: output.length + (message ? 1 : 0), item: tool })
      const argumentsText = String(item.arguments || '{}')
      yield event('response.function_call_arguments.delta', { item_id: tool.id, output_index: output.length + (message ? 1 : 0), delta: argumentsText })
      tool.arguments = argumentsText
      tool.status = 'completed'
      yield event('response.function_call_arguments.done', { item_id: tool.id, output_index: output.length + (message ? 1 : 0), arguments: argumentsText })
      yield event('response.output_item.done', { output_index: output.length + (message ? 1 : 0), item: tool })
      output.push(tool)
    }
  }

  if (message) {
    message.content = [{ type: 'output_text', text, annotations: [] }]
    message.status = 'completed'
    yield event('response.output_text.done', { item_id: message.id, output_index: 0, content_index: 0, text })
    yield event('response.output_item.done', { output_index: 0, item: message })
    output.unshift(message)
  }
  yield event('response.completed', { response: responseEnvelope(responseId, 'completed', { output, createdAt, completedAt: Math.floor(Date.now() / 1_000), model: normalized.modelId }) })
}

export async function completeMiMoResponse(options) {
  let completed = null
  for await (const frame of streamResponseEvents(options)) {
    if (frame.type === 'response.completed') completed = frame.data.response
  }
  if (!completed) throw new Error('所选模型没有返回完整响应')
  return completed
}

export async function* streamChatCompletionEvents({ request, systemPrompt, streamChat, completionId = id('chatcmpl') }) {
  const normalized = normalizeLegacyRequest(request, { systemPrompt })
  const created = Math.floor(Date.now() / 1_000)
  yield { id: completionId, object: 'chat.completion.chunk', created, model: request.model, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] }
  let calledTool = false
  let index = 0
  for await (const item of streamChat(normalized)) {
    if (item?.type === 'text' && item.text) {
      yield { id: completionId, object: 'chat.completion.chunk', created, model: request.model, choices: [{ index: 0, delta: { content: String(item.text) }, finish_reason: null }] }
      continue
    }
    if (item?.type === 'tool_call' && item.name) {
      calledTool = true
      yield {
        id: completionId,
        object: 'chat.completion.chunk',
        created,
        model: request.model,
        choices: [{ index: 0, delta: { tool_calls: [{ index: index++, id: String(item.id || id('call')), type: 'function', function: { name: String(item.name), arguments: String(item.arguments || '{}') } }] }, finish_reason: null }],
      }
    }
  }
  yield { id: completionId, object: 'chat.completion.chunk', created, model: request.model, choices: [{ index: 0, delta: {}, finish_reason: calledTool ? 'tool_calls' : 'stop' }] }
}

function providerConfig(model, env) {
  if (model === 'deepseek') return {
    baseUrl: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    apiKey: env.DEEPSEEK_API_KEY,
    model: env.DEEPSEEK_TEXT_MODEL || CHAT_MODELS.deepseek,
    extra: { thinking: { type: 'disabled' } },
  }
  return {
    baseUrl: env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1',
    apiKey: env.MINIMAX_API_KEY,
    model: env.MINIMAX_TEXT_MODEL || CHAT_MODELS.minimax,
    extra: { thinking: { type: 'adaptive' } },
  }
}

function createVisibleTextFilter() {
  const openTag = '<think>'
  const closeTag = '</think>'
  let pending = ''
  let hiding = false

  const trailingTagPrefix = (text, tag) => {
    for (let length = Math.min(text.length, tag.length - 1); length > 0; length -= 1) {
      if (text.slice(-length).toLowerCase() === tag.slice(0, length)) return length
    }
    return 0
  }

  return {
    push(chunk) {
      let source = pending + String(chunk || '')
      pending = ''
      let visible = ''
      while (source) {
        if (hiding) {
          const closingAt = source.toLowerCase().indexOf(closeTag)
          if (closingAt >= 0) {
            source = source.slice(closingAt + closeTag.length)
            hiding = false
            continue
          }
          const suffixLength = trailingTagPrefix(source, closeTag)
          pending = suffixLength ? source.slice(-suffixLength) : ''
          return visible
        }
        const openingAt = source.toLowerCase().indexOf(openTag)
        if (openingAt >= 0) {
          visible += source.slice(0, openingAt)
          source = source.slice(openingAt + openTag.length)
          hiding = true
          continue
        }
        const suffixLength = trailingTagPrefix(source, openTag)
        visible += suffixLength ? source.slice(0, -suffixLength) : source
        pending = suffixLength ? source.slice(-suffixLength) : ''
        return visible
      }
      return visible
    },
    finish() {
      const visible = hiding ? '' : pending
      pending = ''
      hiding = false
      return visible
    },
  }
}

export async function* streamGatewayChat({ model, messages, tools }, { fetchImpl = fetch, env = process.env } = {}) {
  const provider = providerConfig(model, env)
  if (!provider.apiKey) throw new Error('所选模型当前不可用')
  let response
  try {
    response = await fetchImpl(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${provider.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: provider.model, messages, tools: tools.length ? tools : undefined, tool_choice: tools.length ? 'auto' : undefined, stream: true, temperature: 0.3, ...provider.extra }),
      signal: AbortSignal.timeout(120_000),
    })
  } catch {
    throw new Error('所选模型暂时无法连接')
  }
  if (!response.ok || !response.body) throw new Error('所选模型暂时无法响应')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const toolCalls = new Map()
  const visibleText = createVisibleTextFilter()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta || {}
          if (delta.content) {
            const text = visibleText.push(delta.content)
            if (text) yield { type: 'text', text }
          }
          for (const call of delta.tool_calls || []) {
            const existing = toolCalls.get(call.index) || { id: call.id || id('call'), name: '', arguments: '' }
            if (call.id) existing.id = call.id
            if (call.function?.name) existing.name += call.function.name
            if (call.function?.arguments) existing.arguments += call.function.arguments
            toolCalls.set(call.index, existing)
          }
        } catch {
          // Ignore an incomplete/provider-specific SSE frame.
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
  const remainingText = visibleText.finish()
  if (remainingText) yield { type: 'text', text: remainingText }
  for (const call of toolCalls.values()) if (call.name) yield { type: 'tool_call', ...call }
}

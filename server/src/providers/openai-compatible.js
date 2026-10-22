const TOOL_START = /<\|(?:tool_?call|function_?call)\|>|<(?:tool_?call|function_?call)>/i
const TOOL_END = /<\|\/(?:tool_?call|function_?call)\|>|<\/(?:tool_?call|function_?call)>/i
const MODEL_MARKER = /<\|(?:minimax|assistant|user|system)\|>/i
const STREAM_MARKERS = ['<think>', '</think>', '<|toolcall|>', '<|tool_call|>', '<|functioncall|>', '<|function_call|>', '<toolcall>', '<tool_call>', '<functioncall>', '<function_call>', '<|minimax|>', '<|assistant|>', '<|user|>', '<|system|>']
const THINK_END_MARKERS = ['</think>']
const TOOL_END_MARKERS = ['<|/toolcall|>', '<|/tool_call|>', '<|/functioncall|>', '<|/function_call|>', '</toolcall>', '</tool_call>', '</functioncall>', '</function_call>']

function suffixPrefixLength(value, markers = STREAM_MARKERS) {
  let longest = 0
  for (const marker of markers) {
    const max = Math.min(marker.length - 1, value.length)
    for (let size = max; size > longest; size -= 1) {
      if (value.endsWith(marker.slice(0, size))) { longest = size; break }
    }
  }
  return longest
}

function nextMarker(value) {
  const candidates = []
  const thinkIndex = value.indexOf('<think>')
  if (thinkIndex !== -1) candidates.push({ index: thinkIndex, length: '<think>'.length, type: 'think' })
  const toolMatch = value.match(TOOL_START)
  if (toolMatch) candidates.push({ index: toolMatch.index, length: toolMatch[0].length, type: 'tool' })
  const modelMatch = value.match(MODEL_MARKER)
  if (modelMatch) candidates.push({ index: modelMatch.index, length: modelMatch[0].length, type: 'marker' })
  return candidates.sort((left, right) => left.index - right.index)[0] || null
}

function createVisibleTextFilter() {
  let pending = ''
  let mode = 'visible'

  function drain(final = false) {
    let visible = ''
    while (pending) {
      if (mode === 'think') {
        const end = pending.indexOf('</think>')
        if (end === -1) {
          const keep = suffixPrefixLength(pending, THINK_END_MARKERS)
          pending = keep ? pending.slice(-keep) : ''
          break
        }
        pending = pending.slice(end + '</think>'.length)
        mode = 'visible'
        continue
      }
      if (mode === 'tool') {
        const end = pending.match(TOOL_END)
        if (!end) {
          const keep = suffixPrefixLength(pending, TOOL_END_MARKERS)
          pending = keep ? pending.slice(-keep) : ''
          break
        }
        pending = pending.slice(end.index + end[0].length)
        mode = 'visible'
        continue
      }
      const marker = nextMarker(pending)
      if (!marker) {
        const keep = suffixPrefixLength(pending)
        visible += pending.slice(0, pending.length - keep)
        pending = pending.slice(pending.length - keep)
        break
      }
      visible += pending.slice(0, marker.index)
      pending = pending.slice(marker.index + marker.length)
      if (marker.type === 'think') mode = 'think'
      else if (marker.type === 'tool') mode = 'tool'
    }
    if (final && mode === 'visible') {
      const keep = suffixPrefixLength(pending)
      visible += pending.slice(0, pending.length - keep)
      pending = ''
    }
    return visible
  }

  return {
    push(value) { pending += String(value || ''); return drain() },
    finish() { return drain(true) },
  }
}

export async function* streamOpenAICompatible({ baseUrl, apiKey, model, messages, extra = {}, fetchImpl = fetch, separateReasoning = false, signal, onMetadata = () => {}, timeoutMs = 90_000 }) {
  const started = Date.now()
  const abort = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])])
  abort.throwIfAborted()
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.7, ...extra }),
    signal: abort,
  })
  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    throw Object.assign(new Error(`上游模型请求失败（${response.status}），请稍后重试。`), { status: response.status, code: 'model_upstream' })
  }
  if (!response.body) throw new Error('上游模型没有返回流')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let reachedEof = false
  let completed = false
  let finishReason = null
  let firstTokenMs = null
  let usage = null
  const count = value => Number.isFinite(value) && value >= 0 ? Math.floor(value) : null
  const textFilter = createVisibleTextFilter()
  const cancelReader = () => { void reader.cancel().catch(() => {}) }
  abort.addEventListener('abort', cancelReader, { once: true })
  try {
    while (true) {
      abort.throwIfAborted()
      const { value, done } = await reader.read()
      abort.throwIfAborted()
      reachedEof = done
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split(/\r?\n/)
      buffer = done ? '' : lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload === '[DONE]') {
          completed = true
          const trailing = separateReasoning ? '' : textFilter.finish()
          if (trailing) yield trailing
          return
        }
        if (!payload) continue
        let json
        try { json = JSON.parse(payload) } catch { throw Object.assign(new Error('模型流数据不完整，请重试。'), { code: 'model_protocol' }) }
          if (json.error) throw Object.assign(new Error('模型服务暂时不可用，请重试。'), { code: 'model_upstream' })
          if (json.usage) usage = { inputTokens: count(json.usage.prompt_tokens), outputTokens: count(json.usage.completion_tokens), cachedTokens: count(json.usage.prompt_tokens_details?.cached_tokens ?? json.usage.cache_read_input_tokens) }
          const reason = json.choices?.[0]?.finish_reason
          if (reason) {
            finishReason = reason
            if (reason !== 'stop') throw Object.assign(new Error(reason === 'length' ? '回答达到长度限制，尚未完成。' : '模型回答未正常完成，请重试。'), { code: reason === 'length' ? 'model_truncated' : 'model_incomplete' })
            completed = true
          }
          const delta = json.choices?.[0]?.delta?.content || ''
          if (typeof delta === 'string' && delta) {
            const visible = separateReasoning ? delta : textFilter.push(delta)
            if (visible) { firstTokenMs ??= Date.now() - started; yield visible }
          }
      }
      if (done) break
    }
  } finally {
    abort.removeEventListener('abort', cancelReader)
    if (!reachedEof) await reader.cancel().catch(() => {})
    reader.releaseLock()
    // Diagnostics must not turn a successful reply into an application error.
    try { onMetadata({ model, finishReason, completed, firstTokenMs, durationMs: Date.now() - started, usage }) } catch {}
  }
  if (!completed) throw Object.assign(new Error('模型连接中断，回答尚未完成，请重试。'), { code: 'model_incomplete' })
  const trailing = separateReasoning ? '' : textFilter.finish()
  if (trailing) yield trailing
}

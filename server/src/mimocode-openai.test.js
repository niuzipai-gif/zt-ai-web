import test from 'node:test'
import assert from 'node:assert/strict'
import { MODEL_CATALOG, completeMiMoResponse, isPrivateDesktopRuntimeRequest, normalizeMiMoResponseRequest, streamChatCompletionEvents, streamGatewayChat, streamResponseEvents } from './mimocode-openai.js'

async function collect(iterable) {
  const values = []
  for await (const value of iterable) values.push(value)
  return values
}

test('normalizes MiMo Responses input into an upstream tool-capable chat request', () => {
  const normalized = normalizeMiMoResponseRequest({
    model: 'zt-deepseek-v4-flash',
    instructions: '保持中文且先给计划。',
    input: [
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: '读取 README.md' }] },
      { type: 'function_call_output', call_id: 'call_1', output: 'README 内容' },
    ],
    tools: [{ type: 'function', name: 'read', description: 'Read one file', parameters: { type: 'object', properties: { file_path: { type: 'string' } } } }],
  }, { systemPrompt: '桌面端工具需要用户授权。' })

  assert.equal(normalized.model, 'deepseek')
  assert.match(normalized.messages[0].content, /桌面端工具需要用户授权/)
  assert.match(normalized.messages[0].content, /保持中文/)
  assert.deepEqual(normalized.messages.slice(1), [
    { role: 'user', content: '读取 README.md' },
    { role: 'tool', tool_call_id: 'call_1', content: 'README 内容' },
  ])
  assert.deepEqual(normalized.tools, [{
    type: 'function',
    function: { name: 'read', description: 'Read one file', parameters: { type: 'object', properties: { file_path: { type: 'string' } } } },
  }])
})

test('rejects models outside the two desktop gateway aliases', () => {
  assert.throws(() => normalizeMiMoResponseRequest({ model: 'gpt-anything', input: 'hi' }), /不支持/)
  assert.deepEqual(Object.keys(MODEL_CATALOG), ['zt-minimax-m3', 'zt-deepseek-v4-flash'])
})

test('only allows the key-bearing bridge from a non-browser desktop runtime request', () => {
  assert.equal(isPrivateDesktopRuntimeRequest(undefined), true)
  assert.equal(isPrivateDesktopRuntimeRequest(''), true)
  assert.equal(isPrivateDesktopRuntimeRequest('https://niuzipai-gif.github.io'), false)
})

test('translates upstream text and a tool call into an OpenAI Responses event stream', async () => {
  const frames = await collect(streamResponseEvents({
    request: { model: 'zt-minimax-m3', input: '读取 README' },
    systemPrompt: '使用本机工具前需要授权。',
    responseId: 'resp_test',
    streamChat: async function* () {
      yield { type: 'text', text: '我先读取文件。' }
      yield { type: 'tool_call', id: 'call_1', name: 'read', arguments: '{"file_path":"README.md"}' }
    },
  }))

  assert.equal(frames[0].type, 'response.created')
  assert.ok(frames.every(frame => frame.data.type === frame.type), 'every streamed Responses payload must repeat its event type for strict clients such as MiMoCode')
  assert.equal(typeof frames[0].data.sequence_number, 'number')
  assert.equal(typeof frames[0].data.response.created_at, 'number')
  assert.equal(frames[0].data.response.model, 'zt-minimax-m3')
  assert.equal(frames[0].data.response.parallel_tool_calls, true)
  assert.ok(frames.some(frame => frame.type === 'response.output_text.delta' && frame.data.delta === '我先读取文件。'))
  assert.ok(frames.some(frame => frame.type === 'response.function_call_arguments.done' && frame.data.arguments.includes('README.md')))
  const done = frames.find(frame => frame.type === 'response.completed')
  assert.equal(done.data.response.id, 'resp_test')
  assert.equal(done.data.response.status, 'completed')
  assert.equal(typeof done.data.response.completed_at, 'number')
  assert.deepEqual(done.data.response.usage, {
    input_tokens: 0,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: 0,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: 0,
  })
  assert.deepEqual(done.data.response.output.map(item => item.type), ['message', 'function_call'])
})

test('collects a valid non-streaming Responses object for compatible clients', async () => {
  const response = await completeMiMoResponse({
    request: { model: 'zt-minimax-m3', input: '你好' },
    responseId: 'resp_sync',
    streamChat: async function* () { yield { type: 'text', text: '你好。' } },
  })
  assert.equal(response.object, 'response')
  assert.equal(response.id, 'resp_sync')
  assert.equal(response.output[0].type, 'message')
  assert.equal(response.output[0].content[0].text, '你好。')
})

test('keeps a legacy Chat Completions stream available for compatible clients', async () => {
  const chunks = await collect(streamChatCompletionEvents({
    request: { model: 'zt-minimax-m3', messages: [{ role: 'user', content: '你好' }] },
    systemPrompt: '执行模式',
    completionId: 'chat_test',
    streamChat: async function* () {
      yield { type: 'text', text: '你好。' }
      yield { type: 'tool_call', id: 'call_2', name: 'read', arguments: '{"file_path":"README.md"}' }
    },
  }))
  assert.equal(chunks[0].id, 'chat_test')
  assert.equal(chunks[0].choices[0].delta.role, 'assistant')
  assert.equal(chunks[1].choices[0].delta.content, '你好。')
  assert.equal(chunks[2].choices[0].delta.tool_calls[0].function.name, 'read')
  assert.equal(chunks.at(-1).choices[0].finish_reason, 'tool_calls')
})

test('gateway bridge forwards tool envelopes to the configured provider without exposing its key', async () => {
  let received
  const chunks = await collect(streamGatewayChat({
    model: 'minimax',
    messages: [{ role: 'user', content: '读取 README.md' }],
    tools: [{ type: 'function', function: { name: 'read', parameters: { type: 'object' } } }],
  }, {
    env: { MINIMAX_API_KEY: 'fixture-only', MINIMAX_BASE_URL: 'https://fixture.invalid/v1', MINIMAX_TEXT_MODEL: 'fixture-model' },
    fetchImpl: async (url, options) => {
      received = { url, options: { ...options, headers: { ...options.headers, authorization: '[redacted]' } } }
      const body = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read","arguments":"{\\"file_path\\":\\"README.md\\"}"}}]}}]}\n\n',
        'data: [DONE]\n\n',
      ].join('')
      return new Response(body, { status: 200 })
    },
  }))
  assert.equal(received.url, 'https://fixture.invalid/v1/chat/completions')
  assert.equal(received.options.headers.authorization, '[redacted]')
  assert.match(received.options.body, /"tools"/)
  assert.deepEqual(chunks, [{ type: 'tool_call', id: 'call_1', name: 'read', arguments: '{"file_path":"README.md"}' }])
})

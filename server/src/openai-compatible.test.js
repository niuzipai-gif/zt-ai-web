import test from 'node:test'
import assert from 'node:assert/strict'
import { streamOpenAICompatible } from './providers/openai-compatible.js'

function sseResponse(parts) {
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      for (const content of parts) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

async function collect(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

test('removes MiniMax tool protocol from visible streaming text', async () => {
  const chunks = await collect(streamOpenAICompatible({
    baseUrl: 'https://provider.test/v1',
    apiKey: 'fixture',
    model: 'fixture-model',
    messages: [{ role: 'user', content: '请回答' }],
    fetchImpl: async () => sseResponse([
      '已经完成资料核验。<|minimax|>',
      '<|toolcall|>{"name":"websearch","arguments":{"query":"ChatGPT"}}',
      '</tool_call>最终回答。',
    ]),
  }))

  assert.equal(chunks.join(''), '已经完成资料核验。最终回答。')
  assert.deepEqual(chunks, ['已经完成资料核验。', '最终回答。'])
  assert.doesNotMatch(chunks.join(''), /toolcall|tool_call|websearch|<\|minimax\|>/i)
})

test('removes alternate tool-call markers and keeps ordinary text', async () => {
  const chunks = await collect(streamOpenAICompatible({
    baseUrl: 'https://provider.test/v1',
    apiKey: 'fixture',
    model: 'fixture-model',
    messages: [{ role: 'user', content: '请回答' }],
    fetchImpl: async () => sseResponse([
      '正常开头',
      '<tool_call>{\'name\':\'web_search\',\'arguments\':{\'query\':\'test\'}}</tool_call>',
      '正常结尾',
    ]),
  }))

  assert.equal(chunks.join(''), '正常开头正常结尾')
  assert.doesNotMatch(chunks.join(''), /toolcall|tool_call|web_search|<tool_call>/i)
})

test('handles tool markers split across provider chunks', async () => {
  const chunks = await collect(streamOpenAICompatible({
    baseUrl: 'https://provider.test/v1',
    apiKey: 'fixture',
    model: 'fixture-model',
    messages: [{ role: 'user', content: '请回答' }],
    fetchImpl: async () => sseResponse([
      '答案开头<|tool',
      'call|>{"name":"websearch","arguments":{}}<|/tool',
      'call|>答案结尾',
    ]),
  }))

  assert.equal(chunks.join(''), '答案开头答案结尾')
  assert.doesNotMatch(chunks.join(''), /toolcall|tool_call|websearch/i)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { MODEL_CATALOG, streamGatewayChat } from './mimocode-openai.js'
import { CHAT_MODELS, MINIMAX_PREVIEW_MODEL } from './contracts/chat.js'

const env = { MINIMAX_API_KEY: 'fixture-only', MINIMAX_TEXT_MODEL: MINIMAX_PREVIEW_MODEL }
const input = { model: 'minimax', messages: [{ role: 'user', content: 'Synthetic readback' }], tools: [] }
const frame = delta => `data: ${JSON.stringify({ choices: [{ delta }] })}`
async function collect(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

test('desktop alias displays the actual configured MiniMax model', () => {
  assert.equal(MODEL_CATALOG['zt-minimax-m3'].label, CHAT_MODELS.minimax)
})

test('desktop bridge configures separate reasoning for the released model too', async () => {
  let body
  const chunks = await collect(streamGatewayChat(input, {
    env: { ...env, MINIMAX_TEXT_MODEL: 'MiniMax-M3.1-Flash', MINIMAX_REASONING_EFFORT: 'medium' },
    fetchImpl: async (_, options) => { body = JSON.parse(options.body); return new Response(`${frame({ content: '{"tag":"<think>literal</think>"}' })}\n\ndata: [DONE]\n\n`) },
  }))
  assert.equal(body.reasoning_effort, 'medium')
  assert.equal(chunks[0].text, '{"tag":"<think>literal</think>"}')
})

test('desktop bridge sends preview high effort and preserves final JSON at EOF', async () => {
  let request
  const final = '{"value":"<think>literal</think>"}'
  const chunks = await collect(streamGatewayChat(input, {
    env,
    fetchImpl: async (url, options) => {
      request = { url, body: JSON.parse(options.body) }
      return new Response(`${frame({ reasoning_content: 'not visible' })}\n\n${frame({ content: final })}`)
    },
  }))
  assert.equal(request.url, 'https://api.minimax.cn/v1/chat/completions')
  assert.equal(request.body.reasoning_effort, 'high')
  assert.equal(request.body.thinking.type, 'adaptive')
  assert.deepEqual(chunks, [{ type: 'text', text: final }])
})

test('desktop bridge rejects unsupported preview effort before requesting upstream', async () => {
  let requested = false
  await assert.rejects(collect(streamGatewayChat(input, {
    env: { ...env, MINIMAX_REASONING_EFFORT: 'none' },
    fetchImpl: async () => { requested = true; return new Response('') },
  })), /MINIMAX_REASONING_EFFORT/)
  assert.equal(requested, false)
})

test('desktop bridge cancels at DONE and still emits completed tool calls', async () => {
  let canceled = false
  const delta = { tool_calls: [{ index: 0, id: 'call_fixture', function: { name: 'read', arguments: '{}' } }] }
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`${frame(delta)}\n\ndata: [DONE]\n\n`))
    },
    cancel() { canceled = true },
  })
  const chunks = await collect(streamGatewayChat(input, { env, fetchImpl: async () => new Response(body) }))
  assert.equal(canceled, true)
  assert.deepEqual(chunks, [{ type: 'tool_call', id: 'call_fixture', name: 'read', arguments: '{}' }])
})

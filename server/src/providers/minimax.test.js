import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { streamMinimax } from './minimax.js'
import { streamDeepseek } from './deepseek.js'

const PREVIEW = 'MiniMax-M3.1-Flash-Preview'
const CURRENT = 'MiniMax-M3.1-Flash'
const messages = [{ role: 'user', content: 'Return a small JSON object.' }]

function configure(t, overrides = {}) {
  const values = {
    MINIMAX_API_KEY: 'unit-test-key',
    MINIMAX_BASE_URL: undefined,
    MINIMAX_TEXT_MODEL: undefined,
    MINIMAX_REASONING_EFFORT: undefined,
    DEEPSEEK_API_KEY: 'unit-test-key',
    DEEPSEEK_BASE_URL: undefined,
    ...overrides,
  }
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

function mockStream(t, deltas = [{ content: '{"ok":true}' }]) {
  const requests = []
  const wire = deltas.map(delta => `data: ${JSON.stringify({ choices: [{ delta }] })}\r\n\r\n`).join('') + 'data: [DONE]\r\n\r\n'
  const bytes = new TextEncoder().encode(wire)
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) })
    return new Response(new ReadableStream({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 13) controller.enqueue(bytes.slice(offset, offset + 13))
        controller.close()
      },
    }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  })
  return requests
}

async function finalText(stream) {
  let text = ''
  for await (const chunk of stream) text += chunk
  return text
}

test('uses the released model, China endpoint and explicit high effort by default', async t => {
  configure(t)
  const requests = mockStream(t)
  assert.equal(await finalText(streamMinimax({ messages })), '{"ok":true}')
  assert.equal(requests[0].url, 'https://api.minimax.cn/v1/chat/completions')
  assert.equal(requests[0].body.model, CURRENT)
  assert.equal(requests[0].body.reasoning_effort, 'high')
  assert.deepEqual(requests[0].body.thinking, { type: 'adaptive' })
  assert.equal(requests[0].body.stream, true)
})

test('released model preserves separate reasoning and supports explicit request effort', async t => {
  configure(t)
  const requests = mockStream(t, [{ reasoning_content: 'private' }, { content: '{"tag":"<think>literal</think>"}' }])
  assert.deepEqual(JSON.parse(await finalText(streamMinimax({ model: CURRENT, messages, reasoningEffort: 'low' }))), { tag: '<think>literal</think>' })
  assert.equal(requests[0].body.reasoning_effort, 'low')
  assert.throws(() => streamMinimax({ model: CURRENT, messages, reasoningEffort: 'none' }), /reasoning|EFFORT/)
})

test('keeps structured final content intact and does not surface separate reasoning or tools', async t => {
  configure(t)
  mockStream(t, [
    { reasoning_content: 'private reasoning', content: null },
    { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'lookup', arguments: '{}' } }] },
    { reasoning_content: 'more private reasoning', content: '{"ok":' },
    { content: 'true,"note":"<think>literal</think>","label":"\u4f60\u597d"}' },
  ])
  const text = await finalText(streamMinimax({ model: PREVIEW, messages }))
  assert.deepEqual(JSON.parse(text), { ok: true, note: '<think>literal</think>', label: '\u4f60\u597d' })
  assert.doesNotMatch(text, /private reasoning|call-1|lookup/)
})

test('preserves tool continuation messages and extra request options without disabling preview thinking', async t => {
  configure(t)
  const requests = mockStream(t)
  const conversation = [
    ...messages,
    { role: 'assistant', content: null, reasoning_content: 'prior reasoning', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'lookup', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'call-1', content: '{"value":1}' },
  ]
  const tools = [{ type: 'function', function: { name: 'lookup', parameters: { type: 'object', properties: {} } } }]
  await finalText(streamMinimax({ model: PREVIEW, messages: conversation, extra: { tools, tool_choice: 'auto', max_tokens: 2048, thinking: { type: 'disabled' }, reasoning_effort: 'none' } }))
  assert.deepEqual(requests[0].body.messages, conversation)
  assert.deepEqual(requests[0].body.tools, tools)
  assert.equal(requests[0].body.tool_choice, 'auto')
  assert.equal(requests[0].body.max_tokens, 2048)
  assert.equal(requests[0].body.reasoning_effort, 'high')
  assert.deepEqual(requests[0].body.thinking, { type: 'adaptive' })
})

test('honors supported configured preview effort and rejects efforts that disable thinking', async t => {
  configure(t, { MINIMAX_REASONING_EFFORT: 'xhigh' })
  const requests = mockStream(t)
  await finalText(streamMinimax({ model: PREVIEW, messages }))
  assert.equal(requests[0].body.reasoning_effort, 'xhigh')
  process.env.MINIMAX_REASONING_EFFORT = 'none'
  assert.throws(() => streamMinimax({ model: PREVIEW, messages }), /MINIMAX_REASONING_EFFORT/)
})

test('keeps legacy model overrides, endpoints and inline thinking filtering', async t => {
  configure(t, { MINIMAX_TEXT_MODEL: 'MiniMax-M3', MINIMAX_BASE_URL: 'https://api.minimaxi.com/v1/', MINIMAX_REASONING_EFFORT: 'none' })
  const requests = mockStream(t, [{ content: '<think>legacy reasoning</think>{"ok":true}' }])
  assert.equal(await finalText(streamMinimax({ messages })), '{"ok":true}')
  assert.equal(requests[0].url, 'https://api.minimaxi.com/v1/chat/completions')
  assert.equal(requests[0].body.model, 'MiniMax-M3')
  assert.equal(requests[0].body.reasoning_effort, undefined)
  assert.deepEqual(requests[0].body.thinking, { type: 'adaptive' })
  await finalText(streamMinimax({ model: 'MiniMax-M2.7', messages }))
  assert.equal(requests[1].body.model, 'MiniMax-M2.7')
  assert.equal(requests[1].body.reasoning_effort, undefined)
})

test('does not change DeepSeek endpoint, model, thinking or final-answer streaming', async t => {
  configure(t)
  const requests = mockStream(t, [{ reasoning_content: 'hidden' }, { content: '<think>legacy reasoning</think>final answer' }])
  assert.equal(await finalText(streamDeepseek({ model: 'deepseek-v4-flash', messages })), 'final answer')
  assert.equal(requests[0].url, 'https://api.deepseek.com/chat/completions')
  assert.equal(requests[0].body.model, 'deepseek-v4-flash')
  assert.deepEqual(requests[0].body.thinking, { type: 'disabled' })
  assert.equal(requests[0].body.reasoning_effort, undefined)
})

test('still rejects missing MiniMax credentials before any request', t => {
  configure(t, { MINIMAX_API_KEY: undefined })
  assert.throws(() => streamMinimax({ model: PREVIEW, messages }), /MINIMAX_API_KEY/)
})

test('includes the preview model in the usage catalog and preserves previous choices', () => {
  const html = fs.readFileSync(new URL('../../public/control-room/index.html', import.meta.url), 'utf8')
  for (const model of [CURRENT, PREVIEW, 'MiniMax-M3', 'deepseek-v4-flash']) {
    assert.ok(html.includes(`<option value="${model}">${model}</option>`), `Missing usage filter: ${model}`)
  }
})

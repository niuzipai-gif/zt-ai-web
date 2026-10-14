import test from 'node:test'
import assert from 'node:assert/strict'
import { streamOpenAICompatible } from './openai-compatible.js'

const input = { baseUrl: 'https://example.com/v1', apiKey: 'unit-test-key', model: 'MiniMax-M3.1-Flash-Preview', messages: [{ role: 'user', content: 'Synthetic stream test' }], separateReasoning: true }
const data = delta => `data: ${JSON.stringify({ choices: [{ delta }] })}`

async function collect(stream) {
  let text = ''
  for await (const chunk of stream) text += chunk
  return text
}

test('processes the final complete SSE data line at EOF without a trailing newline', async t => {
  const final = JSON.stringify({ label: '\u4f60\u597d', ok: true })
  const bytes = new TextEncoder().encode(data({ content: final }))
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
      controller.close()
    },
  }), { status: 200 }))
  assert.equal(await collect(streamOpenAICompatible(input)), final)
})

test('honors the DONE marker instead of appending content after completion', async t => {
  const wire = `${data({ content: '{"ok":true}' })}\n\ndata: [DONE]\n\n${data({ content: 'must not be emitted' })}\n\n`
  t.mock.method(globalThis, 'fetch', async () => new Response(wire, { status: 200 }))
  assert.equal(await collect(streamOpenAICompatible(input)), '{"ok":true}')
})

test('finishes and cancels the reader on DONE without waiting for transport EOF', async t => {
  let sourceController
  let canceled = false
  const body = new ReadableStream({
    start(controller) {
      sourceController = controller
      controller.enqueue(new TextEncoder().encode(`${data({ content: '{"ok":true}' })}\n\ndata: [DONE]\n\n`))
    },
    cancel() { canceled = true },
  })
  t.mock.method(globalThis, 'fetch', async () => new Response(body, { status: 200 }))
  const completion = collect(streamOpenAICompatible(input))
  let timer
  try {
    const text = await Promise.race([completion, new Promise(resolve => { timer = setTimeout(() => resolve('timed out waiting for parser completion'), 250) })])
    assert.equal(text, '{"ok":true}')
    assert.equal(canceled, true)
  } finally {
    clearTimeout(timer)
    if (!canceled) sourceController.close()
    await completion
  }
})

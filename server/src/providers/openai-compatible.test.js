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

test('processes a final complete SSE data line and finish reason without a trailing newline', async t => {
  const final = JSON.stringify({ label: '\u4f60\u597d', ok: true })
  const bytes = new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: final }, finish_reason: 'stop' }] })}`)
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
      controller.close()
    },
  }), { status: 200 }))
  assert.equal(await collect(streamOpenAICompatible(input)), final)
})

test('does not silently accept a cut-off stream or a truncated generation', async () => {
  await assert.rejects(collect(streamOpenAICompatible({ ...input, fetchImpl: async () => new Response(data({ content: 'partial' })) })), /incomplete|中断/)
  const wire = `data: ${JSON.stringify({ choices: [{ delta: { content: 'partial' }, finish_reason: 'length' }] })}\n\ndata: [DONE]\n\n`
  await assert.rejects(collect(streamOpenAICompatible({ ...input, fetchImpl: async () => new Response(wire) })), /truncated|长度/)
})

test('cancellation aborts upstream and rejects without late content', async () => {
  const controller = new AbortController()
  let signal
  const stream = streamOpenAICompatible({ ...input, signal: controller.signal, fetchImpl: async (_, options) => {
    signal = options.signal
    controller.abort()
    return new Response(`${data({ content: 'late' })}\n\ndata: [DONE]\n\n`)
  } })
  await assert.rejects(collect(stream), { name: 'AbortError' })
  assert.equal(signal.aborted, true)
})

test('reports only safe usage metadata and hides provider error details', async () => {
  let report
  const wire = `${data({ content: 'ok' })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 8 } } })}\n\ndata: [DONE]\n\n`
  assert.equal(await collect(streamOpenAICompatible({ ...input, onMetadata: value => { report = value }, fetchImpl: async () => new Response(wire) })), 'ok')
  assert.equal(report.usage.cachedTokens, 8)
  assert.equal(report.finishReason, 'stop')
  await assert.rejects(collect(streamOpenAICompatible({ ...input, fetchImpl: async () => new Response('secret-provider-debug', { status: 401 }) })), error => !error.message.includes('secret-provider-debug') && error.status === 401)
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

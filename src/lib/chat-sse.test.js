import test from 'node:test'
import assert from 'node:assert/strict'
import { consumeChatSse } from './chat-sse.js'

test('a broken frame cancels the stream instead of leaving generation running', async () => {
  let cancelled = false
  const response = new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('event: voice.audio\ndata: {broken}\n\n')) }, cancel() { cancelled = true } }))
  await assert.rejects(consumeChatSse(response, () => {}), /不完整/)
  assert.equal(cancelled, true)
})

test('callback cancellation closes upstream and valid UTF-8 survives byte boundaries', async () => {
  const wire = new TextEncoder().encode('event: message.delta\ndata: {"text":"你好"}\n\nevent: message.done\ndata: {}')
  const seen = []
  await consumeChatSse(new Response(new ReadableStream({ start(c) { for (const byte of wire) c.enqueue(Uint8Array.of(byte)); c.close() } })), (event, data) => seen.push([event, data]))
  assert.deepEqual(seen, [['message.delta', { text: '你好' }], ['message.done', {}]])
  let cancelled = false
  await assert.rejects(consumeChatSse(new Response(new ReadableStream({ start(c) { c.enqueue(wire) }, cancel() { cancelled = true } })), () => { throw new DOMException('Cancelled', 'AbortError') }), { name: 'AbortError' })
  assert.equal(cancelled, true)
})

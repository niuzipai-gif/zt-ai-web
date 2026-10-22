import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

process.env.ZT_AI_TEST_MODE = '1'
process.env.ZT_AI_DATA_PATH = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'zt-stream-')), 'data.json')
Object.assign(process.env, { CORS_ORIGIN: 'https://niuzipai-gif.github.io', VOICE_MODE_ENABLED: 'true', VOICE_STREAMING_ENABLED: 'true', MINIMAX_API_KEY: 'fixture', MINIMAX_VOICE_ID: 'owner' })
const { createServer } = await import('./index.js')

test('chat streams text and PCM in one turn, preserving text if speech fails', async t => {
  const realFetch = globalThis.fetch
  let fail = false, upstream, created = 0
  const server = createServer({ speechFactory: ({ onAudio }) => {
    created += 1
    return { write(text) { assert.equal(text, '你好呀。'); if (!fail) onAudio({ audio: 'AAAAAA==', sequence: 0, sampleRate: 32000 }) }, async finish() { if (fail) throw new Error('private upstream details') }, cancel() {} }
  } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { await new Promise(resolve => server.close(resolve)) })
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    upstream = options.signal
    return new Response('data: {"choices":[{"delta":{"content":"你好呀。"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')
  })
  const send = async (voice, origin = 'https://niuzipai-gif.github.io') => {
    const response = await realFetch(`http://127.0.0.1:${server.address().port}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ messages: [{ role: 'user', content: '你好' }], voice }) })
    if (origin === 'https://untrusted.example') { assert.equal(response.status, 403); return response.text() }
    assert.equal(response.status, 200)
    return response.text()
  }
  const wire = await send({ stream: true })
  assert.match(wire, /voice.audio/); assert.match(wire, /voice.done/); assert.match(wire, /message.done/)
  assert.equal(typeof upstream.addEventListener, 'function')
  fail = true
  const recovered = await send({ stream: true })
  assert.match(recovered, /你好呀/); assert.match(recovered, /voice.error/)
  assert.doesNotMatch(recovered, /private upstream details/)
  await send(undefined)
  await send({ stream: true }, 'https://untrusted.example')
  assert.equal(created, 2, 'legacy clients never open streaming speech')
})

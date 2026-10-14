import test from 'node:test'
import assert from 'node:assert/strict'
const { createVoiceClient, formatVoiceRequestError } = await import('./voice-client.js')

test('voice transport retries a temporary outage without losing the input', async () => {
  assert.equal(typeof createVoiceClient, 'function')
  const calls = []
  const client = createVoiceClient({ baseUrl: 'https://gateway.test', sleep: async () => {}, fetchImpl: async (url, options) => {
    calls.push(JSON.parse(options.body))
    if (calls.length === 1) throw new TypeError('Failed to fetch')
    return Response.json({ url: 'https://audio.test/voice.mp3' })
  } })
  assert.equal((await client.synthesize('你好', 'zh')).url, 'https://audio.test/voice.mp3')
  assert.deepEqual(calls, [{ text: '你好', language: 'zh' }, { text: '你好', language: 'zh' }])
})

test('voice transport does not retry revoked identity, permission or exhausted quota', async () => {
  assert.equal(typeof createVoiceClient, 'function')
  let calls = 0
  const client = createVoiceClient({ fetchImpl: async () => { calls += 1; return Response.json({ code: 'voice_quota', error: 'quota unavailable', retryable: false }, { status: 503 }) }, sleep: async () => {} })
  await assert.rejects(() => client.synthesize('hello', 'en'), error => error.code === 'voice_quota')
  assert.equal(calls, 1)
})

test('transcription uploads an actual audio blob and leaves language automatic', async () => {
  assert.equal(typeof createVoiceClient, 'function')
  const client = createVoiceClient({ fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body)
    assert.equal(url, '/api/voice/transcribe')
    assert.equal(body.mimeType, 'audio/wav')
    assert.equal(body.language, 'auto')
    assert.equal(body.audio, Buffer.from('a'.repeat(100)).toString('base64'))
    return Response.json({ text: 'こんにちは。' })
  } })
  assert.equal((await client.transcribe(new Blob(['a'.repeat(100)], { type: 'audio/wav' }))).text, 'こんにちは。')
})

test('closing a voice turn aborts its request without another attempt', async () => {
  assert.equal(typeof createVoiceClient, 'function')
  let calls = 0
  const cancel = new AbortController()
  cancel.abort()
  const client = createVoiceClient({ fetchImpl: async () => { calls += 1; return Response.json({}) } })
  await assert.rejects(() => client.status({ signal: cancel.signal }), error => error.name === 'AbortError')
  assert.equal(calls, 0)
})

test('service and quota failures are not mislabeled as a network error', () => {
  const copy = { voiceServiceError: 'service configuration', voiceQuotaError: 'quota unavailable', voiceConnectionError: 'connection interrupted' }
  assert.equal(formatVoiceRequestError({ code: 'voice_identity', message: 'raw' }, copy), 'service configuration')
  assert.equal(formatVoiceRequestError({ code: 'voice_quota', message: 'raw' }, copy), 'quota unavailable')
  assert.equal(formatVoiceRequestError({ code: 'voice_connection', message: 'raw' }, copy), 'connection interrupted')
})

test('cancellation during an active voice request stops retries', async () => {
  let calls = 0
  const cancel = new AbortController()
  const client = createVoiceClient({ fetchImpl: async (url, { signal }) => {
    calls += 1
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }))
  } })
  const request = client.synthesize('hello', 'en', { signal: cancel.signal })
  cancel.abort()
  await assert.rejects(() => request, error => error.name === 'AbortError')
  assert.equal(calls, 1)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

process.env.ZT_AI_TEST_MODE = '1'
process.env.ZT_AI_DATA_PATH = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'zt-voice-')), 'data.json')
Object.assign(process.env, { VOICE_MODE_ENABLED: 'true', MMX_API_KEY: 'fixture-key', MMX_BASE_URL: 'https://voice-provider.test/v1', MINIMAX_VOICE_ID_ZH: 'OwnerZhClean20260828', MINIMAX_VOICE_ID_EN: 'OwnerEnClean20260828' })
const { createServer } = await import('./index.js')

test('voice API transcribes audio without browser recognition and recovers a revoked language voice', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    if (String(url).endsWith('/speech_to_text')) {
      assert.ok(options.body instanceof FormData)
      assert.equal(options.headers['content-type'], undefined)
      assert.equal(options.body.get('model'), 'asr-1.0')
      assert.equal(options.body.get('file').type, 'audio/wav')
      assert.equal(options.headers.language, undefined, 'automatic multilingual detection')
      return Response.json({ text: 'こんにちは。', duration: 1 })
    }
    if (String(url).endsWith('/get_voice')) return Response.json({ voice_cloning: [{ voice_id: 'OwnerEn20260827' }, { voice_id: 'OtherPersonEn20260901' }], base_resp: { status_code: 0 } })
    const request = JSON.parse(options.body)
    if (request.voice_setting.voice_id === 'OwnerEnClean20260828') return Response.json({ base_resp: { status_code: 2042, status_msg: "you don't have access to this voice_id" } })
    assert.equal(request.voice_setting.voice_id, 'OwnerEn20260827')
    return Response.json({ data: { audio: 'https://audio.test/english.mp3' }, base_resp: { status_code: 0 } })
  }
  try {
    const wav = Buffer.alloc(76)
    wav.write('RIFF'); wav.writeUInt32LE(68, 4); wav.write('WAVE', 8)
    const asr = await originalFetch(base + '/api/voice/transcribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ audio: wav.toString('base64'), mimeType: 'audio/wav', language: 'auto' }) })
    assert.equal(asr.status, 200)
    assert.equal((await asr.json()).text, 'こんにちは。')
    const malformed = await originalFetch(base + '/api/voice/transcribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ audio: 'not-base64!!!', mimeType: 'audio/wav' }) })
    assert.equal(malformed.status, 400)
    const before = calls.length
    const body = { language: 'en', text: 'Hello, recovery test.' }
    const result = await originalFetch(base + '/api/voice/synthesize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    assert.equal(result.status, 200)
    assert.equal((await result.json()).url, 'https://audio.test/english.mp3')
    const cached = await originalFetch(base + '/api/voice/synthesize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    assert.equal(cached.status, 200)
    await cached.text()
    assert.equal(calls.length - before, 2, 'resolve the registered personal voice before synthesis; replay is cached')
    const status = await (await originalFetch(base + '/api/voice/status')).json()
    assert.equal(status.serverInput, true)
    assert.doesNotMatch(JSON.stringify(status), /fixture-key|OwnerEn/)
  } finally {
    globalThis.fetch = originalFetch
    await new Promise(resolve => server.close(resolve))
  }
})

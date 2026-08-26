import test from 'node:test'
import assert from 'node:assert/strict'
import { runHiddenMediaRequest, synthesizeVoice } from './mmx.js'

function withEnv(values, callback) {
  const previous = new Map(Object.keys(values).map(key => [key, process.env[key]]))
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  return Promise.resolve(callback()).finally(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
}

test('uses the MMX credential and base URL for hosted image generation', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return new Response(JSON.stringify({ data: { image_urls: ['https://cdn.example.test/mmx-image.png'] }, base_resp: { status_code: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const result = await withEnv({ MMX_ENABLED: 'true', MMX_API_KEY: 'fixture-key', MMX_BASE_URL: 'https://fixture.example.test/v1', MINIMAX_API_KEY: undefined, MINIMAX_BASE_URL: undefined }, () => runHiddenMediaRequest({ text: '生成一张美女图片' }))
    assert.deepEqual(result, { kind: 'image', status: 'completed', url: 'https://cdn.example.test/mmx-image.png' })
    assert.equal(calls[0].url, 'https://fixture.example.test/v1/image_generation')
    assert.equal(calls[0].options.headers.authorization, 'Bearer fixture-key')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('synthesizes speech with the cloned voice for the requested language', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return new Response(JSON.stringify({ data: { audio: 'https://cdn.example.test/cai-voice.mp3', status: 2 }, extra_info: { audio_format: 'mp3' }, base_resp: { status_code: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const result = await withEnv({
      MMX_API_KEY: 'fixture-key',
      MMX_BASE_URL: 'https://fixture.example.test/v1',
      MINIMAX_API_KEY: undefined,
      MINIMAX_VOICE_ID: 'CaiZhouTingFallback',
      MINIMAX_VOICE_ID_ZH: 'CaiZhouTingZh20260827',
    }, () => synthesizeVoice({ text: '你好，先把问题说清楚。', language: 'zh' }))
    assert.deepEqual(result, { kind: 'audio', status: 'completed', url: 'https://cdn.example.test/cai-voice.mp3', language: 'zh' })
    assert.equal(calls[0].url, 'https://fixture.example.test/v1/t2a_v2')
    const body = JSON.parse(calls[0].options.body)
    assert.equal(body.voice_setting.voice_id, 'CaiZhouTingZh20260827')
    assert.equal(body.language_boost, 'Chinese')
    assert.equal(body.output_format, 'url')
  } finally {
    globalThis.fetch = originalFetch
  }
})

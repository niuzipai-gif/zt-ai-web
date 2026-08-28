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
      MINIMAX_VOICE_ID_ZH: 'CaiZhouTingZhClean20260828',
    }, () => synthesizeVoice({ text: '你好，先把问题说清楚。', language: 'zh' }))
    assert.deepEqual(result, { kind: 'audio', status: 'completed', url: 'https://cdn.example.test/cai-voice.mp3', language: 'zh' })
    assert.equal(calls[0].url, 'https://fixture.example.test/v1/t2a_v2')
    const body = JSON.parse(calls[0].options.body)
    assert.equal(body.voice_setting.voice_id, 'CaiZhouTingZhClean20260828')
    assert.equal(body.language_boost, 'Chinese')
    assert.equal(body.output_format, 'url')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('uses separate clarity settings for English and Japanese without changing Chinese defaults', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return new Response(JSON.stringify({ data: { audio: 'https://cdn.example.test/cai-voice.mp3', status: 2 }, base_resp: { status_code: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    await withEnv({
      MMX_API_KEY: 'fixture-key',
      MMX_BASE_URL: 'https://fixture.example.test/v1',
      MINIMAX_API_KEY: undefined,
      MINIMAX_VOICE_ID: undefined,
      MINIMAX_VOICE_ID_EN: 'CaiZhouTingEnClean20260828',
      MINIMAX_VOICE_ID_JA: 'CaiZhoutingJaClean20260828',
      MINIMAX_TTS_SPEED_EN: '0.90',
      MINIMAX_TTS_SPEED_JA: '0.88',
      MINIMAX_TTS_EMOTION_EN: 'calm',
      MINIMAX_TTS_EMOTION_JA: 'calm',
      MINIMAX_TTS_PRONUNCIATION_EN_JSON: '{"ZT.AI":"zee tee eye"}',
      MINIMAX_TTS_PRONUNCIATION_JA_JSON: '{"ZT.AI":"ゼットエーアイ"}',
    }, async () => {
      await synthesizeVoice({ text: 'Please explain ZT.AI clearly.', language: 'en' })
      await synthesizeVoice({ text: 'ZT.AIについて説明してください。', language: 'ja' })
    })
    const english = JSON.parse(calls[0].options.body)
    const japanese = JSON.parse(calls[1].options.body)
    assert.equal(english.language_boost, 'English')
    assert.equal(english.voice_setting.speed, 0.90)
    assert.equal(english.voice_setting.emotion, 'calm')
    assert.deepEqual(english.pronunciation_dict, { tone: ['ZT.AI/zee tee eye'] })
    assert.equal(japanese.language_boost, 'Japanese')
    assert.equal(japanese.voice_setting.speed, 0.88)
    assert.equal(japanese.voice_setting.emotion, 'calm')
    assert.deepEqual(japanese.pronunciation_dict, { tone: ['ZT.AI/ゼットエーアイ'] })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('keeps personal voice IDs while applying multilingual pronunciation defaults', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return new Response(JSON.stringify({ data: { audio: 'https://cdn.example.test/cai-voice.mp3', status: 2 }, base_resp: { status_code: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    await withEnv({
      MMX_API_KEY: 'fixture-key',
      MMX_BASE_URL: 'https://fixture.example.test/v1',
      MINIMAX_VOICE_ID: undefined,
      MINIMAX_VOICE_ID_EN: 'CaiZhouTingEnClean20260828',
      MINIMAX_VOICE_ID_JA: 'CaiZhoutingJaClean20260828',
      MINIMAX_TTS_SPEED_EN: undefined,
      MINIMAX_TTS_SPEED_JA: undefined,
      MINIMAX_TTS_PRONUNCIATION_EN_JSON: undefined,
      MINIMAX_TTS_PRONUNCIATION_JA_JSON: undefined,
    }, async () => {
      await synthesizeVoice({ text: 'Hello, please explain ZT.AI and FDE.', language: 'en' })
      await synthesizeVoice({ text: '蔡宙廷です。ZT.AIについて説明します。', language: 'ja' })
    })
    const english = JSON.parse(calls[0].options.body)
    const japanese = JSON.parse(calls[1].options.body)
    assert.equal(english.voice_setting.voice_id, 'CaiZhouTingEnClean20260828')
    assert.equal(english.voice_setting.speed, 0.90)
    assert.ok(english.pronunciation_dict.tone.includes('ZT.AI/zee tee eye'))
    assert.ok(english.pronunciation_dict.tone.includes('FDE/eff dee ee'))
    assert.equal(japanese.voice_setting.voice_id, 'CaiZhoutingJaClean20260828')
    assert.equal(japanese.voice_setting.speed, 0.88)
    assert.ok(japanese.pronunciation_dict.tone.includes('蔡宙廷/さい・ちょうてい'))
    assert.ok(japanese.pronunciation_dict.tone.includes('ZT.AI/ゼットエーアイ'))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('keeps greeting synthesis text intact because mobile pre-roll is handled by the client player', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return new Response(JSON.stringify({ data: { audio: 'https://cdn.example.test/greeting.mp3', status: 2 }, base_resp: { status_code: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    await withEnv({
      MMX_API_KEY: 'fixture-key',
      MMX_BASE_URL: 'https://fixture.example.test/v1',
      MINIMAX_API_KEY: undefined,
      MINIMAX_VOICE_ID: 'CaiZhouTingZhClean20260828',
    }, () => synthesizeVoice({ text: '你好，我是蔡宙廷。', language: 'zh', leadingPause: true }))
    const body = JSON.parse(calls[0].options.body)
    assert.equal(body.text, '你好，我是蔡宙廷。')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('removes Japanese reading annotations from spoken text while preserving the visible answer contract', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return new Response(JSON.stringify({ data: { audio: 'https://cdn.example.test/japanese.mp3', status: 2 }, base_resp: { status_code: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    await withEnv({
      MMX_API_KEY: 'fixture-key',
      MMX_BASE_URL: 'https://fixture.example.test/v1',
      MINIMAX_VOICE_ID: undefined,
      MINIMAX_VOICE_ID_JA: 'CaiZhoutingJaClean20260828',
    }, () => synthesizeVoice({ text: '蔡宙廷（さい・ちょうてい）です。', language: 'ja' }))
    const body = JSON.parse(calls[0].options.body)
    assert.equal(body.text, '蔡宙廷です。')
  } finally {
    globalThis.fetch = originalFetch
  }
})

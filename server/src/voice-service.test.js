import test from 'node:test'
import assert from 'node:assert/strict'
import { createVoiceService, voiceErrorResponse } from './voice-service.js'

test('streaming and HTTP resolve the same registered personal voice; Chinese is never reselected', async () => {
  let lists = 0
  const service = createVoiceService({ env: { MINIMAX_VOICE_ID_ZH: 'OwnerZhClean20260828', MINIMAX_VOICE_ID_EN: 'OwnerEnClean20260828' },
    listVoices: async () => { lists++; return ['OtherEn20261022', 'OwnerEn20260827'] },
    synthesize: async input => ({ voiceId: input.voiceId }) })
  assert.equal(await service.resolveVoice('zh'), 'OwnerZhClean20260828'); assert.equal(lists, 0)
  const ids = await Promise.all(Array.from({ length: 5 }, () => service.resolveVoice('en')))
  assert.deepEqual(ids, Array(5).fill('OwnerEn20260827')); assert.equal(lists, 1)
  assert.equal((await service.synthesize({ text: 'Hello', language: 'en' })).voiceId, ids[0])
})

test('registry outage still permits the explicitly configured voice without identity substitution', async () => {
  const service = createVoiceService({ env: { MINIMAX_VOICE_ID_EN: 'OwnerEn20260827' }, listVoices: async () => { throw Error('registry unavailable') }, synthesize: async input => input })
  assert.equal(await service.resolveVoice('en'), 'OwnerEn20260827')
  assert.equal((await service.synthesize({ text: 'hello', language: 'en' })).voiceId, 'OwnerEn20260827')
})

test('simultaneous retry requests share one synthesis and expired audio is regenerated', async () => {
  let time = 0, calls = 0
  const service = createVoiceService({ env: { MINIMAX_VOICE_ID: 'OwnerZh20260828' }, now: () => time, synthesize: async () => { calls += 1; return { url: 'https://audio.test/result.mp3' } } })
  const replies = await Promise.all(Array.from({ length: 30 }, () => service.synthesize({ text: 'same greeting', language: 'zh' })))
  assert.equal(replies.length, 30)
  assert.equal(calls, 1)
  time += 6 * 60_000
  await service.synthesize({ text: 'same greeting', language: 'zh' })
  assert.equal(calls, 2)
})

test('failed synthesis is not cached and cannot substitute another person', async () => {
  let fail = true
  const service = createVoiceService({ env: { MINIMAX_VOICE_ID_EN: 'OwnerEnClean20260828' }, synthesize: async () => {
    if (fail) throw Object.assign(new Error('revoked'), { providerCode: 2042 })
    return { url: 'https://audio.test/recovered.mp3' }
  }, listVoices: async () => ['AnotherPersonEn20260829'] })
  await assert.rejects(() => service.synthesize({ text: 'hello', language: 'en' }), error => error.providerCode === 2042)
  fail = false
  assert.ok((await service.synthesize({ text: 'hello', language: 'en' })).url)
})

test('voice errors have actionable public codes without leaking upstream credentials', () => {
  const raw = Object.assign(new Error('Bearer private-key: upstream details'), { status: 401 })
  const failure = voiceErrorResponse(raw)
  assert.equal(failure.body.retryable, false)
  assert.doesNotMatch(JSON.stringify(failure), /private-key|Bearer|upstream/)
  assert.equal(voiceErrorResponse({ status: 504 }).body.retryable, true)
  assert.equal(voiceErrorResponse({ code: 'voice_input' }).status, 400)
})

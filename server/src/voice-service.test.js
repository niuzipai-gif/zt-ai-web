import test from 'node:test'
import assert from 'node:assert/strict'
import { createVoiceService, voiceErrorResponse } from './voice-service.js'

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

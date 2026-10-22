import test from 'node:test'
import assert from 'node:assert/strict'
import { voiceCapability } from './voice.js'

test('voice capability is disabled until both feature flag and voice id exist', () => {
  const result = voiceCapability({ VOICE_MODE_ENABLED: 'true', MINIMAX_VOICE_ID: '' })
  assert.deepEqual(result, { enabled: false, input: false, output: false, reason: 'voice-not-configured' })
  assert.equal(JSON.stringify(result).includes('API_KEY'), false)
})

test('voice capability exposes public readiness but never provider credentials', () => {
  const result = voiceCapability({ VOICE_MODE_ENABLED: 'true', MINIMAX_VOICE_ID: 'CaiZhouTingVoice01', ASR_PROVIDER: 'configured' })
  assert.deepEqual(result, { enabled: true, input: true, output: true, reason: 'ready' })
})

test('voice capability accepts language-specific cloned voices with browser recognition fallback', () => {
  const result = voiceCapability({
    VOICE_MODE_ENABLED: 'true',
    MINIMAX_VOICE_ID_ZH: 'CaiZhouTingZhClean20260828',
    MINIMAX_VOICE_ID_EN: 'CaiZhouTingEnClean20260828',
    MINIMAX_VOICE_ID_JA: 'CaiZhoutingJaClean20260828',
    ASR_PROVIDER: 'browser',
  })
  assert.deepEqual(result, { enabled: true, input: true, output: true, reason: 'ready' })
})

test('server transcription remains available when browser recognition is disabled', () => {
  const result = voiceCapability({ VOICE_MODE_ENABLED: 'true', MINIMAX_VOICE_ID_ZH: 'OwnerVoice', MMX_API_KEY: 'secret', VOICE_BROWSER_ASR: 'false' })
  assert.equal(result.enabled, true)
  assert.equal(result.serverInput, true)
  assert.doesNotMatch(JSON.stringify(result), /secret|OwnerVoice/)
})

test('streaming output requires its own explicit rollout flag', () => {
  const configured = { VOICE_MODE_ENABLED: 'true', MINIMAX_VOICE_ID: 'OwnerVoice' }
  assert.equal(voiceCapability(configured).streamOutput, undefined)
  assert.equal(voiceCapability({ ...configured, VOICE_STREAMING_ENABLED: 'false' }).streamOutput, undefined)
  assert.equal(voiceCapability({ ...configured, VOICE_STREAMING_ENABLED: 'true' }).streamOutput, true)
})

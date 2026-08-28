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

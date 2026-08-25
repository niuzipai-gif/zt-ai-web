import test from 'node:test'
import assert from 'node:assert/strict'
import { createVoiceState, transitionVoiceState } from '../public/voice-mode.mjs'

test('desktop voice lifecycle uses the same state names and transitions', () => {
  let state = transitionVoiceState(createVoiceState(), { type: 'start-listening' })
  state = transitionVoiceState(state, { type: 'finish-listening', transcript: '测试语音' })
  state = transitionVoiceState(state, { type: 'start-speaking', audioUrl: 'https://example.test/voice.mp3' })
  assert.deepEqual(state, { status: 'speaking', transcript: '测试语音', error: '', audioUrl: 'https://example.test/voice.mp3' })
  assert.deepEqual(transitionVoiceState(state, { type: 'cancel' }), { status: 'idle', transcript: '', error: '', audioUrl: '' })
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { createVoiceState, startVoiceCapture, transitionVoiceState } from '../public/voice-mode.mjs'

test('desktop voice capture starts recognition before awaiting microphone permission', async () => {
  const calls = []
  const result = await startVoiceCapture({
    recognition: {
      start: () => { calls.push('recognition'); return { status: 'listening' } },
      stop: () => calls.push('stop-recognition'),
    },
    recorder: { start: async () => { calls.push('recorder'); return { status: 'recording' } } },
  })
  assert.deepEqual(calls, ['recognition', 'recorder'])
  assert.equal(result.status, 'recording')
})

test('desktop voice lifecycle uses the same state names and transitions', () => {
  let state = transitionVoiceState(createVoiceState(), { type: 'start-listening' })
  state = transitionVoiceState(state, { type: 'finish-listening', transcript: '测试语音' })
  state = transitionVoiceState(state, { type: 'start-speaking', audioUrl: 'https://example.test/voice.mp3' })
  assert.deepEqual(state, { status: 'speaking', transcript: '测试语音', error: '', audioUrl: 'https://example.test/voice.mp3' })
  assert.deepEqual(transitionVoiceState(state, { type: 'cancel' }), { status: 'idle', transcript: '', error: '', audioUrl: '' })
})

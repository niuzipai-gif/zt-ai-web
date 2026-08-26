import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseRecorderMime, createVoiceAudioController, createVoicePlayback, createVoiceRecognition } from '../public/voice-audio.mjs'

test('desktop audio controller has the same capability fallback', async () => {
  assert.equal(chooseRecorderMime(() => false), '')
  const result = await createVoiceAudioController({ mediaDevices: null }).stop()
  assert.equal(result.status, 'unavailable')
})

test('desktop voice audio exposes recognition and playback controllers', () => {
  assert.equal(typeof createVoiceRecognition, 'function')
  assert.equal(typeof createVoicePlayback, 'function')
})

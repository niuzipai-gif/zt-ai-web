import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseRecorderMime, createVoiceAudioController, createVoicePlayback } from './voice-audio.js'

test('recorder chooses a supported audio MIME and reports unavailable capability', () => {
  assert.equal(chooseRecorderMime(type => type === 'audio/webm;codecs=opus'), 'audio/webm;codecs=opus')
  assert.equal(chooseRecorderMime(() => false), '')
})

test('controller stop is safe before a recorder exists', async () => {
  const controller = createVoiceAudioController({ mediaDevices: null })
  const result = await controller.stop()
  assert.equal(result.status, 'unavailable')
})

test('playback rejects non-https URLs and reports autoplay blocks', async () => {
  const events = []
  const audio = {
    preload: '', src: '', currentTime: 0, paused: true,
    addEventListener() {}, removeEventListener() {}, pause() { this.paused = true },
    async play() { throw new Error('gesture required') },
  }
  const playback = createVoicePlayback({ audioFactory: () => audio, onStateChange: event => events.push(event) })
  assert.throws(() => playback.load('http://unsafe.test/a.mp3'), /HTTPS/)
  playback.load('https://safe.test/a.mp3')
  const result = await playback.play()
  assert.equal(result.status, 'blocked')
  assert.equal(events.at(-1).status, 'blocked')
  playback.dispose()
})

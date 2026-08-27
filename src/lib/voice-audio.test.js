import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseRecorderMime, createVoiceAudioController, createVoicePlayback, createVoiceRecognition, mergeVoiceTranscript } from './voice-audio.js'

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

test('speech recognition reports interim text and can be stopped safely', () => {
  const events = []
  const instances = []
  class FakeRecognition {
    start() { this.started = true }
    stop() { this.stopped = true; this.onend?.() }
  }
  const recognition = createVoiceRecognition({
    recognitionFactory: () => { const instance = new FakeRecognition(); instances.push(instance); return instance },
    language: 'en',
    onTranscript: (text, isFinal) => events.push({ text, isFinal }),
  })
  assert.equal(recognition.start().status, 'listening')
  instances[0].onresult({ results: [{ 0: { transcript: 'Hello ZT.AI' }, isFinal: true }] })
  assert.deepEqual(events, [{ text: 'Hello ZT.AI', isFinal: true }])
  assert.deepEqual(recognition.stop(), { status: 'stopped' })
  assert.equal(instances[0].stopped, true)
})

test('voice transcript does not duplicate an interim phrase when the final result arrives', () => {
  const interim = mergeVoiceTranscript('', '你好 ZT.AI', false)
  const final = mergeVoiceTranscript(interim.stable, '你好 ZT.AI', true)
  assert.equal(interim.display, '你好 ZT.AI')
  assert.equal(final.stable, '你好 ZT.AI')
  assert.equal(final.display, '你好 ZT.AI')
})

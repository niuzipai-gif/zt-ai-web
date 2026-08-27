import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseRecorderMime, createVoiceAudioController, createVoicePlayback, createVoiceRecognition, formatVoiceRecognitionError, mergeVoiceTranscript } from './voice-audio.js'

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

test('cross-origin audio keeps native output instead of routing through a CORS-less analyser', async () => {
  const sourceCalls = []
  const audio = {
    preload: '', src: '', currentTime: 0, paused: true,
    addEventListener() {}, removeEventListener() {}, pause() { this.paused = true },
    async play() { this.paused = false },
  }
  class FakeAudioContext {
    constructor() { this.destination = {} }
    createAnalyser() { return { connect() {} } }
    createMediaElementSource() { sourceCalls.push('createMediaElementSource'); return { connect() {} } }
    resume() {}
    close() {}
  }
  const previousLocation = globalThis.location
  globalThis.location = { href: 'https://niuzipai-gif.github.io/zt-ai-web/', origin: 'https://niuzipai-gif.github.io' }
  try {
    const playback = createVoicePlayback({ audioFactory: () => audio, audioContextFactory: FakeAudioContext })
    playback.load('https://minimax-algeng-chat-tts.oss-cn-wulanchabu.aliyuncs.com/greeting.mp3')
    assert.equal((await playback.play()).status, 'speaking')
    assert.deepEqual(sourceCalls, [])
    playback.dispose()
  } finally {
    if (previousLocation === undefined) delete globalThis.location
    else globalThis.location = previousLocation
  }
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

test('speech recognition exposes the native end event for final transcript handoff', () => {
  let ended = 0
  class FakeRecognition {
    start() {}
    stop() { this.onend?.() }
  }
  const recognition = createVoiceRecognition({
    recognitionFactory: () => new FakeRecognition(),
    onEnd: () => { ended += 1 },
  })
  assert.equal(recognition.start().status, 'listening')
  recognition.stop()
  assert.equal(ended, 1)
})

test('speech recognition leaves the language unset in auto mode', () => {
  const instances = []
  class FakeRecognition { start() {} stop() {} }
  const recognition = createVoiceRecognition({
    language: 'auto',
    recognitionFactory: () => { const instance = new FakeRecognition(); instances.push(instance); return instance },
  })
  assert.equal(recognition.start().status, 'listening')
  assert.notEqual(instances[0].lang, 'zh-CN')
})

test('voice transcript does not duplicate an interim phrase when the final result arrives', () => {
  const interim = mergeVoiceTranscript('', '你好 ZT.AI', false)
  const final = mergeVoiceTranscript(interim.stable, '你好 ZT.AI', true)
  assert.equal(interim.display, '你好 ZT.AI')
  assert.equal(final.stable, '你好 ZT.AI')
  assert.equal(final.display, '你好 ZT.AI')
})

test('voice recognition errors are translated into actionable messages', () => {
  const copy = { voiceBrowserUnsupported: '请改用 Safari', voicePermissionDenied: '请开启麦克风', voiceNetworkError: '请检查网络' }
  assert.equal(formatVoiceRecognitionError('service-not-allowed', copy), '请改用 Safari')
  assert.equal(formatVoiceRecognitionError('not-allowed', copy), '请开启麦克风')
  assert.equal(formatVoiceRecognitionError('network', copy), '请检查网络')
})

test('speech recognition resets after a service error so the next tap can retry', () => {
  const instances = []
  class FakeRecognition {
    start() { this.started = true }
    stop() { this.stopped = true }
  }
  const recognition = createVoiceRecognition({
    recognitionFactory: () => { const instance = new FakeRecognition(); instances.push(instance); return instance },
    onError: () => {},
  })
  assert.equal(recognition.start().status, 'listening')
  instances[0].onerror({ error: 'service-not-allowed' })
  assert.equal(recognition.isListening(), false)
  assert.equal(recognition.start().status, 'listening')
  assert.equal(instances.length, 2)
})

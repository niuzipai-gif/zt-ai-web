import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseRecorderMime, createVoiceAudioController, createVoicePlayback, createVoiceRecognition, formatVoiceRecognitionError, mergeVoiceTranscript, prepareVoicePlayback } from './voice-audio.js'

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

test('replaying a completed voice answer starts from the beginning', async () => {
  const audio = {
    preload: '', src: '', currentTime: 0, paused: true, ended: false,
    listeners: new Map(),
    addEventListener(name, callback) { this.listeners.set(name, callback) },
    removeEventListener(name) { this.listeners.delete(name) },
    pause() { this.paused = true },
    load() {},
    async play() { this.paused = false; this.ended = false },
  }
  const playback = createVoicePlayback({ audioFactory: () => audio })
  playback.load('https://safe.test/reply.mp3')
  audio.currentTime = 8
  audio.ended = true
  audio.listeners.get('ended')?.()
  await playback.play()
  assert.equal(audio.currentTime, 0)
  playback.dispose()
})

test('waits for remote audio readiness before starting playback', async () => {
  const calls = []
  const listeners = new Map()
  const audio = {
    preload: '', src: '', currentTime: 0, paused: true, ended: false, readyState: 0,
    addEventListener(name, callback) { listeners.set(name, callback) },
    removeEventListener(name) { listeners.delete(name) },
    pause() { this.paused = true },
    load() {},
    play() { calls.push('play'); this.paused = false; return Promise.resolve() },
  }
  const playback = createVoicePlayback({ audioFactory: () => audio })
  playback.load('https://safe.test/greeting.mp3')
  const pending = playback.play()
  await Promise.resolve()
  assert.deepEqual(calls, [])
  audio.readyState = 3
  listeners.get('loadeddata')?.()
  assert.equal((await pending).status, 'speaking')
  assert.deepEqual(calls, ['play'])
  playback.dispose()
})

test('voice assistant unlocks one audio element before async synthesis and reuses it for playback', async () => {
  const calls = []
  const audio = {
    preload: '', src: '', currentTime: 0, paused: true, ended: false, muted: false,
    addEventListener() {}, removeEventListener() {},
    pause() { this.paused = true },
    load() {},
    play() { calls.push(this.src); this.paused = false; return Promise.resolve() },
  }
  const prepared = prepareVoicePlayback({ audioFactory: () => audio })
  assert.equal(prepared, audio)
  assert.equal(audio.loop, true)
  assert.equal(calls.length, 1)
  assert.match(calls[0], /^data:audio\/wav;base64,/)

  const playback = createVoicePlayback({ audioElement: prepared, audioFactory: () => { throw new Error('created a second audio element') } })
  playback.load('https://safe.test/greeting.mp3')
  await playback.play()
  assert.deepEqual(calls, [calls[0], 'https://safe.test/greeting.mp3'])
  playback.dispose()
})

test('keeps the unlocked audio route warm during greeting synthesis and switches after a controlled pre-roll', async () => {
  const calls = []
  const makeAudio = () => ({
    preload: '', src: '', currentTime: 0, paused: true, ended: false, readyState: 4, loop: false,
    addEventListener() {}, removeEventListener() {},
    pause() { this.paused = true },
    load() {},
    play() { calls.push({ src: this.src, loop: this.loop }); this.paused = false; return Promise.resolve() },
  })
  const audio = makeAudio()
  const preloadAudio = makeAudio()
  const prepared = prepareVoicePlayback({ audioFactory: () => audio })
  const sleeps = []
  const playback = createVoicePlayback({
    audioElement: prepared,
    audioFactory: () => { throw new Error('created a second playback element') },
    preloadAudioFactory: () => preloadAudio,
    sleep: async milliseconds => { sleeps.push(milliseconds) },
  })

  playback.load('https://safe.test/greeting.mp3', { preRollMs: 900 })
  const result = await playback.play()

  assert.equal(result.status, 'speaking')
  assert.equal(preloadAudio.src, 'https://safe.test/greeting.mp3')
  assert.deepEqual(sleeps, [900])
  assert.deepEqual(calls.map(call => call.src), [calls[0].src, 'https://safe.test/greeting.mp3'])
  assert.match(calls[0].src, /^data:audio\/wav;base64,/)
  assert.equal(audio.loop, false)
  playback.dispose()
})

test('greeting playback waits for enough decoded audio before leaving the silent pre-roll', async () => {
  const calls = []
  let sleepCalled = false
  const listeners = new Map()
  const makeAudio = readyState => ({
    preload: '', src: '', currentTime: 0, paused: true, ended: false, readyState, loop: false,
    addEventListener(name, callback) { listeners.set(`${this.src}:${name}`, callback) },
    removeEventListener() {},
    pause() { this.paused = true },
    load() {},
    play() { calls.push(this.src); this.paused = false; return Promise.resolve() },
  })
  const audio = makeAudio(4)
  const preloader = makeAudio(3)
  const prepared = prepareVoicePlayback({ audioFactory: () => audio })
  const playback = createVoicePlayback({
    audioElement: prepared,
    audioFactory: () => { throw new Error('created a second playback element') },
    preloadAudioFactory: () => preloader,
    sleep: async () => { sleepCalled = true },
  })
  playback.load('https://safe.test/greeting.mp3', { preRollMs: 1_400 })
  const pending = playback.play()
  await Promise.resolve()
  assert.deepEqual(calls, [calls[0]])
  assert.equal(sleepCalled, false)
  preloader.readyState = 4
  listeners.get('https://safe.test/greeting.mp3:canplaythrough')?.()
  assert.equal((await pending).status, 'speaking')
  assert.deepEqual(calls, [calls[0], 'https://safe.test/greeting.mp3'])
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

test('speech recognition can start again after the browser ends a session naturally', () => {
  const instances = []
  class FakeRecognition {
    start() { this.started = true }
    stop() { this.stopped = true }
  }
  const recognition = createVoiceRecognition({
    recognitionFactory: () => { const instance = new FakeRecognition(); instances.push(instance); return instance },
  })
  assert.equal(recognition.start().status, 'listening')
  instances[0].onend()
  assert.equal(recognition.isListening(), false)
  assert.equal(recognition.start().status, 'listening')
  assert.equal(instances.length, 2)
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

import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseRecorderMime, createVoiceAudioController, createVoicePlayback, createVoiceRecognition, formatVoiceRecognitionError } from '../public/voice-audio.mjs'

test('desktop audio controller has the same capability fallback', async () => {
  assert.equal(chooseRecorderMime(() => false), '')
  const result = await createVoiceAudioController({ mediaDevices: null }).stop()
  assert.equal(result.status, 'unavailable')
})

test('desktop voice audio exposes recognition and playback controllers', () => {
  assert.equal(typeof createVoiceRecognition, 'function')
  assert.equal(typeof createVoicePlayback, 'function')
})

test('desktop playback keeps cross-origin audio on native output', async () => {
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
  globalThis.location = { href: 'https://zt-ai.invalid/', origin: 'https://zt-ai.invalid' }
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

test('desktop speech recognition leaves the language unset in auto mode', () => {
  const instances = []
  class FakeRecognition { start() {} stop() {} }
  const recognition = createVoiceRecognition({
    language: 'auto',
    recognitionFactory: () => { const instance = new FakeRecognition(); instances.push(instance); return instance },
  })
  assert.equal(recognition.start().status, 'listening')
  assert.notEqual(instances[0].lang, 'zh-CN')
})

test('desktop voice recognition errors are actionable', () => {
  assert.match(formatVoiceRecognitionError('service-not-allowed'), /不提供语音识别服务/)
  assert.match(formatVoiceRecognitionError('not-allowed'), /权限未开启/)
})

test('desktop speech recognition resets after a service error', () => {
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

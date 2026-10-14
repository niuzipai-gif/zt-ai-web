import test from 'node:test'
import assert from 'node:assert/strict'
import * as audio from './voice-audio.js'

test('server capture records PCM WAV independently of browser speech recognition', async () => {
  assert.equal(typeof audio.createPcmVoiceRecorder, 'function')
  let stopped = 0
  let processor
  class Context {
    constructor() { this.sampleRate = 48000; this.destination = {}; this.state = 'running' }
    resume() {} close() {} createMediaStreamSource() { return { connect() {}, disconnect() {} } }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} } }
    createAnalyser() { return { fftSize: 256 } }
    createScriptProcessor() { processor = { connect() {}, disconnect() {} }; return processor }
  }
  const recorder = audio.createPcmVoiceRecorder({ mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stopped += 1 } }] }) }, audioContextFactory: Context })
  assert.equal((await recorder.start()).status, 'recording')
  processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array([0.5, 0.5, 0.5, -0.5, -0.5, -0.5]) } })
  const result = await recorder.stop()
  assert.equal(result.mimeType, 'audio/wav')
  const bytes = Buffer.from(await result.blob.arrayBuffer())
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE')
  assert.equal(bytes.readUInt32LE(24), 16000)
  assert.equal(bytes.length, 48)
  assert.ok(bytes.readInt16LE(44) > 16000)
  assert.ok(bytes.readInt16LE(46) < -16000)
  assert.equal(stopped, 1)
})

test('late microphone permission cannot restart a cancelled voice turn', async () => {
  assert.equal(typeof audio.createPcmVoiceRecorder, 'function')
  let grant
  let stopped = false
  class Context { resume() {} close() {} }
  const recorder = audio.createPcmVoiceRecorder({ mediaDevices: { getUserMedia: () => new Promise(resolve => { grant = resolve }) }, audioContextFactory: Context })
  const start = recorder.start()
  await Promise.resolve()
  recorder.cancel()
  grant({ getTracks: () => [{ stop: () => { stopped = true } }] })
  assert.equal((await start).status, 'cancelled')
  assert.equal(stopped, true)
})

test('aborted or stale native recognition does not overwrite the next turn with network errors', () => {
  let instance
  const errors = []
  class Recognition { start() {} stop() {} }
  const recognition = audio.createVoiceRecognition({ recognitionFactory: () => { instance = new Recognition(); return instance }, onError: error => errors.push(error) })
  recognition.start()
  const first = instance
  recognition.stop()
  first.onerror({ error: 'aborted' })
  recognition.start()
  first.onerror({ error: 'network' })
  assert.equal(recognition.isListening(), true)
  assert.deepEqual(errors, [])
})

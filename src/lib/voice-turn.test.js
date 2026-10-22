import test from 'node:test'
import assert from 'node:assert/strict'
import { createAutomaticVoiceCapture, pcm16Wav } from './voice-turn.js'

function fixture(extra = {}) {
  let options, starts = 0, ends = [], stopped = 0, destroyed = 0, playing = false
  const track = { stop() { stopped++ }, getSettings: () => ({ echoCancellation: true }), addEventListener() {}, removeEventListener() {} }
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
  class Context { state = 'running'; async resume() {} async close() {} createAnalyser() { return { disconnect() {} } } createMediaStreamSource() { return { connect() {}, disconnect() {} } } }
  const capture = createAutomaticVoiceCapture({ Context, mediaDevices: { getUserMedia: async () => stream }, loadVad: async () => ({ MicVAD: { new: async o => { options = o; return { start: async () => { await o.getStream() }, destroy: async () => { destroyed++ }, pause: async () => {}, setOptions() {} } } } }), isOutputActive: () => playing, onSpeechStart: () => { starts++ }, onSpeechEnd: audio => { ends.push(audio) }, ...extra })
  return { capture, track, stream, get options() { return options }, get starts() { return starts }, get ends() { return ends }, get stopped() { return stopped }, get destroyed() { return destroyed }, play(v) { playing = v } }
}

test('automatic capture only interrupts on confirmed speech, not initial VAD noise; retains first samples', async () => {
  const f = fixture(); await f.capture.start()
  f.options.onSpeechStart?.(); assert.equal(f.starts, 0)
  f.options.onSpeechRealStart(); assert.equal(f.starts, 1)
  const samples = new Float32Array(16000); samples[0] = .5
  f.options.onSpeechEnd(samples)
  assert.equal(f.ends.length, 1)
  const wav = new DataView(await f.ends[0].arrayBuffer())
  assert.equal(wav.getInt16(44, true), 16383)
  assert.ok(f.options.preSpeechPadMs >= 600)
  await f.capture.stop()
  f.options.onSpeechRealStart(); f.options.onSpeechEnd(samples)
  assert.equal(f.starts, 1); assert.equal(f.ends.length, 1); assert.ok(f.stopped > 0)
})

test('known missing echo cancellation never lets speaker output become a visitor turn', async () => {
  const f = fixture(); f.track.getSettings = () => ({ echoCancellation: false })
  await f.capture.start(); f.play(true)
  f.options.onSpeechRealStart(); f.options.onSpeechEnd(new Float32Array(16000))
  assert.equal(f.starts, 0); assert.equal(f.ends.length, 0)
  f.play(false); f.options.onSpeechRealStart(); f.options.onSpeechEnd(new Float32Array(16000))
  assert.equal(f.starts, 1); assert.equal(f.ends.length, 1)
  await f.capture.stop()
})

test('closing during model loading releases the microphone and ignores late initialization', async () => {
  let resolve
  const f = fixture({ loadVad: () => new Promise(r => { resolve = r }) })
  const start = f.capture.start(); await new Promise(r => setImmediate(r)); await f.capture.stop()
  resolve({ MicVAD: { new: async () => { throw Error('must not initialize after cancel') } } })
  assert.equal((await start).status, 'cancelled'); assert.ok(f.stopped > 0)
})

test('WAV encoding clips safely and rejects oversized / empty speech', () => {
  assert.throws(() => pcm16Wav(new Float32Array()), /audio/)
  assert.throws(() => pcm16Wav(new Float32Array(16000 * 91)), /audio/)
})

test('cancelling while VAD nodes initialize stops tracks immediately and destroys after initialization', async () => {
  let resolveNew, destroyed = 0
  const f = fixture({ loadVad: async () => ({ MicVAD: { new: () => new Promise(resolve => { resolveNew = resolve }) } }) })
  const starting = f.capture.start(); await new Promise(r => setImmediate(r))
  const stopping = f.capture.stop()
  assert.ok(f.stopped > 0)
  resolveNew({ start: async () => {}, destroy: async () => { destroyed++ } })
  await stopping
  assert.equal((await starting).status, 'cancelled'); assert.equal(destroyed, 1)
})

test('permission denial and model failure can be retried without stale speech callbacks', async () => {
  let denied = true
  const f = fixture({ mediaDevices: { getUserMedia: async () => { if (denied) throw new DOMException('denied', 'NotAllowedError'); return f.stream } } })
  assert.equal((await f.capture.start()).error, 'permission-denied')
  denied = false
  assert.equal((await f.capture.start()).status, 'recording')
  await f.capture.stop()
})

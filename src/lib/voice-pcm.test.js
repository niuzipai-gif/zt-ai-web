import test from 'node:test'
import assert from 'node:assert/strict'
import { createPcmSpeechPlayer } from './voice-pcm.js'

function fixture() {
  const sources = [], events = []
  class Context {
    constructor() { this.currentTime = 0; this.state = 'suspended'; this.destination = {} }
    async resume() { this.state = 'running' }
    async close() { this.state = 'closed' }
    createAnalyser() { return { connect() {}, disconnect() {} } }
    createBuffer(_, count, rate) { const samples = new Float32Array(count); return { duration: count / rate, getChannelData: () => samples } }
    createBufferSource() { const s = { connect() {}, disconnect() {}, start(time) { this.time = time }, stop() { this.stopped = true } }; sources.push(s); return s }
  }
  const player = createPcmSpeechPlayer({ Context, onStateChange: e => events.push(e.status) })
  const frame = sequence => ({ audio: Buffer.from([255, 127, 0, 128]).toString('base64'), sequence, sampleRate: 32000 })
  return { player, sources, events, frame, Context }
}

test('device suspension cancels playback instead of leaving a silent speaking indicator', async () => {
  const f = fixture(); let context
  class Context extends f.Context { constructor() { super(); context = this } }
  const events = [], player = createPcmSpeechPlayer({ Context, onStateChange: event => events.push(event.status) })
  await player.unlock(); player.begin(); player.push(f.frame(0))
  const finished = player.finish()
  context.state = 'suspended'; context.onstatechange?.()
  await assert.rejects(finished, { name: 'AbortError' })
  assert.equal(events.at(-1), 'blocked')
  player.dispose()
})

test('suspension before first audio fails instead of queuing inaudible samples', async () => {
  const f = fixture(); let context
  class Context extends f.Context { constructor() { super(); context = this } }
  const events = [], player = createPcmSpeechPlayer({ Context, onStateChange: e => events.push(e.status) })
  await player.unlock(); player.begin(); context.state = 'suspended'; context.onstatechange?.()
  assert.throws(() => player.push(f.frame(0)), /暂停/)
  assert.equal(events.at(-1), 'blocked'); player.dispose()
})

test('PCM playback preserves the first sample, schedules in order, and waits for final audio', async () => {
  const f = fixture()
  assert.equal(await f.player.unlock(), true)
  f.player.begin()
  f.player.push(f.frame(0)); f.player.push(f.frame(1))
  assert.ok(f.sources[1].time > f.sources[0].time)
  assert.ok(f.sources[0].buffer.getChannelData(0)[0] > 0.99)
  let done = false
  const finish = f.player.finish().then(() => { done = true })
  f.sources[0].onended(); await Promise.resolve()
  assert.equal(done, false)
  f.sources[1].onended(); await finish
  assert.equal(done, true)
  f.player.dispose()
})

test('interruption stops all scheduled sources and old completion cannot end the next turn', async () => {
  const f = fixture(); await f.player.unlock(); f.player.begin()
  f.player.push(f.frame(0))
  const oldEnded = f.sources[0].onended
  const old = f.player.finish()
  f.player.stop()
  await assert.rejects(old, { name: 'AbortError' })
  assert.equal(f.sources[0].stopped, true)
  f.player.begin(); f.player.push(f.frame(0)); oldEnded()
  assert.notEqual(f.events.at(-1), 'idle')
  f.player.dispose()
})

test('duplicate, missing and malformed chunks fail instead of corrupting playback', async () => {
  const f = fixture(); await f.player.unlock(); f.player.begin()
  assert.throws(() => f.player.push(f.frame(1)), /顺序/)
  assert.throws(() => f.player.push({ ...f.frame(0), audio: '!!!' }), /音频/)
  f.player.push(f.frame(0))
  assert.throws(() => f.player.push(f.frame(0)), /顺序/)
  f.player.dispose()
})

test('an empty playback queue returns to processing while awaiting more audio', async () => {
  const f = fixture(); await f.player.unlock(); f.player.begin()
  f.player.push(f.frame(0)); f.sources[0].onended()
  assert.equal(f.events.at(-1), 'processing')
  f.player.push(f.frame(1))
  const finished = f.player.finish()
  f.sources[1].onended(); await finished
  assert.equal(f.events.at(-1), 'idle')
  f.player.dispose()
})

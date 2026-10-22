import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createBidiSpeech } from './minimax-bidi.js'

function fixture(options = {}) {
  let socket
  class Socket extends EventEmitter {
    constructor(url, init) { super(); this.url = url; this.init = init; this.readyState = 1; this.sent = []; socket = this; queueMicrotask(() => this.event('connected_success')) }
    event(event, extra = {}) { this.emit('message', Buffer.from(JSON.stringify({ event, ...extra }))) }
    send(raw) { const data = JSON.parse(raw); this.sent.push(data); if (data.event === 'task_start') queueMicrotask(() => this.event('task_started')); if (data.event === 'task_finish') queueMicrotask(() => this.event('task_finished')) }
    close() { this.readyState = 3; this.emit('close') }
    terminate() { this.close() }
    ping() {}
  }
  const chunks = []
  const speech = createBidiSpeech({ apiKey: 'fixture', baseUrl: 'https://api.minimax.cn/v1', settings: { model: 'speech-2.8-hd', voice_setting: { voice_id: 'owner-voice' } }, WebSocketImpl: Socket, onAudio: chunk => chunks.push(chunk), ...options })
  return { speech, chunks, get socket() { return socket } }
}

test('bidi waits for handshake, preserves text and finishes only at task_finished', async () => {
  const f = fixture()
  await f.speech.write('你好，我是蔡宙廷。')
  assert.equal(f.socket.url, 'wss://api.minimax.cn/ws/v1/t2a_v2_bidi')
  assert.equal(f.socket.init.headers.Authorization, 'Bearer fixture')
  assert.equal(f.socket.sent[0].voice_setting.voice_id, 'owner-voice')
  assert.equal(f.socket.sent[0].audio_setting.format, 'pcm')
  f.socket.event('task_continued', { data: { audio: '0000ff7f0080' }, is_final: true })
  f.socket.event('sentence_end')
  await f.speech.write('第二句。')
  await f.speech.finish()
  assert.equal(f.chunks[0].audio, Buffer.from('0000ff7f0080', 'hex').toString('base64'))
  assert.deepEqual(f.socket.sent.map(x => x.event), ['task_start', 'task_continue', 'task_continue', 'task_finish'])
})

test('cancel stops upstream and ignores audio that arrives after interruption', async () => {
  const abort = new AbortController()
  const f = fixture({ signal: abort.signal })
  await f.speech.write('第一句。')
  abort.abort()
  f.socket.event('task_continued', { data: { audio: '0000' } })
  await assert.rejects(f.speech.finish(), { name: 'AbortError' })
  assert.equal(f.chunks.length, 0)
  assert.ok(f.socket.sent.some(x => x.event === 'task_cancel'))
})

test('unexpected close and queue rejection fail safely instead of replaying speech', async () => {
  const f = fixture()
  await f.speech.write('hello.')
  f.socket.close()
  await assert.rejects(f.speech.finish(), /中断/)
  const g = fixture()
  await g.speech.write('hello.')
  g.socket.event('task_failed', { base_resp: { status_code: 2205, status_msg: 'private details' } })
  await assert.rejects(g.speech.finish(), error => error.providerCode === 2205 && !error.message.includes('private details'))
  assert.equal(g.socket.sent.filter(x => x.event === 'task_continue').length, 1)
})

test('invalid PCM, limits and missing task completion cannot look like success', async () => {
  const f = fixture()
  await f.speech.write('hello.')
  f.socket.event('task_continued', { data: { audio: 'not hex' } })
  await assert.rejects(f.speech.finish(), /音频/)
  const g = fixture({ maxTextChars: 3 })
  await assert.rejects(g.speech.write('too long'), /长度/)
  g.speech.cancel()
})

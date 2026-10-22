import test from 'node:test'
import assert from 'node:assert/strict'
import { createSpeechTextBuffer, createChatSpeech } from './voice-stream.js'

test('spoken buffer preserves sentence boundaries and never reads split fences or link URLs', () => {
  const buffer = createSpeechTextBuffer('en')
  assert.equal(buffer.push('Hello'), '')
  assert.equal(buffer.push(', there. '), 'Hello, there.')
  assert.equal(buffer.push('See [this guide](https://exa'), '')
  assert.equal(buffer.push('mple.com/a). '), 'See this guide.')
  assert.equal(buffer.push('```js\nsecret code. '), '')
  assert.equal(buffer.push('\n```\nDone. '), 'Done.')
  assert.equal(buffer.push('Final short tail'), '')
  assert.equal(buffer.push('', true), 'Final short tail')
  assert.equal(createSpeechTextBuffer('ja').push('蔡宙廷（さい・ちょうてい）です。'), '蔡宙廷です。')
})

test('cancelling a queued voice turn must not open an upstream connection', async t => {
  const old = process.env.MMX_API_KEY, oldVoice = process.env.MINIMAX_VOICE_ID
  process.env.MMX_API_KEY = 'fixture'; process.env.MINIMAX_VOICE_ID = 'owner'
  t.after(() => { if (old === undefined) delete process.env.MMX_API_KEY; else process.env.MMX_API_KEY = old; if (oldVoice === undefined) delete process.env.MINIMAX_VOICE_ID; else process.env.MINIMAX_VOICE_ID = oldVoice })
  let created = 0
  const speech = createChatSpeech({ language: 'zh', factory: () => { created += 1; return {} } })
  speech.write('你好。'); speech.cancel()
  await assert.rejects(speech.finish())
  assert.equal(created, 0)
})

test('streaming concurrency is bounded and every completion or cancel releases its slot', async t => {
  const old = process.env.MMX_API_KEY, oldVoice = process.env.MINIMAX_VOICE_ID
  process.env.MMX_API_KEY = 'fixture'; process.env.MINIMAX_VOICE_ID = 'owner'
  t.after(() => { if (old === undefined) delete process.env.MMX_API_KEY; else process.env.MMX_API_KEY = old; if (oldVoice === undefined) delete process.env.MINIMAX_VOICE_ID; else process.env.MINIMAX_VOICE_ID = oldVoice })
  let created = 0
  const factory = () => { created += 1; return { async write() {}, async finish() {}, cancel() {} } }
  const streams = Array.from({ length: 5 }, () => createChatSpeech({ language: 'zh', factory }))
  t.after(() => streams.forEach(stream => stream.cancel()))
  streams.forEach(stream => stream.write('你好。'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(created, 4)
  await assert.rejects(streams[4].finish(), /繁忙/)
  streams[0].cancel(); streams[0].cancel()
  const retry = createChatSpeech({ language: 'zh', factory })
  t.after(() => retry.cancel())
  retry.write('新的回答。'); await retry.finish()
  await Promise.all(streams.slice(1, 4).map(stream => stream.finish()))
  assert.equal(created, 5)
})

test('cancel during voice registry resolution releases reservation and never opens a late socket', async t => {
  const old = process.env.MMX_API_KEY, oldVoice = process.env.MINIMAX_VOICE_ID
  process.env.MMX_API_KEY = 'fixture'; process.env.MINIMAX_VOICE_ID = 'owner'
  t.after(() => { if (old === undefined) delete process.env.MMX_API_KEY; else process.env.MMX_API_KEY = old; if (oldVoice === undefined) delete process.env.MINIMAX_VOICE_ID; else process.env.MINIMAX_VOICE_ID = oldVoice })
  const resolvers = []; let created = 0
  const streams = Array.from({ length: 4 }, () => createChatSpeech({ language: 'en', resolveVoice: () => new Promise(resolve => resolvers.push(resolve)), factory: () => { created++; return { async write() {}, async finish() {}, cancel() {} } } }))
  streams.forEach(stream => stream.write('Hello. '))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(resolvers.length, 4)
  streams.forEach(stream => stream.cancel())
  resolvers.forEach(resolve => resolve('owner'))
  await Promise.all(streams.map(stream => assert.rejects(stream.finish())))
  assert.equal(created, 0)
  const next = createChatSpeech({ language: 'en', factory: () => { created++; return { async write() {}, async finish() {}, cancel() {} } } })
  next.write('Hello. '); await next.finish(); assert.equal(created, 1)
})

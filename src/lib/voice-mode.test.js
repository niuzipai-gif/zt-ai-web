import test from 'node:test'
import assert from 'node:assert/strict'
import { createVoiceGreetingState, createVoiceState, detectVoiceLanguage, startVoiceCapture, transitionVoiceGreeting, transitionVoiceState } from './voice-mode.js'

test('voice capture starts recognition before awaiting microphone permission', async () => {
  const calls = []
  const result = await startVoiceCapture({
    recognition: {
      start: () => { calls.push('recognition'); return { status: 'listening' } },
      stop: () => calls.push('stop-recognition'),
    },
    recorder: { start: async () => { calls.push('recorder'); return { status: 'recording' } } },
  })
  assert.deepEqual(calls, ['recognition', 'recorder'])
  assert.equal(result.status, 'recording')
})

test('voice capture stops recognition when microphone permission fails', async () => {
  const calls = []
  const result = await startVoiceCapture({
    recognition: {
      start: () => { calls.push('recognition'); return { status: 'listening' } },
      stop: () => calls.push('stop-recognition'),
    },
    recorder: { start: async () => { calls.push('recorder'); return { status: 'unavailable', error: '麦克风权限未开启' } } },
  })
  assert.deepEqual(calls, ['recognition', 'recorder', 'stop-recognition'])
  assert.equal(result.status, 'unavailable')
})

test('voice lifecycle moves from idle through listening, processing and speaking', () => {
  let state = createVoiceState()
  state = transitionVoiceState(state, { type: 'start-listening' })
  assert.equal(state.status, 'listening')
  state = transitionVoiceState(state, { type: 'finish-listening', transcript: '你好' })
  assert.deepEqual(state, { status: 'processing', transcript: '你好', error: '', audioUrl: '' })
  state = transitionVoiceState(state, { type: 'start-speaking', audioUrl: 'https://example.test/answer.mp3' })
  assert.equal(state.status, 'speaking')
  assert.equal(state.audioUrl, 'https://example.test/answer.mp3')
  state = transitionVoiceState(state, { type: 'finish-speaking' })
  assert.equal(state.status, 'idle')
})

test('voice lifecycle keeps a recoverable error and cancels without stale audio', () => {
  const failed = transitionVoiceState(createVoiceState(), { type: 'fail', error: '语音暂时不可用' })
  assert.deepEqual(failed, { status: 'error', transcript: '', error: '语音暂时不可用', audioUrl: '' })
  const reset = transitionVoiceState(failed, { type: 'reset' })
  assert.equal(reset.status, 'idle')
  assert.equal(reset.audioUrl, '')
})

test('voice lifecycle keeps interim recognition text while listening', () => {
  const state = transitionVoiceState(
    transitionVoiceState(createVoiceState(), { type: 'start-listening' }),
    { type: 'update-transcript', transcript: '正在说话' },
  )
  assert.equal(state.status, 'listening')
  assert.equal(state.transcript, '正在说话')
})

test('voice greeting is prepared on open and remains manually replayable when autoplay is blocked', () => {
  let greeting = createVoiceGreetingState('你好，我是 ZT.AI。')
  assert.deepEqual(greeting, { status: 'idle', text: '你好，我是 ZT.AI。', audioUrl: '', error: '' })
  greeting = transitionVoiceGreeting(greeting, { type: 'start' })
  assert.equal(greeting.status, 'loading')
  greeting = transitionVoiceGreeting(greeting, { type: 'ready', audioUrl: 'https://example.test/greeting.mp3' })
  assert.equal(greeting.status, 'ready')
  greeting = transitionVoiceGreeting(greeting, { type: 'blocked', error: '需要点击播放' })
  assert.equal(greeting.status, 'blocked')
  greeting = transitionVoiceGreeting(greeting, { type: 'start-speaking' })
  assert.equal(greeting.status, 'speaking')
  greeting = transitionVoiceGreeting(greeting, { type: 'finish-speaking' })
  assert.equal(greeting.status, 'idle')
})

test('voice language follows the recognized speech instead of the selected interface language', () => {
  assert.equal(detectVoiceLanguage('请介绍一下你的项目', 'en'), 'zh')
  assert.equal(detectVoiceLanguage('Please introduce your current project', 'zh'), 'en')
  assert.equal(detectVoiceLanguage('現在のプロジェクトを紹介してください', 'zh'), 'ja')
  assert.equal(detectVoiceLanguage('12345', 'ja'), 'ja')
})

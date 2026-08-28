import test from 'node:test'
import assert from 'node:assert/strict'
import { createVoiceGreetingState, createVoiceState, detectVoiceLanguage, startVoiceCapture, transitionVoiceGreeting, transitionVoiceState } from '../public/voice-mode.mjs'

test('desktop voice capture starts recognition before awaiting microphone permission', async () => {
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

test('desktop voice lifecycle uses the same state names and transitions', () => {
  let state = transitionVoiceState(createVoiceState(), { type: 'start-listening' })
  state = transitionVoiceState(state, { type: 'finish-listening', transcript: '测试语音' })
  state = transitionVoiceState(state, { type: 'start-speaking', audioUrl: 'https://example.test/voice.mp3' })
  assert.deepEqual(state, { status: 'speaking', transcript: '测试语音', error: '', audioUrl: 'https://example.test/voice.mp3' })
  assert.deepEqual(transitionVoiceState(state, { type: 'cancel' }), { status: 'idle', transcript: '', error: '', audioUrl: '' })
})

test('desktop voice greeting keeps a manual replay state after autoplay is blocked', () => {
  let greeting = transitionVoiceGreeting(createVoiceGreetingState('你好，我是 ZT.AI。'), { type: 'start' })
  greeting = transitionVoiceGreeting(greeting, { type: 'ready', audioUrl: 'https://example.test/greeting.mp3' })
  greeting = transitionVoiceGreeting(greeting, { type: 'blocked' })
  assert.equal(greeting.status, 'blocked')
  assert.equal(transitionVoiceGreeting(greeting, { type: 'start-speaking' }).status, 'speaking')
})

test('desktop voice reply language follows recognized speech', () => {
  assert.equal(detectVoiceLanguage('Please explain this workflow', 'zh'), 'en')
  assert.equal(detectVoiceLanguage('この機能を説明してください', 'zh'), 'ja')
  assert.equal(detectVoiceLanguage('请解释这个流程', 'en'), 'zh')
})

test('desktop voice text submission can replace a speaking answer after interruption', () => {
  const speaking = transitionVoiceState(createVoiceState(), { type: 'start-speaking', audioUrl: 'https://example.test/old-answer.mp3' })
  const next = transitionVoiceState(speaking, { type: 'start-processing', transcript: '打断后输入的新问题' })
  assert.deepEqual(next, { status: 'processing', transcript: '打断后输入的新问题', error: '', audioUrl: '' })
})

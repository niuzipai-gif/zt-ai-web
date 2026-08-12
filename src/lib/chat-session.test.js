import test from 'node:test'
import assert from 'node:assert/strict'
import { createSessionState, loadSessionState, saveSessionState } from './chat-session.js'

test('persists messages independently from the selected model', () => {
  const storage = new Map()
  const state = createSessionState([{ id: 'u1', role: 'user', text: '你好' }], 'MINIMAX')
  saveSessionState(storage, state)
  const restored = loadSessionState(storage)
  assert.deepEqual(restored.messages, state.messages)
  assert.equal(restored.model, 'MINIMAX')
  const switched = { ...restored, model: 'DEEPSEEK' }
  saveSessionState(storage, switched)
  assert.deepEqual(loadSessionState(storage).messages, state.messages)
  assert.equal(loadSessionState(storage).model, 'DEEPSEEK')
})

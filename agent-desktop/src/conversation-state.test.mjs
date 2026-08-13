import test from 'node:test'
import assert from 'node:assert/strict'
import { addConversationMessage, createConversation, createEmptyConversation, normalizeConversations } from '../public/conversation-state.mjs'

test('creates independent conversations with isolated messages', () => {
  const first = createConversation('chat-1', 100)
  const second = createEmptyConversation('chat-2', 200)
  const updated = addConversationMessage(second, { role: 'user', content: '检查接口' }, 300)

  assert.notEqual(first.id, updated.id)
  assert.equal(first.messages.length, 1)
  assert.equal(second.messages.length, 0)
  assert.equal(updated.messages.at(-1).content, '检查接口')
  assert.equal(updated.title, '检查接口')
})

test('normalizes invalid stored conversations without sharing references', () => {
  const stored = normalizeConversations([{ id: 'chat-1', title: '旧对话', messages: [{ role: 'user', content: '你好' }] }])
  stored[0].messages.push({ role: 'assistant', content: '回复' })

  assert.equal(stored.length, 1)
  assert.equal(stored[0].messages.length, 2)
  assert.deepEqual(normalizeConversations(null), [])
})

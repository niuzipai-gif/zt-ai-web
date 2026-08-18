import test from 'node:test'
import assert from 'node:assert/strict'
import { addConversationMessage, conversationStorageKeys, createConversation, createEmptyConversation, mergeServerConversations, normalizeConversations } from '../public/conversation-state.mjs'

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

test('uses a separate persistent conversation namespace for every desktop account', () => {
  const first = conversationStorageKeys('user-a')
  const second = conversationStorageKeys('user-b')

  assert.notEqual(first.chats, second.chats)
  assert.notEqual(first.active, second.active)
  assert.match(first.chats, /user-a/)
})

test('merges durable MiMo conversations without leaking another account or replacing richer local messages', () => {
  const local = [addConversationMessage(createConversation('chat-1', 100), { role: 'user', content: '本地问题' }, 200)]
  const merged = mergeServerConversations(local, [
    { id: 'chat-1', title: '本地问题', messages: [{ role: 'user', content: '本地问题' }, { role: 'assistant', content: '本地回答' }], updatedAt: 300 },
    { id: 'chat-2', title: '另一个账号', messages: [{ role: 'user', content: '不应丢失' }], updatedAt: 400 },
  ])
  assert.equal(merged.length, 2)
  assert.equal(merged.find(item => item.id === 'chat-1').messages.at(-1).content, '本地回答')
  assert.equal(merged.find(item => item.id === 'chat-2').title, '另一个账号')
})

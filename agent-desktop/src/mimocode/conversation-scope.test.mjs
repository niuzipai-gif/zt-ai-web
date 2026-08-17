import test from 'node:test'
import assert from 'node:assert/strict'
import { scopedConversationId } from './conversation-scope.mjs'

test('MiMo session ids are scoped by the approved desktop account as well as the local chat', () => {
  assert.equal(scopedConversationId('user-a', 'chat-1'), 'user-a:chat-1')
  assert.equal(scopedConversationId('user-b', 'chat-1'), 'user-b:chat-1')
  assert.notEqual(scopedConversationId('user-a', 'chat-1'), scopedConversationId('user-b', 'chat-1'))
})

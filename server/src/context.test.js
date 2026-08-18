import test from 'node:test'
import assert from 'node:assert/strict'
import { clientContext } from './index.js'

test('authenticated desktop context is grouped by account and keeps conversation headers', () => {
  const context = clientContext({
    headers: { 'x-forwarded-for': '203.0.113.42', 'x-zt-conversation-id': 'header-chat', 'user-agent': 'test-agent' },
    socket: { remoteAddress: '127.0.0.1' },
  }, { visitorId: 'anonymous' }, { user: { id: 'user-niulai' } }, 'desktop-agent')
  assert.equal(context.visitorId, 'account-user-niulai')
  assert.equal(context.conversationId, 'header-chat')
  assert.equal(context.ip, '203.0.113.42')
})

test('public context keeps the visitor-provided id', () => {
  const context = clientContext({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }, { visitorId: 'browser-1', conversationId: 'chat-1' })
  assert.equal(context.visitorId, 'browser-1')
  assert.equal(context.conversationId, 'chat-1')
})

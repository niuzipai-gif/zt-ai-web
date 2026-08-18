import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createAdminApi } from './admin.js'
import { createAuthService } from './auth.js'
import { JsonDataStore } from './data-store.js'
import { createTelemetry } from './telemetry.js'

async function setup() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-ai-admin-'))
  const store = new JsonDataStore(path.join(dir, 'data.json'))
  const auth = createAuthService({ store, adminPassword: 'admin-test-password', requireEmailVerification: false })
  const telemetry = createTelemetry({ store })
  return { admin: createAdminApi({ auth, telemetry }), auth, telemetry }
}

test('admin routes reject unauthenticated overview and detail access', async () => {
  const { admin } = await setup()
  await assert.rejects(() => admin.overview(''), /需要管理员登录/)
  await assert.rejects(() => admin.detail('', 'missing'), /需要管理员登录/)
})

test('wrong admin password does not create a session', async () => {
  const { admin, auth } = await setup()
  await assert.rejects(() => admin.login('wrong-password'), /管理员账号或密码错误/)
  const data = await auth.store.read()
  assert.equal(data.adminSessions.length, 0)
})

test('admin detail contains full IP while visitor list is masked', async () => {
  const { admin, telemetry } = await setup()
  await telemetry.recordRequest({ product: 'web', visitorId: 'browser-1', conversationId: 'chat-1', model: 'MiniMax-M3', requestType: 'chat', status: 'success', ip: '203.0.113.42', inputText: 'hello', outputText: 'world' })
  const { token } = await admin.login('admin-test-password')
  const visitors = await admin.visitors(token)
  assert.equal(visitors[0].maskedIp, '203.0.*.*')
  assert.equal('lastIp' in visitors[0], false)
  const detail = await admin.detail(token, visitors[0].id)
  assert.equal(detail.visitor.lastIp, '203.0.113.42')
  assert.equal(detail.messages.length, 2)
})

test('admin usage requires authentication and returns filtered audit events', async () => {
  const { admin, telemetry } = await setup()
  await telemetry.recordRequest({ product: 'web', visitorId: 'browser-1', model: 'MiniMax-M3', requestType: 'chat', status: 'success', inputText: 'hello', outputText: 'world' })
  await assert.rejects(() => admin.usage('', { model: 'MiniMax-M3' }), /需要管理员登录/)
  const { token } = await admin.login('admin-test-password')
  const result = await admin.usage(token, { model: 'MiniMax-M3' })
  assert.equal(result.length, 1)
  assert.equal(result[0].estimatedTotalTokens, 4)
})

test('admin can review, approve, and revoke registered users', async () => {
  const { admin, auth } = await setup()
  const created = await auth.register({ username: 'review-me', password: 'strong-pass-123' })
  const { token } = await admin.login('admin-test-password')
  const pending = await admin.users(token, { status: 'pending' })
  assert.equal(pending.length, 1)
  assert.equal(pending[0].username, 'review-me')
  const approved = await admin.approveUser(token, created.user.id)
  assert.equal(approved.status, 'active')
  const revoked = await admin.revokeUser(token, created.user.id)
  assert.equal(revoked.status, 'revoked')
})

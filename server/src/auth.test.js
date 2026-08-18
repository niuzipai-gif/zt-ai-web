import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createAuthService } from './auth.js'
import { JsonDataStore } from './data-store.js'

async function service() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-ai-auth-'))
  return createAuthService({ store: new JsonDataStore(path.join(dir, 'data.json')), adminPassword: 'local-test-only', requireEmailVerification: false })
}

test('registration is unique and password is not stored in plaintext', async () => {
  const auth = await service()
  const first = await auth.register({ username: 'Alice', phone: '13800000001', email: 'alice@example.com', password: 'strong-pass-123' })
  assert.equal(first.user.username, 'alice')
  await assert.rejects(() => auth.register({ username: 'alice', phone: '13800000002', email: 'alice-2@example.com', password: 'different-pass' }), /用户名已存在/)
  const data = await auth.store.read()
  assert.equal(JSON.stringify(data).includes('strong-pass-123'), false)
  assert.ok(data.users[0].passwordHash)
})

test('user token expires and can be revoked', async () => {
  let now = Date.now()
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-ai-auth-'))
  const auth = createAuthService({ store: new JsonDataStore(path.join(dir, 'data.json')), adminPassword: 'local-test-only', now: () => now, requireEmailVerification: false })
  const created = await auth.register({ username: 'bob', phone: '13800000003', email: 'bob@example.com', password: 'strong-pass-123' })
  await auth.approveUser(created.user.id)
  const { token } = await auth.login({ username: 'bob', password: 'strong-pass-123' })
  assert.ok(await auth.getSession(token, 'user'))
  await auth.revoke(token, 'user')
  assert.equal(await auth.getSession(token, 'user'), null)
  const { token: expiring } = await auth.login({ username: 'bob', password: 'strong-pass-123' })
  now += 31 * 24 * 60 * 60 * 1000
  assert.equal(await auth.getSession(expiring, 'user'), null)
})

test('wrong password is rejected', async () => {
  const auth = await service()
  const created = await auth.register({ username: 'carol', phone: '13800000004', email: 'carol@example.com', password: 'strong-pass-123' })
  await auth.approveUser(created.user.id)
  await assert.rejects(() => auth.login({ username: 'carol', password: 'wrong-pass-123' }), /用户名或密码错误/)
})

test('admin password creates a short-lived session without storing the password', async () => {
  const auth = await service()
  const result = await auth.loginAdmin('local-test-only')
  assert.ok(result.token)
  assert.ok(await auth.getSession(result.token, 'admin'))
  const data = await auth.store.read()
  assert.equal(JSON.stringify(data).includes('local-test-only'), false)
})

test('registration creates a pending account without a usable session until approved', async () => {
  const auth = await service()
  const result = await auth.register({ username: 'pending-user', phone: '13800000005', email: 'pending@example.com', password: 'strong-pass-123' })
  assert.equal(result.token, undefined)
  assert.equal(result.pending, true)
  assert.equal(result.user.status, 'pending')
  await assert.rejects(() => auth.login({ username: 'pending-user', password: 'strong-pass-123' }), /等待管理员审核/)
  const approved = await auth.approveUser(result.user.id)
  assert.equal(approved.status, 'active')
  const loggedIn = await auth.login({ username: 'pending-user', password: 'strong-pass-123' })
  assert.ok(loggedIn.token)
})

test('approved accounts default to 24 hours and expire across login and session checks', async () => {
  let now = Date.now()
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-ai-auth-expiry-'))
  const auth = createAuthService({ store: new JsonDataStore(path.join(dir, 'data.json')), adminPassword: 'local-test-only', now: () => now, requireEmailVerification: false })
  const created = await auth.register({ username: 'limited-user', phone: '13800000006', email: 'limited@example.com', password: 'strong-pass-123' })
  const approved = await auth.approveUser(created.user.id)
  assert.equal(approved.accessDurationHours, 24)
  assert.equal(approved.accessExpiresAt, now + 24 * 60 * 60 * 1000)
  const loggedIn = await auth.login({ username: 'limited-user', password: 'strong-pass-123' })
  assert.ok(await auth.getSession(loggedIn.token, 'user'))
  now += 24 * 60 * 60 * 1000 + 1
  assert.equal(await auth.getSession(loggedIn.token, 'user'), null)
  await assert.rejects(() => auth.login({ username: 'limited-user', password: 'strong-pass-123' }), /使用期限已到期/)
  const listed = await auth.users({ query: 'limited-user' })
  assert.equal(listed[0].accessExpired, true)
})

test('revoking a user invalidates existing sessions and blocks future login', async () => {
  const auth = await service()
  const created = await auth.register({ username: 'revokable-user', phone: '13800000007', email: 'revokable@example.com', password: 'strong-pass-123' })
  await auth.approveUser(created.user.id)
  const session = await auth.login({ username: 'revokable-user', password: 'strong-pass-123' })
  assert.ok(await auth.getSession(session.token, 'user'))
  const revoked = await auth.revokeUser(created.user.id)
  assert.equal(revoked.status, 'revoked')
  assert.equal(await auth.getSession(session.token, 'user'), null)
  await assert.rejects(() => auth.login({ username: 'revokable-user', password: 'strong-pass-123' }), /已被注销/)
})

test('admin identity has a username and accepts the configured permanent account', async () => {
  const auth = await service()
  const result = await auth.loginAdmin({ username: 'shali', password: 'local-test-only' })
  assert.ok(result.token)
  const session = await auth.getSession(result.token, 'admin')
  assert.equal(session.user.username, 'shali')
})

test('permanent administrator credentials bootstrap a desktop workspace account', async () => {
  const auth = await service()
  const result = await auth.login({ username: 'shali', password: 'local-test-only' })
  assert.ok(result.token)
  assert.equal(result.user.username, 'shali')
  assert.equal(result.user.status, 'active')
  const data = await auth.store.read()
  assert.equal(data.users.length, 1)
  assert.equal(data.users[0].status, 'active')
  assert.equal(JSON.stringify(data).includes('local-test-only'), false)
})

test('registration collects a phone number without an unavailable verification step', async () => {
  const auth = await service()
  await assert.rejects(() => auth.register({ username: 'phone-required', password: 'strong-pass-123' }), /有效手机号/)
  const created = await auth.register({ username: 'phone-user', phone: '138 0000 0008', email: 'phone@example.com', password: 'strong-pass-123' })
  assert.equal(created.pending, true)
  assert.equal(created.user.phone, '13800000008')
  assert.equal(created.user.email, 'phone@example.com')
  await assert.rejects(() => auth.register({ username: 'phone-user-2', phone: '13800000008', email: 'phone-2@example.com', password: 'strong-pass-123' }), /手机号已注册/)
  await assert.rejects(() => auth.register({ username: 'phone-user-3', phone: '13800000009', email: 'phone@example.com', password: 'strong-pass-123' }), /邮箱已注册/)
})

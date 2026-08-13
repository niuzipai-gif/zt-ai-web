import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createAuthService } from './auth.js'
import { JsonDataStore } from './data-store.js'

async function service() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-ai-auth-'))
  return createAuthService({ store: new JsonDataStore(path.join(dir, 'data.json')), adminPassword: 'local-test-only' })
}

test('registration is unique and password is not stored in plaintext', async () => {
  const auth = await service()
  const first = await auth.register({ username: 'Alice', password: 'strong-pass-123' })
  assert.equal(first.user.username, 'alice')
  await assert.rejects(() => auth.register({ username: 'alice', password: 'different-pass' }), /用户名已存在/)
  const data = await auth.store.read()
  assert.equal(JSON.stringify(data).includes('strong-pass-123'), false)
  assert.ok(data.users[0].passwordHash)
})

test('user token expires and can be revoked', async () => {
  let now = Date.now()
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-ai-auth-'))
  const auth = createAuthService({ store: new JsonDataStore(path.join(dir, 'data.json')), adminPassword: 'local-test-only', now: () => now })
  const { token } = await auth.register({ username: 'bob', password: 'strong-pass-123' })
  assert.ok(await auth.getSession(token, 'user'))
  await auth.revoke(token, 'user')
  assert.equal(await auth.getSession(token, 'user'), null)
  const { token: expiring } = await auth.login({ username: 'bob', password: 'strong-pass-123' })
  now += 31 * 24 * 60 * 60 * 1000
  assert.equal(await auth.getSession(expiring, 'user'), null)
})

test('wrong password is rejected', async () => {
  const auth = await service()
  await auth.register({ username: 'carol', password: 'strong-pass-123' })
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

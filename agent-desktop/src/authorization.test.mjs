import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { DeviceAuthorizationStore, requiresDeviceAuthorization } from './authorization.mjs'

test('write and command capabilities require explicit device authorization', () => {
  assert.equal(requiresDeviceAuthorization('read'), false)
  assert.equal(requiresDeviceAuthorization('workspace_write'), true)
  assert.equal(requiresDeviceAuthorization('command_exec'), true)
})

test('device authorization persists only a local confirmation state', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-ai-device-auth-'))
  const store = new DeviceAuthorizationStore(path.join(root, 'authorization.json'))
  await store.load()
  assert.equal(store.isAuthorized(), false)
  await store.set(true)
  assert.equal(store.snapshot().authorized, true)
  const persisted = JSON.parse(await fs.readFile(path.join(root, 'authorization.json'), 'utf8'))
  assert.equal(persisted.authorized, true)
  assert.ok(persisted.authorizedAt)
})

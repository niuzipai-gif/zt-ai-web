import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { CAPABILITIES, DEFAULT_PERMISSIONS, PermissionStore } from './permissions.mjs'
import { requiresDeviceAuthorization } from './authorization.mjs'

test('permission store defaults to read-only and persists explicit grants', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-ai-agent-'))
  const store = new PermissionStore(path.join(directory, 'permissions.json'))
  await store.load()
  assert.deepEqual(store.snapshot(), DEFAULT_PERMISSIONS)
  await store.set(CAPABILITIES.workspaceWrite, true)
  const reloaded = new PermissionStore(path.join(directory, 'permissions.json'))
  await reloaded.load()
  assert.equal(reloaded.has(CAPABILITIES.workspaceWrite), true)
  assert.equal(reloaded.has(CAPABILITIES.commandExec), false)
})

test('full access is explicit, disabled by default, and device-bound', () => {
  assert.equal(DEFAULT_PERMISSIONS[CAPABILITIES.fullAccess], false)
  assert.equal(requiresDeviceAuthorization(CAPABILITIES.fullAccess), true)
})

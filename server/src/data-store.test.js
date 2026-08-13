import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { JsonDataStore } from './data-store.js'

async function tempFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-ai-store-'))
  return path.join(dir, 'data.json')
}

test('queued JSON store persists collections atomically', async () => {
  const filePath = await tempFile()
  const store = new JsonDataStore(filePath)
  await Promise.all([
    store.update(data => data.users.push({ id: 'u-1' })),
    store.update(data => data.users.push({ id: 'u-2' })),
  ])
  const loaded = await store.read()
  assert.deepEqual(loaded.users.map(user => user.id).sort(), ['u-1', 'u-2'])
  assert.equal((await fs.readFile(filePath, 'utf8')).includes('"users"'), true)
})


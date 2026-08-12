import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { listWorkspace, readFile, resolveWorkspacePath } from './tools.mjs'

test('workspace paths cannot escape the selected workspace', () => {
  const root = path.resolve(os.tmpdir(), 'zt-ai-workspace')
  assert.equal(resolveWorkspacePath(root, 'src/index.js'), path.join(root, 'src', 'index.js'))
  assert.throws(() => resolveWorkspacePath(root, '../outside.txt'), /工作区内/)
})

test('read and list tools operate on the workspace boundary', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-ai-agent-workspace-'))
  await fs.writeFile(path.join(root, 'README.md'), '# hello', 'utf8')
  const listing = await listWorkspace({ workspaceRoot: root })
  assert.ok(listing.entries.some(entry => entry.name === 'README.md'))
  const file = await readFile({ workspaceRoot: root, inputPath: 'README.md' })
  assert.equal(file.text, '# hello')
})

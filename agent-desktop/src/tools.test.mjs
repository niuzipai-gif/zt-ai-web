import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { listWorkspace, moveFile, parseSearchResults, readFile, resolveWorkspacePath } from './tools.mjs'

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

test('move tool relocates a file only inside the selected workspace', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-ai-agent-move-'))
  await fs.mkdir(path.join(root, 'archive'))
  await fs.writeFile(path.join(root, 'desktop.txt'), 'keep', 'utf8')
  const result = await moveFile({ workspaceRoot: root, inputPath: 'desktop.txt', targetPath: 'archive/desktop.txt' })
  assert.equal(result.tool, 'move_file')
  assert.equal(await fs.readFile(path.join(root, 'archive/desktop.txt'), 'utf8'), 'keep')
  await assert.rejects(() => fs.access(path.join(root, 'desktop.txt')))
  await assert.rejects(() => moveFile({ workspaceRoot: root, inputPath: 'archive/desktop.txt', targetPath: '../outside.txt' }), /工作区内/)
})

test('web search parser keeps source title, url and snippet', () => {
  const html = '<a class="result__a" href="https://example.com/a">Official <b>Docs</b></a><a class="result__snippet">Primary source summary</a>'
  assert.deepEqual(parseSearchResults(html), [{ rank: 1, title: 'Official Docs', url: 'https://example.com/a', snippet: 'Primary source summary' }])
})

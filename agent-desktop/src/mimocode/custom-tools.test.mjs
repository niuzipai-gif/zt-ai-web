import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { installRuntimeWebTools } from './custom-tools.mjs'

test('runtime web tools override built-in search and fetch through the local bridge', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-buddy-tools-'))
  const workspace = path.join(root, 'workspace')
  const data = path.join(root, 'data')
  await installRuntimeWebTools({ workspaceRoot: workspace, dataDir: data })
  const search = await fs.readFile(path.join(workspace, '.opencode', 'tools', 'websearch.mjs'), 'utf8')
  const fetcher = await fs.readFile(path.join(workspace, '.opencode', 'tools', 'webfetch.mjs'), 'utf8')
  assert.match(search, /api\/internal\/web\/search/)
  assert.match(fetcher, /api\/internal\/web\/fetch/)
  assert.match(search, /不要使用其他搜索引擎/)
  assert.doesNotMatch(`${search}\n${fetcher}`, /MiMoCode|mimo\s*code/i)
  assert.equal(await fs.readFile(path.join(data, 'opencode', 'tools', 'websearch.mjs'), 'utf8'), search)
})

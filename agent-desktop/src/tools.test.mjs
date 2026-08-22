import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { listWorkspace, moveFile, normalizeFirecrawlSearch, parseSearchResults, readFile, resolveWorkspacePath, resolveWebSearchConfig, searchWeb } from './tools.mjs'

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

test('Firecrawl v2 results become stable source records with page fingerprints', () => {
  assert.deepEqual(normalizeFirecrawlSearch({ data: { web: [{ title: 'Official Docs', url: 'https://example.com/docs', description: 'Primary source summary', markdown: '# Docs\n\nDetails' }] } }), [{
    rank: 1,
    title: 'Official Docs',
    url: 'https://example.com/docs',
    snippet: 'Primary source summary',
    fingerprint: 'Details',
  }])
})

test('desktop web search resolves Firecrawl settings from a portable env file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-ai-search-config-'))
  const envFile = path.join(root, 'aikey.env')
  await fs.writeFile(envFile, 'FIRECRAWL_BASE_URL=https://firecrawl.example/v2\nFIRECRAWL_API_KEY=file-secret\n', 'utf8')
  const config = await resolveWebSearchConfig({ env: {}, envFile })
  assert.equal(config.baseUrl, 'https://firecrawl.example/v2')
  assert.equal(config.apiKey, 'file-secret')
  const override = await resolveWebSearchConfig({ env: { FIRECRAWL_BASE_URL: 'https://override.example/v2', FIRECRAWL_API_KEY: 'env-secret' }, envFile })
  assert.equal(override.baseUrl, 'https://override.example/v2')
  assert.equal(override.apiKey, 'env-secret')
})

test('Firecrawl search uses the keyless free path when no API key is configured', async () => {
  const progress = []
  let request
  const result = await searchWeb({
    query: 'ZT.AI official',
    config: { baseUrl: 'https://api.firecrawl.dev/v2', apiKey: '' },
    fetchImpl: async (url, options) => {
      request = { url, options }
      return new Response(JSON.stringify({ data: { web: [{ title: 'Official', url: 'https://example.com', description: 'source', markdown: 'source page' }] } }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
    onProgress: message => progress.push(message),
  })
  assert.equal(request.options.headers.authorization, undefined)
  assert.equal(result.provider, 'firecrawl')
  assert.equal(result.results[0].url, 'https://example.com')
  assert.ok(progress.some(message => /连接/.test(message)))
})

test('web search falls back to a public index when Firecrawl rejects a keyless request', async () => {
  const progress = []
  const result = await searchWeb({
    query: '义乌速度 小猪佩奇 拖车绳',
    config: { baseUrl: 'https://api.firecrawl.dev/v2', apiKey: '' },
    fetchImpl: async url => {
      if (String(url).startsWith('https://api.firecrawl.dev/')) {
        return new Response(JSON.stringify({ error: 'keyless blocked' }), { status: 403, headers: { 'content-type': 'application/json' } })
      }
      assert.match(String(url), /^https:\/\/html\.duckduckgo\.com\/html\/\?q=/)
      return new Response('<a class="result__a" href="https://example.com/source">Verified source</a><a class="result__snippet">Source summary</a>', { status: 200, headers: { 'content-type': 'text/html' } })
    },
    onProgress: message => progress.push(message),
  })

  assert.equal(result.provider, 'duckduckgo')
  assert.equal(result.results[0].url, 'https://example.com/source')
  assert.ok(progress.some(message => /备用公开索引/.test(message)))
})

test('web search refuses to claim verification when every search provider has no sources', async () => {
  await assert.rejects(() => searchWeb({
    query: 'unverifiable query',
    config: { baseUrl: 'https://api.firecrawl.dev/v2', apiKey: '' },
    fetchImpl: async url => String(url).startsWith('https://api.firecrawl.dev/')
      ? new Response(JSON.stringify({ error: 'blocked' }), { status: 403, headers: { 'content-type': 'application/json' } })
      : new Response('<html><body>no sources</body></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
  }), /未找到可核验的公开来源/)
})

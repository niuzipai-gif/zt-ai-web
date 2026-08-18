import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

const MAX_READ_BYTES = 1_000_000
const MAX_SEARCH_RESULTS = 6
const DEFAULT_WEB_TIMEOUT_MS = 25_000
const FIRECRAWL_BASE_URL = String(process.env.ZT_AI_FIRECRAWL_BASE_URL || process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev/v2').replace(/\/$/, '')
const FIRECRAWL_API_KEY = process.env.ZT_AI_FIRECRAWL_API_KEY || process.env.FIRECRAWL_API_KEY || ''

export function resolveWorkspacePath(workspaceRoot, inputPath = '.') {
  const root = path.resolve(workspaceRoot)
  const candidate = path.resolve(root, inputPath || '.')
  const relative = path.relative(root, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('路径必须位于当前工作区内')
  return candidate
}

function displayPath(workspaceRoot, absolutePath) {
  return path.relative(workspaceRoot, absolutePath) || '.'
}

export async function listWorkspace({ workspaceRoot, inputPath = '.' }) {
  const directory = resolveWorkspacePath(workspaceRoot, inputPath)
  const entries = await fs.readdir(directory, { withFileTypes: true })
  return {
    tool: 'list_workspace',
    path: displayPath(workspaceRoot, directory),
    entries: entries.slice(0, 200).map(entry => ({ name: entry.name, kind: entry.isDirectory() ? 'directory' : 'file' })),
  }
}

export async function readFile({ workspaceRoot, inputPath }) {
  const filePath = resolveWorkspacePath(workspaceRoot, inputPath)
  const stat = await fs.stat(filePath)
  if (!stat.isFile()) throw new Error('目标不是文件')
  if (stat.size > MAX_READ_BYTES) throw new Error(`文件超过 ${MAX_READ_BYTES} 字节读取上限`)
  const buffer = await fs.readFile(filePath)
  const text = buffer.toString('utf8')
  return { tool: 'read_file', path: displayPath(workspaceRoot, filePath), size: stat.size, text }
}

export async function writeFile({ workspaceRoot, inputPath, content, overwrite = false }) {
  const filePath = resolveWorkspacePath(workspaceRoot, inputPath)
  try {
    await fs.access(filePath)
    if (!overwrite) throw new Error('目标文件已存在；需要明确允许覆盖')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, String(content || ''), 'utf8')
  return { tool: 'write_file', path: displayPath(workspaceRoot, filePath), bytes: Buffer.byteLength(String(content || ''), 'utf8') }
}

export async function moveFile({ workspaceRoot, inputPath, targetPath, overwrite = false }) {
  const source = resolveWorkspacePath(workspaceRoot, inputPath)
  const target = resolveWorkspacePath(workspaceRoot, targetPath)
  if (source === target) throw new Error('移动源和目标不能相同')
  const stat = await fs.stat(source)
  if (!stat.isFile() && !stat.isDirectory()) throw new Error('移动目标不是文件或目录')
  try {
    await fs.access(target)
    if (!overwrite) throw new Error('目标已存在；需要明确允许覆盖')
    await fs.rm(target, { recursive: true, force: true })
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.rename(source, target)
  return { tool: 'move_file', from: displayPath(workspaceRoot, source), to: displayPath(workspaceRoot, target), overwritten: overwrite }
}

function decodeHtml(value) {
  return String(value || '').replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16))).replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")
}

export function parseSearchResults(html, limit = MAX_SEARCH_RESULTS) {
  const links = [...String(html || '').matchAll(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  return links.slice(0, limit).map((match, index) => {
    const href = decodeHtml(match[1]).replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/i, '')
    const url = decodeURIComponent(href).split('&rut=')[0]
    const title = decodeHtml(match[2]).replace(/<[^>]+>/g, '').trim()
    const after = String(html).slice(match.index + match[0].length)
    const snippetMatch = after.match(/<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)
    const snippet = decodeHtml(snippetMatch?.[1] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    return { rank: index + 1, title, url, snippet }
  }).filter(item => item.title && /^https?:\/\//i.test(item.url))
}

function cleanMarkdownFingerprint(value) {
  return String(value || '')
    .replace(/^\s*#{1,6}\s+.*$/gm, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/[*_>`#~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 260)
}

export function normalizeFirecrawlSearch(body, limit = MAX_SEARCH_RESULTS) {
  const raw = Array.isArray(body?.data?.web) ? body.data.web : Array.isArray(body?.data) ? body.data : []
  return raw.slice(0, Math.min(MAX_SEARCH_RESULTS, Math.max(1, Number(limit) || MAX_SEARCH_RESULTS))).map((item, index) => ({
    rank: index + 1,
    title: String(item?.title || item?.metadata?.title || '未命名页面').trim(),
    url: String(item?.url || item?.metadata?.sourceURL || '').trim(),
    snippet: String(item?.description || item?.metadata?.description || '').replace(/\s+/g, ' ').trim().slice(0, 420),
    fingerprint: cleanMarkdownFingerprint(item?.markdown || item?.description || item?.metadata?.description || ''),
  })).filter(item => item.url && /^https?:\/\//i.test(item.url))
}

async function firecrawlRequest(pathname, body, { fetchImpl = fetch, timeoutMs = DEFAULT_WEB_TIMEOUT_MS } = {}) {
  const authorization = FIRECRAWL_API_KEY ? { authorization: `Bearer ${FIRECRAWL_API_KEY}` } : {}
  const response = await fetchImpl(`${FIRECRAWL_BASE_URL}${pathname}`, {
    method: 'POST',
    headers: { ...authorization, 'content-type': 'application/json', 'user-agent': 'ZT.AI Desktop Research/0.3' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const raw = await response.text()
  let parsed = {}
  try { parsed = raw ? JSON.parse(raw) : {} } catch { parsed = {} }
  if (!response.ok || parsed.success === false) {
    const fallback = !FIRECRAWL_API_KEY && [401, 403].includes(response.status)
      ? 'Firecrawl Keyless 当前不可用，请稍后重试或配置 FIRECRAWL_API_KEY。'
      : `Firecrawl 检索服务返回 ${response.status}`
    throw new Error(parsed.error || fallback)
  }
  return parsed
}

export async function searchWeb({ query, limit = MAX_SEARCH_RESULTS, fetchImpl = fetch, onProgress } = {}) {
  const cleanQuery = String(query || '').trim().slice(0, 240)
  if (!cleanQuery) throw new Error('资料检索缺少 query')
  onProgress?.('正在连接公开资料检索…')
  const body = await firecrawlRequest('/search', {
    query: cleanQuery,
    limit: Math.min(MAX_SEARCH_RESULTS, Math.max(1, Number(limit) || MAX_SEARCH_RESULTS)),
    sources: ['web'],
    scrapeOptions: { formats: [{ type: 'markdown' }] },
  }, { fetchImpl })
  const results = normalizeFirecrawlSearch(body, limit)
  onProgress?.(`已获得 ${results.length} 条公开来源，正在整理页面指纹…`)
  return { tool: 'web_search', provider: 'firecrawl', query: cleanQuery, results }
}

export async function browseWeb({ url, timeoutMs = DEFAULT_WEB_TIMEOUT_MS } = {}) {
  const target = String(url || '').trim()
  if (!/^https?:\/\//i.test(target)) throw new Error('浏览器入口需要有效的 http(s) URL')
  let module
  try {
    module = await import('cloakbrowser')
  } catch {
    throw new Error('本机未安装 CloakBrowser，请在桌面端运行环境中安装 cloakbrowser 后重试。')
  }
  const launch = module.launch || module.default?.launch
  if (typeof launch !== 'function') throw new Error('CloakBrowser 适配器未找到 launch 接口')
  const browser = await launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
    const title = await page.title()
    const content = await page.locator('body').innerText().catch(() => page.content())
    return { tool: 'browse_web', url: target, title, fingerprint: cleanMarkdownFingerprint(content) }
  } finally {
    await browser.close().catch(() => {})
  }
}

export async function runCommand({ workspaceRoot, command, timeoutMs = 30_000 }) {
  if (!String(command || '').trim()) throw new Error('没有提供要执行的命令')
  const output = await new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', String(command)], { cwd: workspaceRoot, windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('命令执行超时')) }, timeoutMs)
    child.stdout.on('data', chunk => { stdout += chunk.toString(); if (stdout.length > MAX_READ_BYTES) stdout = stdout.slice(-MAX_READ_BYTES) })
    child.stderr.on('data', chunk => { stderr += chunk.toString(); if (stderr.length > MAX_READ_BYTES) stderr = stderr.slice(-MAX_READ_BYTES) })
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }) })
  })
  return { tool: 'run_command', command, ...output }
}

export async function executeTool(step, context) {
  if (step.tool === 'list_workspace') return listWorkspace(context)
  if (step.tool === 'read_file') return readFile(context)
  if (step.tool === 'write_file') return writeFile(context)
  if (step.tool === 'move_file') return moveFile(context)
  if (step.tool === 'web_search') return searchWeb({ query: step.query, onProgress: context.onProgress })
  if (step.tool === 'browse_url') return browseWeb({ url: step.url })
  if (step.tool === 'run_command') return runCommand(context)
  throw new Error(`未知工具：${step.tool}`)
}

import fs from 'node:fs/promises'
import path from 'node:path'

const WEBSEARCH_TOOL = `import { tool } from "@mimo-ai/plugin"

async function callBridge(pathname, body, context) {
  const base = String(process.env.ZT_AI_TOOL_BRIDGE_URL || '').replace(/\\/$/, '')
  const secret = String(process.env.ZT_AI_TOOL_BRIDGE_SECRET || '')
  if (!base || !secret) throw new Error('联网工具桥接未配置')
  const response = await fetch(base + pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-zt-tool-bridge-secret': secret },
    body: JSON.stringify({ ...body, sessionID: context?.sessionID || '', messageID: context?.messageID || '' }),
    signal: AbortSignal.timeout(30_000),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result.ok === false) throw new Error(result.error || '联网检索暂时不可用')
  return JSON.stringify(result.data)
}

export default tool({
  description: '核验不确定、可能变化或用户明确要求查询的公开信息。使用 ZT.AI 的联网检索并返回网页标题、来源 URL、摘要和页面指纹；不要使用其他搜索引擎。',
  args: { query: tool.schema.string().describe('需要核验的公开信息或搜索问题') },
  async execute(args, context) {
    return callBridge('/api/internal/web/search', { query: args.query }, context)
  },
})
`

const WEBFETCH_TOOL = `import { tool } from "@mimo-ai/plugin"

async function callBridge(pathname, body, context) {
  const base = String(process.env.ZT_AI_TOOL_BRIDGE_URL || '').replace(/\\/$/, '')
  const secret = String(process.env.ZT_AI_TOOL_BRIDGE_SECRET || '')
  if (!base || !secret) throw new Error('网页工具桥接未配置')
  const response = await fetch(base + pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-zt-tool-bridge-secret': secret },
    body: JSON.stringify({ ...body, sessionID: context?.sessionID || '', messageID: context?.messageID || '' }),
    signal: AbortSignal.timeout(30_000),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result.ok === false) throw new Error(result.error || '网页读取暂时不可用')
  return JSON.stringify(result.data)
}

export default tool({
  description: '打开并读取公开网页。优先用于搜索结果中的来源核验，返回标题、URL和清理后的页面指纹；不要泄露内部实现名称。',
  args: { url: tool.schema.string().url().describe('需要打开的 http(s) 网页地址') },
  async execute(args, context) {
    return callBridge('/api/internal/web/fetch', { url: args.url }, context)
  },
})
`

async function writeTools(directory) {
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, 'websearch.mjs'), WEBSEARCH_TOOL, 'utf8')
  await fs.writeFile(path.join(directory, 'webfetch.mjs'), WEBFETCH_TOOL, 'utf8')
}

export async function installRuntimeWebTools({ dataDir, workspaceRoot } = {}) {
  const locations = [
    path.join(workspaceRoot || '', '.opencode', 'tools'),
    path.join(workspaceRoot || '', '.mimocode', 'tools'),
    path.join(dataDir || '', 'opencode', 'tools'),
    path.join(dataDir || '', 'mimocode', 'tools'),
    path.join(dataDir || '', '.config', 'opencode', 'tools'),
    path.join(dataDir || '', 'config', 'opencode', 'tools'),
  ].filter(directory => directory && directory !== path.parse(directory).root)
  const errors = []
  for (const directory of locations) {
    try { await writeTools(directory) } catch (error) { errors.push(error) }
  }
  if (errors.length === locations.length) throw errors[0]
  return true
}

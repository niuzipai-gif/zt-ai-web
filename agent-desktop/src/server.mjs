import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AgentTaskManager } from './agent-core.mjs'
import { CAPABILITIES, PermissionStore } from './permissions.mjs'
import { DeviceAuthorizationStore, requiresDeviceAuthorization } from './authorization.mjs'
import { scanSkillRoots } from './skills.mjs'
import { classifyIntent } from './intent-router.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = path.join(ROOT, 'public')
const DATA = path.resolve(process.env.ZT_AI_AGENT_DATA || path.join(ROOT, 'data'))
const port = Number(process.env.ZT_AI_AGENT_PORT || process.env.PORT || 8788)
let workspaceRoot = path.resolve(process.env.ZT_AI_WORKSPACE || path.join(ROOT, '..'))
const gatewayUrl = process.env.ZT_AI_GATEWAY_URL || 'http://localhost:8790'
const localSecret = process.env.ZT_AI_AGENT_SECRET || ''
const requireAccountAuth = process.env.ZT_AI_AGENT_REQUIRE_AUTH === '1'
const userProfile = process.env.USERPROFILE || process.env.HOME || ''
const skillRoots = [
  ...String(process.env.ZT_AI_SKILL_ROOTS || '').split(path.delimiter).filter(Boolean),
  path.join(userProfile, '.codex', 'skills'),
  path.join(userProfile, '.agents', 'skills'),
  path.join(workspaceRoot, '.codex', 'skills'),
  path.join(workspaceRoot, '.agents', 'skills'),
]
let skillCache = { at: 0, skills: [] }
const permissions = new PermissionStore(path.join(DATA, 'permissions.json'))
const deviceAuthorization = new DeviceAuthorizationStore(path.join(DATA, 'device-authorization.json'))
await permissions.load()
await deviceAuthorization.load()
const tasks = new AgentTaskManager({ workspaceRoot, permissionStore: permissions, deviceAuthorization, gatewayUrl, historyPath: path.join(DATA, 'tasks.json') })
await tasks.load()

function cors(request) {
  return { 'access-control-allow-origin': request.headers.origin || '*', vary: 'Origin' }
}

function json(request, response, status, payload) {
  response.writeHead(status, { ...cors(request), 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

function localAuthorized(request) {
  return !localSecret || request.headers['x-zt-agent-secret'] === localSecret
}

function accountToken(request, body = {}) {
  const header = String(request.headers.authorization || '')
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : String(body.accountToken || '')
}

async function accountIsValid(token) {
  if (!token) return false
  try {
    const response = await fetch(`${gatewayUrl}/api/auth/me`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) })
    return response.ok
  } catch { return false }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = ''
    request.on('data', chunk => { raw += chunk; if (raw.length > 2_000_000) reject(new Error('请求过大')) })
    request.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { reject(new Error('请求不是有效 JSON')) } })
    request.on('error', reject)
  })
}

function sseStart(request, response) {
  response.writeHead(200, { ...cors(request), 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' })
  response.flushHeaders?.()
}

const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json; charset=utf-8' }

async function staticFile(request, response) {
  const pathname = new URL(request.url, 'http://localhost').pathname
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '')
  const candidate = path.resolve(PUBLIC, relative)
  if (!candidate.startsWith(PUBLIC)) return json(request, response, 403, { error: 'Forbidden' })
  try {
    const body = await fs.readFile(candidate)
    response.writeHead(200, { ...cors(request), 'content-type': contentTypes[path.extname(candidate).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' })
    response.end(body)
  } catch {
    json(request, response, 404, { error: 'Not found' })
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') { response.writeHead(204, { ...cors(request), 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization, x-zt-agent-secret' }); response.end(); return }
  try {
    const url = new URL(request.url, 'http://localhost')
    if (request.method === 'GET' && url.pathname === '/api/config') return json(request, response, 200, { ok: true, gatewayUrl, localSecret, mode: 'execute' })
    if (url.pathname.startsWith('/api/') && !localAuthorized(request)) return json(request, response, 401, { error: '本机 Agent 请求未通过本地校验' })
    if (request.method === 'GET' && url.pathname === '/api/skills') {
      if (Date.now() - skillCache.at > 30_000) skillCache = { at: Date.now(), skills: await scanSkillRoots(skillRoots) }
      return json(request, response, 200, { ok: true, roots: skillRoots, skills: skillCache.skills, scannedAt: new Date(skillCache.at).toISOString() })
    }
    if (request.method === 'GET' && url.pathname === '/api/state') return json(request, response, 200, { ok: true, ...tasks.snapshot(), permissions: permissions.snapshot(), deviceAuthorization: deviceAuthorization.snapshot(), gatewayUrl, mode: 'execute' })
    if (request.method === 'POST' && url.pathname === '/api/workspace') {
      const body = await readBody(request)
      const selected = path.resolve(String(body.path || ''))
      const stat = await fs.stat(selected).catch(() => null)
      if (!stat?.isDirectory()) return json(request, response, 400, { error: '请选择一个存在的文件夹作为工作区' })
      workspaceRoot = tasks.setWorkspaceRoot(selected)
      return json(request, response, 200, { ok: true, workspaceRoot })
    }
    if (request.method === 'POST' && url.pathname === '/api/authorization') {
      const body = await readBody(request)
      const authorization = await deviceAuthorization.set(body.authorized === true)
      if (!authorization.authorized) {
        await permissions.set(CAPABILITIES.workspaceWrite, false)
        await permissions.set(CAPABILITIES.commandExec, false)
      }
      return json(request, response, 200, { ok: true, deviceAuthorization: authorization, permissions: permissions.snapshot() })
    }
    if (request.method === 'POST' && url.pathname === '/api/permissions') {
      const body = await readBody(request)
      if (body.enabled === true && requiresDeviceAuthorization(body.capability) && !deviceAuthorization.isAuthorized()) throw new Error('请先确认 Agent 只在这台设备上执行，再开启写入或命令权限')
      const value = await permissions.set(body.capability, body.enabled)
      return json(request, response, 200, { ok: true, permissions: value })
    }
    if (request.method === 'POST' && url.pathname === '/api/tasks') {
      const body = await readBody(request)
      if (!String(body.task || '').trim()) return json(request, response, 400, { error: '请输入任务目标' })
      const intent = classifyIntent(body.task, { mode: 'BUDDY' })
      if (intent.route === 'chat') return json(request, response, 409, { error: '这句话被识别为普通聊天，不会调用本机工具，请使用普通聊天模式。', intent })
      if (requireAccountAuth && !(await accountIsValid(accountToken(request, body)))) return json(request, response, 401, { error: '请先登录桌面 Agent 账户或重新登录' })
      sseStart(request, response)
      tasks.create({ task: body.task, model: body.model, response, authToken: accountToken(request, body) })
      return
    }
    const approveMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/(approve|reject)$/)
    if (request.method === 'POST' && approveMatch) {
      const body = await readBody(request)
      if (approveMatch[2] === 'approve') await tasks.approve(approveMatch[1], body.capability, body.remember === true)
      else tasks.reject(approveMatch[1], body.reason)
      return json(request, response, 200, { ok: true })
    }
    if (request.method === 'GET') return staticFile(request, response)
    return json(request, response, 404, { error: 'Not found' })
  } catch (error) {
    return json(request, response, 400, { error: error.message })
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`ZT.AI Desktop Agent listening on http://127.0.0.1:${port}`)
  console.log(`Workspace: ${workspaceRoot}`)
  console.log(`Gateway: ${gatewayUrl}`)
  console.log(`Permissions: ${Object.values(CAPABILITIES).filter(key => permissions.has(key)).join(', ') || 'none'}`)
})

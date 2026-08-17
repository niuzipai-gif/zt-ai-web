import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CAPABILITIES, CAPABILITY_LABELS, PermissionStore } from './permissions.mjs'
import { DeviceAuthorizationStore, requiresDeviceAuthorization } from './authorization.mjs'
import { scanSkillRoots } from './skills.mjs'
import { classifyIntent } from './intent-router.mjs'
import { MiMoBuddyRuntime } from './mimocode/runtime.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = path.join(ROOT, 'public')
const DATA = path.resolve(process.env.ZT_AI_AGENT_DATA || path.join(ROOT, 'data'))
const TASK_HISTORY_PATH = path.join(DATA, 'tasks.json')
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
const buddy = new MiMoBuddyRuntime({
  workspaceRoot,
  statePath: path.join(DATA, 'mimocode-sessions.json'),
  dataDir: path.join(DATA, 'mimocode'),
  gatewayUrl,
})
let taskHistory = []
try {
  const saved = JSON.parse(await fs.readFile(TASK_HISTORY_PATH, 'utf8'))
  if (Array.isArray(saved)) taskHistory = saved.slice(-30)
} catch {
  taskHistory = []
}
const activeTasks = new Map()

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

function sendTaskEvent(state, event, data = {}) {
  if (state.closed || state.response.destroyed) return
  state.response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function desktopCapability(capability) {
  if (capability === 'workspace_read') return CAPABILITIES.read
  if (capability === 'workspace_write') return CAPABILITIES.workspaceWrite
  if (capability === 'command_exec') return CAPABILITIES.commandExec
  if (capability === 'web_access') return CAPABILITIES.webResearch
  return capability || 'sensitive_action'
}

function planStepForMiMo(event) {
  return {
    id: 'mimocode-runtime',
    tool: 'mimocode',
    label: event.label || 'MiMoCode 正在分析任务',
    capability: '按需授权',
  }
}

function finishBuddyTask(state, { status = 'done', summary = '' } = {}) {
  if (!state || state.finished) return
  state.finished = true
  activeTasks.delete(state.id)
  const record = {
    id: state.id,
    task: state.task,
    model: state.model,
    status,
    createdAt: state.createdAt,
    summary: summary || state.output || (status === 'done' ? '本机执行已完成。' : '任务未完成。'),
  }
  taskHistory = [...taskHistory, record].slice(-30)
  void fs.mkdir(path.dirname(TASK_HISTORY_PATH), { recursive: true })
    .then(() => fs.writeFile(TASK_HISTORY_PATH, `${JSON.stringify(taskHistory, null, 2)}\n`, 'utf8'))
    .catch(() => {})
  sendTaskEvent(state, 'task.done', { id: state.id, status, summary: record.summary })
  if (!state.response.destroyed) state.response.end()
  state.closed = true
}

function handleBuddyEvent(state, event) {
  if (!state || state.finished) return
  if (event.type === 'session.started') return
  if (event.type === 'plan.ready') {
    sendTaskEvent(state, 'plan.ready', { source: 'mimocode', steps: [planStepForMiMo(event)] })
    return
  }
  if (event.type === 'tool.started') {
    sendTaskEvent(state, 'tool.start', { id: event.toolId, label: event.label, capability: 'MiMoCode' })
    return
  }
  if (event.type === 'tool.completed') {
    sendTaskEvent(state, 'tool.result', { id: event.toolId, result: event.result || '工具已返回结果' })
    return
  }
  if (event.type === 'approval.required') {
    const capability = desktopCapability(event.capability)
    state.pendingPermissions.set(event.permissionId, { ...event, capability })
    sendTaskEvent(state, 'approval.required', {
      taskId: state.id,
      permissionId: event.permissionId,
      capability,
      capabilityLabel: CAPABILITY_LABELS[capability] || event.label || '敏感操作',
      label: event.label || '需要你的确认',
      preview: event.details?.join('\n') || 'MiMoCode 请求执行本机操作。',
    })
    return
  }
  if (event.type === 'result.delta') {
    state.output += event.text || ''
    if (!state.summaryStarted) {
      state.summaryStarted = true
      sendTaskEvent(state, 'agent.start', { model: state.model, mode: 'execute' })
    }
    sendTaskEvent(state, 'agent.delta', { text: event.text || '' })
    return
  }
  if (event.type === 'session.failed') {
    sendTaskEvent(state, 'task.error', { message: event.message })
    finishBuddyTask(state, { status: 'error', summary: event.message })
    return
  }
  if (event.type === 'session.completed') {
    finishBuddyTask(state, { status: 'done', summary: state.output || '本机执行已完成。' })
  }
}

async function startBuddyTask({ request, response, task, model, token }) {
  const id = crypto.randomUUID()
  const state = {
    id,
    task,
    model: model === 'DEEPSEEK' ? 'DEEPSEEK' : 'MINIMAX',
    response,
    createdAt: new Date().toISOString(),
    pendingPermissions: new Map(),
    output: '',
    summaryStarted: false,
    closed: false,
    finished: false,
  }
  response.on('close', () => { state.closed = true })
  activeTasks.set(id, state)
  sendTaskEvent(state, 'task.start', { id, task, model: state.model, mode: 'execute' })
  try {
    await buddy.startTask({
      task,
      model: state.model,
      taskId: id,
      conversationId: String(request.headers['x-zt-conversation-id'] || id),
      accountToken: token,
      onEvent: event => handleBuddyEvent(state, event),
    })
  } catch {
    sendTaskEvent(state, 'task.error', { message: 'MiMoCode 本机运行时暂时不可用。' })
    finishBuddyTask(state, { status: 'error', summary: 'MiMoCode 本机运行时暂时不可用，请使用完整桌面安装包后重试。' })
  }
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
    if (request.method === 'GET' && url.pathname === '/api/state') return json(request, response, 200, {
      ok: true,
      workspaceRoot,
      history: taskHistory,
      runtime: buddy.snapshot(),
      permissions: permissions.snapshot(),
      deviceAuthorization: deviceAuthorization.snapshot(),
      gatewayUrl,
      mode: 'execute',
    })
    if (request.method === 'POST' && url.pathname === '/api/workspace') {
      const body = await readBody(request)
      const selected = path.resolve(String(body.path || ''))
      const stat = await fs.stat(selected).catch(() => null)
      if (!stat?.isDirectory()) return json(request, response, 400, { error: '请选择一个存在的文件夹作为工作区' })
      workspaceRoot = buddy.setWorkspaceRoot(selected)
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
      void startBuddyTask({ request, response, task: String(body.task).trim(), model: body.model, token: accountToken(request, body) })
      return
    }
    const approveMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/(approve|reject)$/)
    if (request.method === 'POST' && approveMatch) {
      const body = await readBody(request)
      const state = activeTasks.get(approveMatch[1])
      if (!state) return json(request, response, 404, { error: '没有找到正在执行的 MiMoCode 任务' })
      const capability = desktopCapability(body.capability)
      const permissionId = body.permissionId || [...state.pendingPermissions.entries()].find(([, value]) => value.capability === capability)?.[0]
      if (!permissionId) return json(request, response, 400, { error: '没有找到待确认的本机权限请求' })
      if (approveMatch[2] === 'approve') {
        if (requiresDeviceAuthorization(capability) && !deviceAuthorization.isAuthorized()) return json(request, response, 400, { error: '请先确认 Agent 只在当前设备执行，再批准写入或命令权限' })
        if (body.remember === true && Object.values(CAPABILITIES).includes(capability)) await permissions.set(capability, true)
        await buddy.approve({ taskId: state.id, permissionId, remember: body.remember === true })
      } else {
        await buddy.reject({ taskId: state.id, permissionId })
      }
      state.pendingPermissions.delete(permissionId)
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

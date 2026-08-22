import http from 'node:http'
import crypto from 'node:crypto'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { CAPABILITIES, CAPABILITY_LABELS, PermissionStore } from './permissions.mjs'
import { DeviceAuthorizationStore, requiresDeviceAuthorization } from './authorization.mjs'
import { scanSkillRoots } from './skills.mjs'
import { classifyIntent } from './intent-router.mjs'
import { browseWeb, searchWeb } from './tools.mjs'
import { buildWebVerificationContext, buildWebVerificationQuery, requiresWebVerification } from './web-verification.mjs'
import { CodexBuddyRuntime } from './runtime/codex-app-server.mjs'
import { scopedConversationId } from './conversation-scope.mjs'
import { OFFICECLI_MAX_UPLOAD_BYTES, readOfficeSpreadsheetPreview } from './officecli.mjs'
import { createSerialWriteQueue } from './serial-write-queue.mjs'
import { publicTaskFailure } from './public-errors.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = path.join(ROOT, 'public')
const VENDOR = {
  '/vendor/pdfjs.mjs': path.resolve(ROOT, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs'),
  '/vendor/pdf.worker.mjs': path.resolve(ROOT, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs'),
  '/vendor/mammoth.browser.js': path.resolve(ROOT, '..', 'node_modules', 'mammoth', 'mammoth.browser.js'),
  '/vendor/xlsx.full.min.js': path.resolve(ROOT, '..', 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js'),
}
const DATA = path.resolve(process.env.ZT_AI_AGENT_DATA || path.join(ROOT, 'data'))
const TASK_HISTORY_PATH = path.join(DATA, 'tasks.json')
const CONVERSATION_HISTORY_PATH = path.join(DATA, 'conversations.json')
const port = Number(process.env.ZT_AI_AGENT_PORT || process.env.PORT || 8788)
let workspaceRoot = path.resolve(process.env.ZT_AI_WORKSPACE || path.join(ROOT, '..'))
const gatewayUrl = process.env.ZT_AI_GATEWAY_URL || 'http://localhost:8790'
const localSecret = process.env.ZT_AI_AGENT_SECRET || ''
const toolBridgeSecret = crypto.randomBytes(32).toString('hex')
const toolBridgeUrl = `http://127.0.0.1:${port}`
const requireAccountAuth = process.env.ZT_AI_AGENT_REQUIRE_AUTH === '1'
const officeCliPath = String(process.env.ZT_AI_OFFICECLI_PATH || '')
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
const buddy = new CodexBuddyRuntime({
  workspaceRoot,
  statePath: path.join(DATA, 'codex-sessions.json'),
  dataDir: path.join(DATA, 'codex'),
  gatewayUrl,
  binary: process.env.ZT_AI_CODEX_BIN || '',
})
let taskHistory = []
try {
  const saved = JSON.parse(await fs.readFile(TASK_HISTORY_PATH, 'utf8'))
  if (Array.isArray(saved)) taskHistory = saved.slice(-30)
} catch {
  taskHistory = []
}
let conversationHistory = []
try {
  const saved = JSON.parse(await fs.readFile(CONVERSATION_HISTORY_PATH, 'utf8'))
  if (Array.isArray(saved)) conversationHistory = saved.slice(-300)
} catch {
  conversationHistory = []
}
const activeTasks = new Map()
const runtimeSessionTasks = new Map()
const conversationWriteQueue = createSerialWriteQueue()
const taskWriteQueue = createSerialWriteQueue()
const PUBLIC_RUNTIME_LABEL = '执行引擎'

function publicText(value, fallback = '') {
  return String(value ?? fallback)
    .replace(/mimo\s*code/gi, PUBLIC_RUNTIME_LABEL)
    .replace(/mimo/gi, PUBLIC_RUNTIME_LABEL)
    .trim()
}

function conversationMessages(value) {
  return (Array.isArray(value) ? value : []).slice(-120).flatMap(message => {
    const role = message?.role === 'user' ? 'user' : 'assistant'
    const content = String(message?.content || '').trim().slice(0, 16_000)
    return content ? [{ role, content }] : []
  })
}

function localConversationId(scopedId, accountId) {
  const prefix = `${String(accountId)}:`
  return String(scopedId || '').startsWith(prefix) ? String(scopedId).slice(prefix.length) : String(scopedId || '')
}

function buildAccountConversations(accountId) {
  if (!accountId) return []
  const grouped = new Map()
  for (const item of conversationHistory.filter(item => item.accountId === accountId)) {
    grouped.set(item.id, { id: item.id, title: item.title || '新对话', messages: conversationMessages(item.messages), agentContext: item.agentContext === true, createdAt: item.createdAt || Date.now(), updatedAt: item.updatedAt || item.createdAt || Date.now() })
  }
  for (const item of taskHistory.filter(item => item.accountId === accountId)) {
    const id = String(item.conversationId || item.id)
    const existing = grouped.get(id) || { id, title: item.task, messages: [], createdAt: item.createdAt, updatedAt: item.createdAt }
    if (!existing.messages.some(message => message.role === 'user' && message.content === item.task)) existing.messages.push({ role: 'user', content: item.task })
    if (item.summary && !existing.messages.some(message => message.role === 'assistant' && message.content === publicText(item.summary))) existing.messages.push({ role: 'assistant', content: publicText(item.summary) })
    existing.agentContext = true
    existing.title = existing.title === '新对话' ? item.task : existing.title
    existing.updatedAt = Math.max(new Date(existing.updatedAt).getTime() || 0, new Date(item.createdAt).getTime() || 0)
    grouped.set(id, existing)
  }
  for (const item of buddy.snapshot({ accountId }).sessions) {
    const id = localConversationId(item.conversationId, accountId)
    if (!id) continue
    const existing = grouped.get(id) || { id, title: publicText(item.title, 'ZT.buddy 对话'), messages: [], createdAt: item.updatedAt || Date.now(), updatedAt: item.updatedAt || Date.now() }
    existing.updatedAt = Math.max(new Date(existing.updatedAt).getTime() || 0, new Date(item.updatedAt).getTime() || 0)
    if (item.title && existing.title === 'ZT.buddy 对话') existing.title = publicText(item.title)
    existing.agentContext = true
    grouped.set(id, existing)
  }
  return [...grouped.values()].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 50)
}

async function saveConversationHistory() {
  const snapshot = conversationHistory.slice(-300)
  return conversationWriteQueue.enqueue(async () => {
    await fs.mkdir(path.dirname(CONVERSATION_HISTORY_PATH), { recursive: true })
    await fs.writeFile(CONVERSATION_HISTORY_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  })
}

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

async function accountSession(token) {
  if (!token) return false
  try {
    const response = await fetch(`${gatewayUrl}/api/auth/me`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) })
    if (!response.ok) return null
    const body = await response.json()
    return body?.user?.id ? body.user : null
  } catch { return null }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = ''
    request.on('data', chunk => { raw += chunk; if (raw.length > 12_000_000) reject(new Error('请求过大')) })
    request.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { reject(new Error('请求不是有效 JSON')) } })
    request.on('error', reject)
  })
}

function sseStart(request, response) {
  response.writeHead(200, { ...cors(request), 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' })
  response.flushHeaders?.()
}

function spreadsheetUploadName(request) {
  const source = String(request.headers['x-zt-attachment-name'] || 'spreadsheet.xlsx')
  let decoded = source
  try { decoded = decodeURIComponent(source) } catch {}
  const name = path.basename(decoded).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 160)
  if (!/\.(xlsx|xls|xlsm|xlsb|ods)$/i.test(name)) throw new Error('仅支持上传 Excel 或 ODS 表格。')
  return name || 'spreadsheet.xlsx'
}

async function receiveSpreadsheetUpload(request) {
  const declaredLength = Number(request.headers['content-length'] || 0)
  if (declaredLength > OFFICECLI_MAX_UPLOAD_BYTES) throw new Error('表格超过 500MB，请拆分后再试。')
  const name = spreadsheetUploadName(request)
  const tempDirectory = path.join(DATA, 'attachment-tmp')
  await fs.mkdir(tempDirectory, { recursive: true })
  const filePath = path.join(tempDirectory, `${Date.now()}-${crypto.randomUUID()}${path.extname(name)}`)
  let received = 0
  const sizeGuard = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length
      if (received > OFFICECLI_MAX_UPLOAD_BYTES) return callback(new Error('表格超过 500MB，请拆分后再试。'))
      callback(null, chunk)
    },
  })
  try {
    await pipeline(request, sizeGuard, fsSync.createWriteStream(filePath, { flags: 'wx' }))
    if (!received) throw new Error('没有收到表格文件。')
    return { filePath, name, size: received }
  } catch (error) {
    await fs.rm(filePath, { force: true }).catch(() => {})
    throw error
  }
}

async function handleSpreadsheetPreview(request, response) {
  const upload = await receiveSpreadsheetUpload(request)
  try {
    const text = await readOfficeSpreadsheetPreview({ filePath: upload.filePath, binaryPath: officeCliPath })
    if (!text) throw new Error('表格中没有可预览的数据。')
    return json(request, response, 200, { ok: true, text, name: upload.name, size: upload.size })
  } catch (error) {
    return json(request, response, 422, { ok: false, error: error.message || '本机表格读取暂时不可用。' })
  } finally {
    await fs.rm(upload.filePath, { force: true }).catch(() => {})
  }
}

function sendTaskEvent(state, event, data = {}) {
  if (state.closed || state.response.destroyed) return
  state.response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function researchSourcePayload(research) {
  return {
    provider: String(research?.provider || '公开检索'),
    query: String(research?.query || '').slice(0, 240),
    sources: (Array.isArray(research?.results) ? research.results : []).filter(item => /^https?:\/\//i.test(String(item?.url || ''))).slice(0, 6).map((item, index) => ({
      rank: Number(item?.rank) || index + 1,
      title: publicText(item?.title, '未命名来源'),
      url: String(item?.url || ''),
      ...(item?.snippet ? { snippet: publicText(item.snippet).slice(0, 1_000) } : {}),
      ...(item?.fingerprint ? { fingerprint: publicText(item.fingerprint).slice(0, 1_000) } : {}),
    })),
  }
}

function desktopCapability(capability) {
  if (capability === 'workspace_read') return CAPABILITIES.read
  if (capability === 'workspace_write') return CAPABILITIES.workspaceWrite
  if (capability === 'command_exec') return CAPABILITIES.commandExec
  if (capability === 'web_access') return CAPABILITIES.webResearch
  return capability || 'sensitive_action'
}

function planStepForRuntime(event) {
  return {
    id: 'runtime-analysis',
    tool: 'runtime',
    label: publicText(event.label, '正在分析并准备执行'),
    capability: '执行工具',
  }
}

function finishBuddyTask(state, { status = 'done', summary = '' } = {}) {
  if (!state || state.finished) return
  state.finished = true
  activeTasks.delete(state.id)
  if (state.runtimeSessionId) runtimeSessionTasks.delete(state.runtimeSessionId)
  const record = {
    id: state.id,
    task: state.task,
    accountId: state.accountId,
    conversationId: state.conversationId,
    model: state.model,
    status,
    createdAt: state.createdAt,
    summary: publicText(summary || state.output || (status === 'done' ? '本机执行已完成。' : '任务未完成。')),
  }
  taskHistory = [...taskHistory, record].slice(-30)
  const snapshot = taskHistory.slice(-30)
  void taskWriteQueue.enqueue(async () => {
    await fs.mkdir(path.dirname(TASK_HISTORY_PATH), { recursive: true })
    await fs.writeFile(TASK_HISTORY_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  }).catch(() => {})
  sendTaskEvent(state, 'task.done', { id: state.id, status, summary: record.summary })
  if (!state.response.destroyed) state.response.end()
  state.closed = true
}

function handleBuddyEvent(state, event) {
  if (!state || state.finished) return
  if (event.type === 'session.started') return
  if (event.type === 'plan.ready') {
    sendTaskEvent(state, 'plan.ready', { source: 'runtime', steps: [planStepForRuntime(event)] })
    return
  }
  if (event.type === 'tool.started') {
    sendTaskEvent(state, 'tool.start', { id: event.toolId, label: publicText(event.label, '调用工具'), capability: '执行工具' })
    return
  }
  if (event.type === 'tool.progress') {
    sendTaskEvent(state, 'tool.progress', { id: event.toolId, message: publicText(event.message, '正在继续执行…') })
    return
  }
  if (event.type === 'tool.completed') {
    sendTaskEvent(state, 'tool.result', { id: event.toolId, result: publicText(event.result, '工具已返回结果') })
    return
  }
  if (event.type === 'approval.required') {
    const capability = desktopCapability(event.capability)
    state.pendingPermissions.set(event.permissionId, { ...event, capability })
    sendTaskEvent(state, 'approval.required', {
      taskId: state.id,
      permissionId: event.permissionId,
      capability,
      capabilityLabel: CAPABILITY_LABELS[capability] || publicText(event.label, '敏感操作'),
      label: publicText(event.label, '需要你的确认'),
      preview: publicText(event.details?.join('\n'), 'ZT.buddy 请求执行本机操作。'),
    })
    return
  }
  if (event.type === 'result.delta') {
    const text = publicText(event.text)
    state.output += text
    if (!state.summaryStarted) {
      state.summaryStarted = true
      sendTaskEvent(state, 'agent.start', { model: state.model, mode: 'execute' })
    }
    sendTaskEvent(state, 'agent.delta', { text })
    return
  }
  if (event.type === 'session.failed') {
    const message = publicText(event.message, '任务暂时没有完成，请检查权限或稍后重试。')
    sendTaskEvent(state, 'task.error', { message })
    finishBuddyTask(state, { status: 'error', summary: message })
    return
  }
  if (event.type === 'session.completed') {
    finishBuddyTask(state, { status: 'done', summary: state.output || '本机执行已完成。' })
  }
}

function bridgeTask(sessionID) {
  return runtimeSessionTasks.get(String(sessionID || '')) || null
}

async function handleWebBridge(request, response, pathname) {
  if (request.headers['x-zt-tool-bridge-secret'] !== toolBridgeSecret) return json(request, response, 401, { ok: false, error: '联网工具桥接未通过本机校验' })
  const body = await readBody(request)
  const state = bridgeTask(body.sessionID)
  if (!state || state.finished) return json(request, response, 409, { ok: false, error: '当前执行会话已结束，请重新发起任务' })
  const progress = message => sendTaskEvent(state, 'tool.progress', { message: publicText(message, '正在联网核验…') })
  try {
    const data = pathname.endsWith('/search')
      ? await searchWeb({ query: body.query, onProgress: progress })
      : await browseWeb({ url: body.url })
    return json(request, response, 200, { ok: true, data })
  } catch (error) {
    progress(`联网核验未完成：${publicText(error?.message, '请稍后重试')}`)
    return json(request, response, 502, { ok: false, error: publicText(error?.message, '联网核验未完成，请稍后重试') })
  }
}

async function startBuddyTask({ request, response, task, model, token, accountId }) {
  const id = crypto.randomUUID()
  const state = {
    id,
    task,
    accountId,
    conversationId: String(request.headers['x-zt-conversation-id'] || id),
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
    let preparedTask = task
    if (requiresWebVerification(task)) {
      const toolId = 'web-verification'
      sendTaskEvent(state, 'plan.ready', { source: 'web-preflight', steps: [{ id: toolId, tool: 'web_search', label: '先联网核验公开信息', capability: CAPABILITIES.webResearch }] })
      sendTaskEvent(state, 'tool.start', { id: toolId, label: '正在联网核验公开信息', capability: CAPABILITY_LABELS[CAPABILITIES.webResearch] })
      try {
        const research = await searchWeb({
          query: buildWebVerificationQuery(task),
          onProgress: message => sendTaskEvent(state, 'tool.progress', { id: toolId, message: publicText(message, '正在联网核验…') }),
        })
        preparedTask = buildWebVerificationContext(task, research)
        sendTaskEvent(state, 'research.sources', researchSourcePayload(research))
        sendTaskEvent(state, 'tool.result', { id: toolId, result: `${research.provider}：已获得 ${research.results.length} 条可核验来源` })
      } catch (error) {
        const detail = publicTaskFailure(error, '联网核验没有取得可用来源，请稍后重试。')
        const summary = `${detail} 我不会根据猜测作答；你也可以补充更准确的名称、链接或图片线索。`
        sendTaskEvent(state, 'tool.result', { id: toolId, result: detail })
        finishBuddyTask(state, { status: 'error', summary })
        return
      }
    }
    const started = await buddy.startTask({
      task: preparedTask,
      model: state.model,
      taskId: id,
      conversationId: scopedConversationId(accountId || 'local', String(request.headers['x-zt-conversation-id'] || id)),
      accountToken: token,
      fullAccess: permissions.has(CAPABILITIES.fullAccess),
      onEvent: event => handleBuddyEvent(state, event),
    })
    state.runtimeSessionId = started.sessionId
    runtimeSessionTasks.set(started.sessionId, state)
  } catch (error) {
    console.error(`[agent-task-error] ${error?.stack || error?.message || error}`)
    const message = publicTaskFailure(error, '本机执行引擎暂时不可用，请检查完整安装包和网络后重试。')
    sendTaskEvent(state, 'task.error', { message })
    finishBuddyTask(state, { status: 'error', summary: message })
  }
}

function researchChatMessages(messages, preparedTask) {
  const normalized = Array.isArray(messages) ? structuredClone(messages).slice(-80) : []
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    if (normalized[index]?.role !== 'user') continue
    const content = normalized[index].content
    if (Array.isArray(content)) {
      const textPart = content.find(part => part?.type === 'text')
      if (textPart) textPart.text = preparedTask
      else content.unshift({ type: 'text', text: preparedTask })
    } else normalized[index].content = preparedTask
    return normalized
  }
  normalized.push({ role: 'user', content: preparedTask })
  return normalized
}

async function handleResearchChat(request, response) {
  const body = await readBody(request)
  const task = String(body.task || '').trim()
  if (!task) return json(request, response, 400, { error: '请输入需要联网核验的问题' })
  const account = requireAccountAuth ? await accountSession(accountToken(request, body)) : null
  if (requireAccountAuth && !account) return json(request, response, 401, { error: '请先登录桌面账户或重新登录' })
  try {
    const research = await searchWeb({ query: buildWebVerificationQuery(task) })
    const preparedTask = buildWebVerificationContext(task, research)
    const upstream = await fetch(`${gatewayUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: body.model === 'deepseek' ? 'deepseek' : 'minimax',
        language: body.language || 'zh',
        skills: Array.isArray(body.skills) ? body.skills : [],
        visitorId: body.visitorId || `desktop-${account?.id || 'guest'}`,
        conversationId: body.conversationId || crypto.randomUUID(),
        messages: researchChatMessages(body.messages, preparedTask),
      }),
    })
    response.writeHead(upstream.status, {
      ...cors(request),
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
    })
    response.write(`event: research.sources\ndata: ${JSON.stringify(researchSourcePayload(research))}\n\n`)
    if (!upstream.body) { response.end(); return }
    const reader = upstream.body.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      response.write(Buffer.from(value))
    }
    response.end()
  } catch (error) {
    if (!response.headersSent) return json(request, response, 502, { error: publicText(error?.message, '联网核验暂时不可用，请稍后重试') })
    response.end()
  }
}

const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json; charset=utf-8' }

async function staticFile(request, response) {
  const pathname = new URL(request.url, 'http://localhost').pathname
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '')
  const candidate = VENDOR[pathname] || path.resolve(PUBLIC, relative)
  if (!VENDOR[pathname] && !candidate.startsWith(PUBLIC)) return json(request, response, 403, { error: 'Forbidden' })
  try {
    const body = await fs.readFile(candidate)
    response.writeHead(200, { ...cors(request), 'content-type': contentTypes[path.extname(candidate).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' })
    response.end(body)
  } catch {
    json(request, response, 404, { error: 'Not found' })
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') { response.writeHead(204, { ...cors(request), 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization, x-zt-agent-secret, x-zt-attachment-name' }); response.end(); return }
  try {
    const url = new URL(request.url, 'http://localhost')
    if (request.method === 'GET' && url.pathname === '/api/config') return json(request, response, 200, { ok: true, gatewayUrl, localSecret, mode: 'execute', runtime: buddy.capabilities() })
    if (request.method === 'POST' && (url.pathname === '/api/internal/web/search' || url.pathname === '/api/internal/web/fetch')) return handleWebBridge(request, response, url.pathname)
    if (url.pathname.startsWith('/api/') && !localAuthorized(request)) return json(request, response, 401, { error: '本机 Agent 请求未通过本地校验' })
    if (request.method === 'POST' && url.pathname === '/api/chat/research') return handleResearchChat(request, response)
    if (request.method === 'POST' && url.pathname === '/api/attachments/spreadsheet-preview') return handleSpreadsheetPreview(request, response)
    if (request.method === 'GET' && url.pathname === '/api/skills') {
      if (Date.now() - skillCache.at > 30_000) skillCache = { at: Date.now(), skills: await scanSkillRoots(skillRoots) }
      return json(request, response, 200, { ok: true, roots: skillRoots, skills: skillCache.skills, scannedAt: new Date(skillCache.at).toISOString() })
    }
    if (request.method === 'GET' && url.pathname === '/api/state') {
      const account = requireAccountAuth ? await accountSession(accountToken(request)) : null
      const accountId = account?.id || (requireAccountAuth ? null : 'local')
      return json(request, response, 200, {
        ok: true,
        workspaceRoot,
        history: (accountId ? taskHistory.filter(item => item.accountId === accountId) : requireAccountAuth ? [] : taskHistory).map(item => ({ ...item, summary: publicText(item.summary) })),
        conversations: buildAccountConversations(accountId),
        runtime: buddy.snapshot({ accountId }),
        permissions: permissions.snapshot(),
        deviceAuthorization: deviceAuthorization.snapshot(),
        gatewayUrl,
        mode: 'execute',
      })
    }
    if (request.method === 'POST' && url.pathname === '/api/conversations') {
      const account = requireAccountAuth ? await accountSession(accountToken(request)) : null
      if (requireAccountAuth && !account) return json(request, response, 401, { error: '请先登录桌面 Agent 账户或重新登录' })
      const accountId = account?.id || 'local'
      const body = await readBody(request)
      const incoming = Array.isArray(body.conversations) ? body.conversations : []
      const records = incoming.slice(0, 50).flatMap(item => {
        const id = String(item?.id || '').trim().slice(0, 160)
        if (!id || id.includes(':')) return []
        const messages = conversationMessages(item.messages)
        return [{ accountId, id, title: String(item.title || '新对话').slice(0, 160), messages, agentContext: item.agentContext === true, createdAt: Number(item.createdAt) || Date.now(), updatedAt: Number(item.updatedAt) || Date.now() }]
      })
      conversationHistory = [...conversationHistory.filter(item => item.accountId !== accountId), ...records].slice(-300)
      await saveConversationHistory()
      return json(request, response, 200, { ok: true, conversations: buildAccountConversations(accountId) })
    }
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
        await permissions.set(CAPABILITIES.fullAccess, false)
      }
      return json(request, response, 200, { ok: true, deviceAuthorization: authorization, permissions: permissions.snapshot() })
    }
    if (request.method === 'POST' && url.pathname === '/api/permissions') {
      const body = await readBody(request)
      if (body.enabled === true && requiresDeviceAuthorization(body.capability) && !deviceAuthorization.isAuthorized()) throw new Error('请先确认 Agent 只在这台设备上执行，再开启本机写入、命令或完全访问权限')
      const value = await permissions.set(body.capability, body.enabled)
      return json(request, response, 200, { ok: true, permissions: value })
    }
    if (request.method === 'POST' && url.pathname === '/api/tasks') {
      const body = await readBody(request)
      if (!String(body.task || '').trim()) return json(request, response, 400, { error: '请输入任务目标' })
      const intent = classifyIntent(body.task, { mode: 'BUDDY' })
      // ZT.buddy is the only desktop surface. Short questions are answered
      // inside the same Agent workspace; only uncertain or time-sensitive
      // questions receive the mandatory source-backed preflight below.
      const continuation = body.continuation === true
      const token = accountToken(request, body)
      const account = requireAccountAuth ? await accountSession(token) : null
      if (requireAccountAuth && !account) return json(request, response, 401, { error: '请先登录桌面 Agent 账户或重新登录' })
      sseStart(request, response)
      void startBuddyTask({ request, response, task: String(body.task).trim(), model: body.model, token, accountId: account?.id || 'local' })
      return
    }
    const approveMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/(approve|reject)$/)
    if (request.method === 'POST' && approveMatch) {
      const body = await readBody(request)
      const state = activeTasks.get(approveMatch[1])
      if (!state) return json(request, response, 404, { error: '没有找到正在执行的 ZT.buddy 任务' })
      if (requireAccountAuth) {
        const account = await accountSession(accountToken(request, body))
        if (!account || account.id !== state.accountId) return json(request, response, 401, { error: '当前账号不能确认其他用户的任务' })
      }
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

async function shutdown() {
  await buddy.dispose().catch(() => {})
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2_500).unref()
}

process.once('SIGTERM', () => { void shutdown() })
process.once('SIGINT', () => { void shutdown() })

server.listen(port, '127.0.0.1', () => {
  console.log(`ZT.AI Desktop Agent listening on http://127.0.0.1:${port}`)
  console.log(`Workspace: ${workspaceRoot}`)
  console.log(`Gateway: ${gatewayUrl}`)
  console.log(`Permissions: ${Object.values(CAPABILITIES).filter(key => permissions.has(key)).join(', ') || 'none'}`)
})

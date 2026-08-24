import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createSerialWriteQueue } from '../serial-write-queue.mjs'

export const CODEX_APP_SERVER_VERSION = '0.148.0'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function modelIdFor(model) {
  return String(model || '').toUpperCase() === 'DEEPSEEK' ? 'zt-deepseek-v4-flash' : 'zt-minimax-m3'
}

function publicModelName(model) {
  return String(model || '').toUpperCase() === 'DEEPSEEK' ? 'DeepSeek V4 Flash' : 'MiniMax M3'
}

function safeError(error, fallback = '桌面执行暂时没有完成，请稍后重试。') {
  return String(error?.message || error || '').trim() || fallback
}

export function runtimeErrorMessage(params, fallback = '执行内核返回了错误。') {
  const candidates = [
    params?.error?.additionalDetails,
    params?.error?.message,
    params?.additionalDetails,
    params?.message,
    params?.turn?.error?.message,
  ]
  return candidates.map(value => String(value || '').trim()).find(Boolean) || fallback
}

function asText(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) } catch { return String(value) }
}

function approvalCapability(method) {
  if (method === 'item/fileChange/requestApproval') return 'workspace_write'
  if (method === 'item/commandExecution/requestApproval') return 'command_exec'
  if (method === 'item/permissions/requestApproval') return 'sensitive_action'
  return 'sensitive_action'
}

function approvalCapabilityForItem(item) {
  const type = String(item?.type || '')
  if (type === 'fileChange') return 'workspace_write'
  if (type === 'commandExecution') return 'command_exec'
  if (type === 'webSearch' || type === 'webFetch') return 'web_access'
  return 'sensitive_action'
}

function itemLabel(item) {
  const type = String(item?.type || '')
  if (type === 'commandExecution') return item.command ? `执行命令：${item.command}` : '执行本机命令'
  if (type === 'fileChange') return '修改工作区文件'
  if (type === 'mcpToolCall') return item.tool ? `调用工具：${item.tool}` : '调用工具'
  if (type === 'webSearch') return '联网检索公开信息'
  if (type === 'webFetch') return '读取网页内容'
  if (type === 'plan') return '整理执行计划'
  return '执行工作步骤'
}

function itemResult(item) {
  const type = String(item?.type || '')
  if (type === 'commandExecution') {
    const output = item?.aggregatedOutput || item?.output || ''
    const exitCode = item?.exitCode == null ? '' : `（退出码 ${item.exitCode}）`
    return `${String(output).trim().slice(-2_000)}${exitCode}`.trim() || '命令已完成'
  }
  if (type === 'fileChange') return item.status === 'failed' ? '文件修改未完成' : '文件修改已完成'
  if (type === 'mcpToolCall') return asText(item.result || item.status || '工具已返回结果').slice(-2_000)
  return asText(item.status || '步骤已完成')
}

async function fileExists(filePath) {
  return fs.access(filePath).then(() => true).catch(() => false)
}

export function resolveCodexBinary({ platform = process.platform, env = process.env, root = ROOT } = {}) {
  const executable = platform === 'win32' ? 'codex.exe' : 'codex'
  const platformPackage = platform === 'win32' ? '@openai/codex-win32-x64' : `@openai/codex-${platform}`
  return [
    env.ZT_AI_CODEX_BIN,
    path.resolve(root, '..', 'node_modules', platformPackage, 'vendor', 'x86_64-pc-windows-msvc', 'bin', executable),
    path.resolve(root, 'runtime', executable),
  ].filter(Boolean)
}

export function verifyCodexBinary(binary, expectedVersion = CODEX_APP_SERVER_VERSION, spawnSyncImpl = spawnSync) {
  if (!binary) throw new Error('ZT.buddy 执行内核尚未安装，请使用完整桌面安装包。')
  const result = spawnSyncImpl(binary, ['--version'], { encoding: 'utf8', timeout: 15_000, windowsHide: true })
  const output = `${result?.stdout || ''}\n${result?.stderr || ''}`
  if (result?.error || result?.status !== 0 || !new RegExp(`\\b${String(expectedVersion).replaceAll('.', '\\.')}(?:\\b|$)`).test(output)) {
    throw new Error(`ZT.buddy 执行内核版本不匹配，需要 ${expectedVersion}。`)
  }
  return true
}

async function selectCodexBinary({ root = ROOT, env = process.env } = {}) {
  for (const candidate of resolveCodexBinary({ root, env })) {
    if (await fileExists(candidate)) {
      verifyCodexBinary(candidate)
      return candidate
    }
  }
  throw new Error('ZT.buddy 执行内核尚未安装，请使用完整桌面安装包。')
}

function codexConfigToml({ gatewayUrl }) {
  const baseUrl = `${String(gatewayUrl || '').replace(/\/$/, '')}/api/agent/openai/v1`
  return [
    'model = "zt-minimax-m3"',
    'model_provider = "zt"',
    'approval_policy = "on-request"',
    'sandbox_mode = "read-only"',
    'personality = "pragmatic"',
    '',
    '[features]',
    'web_search_request = true',
    '',
    '[model_providers.zt]',
    'name = "ZT.AI Gateway"',
    `base_url = ${JSON.stringify(baseUrl)}`,
    'env_key = "ZT_AI_ACCOUNT_TOKEN"',
    'wire_api = "responses"',
    'requires_openai_auth = false',
    '',
  ].join('\n')
}

function readJsonLineBuffer(buffer, onMessage) {
  const lines = buffer.split(/\r?\n/)
  const remainder = lines.pop() || ''
  for (const line of lines) {
    if (!line.trim()) continue
    try { onMessage(JSON.parse(line)) } catch { /* Ignore non-protocol diagnostics on stdout. */ }
  }
  return remainder
}

export class CodexAppServerConnection {
  constructor({ binary, cwd, codexHome, env = process.env, onNotification, onRequest, spawnImpl = spawn } = {}) {
    if (!binary) throw new Error('缺少 ZT.buddy 执行内核路径')
    this.binary = binary
    this.cwd = cwd
    this.codexHome = codexHome
    this.onNotification = onNotification
    this.onRequest = onRequest
    this.spawnImpl = spawnImpl
    this.pending = new Map()
    this.nextId = 1
    this.buffer = ''
    this.stderr = ''
    this.closed = false
    this.child = spawnImpl(binary, ['app-server', '--stdio'], {
      cwd,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...env, CODEX_HOME: codexHome },
    })
    this.child.stdout.setEncoding('utf8')
    this.child.stderr.setEncoding('utf8')
    this.child.stdout.on('data', data => {
      this.buffer += data
      this.buffer = readJsonLineBuffer(this.buffer, message => { void this.receive(message) })
    })
    this.child.stderr.on('data', data => {
      this.stderr = `${this.stderr}${String(data)}`.slice(-8_000)
    })
    this.child.on('error', error => this.failPending(error))
    this.child.on('exit', (code, signal) => {
      if (!this.closed) {
        const detail = this.stderr.trim().split(/\r?\n/).filter(Boolean).at(-1)?.slice(-1_000)
        this.failPending(new Error(`执行内核已退出（${code ?? signal ?? '未知原因'}）${detail ? `：${detail}` : ''}`))
      }
    })
  }

  async initialize() {
    await this.request('initialize', {
      clientInfo: { name: 'ztai_desktop', title: 'ZT.AI Desktop', version: '0.2.26' },
      capabilities: { experimentalApi: true },
    })
    this.notify('initialized', {})
    return true
  }

  send(message) {
    if (this.closed || this.child.stdin.destroyed) throw new Error('执行内核连接已关闭')
    this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  notify(method, params) { this.send({ method, params }) }

  request(method, params, timeout = 45_000) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`执行内核请求超时：${method}`))
      }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      try { this.send({ id, method, params }) } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  async receive(message) {
    if (message && Object.prototype.hasOwnProperty.call(message, 'id') && !message.method) {
      const pending = this.pending.get(message.id)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(message.error.message || '执行内核请求失败'))
      else pending.resolve(message.result)
      return
    }
    if (message?.method && Object.prototype.hasOwnProperty.call(message, 'id')) {
      try {
        const result = await this.onRequest?.(message)
        this.send({ id: message.id, result: result ?? {} })
      } catch (error) {
        this.send({ id: message.id, error: { code: -32000, message: safeError(error) } })
      }
      return
    }
    if (message?.method) await this.onNotification?.(message.method, message.params || {})
  }

  failPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  close() {
    if (this.closePromise) return this.closePromise
    this.closed = true
    this.failPending(new Error('执行内核连接已关闭'))
    this.closePromise = new Promise(resolve => {
      if (this.child.exitCode != null || this.child.signalCode) { resolve(); return }
      const finish = () => { clearTimeout(timer); resolve() }
      const timer = setTimeout(finish, 2_000)
      this.child.once('exit', finish)
      if (!this.child.killed) this.child.kill()
    })
    return this.closePromise
  }
}

export class CodexBuddyRuntime {
  constructor({ workspaceRoot, statePath, dataDir, gatewayUrl = '', fetchImpl = fetch, binary = '', env = process.env, spawnImpl = spawn } = {}) {
    if (!workspaceRoot) throw new Error('ZT.buddy 需要有效工作区')
    if (!statePath) throw new Error('ZT.buddy 需要会话状态文件')
    this.workspaceRoot = path.resolve(workspaceRoot)
    this.statePath = statePath
    this.dataDir = dataDir || path.join(path.dirname(statePath), 'codex')
    this.gatewayUrl = gatewayUrl
    this.fetch = fetchImpl
    this.binary = binary
    this.env = env
    this.spawnImpl = spawnImpl
    this.sessions = new Map()
    this.tasks = new Map()
    this.runtime = null
    this.runtimeInitPromise = null
    this.sessionWriteQueue = createSerialWriteQueue()
    this.loaded = false
  }

  capabilities() {
    return { runtime: 'app-server', version: CODEX_APP_SERVER_VERSION, models: ['MINIMAX', 'DEEPSEEK'], approvals: true, localTools: true, webSearch: true, fileAnalysis: true }
  }

  async load() {
    if (this.loaded) return
    this.loaded = true
    try {
      const records = JSON.parse(await fs.readFile(this.statePath, 'utf8'))
      for (const record of Array.isArray(records) ? records : []) {
        if (record?.conversationId && record?.threadId && record.workspaceRoot === this.workspaceRoot) this.sessions.set(record.conversationId, record)
      }
    } catch { /* First launch has no sessions. */ }
  }

  snapshot({ accountId } = {}) {
    const prefix = accountId ? `${String(accountId)}:` : null
    return {
      workspaceRoot: this.workspaceRoot,
      sessions: [...this.sessions.values()].filter(record => !prefix || record.conversationId.startsWith(prefix)).map(({ conversationId, threadId, title, updatedAt }) => ({ conversationId, sessionId: threadId, title: title || 'ZT.buddy 对话', updatedAt })),
      tasks: [...this.tasks.values()].filter(task => !prefix || task.conversationId.startsWith(prefix)).map(task => ({ id: task.taskId, sessionId: task.threadId, task: task.task, status: task.status })),
    }
  }

  setWorkspaceRoot(workspaceRoot) {
    if (this.tasks.size) throw new Error('当前有任务执行，暂时不能切换工作区')
    this.workspaceRoot = path.resolve(workspaceRoot)
    this.sessions.clear()
    return this.workspaceRoot
  }

  async persistSessions() {
    const records = [...this.sessions.values()].map(({ conversationId, threadId, title, workspaceRoot, updatedAt }) => ({ conversationId, threadId, title, workspaceRoot, updatedAt }))
    return this.sessionWriteQueue.enqueue(async () => {
      await fs.mkdir(path.dirname(this.statePath), { recursive: true })
      await fs.writeFile(this.statePath, `${JSON.stringify(records, null, 2)}\n`, 'utf8')
    })
  }

  async ensureRuntime(accountToken = '') {
    const tokenKey = crypto.createHash('sha256').update(String(accountToken)).digest('hex')
    if (this.runtime && this.runtime.tokenKey === tokenKey) return this.runtime
    if (this.runtimeInitPromise) {
      const pendingInitialization = this.runtimeInitPromise
      await pendingInitialization
      if (this.runtime && this.runtime.tokenKey === tokenKey) return this.runtime
    }
    if (this.runtime && this.runtime.tokenKey === tokenKey) return this.runtime
    const initialize = async () => {
      await this.stopRuntime()
      const binary = this.binary || await selectCodexBinary({ env: this.env })
      verifyCodexBinary(binary)
      const runtimeHome = path.join(this.dataDir, `codex-${tokenKey.slice(0, 16)}`)
      await fs.mkdir(runtimeHome, { recursive: true })
      await fs.writeFile(path.join(runtimeHome, 'config.toml'), codexConfigToml({ gatewayUrl: this.gatewayUrl }), 'utf8')
      const connection = new CodexAppServerConnection({
        binary,
        cwd: this.workspaceRoot,
        codexHome: runtimeHome,
        env: { ...this.env, ZT_AI_ACCOUNT_TOKEN: String(accountToken || '') },
        spawnImpl: this.spawnImpl,
        onNotification: (method, params) => this.routeNotification(method, params),
        onRequest: request => this.routeRequest(request),
      })
      this.runtime = { tokenKey, binary, home: runtimeHome, connection }
      try {
        await connection.initialize()
        return this.runtime
      } catch (error) {
        connection.close()
        this.runtime = null
        throw error
      }
    }
    this.runtimeInitPromise = initialize()
    try {
      return await this.runtimeInitPromise
    } finally {
      this.runtimeInitPromise = null
    }
  }

  findTask(params) {
    const threadId = String(params?.threadId || '')
    return [...this.tasks.values()].find(task => task.threadId === threadId) || null
  }

  emit(state, event) {
    if (!state || state.closed || !event) return
    const enriched = { ...event, taskId: state.taskId, sessionId: state.threadId }
    if (event.type === 'result.delta') state.output += String(event.text || '')
    state.onEvent(enriched)
    if (event.type === 'session.completed' || event.type === 'session.failed') this.finishTask(state)
  }

  async routeNotification(method, params) {
    const state = this.findTask(params)
    if (!state) return
    if (method === 'item/agentMessage/delta') {
      this.emit(state, { type: 'result.delta', text: String(params.delta || params.text || '') })
      return
    }
    if (method === 'item/commandExecution/outputDelta') {
      this.emit(state, { type: 'tool.progress', toolId: params.itemId, message: String(params.delta || params.output || '').trim().slice(-1_000) })
      return
    }
    if (method === 'item/plan/delta') {
      this.emit(state, { type: 'tool.progress', toolId: 'plan', message: String(params.delta || '').trim().slice(-1_000) })
      return
    }
    if (method === 'thread/tokenUsage/updated') {
      state.usage = params.tokenUsage || {}
      this.emit(state, { type: 'usage.updated', usage: state.usage })
      return
    }
    if (method === 'item/started') {
      const item = params.item || {}
      if (['userMessage', 'agentMessage', 'reasoning'].includes(String(item.type))) return
      this.emit(state, { type: 'tool.started', toolId: item.id || crypto.randomUUID(), label: itemLabel(item), capability: approvalCapabilityForItem(item) })
      return
    }
    if (method === 'item/completed') {
      const item = params.item || {}
      if (['userMessage', 'agentMessage', 'reasoning'].includes(String(item.type))) return
      this.emit(state, { type: 'tool.completed', toolId: item.id, result: itemResult(item) })
      return
    }
    if (method === 'turn/completed') {
      const turn = params.turn || {}
      if (turn.status === 'interrupted') this.emit(state, { type: 'session.failed', message: '任务已停止。' })
      else if (turn.status === 'failed') this.emit(state, { type: 'session.failed', message: runtimeErrorMessage({ turn }, '任务执行失败，请检查权限或网络后重试。') })
      else this.emit(state, { type: 'session.completed', usage: state.usage })
      return
    }
    if (method === 'error') {
      const message = runtimeErrorMessage(params)
      if (params.willRetry === true) this.emit(state, { type: 'tool.progress', message: `执行内核正在重试：${message}` })
      else this.emit(state, { type: 'session.failed', message })
    }
  }

  async routeRequest(request) {
    const state = this.findTask(request.params)
    if (!state) return {}
    const capability = approvalCapability(request.method)
    if (request.method === 'item/permissions/requestApproval') {
      const permissionId = String(request.id)
      state.pending.set(permissionId, { rpcId: request.id, method: request.method, capability, params: request.params, requested: request.params?.permissions || {} })
      const details = []
      if (request.params?.cwd) details.push(`工作目录：${request.params.cwd}`)
      if (request.params?.permissions?.fileSystem) details.push('需要额外的本机文件访问权限')
      if (request.params?.permissions?.network?.enabled) details.push('需要联网访问权限')
      const event = { type: 'approval.required', permissionId, capability, label: 'ZT.buddy 请求扩大本机访问范围', details }
      if (state.fullAccess) {
        await this.approve({ taskId: state.taskId, permissionId, remember: true })
        this.emit(state, { type: 'tool.progress', message: '完全访问已授权，正在继续执行…' })
      } else this.emit(state, event)
      return new Promise(() => {})
    }
    if (request.method === 'item/commandExecution/requestApproval' || request.method === 'item/fileChange/requestApproval') {
      const permissionId = String(request.id)
      state.pending.set(permissionId, { rpcId: request.id, method: request.method, capability, params: request.params })
      const details = []
      if (request.params?.command) details.push(request.params.command)
      if (request.params?.cwd) details.push(`工作目录：${request.params.cwd}`)
      if (request.params?.reason) details.push(request.params.reason)
      const event = { type: 'approval.required', permissionId, capability, label: capability === 'command_exec' ? 'ZT.buddy 请求执行本机命令' : 'ZT.buddy 请求修改工作区文件', details }
      if (state.fullAccess) {
        await this.approve({ taskId: state.taskId, permissionId, remember: true })
        this.emit(state, { type: 'tool.progress', message: '完全访问已授权，正在继续执行…' })
      } else this.emit(state, event)
      return new Promise(() => {})
    }
    if (request.method === 'item/tool/requestUserInput') return { answers: {} }
    return {}
  }

  async startTask({ task, model = 'MINIMAX', conversationId, taskId, onEvent, accountToken = '', fullAccess = false } = {}) {
    const text = String(task || '').trim()
    if (!text) throw new Error('请输入任务目标')
    if (!conversationId) throw new Error('ZT.buddy 任务缺少会话标识')
    if (typeof onEvent !== 'function') throw new Error('ZT.buddy 任务缺少事件接收器')
    await this.load()
    const runtime = await this.ensureRuntime(accountToken)
    let record = this.sessions.get(conversationId)
    let thread
    if (record) {
      try { thread = (await runtime.connection.request('thread/resume', { threadId: record.threadId, cwd: this.workspaceRoot, approvalPolicy: fullAccess ? 'never' : 'on-request', sandbox: fullAccess ? 'danger-full-access' : 'read-only' })).thread } catch { record = null }
    }
    if (!record) {
      thread = (await runtime.connection.request('thread/start', { model: modelIdFor(model), cwd: this.workspaceRoot, approvalPolicy: fullAccess ? 'never' : 'on-request', sandbox: fullAccess ? 'danger-full-access' : 'read-only', ephemeral: false })).thread
      if (!thread?.id) throw new Error('ZT.buddy 未创建执行会话')
      record = { conversationId, threadId: thread.id, title: text.slice(0, 80), workspaceRoot: this.workspaceRoot, updatedAt: new Date().toISOString() }
      this.sessions.set(conversationId, record)
      await this.persistSessions()
    }
    const state = { taskId: taskId || crypto.randomUUID(), task: text, model: String(model).toUpperCase() === 'DEEPSEEK' ? 'DEEPSEEK' : 'MINIMAX', threadId: record.threadId, conversationId, onEvent, pending: new Map(), output: '', status: 'running', fullAccess: fullAccess === true, closed: false, usage: null }
    this.tasks.set(state.taskId, state)
    this.emit(state, { type: 'session.started', sessionId: state.threadId })
    this.emit(state, { type: 'plan.ready', label: `正在使用 ${publicModelName(state.model)} 分析并准备执行` })
    const guardedTask = [
      '你是 ZT.buddy：一个在用户授权的本机工作区内协作、读取资料、整理信息并执行任务的桌面 Agent。',
      '请直接给出简洁、结构清晰、可执行的结果；不要暴露内部运行时、供应商、协议或隐藏推理过程。',
      '遇到不确定、可能变化或用户要求核实的公开信息，先联网查证并附来源；没有可靠来源时明确说明。',
      '如果用户要求生成图片或视频，必须交给 ZT.AI 网关的 MMX 媒体路由；不要调用或提及 image_gen、imagegen，也不要在没有 media.completed 返回媒体地址时声称已经生成成功。',
      `用户任务：${text}`,
    ].join('\n\n')
    await runtime.connection.request('turn/start', { threadId: state.threadId, input: [{ type: 'text', text: guardedTask }], model: modelIdFor(state.model), cwd: this.workspaceRoot, approvalPolicy: fullAccess ? 'never' : 'on-request', effort: 'medium' })
    return { taskId: state.taskId, sessionId: state.threadId }
  }

  async respond({ taskId, permissionId, decision = 'accept' } = {}) {
    const state = this.tasks.get(taskId)
    const pending = state?.pending.get(String(permissionId))
    if (!state || !pending) throw new Error('没有找到待处理的本机权限请求')
    const result = pending.method === 'item/permissions/requestApproval'
      ? { permissions: pending.requested || {}, scope: decision === 'acceptForSession' ? 'session' : 'turn' }
      : { decision }
    this.runtime.connection.send({ id: pending.rpcId, result })
    state.pending.delete(String(permissionId))
    return true
  }

  async approve({ taskId, permissionId, remember = false } = {}) { return this.respond({ taskId, permissionId, decision: remember ? 'acceptForSession' : 'accept' }) }
  async reject({ taskId, permissionId } = {}) { return this.respond({ taskId, permissionId, decision: 'decline' }) }

  finishTask(state) {
    if (!state || state.closed) return
    state.closed = true
    state.status = 'finished'
    this.tasks.delete(state.taskId)
    const record = this.sessions.get(state.conversationId)
    if (record) {
      record.updatedAt = new Date().toISOString()
      void this.persistSessions().catch(() => {})
    }
  }

  async stopRuntime() {
    const runtime = this.runtime
    this.runtime = null
    await runtime?.connection?.close()
  }

  async dispose() {
    for (const state of this.tasks.values()) this.finishTask(state)
    await this.stopRuntime()
  }
}

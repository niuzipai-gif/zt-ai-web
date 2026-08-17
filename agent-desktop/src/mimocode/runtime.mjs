import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { normalizeMiMoEvent } from './event-map.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const MIMOCODE_VERSION = '0.1.12'

function modelIdFor(model) {
  return String(model).toUpperCase() === 'DEEPSEEK' ? 'zt-deepseek-v4-flash' : 'zt-minimax-m3'
}

function basicAuth(password) {
  return `Basic ${Buffer.from(`mimocode:${password}`).toString('base64')}`
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(error => error ? reject(error) : resolve(port))
    })
  })
}

function parseSseChunk(buffer, onEvent) {
  const frames = buffer.split(/\r?\n\r?\n/)
  const remainder = frames.pop() ?? ''
  for (const frame of frames) {
    const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n')
    if (!data) continue
    try { onEvent(JSON.parse(data)) } catch { /* Ignore incomplete or non-JSON MiMo diagnostics. */ }
  }
  return remainder
}

async function readJson(response) {
  const raw = await response.text()
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

function safeFailureMessage() {
  return '本机执行暂时没有完成，请检查网络、登录状态或权限后重试。'
}

export function defaultConfig({ gatewayUrl, accountToken }) {
  const baseURL = `${String(gatewayUrl || '').replace(/\/$/, '')}/api/agent/openai/v1`
  return {
    $schema: 'https://mimo.xiaomi.com/mimocode/config.json',
    model: 'zt/zt-minimax-m3',
    provider: {
      zt: {
        name: 'ZT.AI Gateway',
        npm: '@ai-sdk/openai-compatible',
        options: { baseURL, apiKey: accountToken },
        only_configured_models: true,
        models: {
          'zt-minimax-m3': { name: 'ZT.buddy · MiniMax M3', tool_call: true, limit: { context: 1_000_000, output: 8192 } },
          'zt-deepseek-v4-flash': { name: 'ZT.buddy · DeepSeek V4 Flash', tool_call: true, limit: { context: 1_000_000, output: 8192 } },
        },
      },
    },
    permission: { read: 'ask', edit: 'ask', bash: 'ask', webfetch: 'ask' },
  }
}

async function defaultSpawnRuntime({ workspaceRoot, port, configPath, dataDir, password }) {
  const executable = process.platform === 'win32' ? 'mimo.exe' : 'mimo'
  const candidates = [
    process.env.ZT_AI_MIMOCODE_BIN,
    path.resolve(ROOT, '..', 'node_modules', '@mimo-ai', `mimocode-${process.platform === 'win32' ? 'windows-x64' : process.platform}`, 'bin', executable),
    path.join(ROOT, 'runtime', executable),
  ].filter(Boolean)
  const binary = (await Promise.all(candidates.map(async candidate => ({ candidate, exists: await fs.access(candidate).then(() => true).catch(() => false) })))).find(item => item.exists)?.candidate
  if (!binary) throw new Error('MiMoCode 运行时尚未安装；请使用 ZT.AI Desktop 的完整安装包。')
  const version = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 15_000, windowsHide: true })
  const versionText = `${version.stdout || ''}\n${version.stderr || ''}`
  if (version.error || version.status !== 0 || !new RegExp(`\\b${MIMOCODE_VERSION.replaceAll('.', '\\.')}\\b`).test(versionText)) throw new Error(`MiMoCode 运行时版本不匹配；需要 ${MIMOCODE_VERSION}。`)
  const child = spawn(binary, ['serve', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: workspaceRoot,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      MIMOCODE_HOME: dataDir,
      MIMOCODE_DATA_DIR: dataDir,
      MIMOCODE_CONFIG: configPath,
      MIMOCODE_DISABLE_PROJECT_CONFIG: 'true',
      MIMOCODE_SERVER_PASSWORD: password,
    },
  })
  const url = `http://127.0.0.1:${port}`
  return {
    url,
    stop: async () => {
      if (!child.killed) child.kill()
    },
  }
}

export class MiMoBuddyRuntime {
  constructor({ workspaceRoot, statePath, dataDir, gatewayUrl = '', runtimeUrl = '', fetchImpl = fetch, spawnRuntime = defaultSpawnRuntime } = {}) {
    if (!workspaceRoot) throw new Error('MiMoCode 需要有效工作区')
    if (!statePath) throw new Error('MiMoCode 需要会话状态文件')
    this.workspaceRoot = path.resolve(workspaceRoot)
    this.statePath = statePath
    this.dataDir = dataDir || path.join(path.dirname(statePath), 'mimocode')
    this.gatewayUrl = gatewayUrl
    this.runtimeUrl = String(runtimeUrl || '').replace(/\/$/, '')
    this.fetch = fetchImpl
    this.spawnRuntime = spawnRuntime
    this.sessions = new Map()
    this.tasks = new Map()
    this.runtime = null
    this.loaded = false
  }

  async load() {
    if (this.loaded) return
    this.loaded = true
    try {
      const records = JSON.parse(await fs.readFile(this.statePath, 'utf8'))
      for (const record of Array.isArray(records) ? records : []) {
        if (record?.conversationId && record?.sessionId && record?.workspaceRoot === this.workspaceRoot) this.sessions.set(record.conversationId, record)
      }
    } catch {
      // A first launch simply starts with no reusable session.
    }
  }

  snapshot({ accountId } = {}) {
    const prefix = accountId ? `${String(accountId)}:` : null
    return {
      workspaceRoot: this.workspaceRoot,
      sessions: [...this.sessions.values()].filter(record => !prefix || record.conversationId.startsWith(prefix)).map(({ conversationId, sessionId, updatedAt }) => ({ conversationId, sessionId, updatedAt })),
      tasks: [...this.tasks.values()].filter(task => !prefix || task.conversationId.startsWith(prefix)).map(task => ({ id: task.taskId, sessionId: task.sessionId, task: task.task, status: task.status })),
    }
  }

  setWorkspaceRoot(workspaceRoot) {
    if (this.tasks.size) throw new Error('当前有任务执行，暂时不能切换工作区')
    this.workspaceRoot = path.resolve(workspaceRoot)
    this.sessions.clear()
    return this.workspaceRoot
  }

  async persistSessions() {
    const records = [...this.sessions.values()].map(({ conversationId, sessionId, workspaceRoot, updatedAt }) => ({ conversationId, sessionId, workspaceRoot, updatedAt }))
    await fs.mkdir(path.dirname(this.statePath), { recursive: true })
    await fs.writeFile(this.statePath, `${JSON.stringify(records, null, 2)}\n`, 'utf8')
  }

  async ensureRuntime(accountToken = '') {
    const tokenKey = crypto.createHash('sha256').update(accountToken).digest('hex')
    if (this.runtime && this.runtime.tokenKey === tokenKey) return this.runtime
    if (this.runtime) await this.stopRuntime()

    if (this.runtimeUrl) {
      const password = crypto.randomBytes(24).toString('base64url')
      this.runtime = { url: this.runtimeUrl, password, tokenKey, headers: { authorization: basicAuth(password) }, stop: async () => {} }
      try {
        await this.waitForHealth()
        await this.verifyGatewayBridge(accountToken)
        return this.runtime
      } catch (error) {
        await this.stopRuntime()
        throw error
      }
    }

    const port = await getFreePort()
    const password = crypto.randomBytes(24).toString('base64url')
    const configPath = path.join(this.dataDir, 'mimocode.json')
    await fs.mkdir(this.dataDir, { recursive: true })
    await fs.writeFile(configPath, `${JSON.stringify(defaultConfig({ gatewayUrl: this.gatewayUrl, accountToken }), null, 2)}\n`, 'utf8')
    const spawned = await this.spawnRuntime({
      workspaceRoot: this.workspaceRoot,
      port,
      configPath,
      dataDir: this.dataDir,
      password,
      version: MIMOCODE_VERSION,
    })
    if (!spawned?.url) throw new Error('MiMoCode 运行时没有返回本机地址')
    this.runtime = { ...spawned, password, tokenKey, configPath, headers: { authorization: basicAuth(password) } }
    try {
      await this.waitForHealth()
      await this.verifyGatewayBridge(accountToken)
      return this.runtime
    } catch (error) {
      await this.stopRuntime()
      throw error
    }
  }

  async verifyGatewayBridge(accountToken = '') {
    if (!this.gatewayUrl || !accountToken) return true
    const endpoint = `${this.gatewayUrl.replace(/\/$/, '')}/api/agent/openai/v1/models`
    let response
    try {
      response = await this.fetch(endpoint, {
        headers: { authorization: `Bearer ${accountToken}` },
        signal: AbortSignal.timeout(12_000),
      })
    } catch {
      throw new Error('MiMoCode 模型网关无法连接，请检查网络后重试。')
    }
    if (!response.ok) throw new Error(`MiMoCode 模型网关不可用（${response.status}）。请更新桌面端或联系管理员。`)
    const body = await readJson(response)
    const models = Array.isArray(body?.data) ? body.data : []
    const ids = new Set(models.map(model => String(model?.id || '')))
    if (!ids.has('zt-minimax-m3') || !ids.has('zt-deepseek-v4-flash')) throw new Error('MiMoCode 模型网关配置不完整，请稍后重试。')
    return true
  }

  async waitForHealth(timeout = 45_000) {
    const started = Date.now()
    while (Date.now() - started < timeout) {
      try {
        const response = await this.fetch(`${this.runtime.url}/global/health`, { headers: this.runtime.headers, signal: AbortSignal.timeout(2_000) })
        const body = await readJson(response)
        if (response.ok && body?.healthy === true) return true
      } catch {
        // MiMoCode performs first-run migrations before its HTTP server is ready.
      }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new Error('MiMoCode 本机运行时启动超时')
  }

  async request(pathname, { method = 'GET', body, signal } = {}) {
    const response = await this.fetch(`${this.runtime.url}${pathname}`, {
      method,
      headers: { ...this.runtime.headers, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    })
    if (!response.ok) throw new Error(`MiMoCode 本机请求失败（${response.status}）`)
    return response
  }

  emit(state, event) {
    if (!state || state.closed || !event) return
    const enriched = { ...event, taskId: state.taskId }
    if (event.type === 'approval.required') state.pending.set(event.permissionId, enriched)
    if (event.type === 'result.delta') state.output += event.text || ''
    state.onEvent(enriched)
    if (event.type === 'session.completed' || event.type === 'session.failed') this.finishTask(state)
  }

  async subscribe(state) {
    state.eventsAbort = new AbortController()
    const response = await this.request('/event', { signal: state.eventsAbort.signal })
    if (!response.body) throw new Error('MiMoCode 没有返回执行事件流')
    state.eventReader = response.body.getReader()
    void (async () => {
      const decoder = new TextDecoder()
      let buffer = ''
      try {
        while (!state.closed) {
          const { value, done } = await state.eventReader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          buffer = parseSseChunk(buffer, raw => {
            const event = normalizeMiMoEvent(raw)
            if (!event || event.sessionId !== state.sessionId) return
            this.emit(state, event)
          })
        }
      } catch (error) {
        if (!state.closed && error?.name !== 'AbortError') this.emit(state, { type: 'session.failed', sessionId: state.sessionId, message: safeFailureMessage() })
      }
    })()
  }

  async startTask({ task, model = 'MINIMAX', conversationId, taskId, onEvent, accountToken = '' } = {}) {
    const text = String(task || '').trim()
    if (!text) throw new Error('请输入任务目标')
    if (!conversationId) throw new Error('MiMoCode 任务缺少会话标识')
    if (typeof onEvent !== 'function') throw new Error('MiMoCode 任务缺少事件接收器')
    await this.load()
    await this.ensureRuntime(accountToken)

    let record = this.sessions.get(conversationId)
    if (!record) {
      const response = await this.request('/session', { method: 'POST', body: { title: text.slice(0, 80) } })
      const created = await readJson(response)
      if (!created?.id) throw new Error('MiMoCode 未创建执行会话')
      record = { conversationId, sessionId: created.id, workspaceRoot: this.workspaceRoot, updatedAt: new Date().toISOString() }
      this.sessions.set(conversationId, record)
      await this.persistSessions()
    }

    const state = {
      taskId: taskId || crypto.randomUUID(),
      task: text,
      model: String(model).toUpperCase() === 'DEEPSEEK' ? 'DEEPSEEK' : 'MINIMAX',
      sessionId: record.sessionId,
      conversationId,
      onEvent,
      pending: new Map(),
      output: '',
      status: 'running',
      closed: false,
      eventsAbort: null,
      eventReader: null,
    }
    this.tasks.set(state.taskId, state)
    this.emit(state, { type: 'session.started', sessionId: state.sessionId })
    await this.subscribe(state)
    void this.request(`/session/${encodeURIComponent(state.sessionId)}/message`, {
      method: 'POST',
      body: {
        model: { providerID: 'zt', modelID: modelIdFor(state.model) },
        parts: [{ type: 'text', text }],
      },
    }).catch(() => this.emit(state, { type: 'session.failed', sessionId: state.sessionId, message: safeFailureMessage() }))
    return { taskId: state.taskId, sessionId: state.sessionId }
  }

  async respond({ taskId, permissionId, reply }) {
    const state = this.tasks.get(taskId)
    if (!state || !state.pending.has(permissionId)) throw new Error('没有找到待处理的 MiMoCode 权限请求')
    await this.request(`/permission/${encodeURIComponent(permissionId)}/reply`, { method: 'POST', body: { reply } })
    state.pending.delete(permissionId)
    return true
  }

  async approve({ taskId, permissionId } = {}) {
    return this.respond({ taskId, permissionId, reply: 'once' })
  }

  async reject({ taskId, permissionId } = {}) {
    return this.respond({ taskId, permissionId, reply: 'reject' })
  }

  finishTask(state) {
    if (state.closed) return
    state.closed = true
    state.status = 'finished'
    state.eventsAbort?.abort()
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
    if (runtime?.stop) await runtime.stop().catch(() => {})
  }

  async dispose() {
    for (const state of this.tasks.values()) this.finishTask(state)
    await this.stopRuntime()
  }
}

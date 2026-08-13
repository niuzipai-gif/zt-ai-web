import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { capabilityForTool, CAPABILITY_LABELS } from './permissions.mjs'
import { requiresDeviceAuthorization } from './authorization.mjs'
import { executeTool, resolveWorkspacePath } from './tools.mjs'

const TOOL_LABELS = Object.freeze({
  list_workspace: '查看工作区',
  read_file: '读取文件',
  write_file: '写入文件',
  run_command: '执行命令',
})

const ALLOWED_TOOLS = new Set(Object.keys(TOOL_LABELS))
const MAX_PLAN_STEPS = 8
const MAX_GENERATED_FILE_BYTES = 250_000

function compact(value, max = 2_000) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return text.length > max ? `${text.slice(0, max)}\n…（已截断）` : text
}

export function extractFilePath(text) {
  const candidates = String(text || '').match(/(?:[A-Za-z]:[\\/][^\s，。；;：:]+|(?:[\w./-]+\.(?:md|txt|json|csv|js|jsx|ts|tsx|py|html|css|yml|yaml|docx?)))/g) || []
  return candidates[0] || null
}

function parseJsonText(raw) {
  const source = String(raw || '').trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '')
  try { return JSON.parse(source) } catch {
    const start = source.indexOf('{')
    const end = source.lastIndexOf('}')
    if (start < 0 || end <= start) throw new Error('模型没有返回有效 JSON 计划')
    try { return JSON.parse(source.slice(start, end + 1)) } catch { throw new Error('模型返回的 Agent 计划无法解析') }
  }
}

export function parseAgentPlan(raw, { workspaceRoot = '.' } = {}) {
  const parsed = parseJsonText(raw)
  const rawSteps = Array.isArray(parsed) ? parsed : parsed?.steps
  if (!Array.isArray(rawSteps) || !rawSteps.length) throw new Error('模型计划没有 steps')
  if (rawSteps.length > MAX_PLAN_STEPS) throw new Error(`模型计划最多允许 ${MAX_PLAN_STEPS} 步`)
  const steps = rawSteps.map((rawStep, index) => {
    const tool = String(rawStep?.tool || '')
    if (!ALLOWED_TOOLS.has(tool)) throw new Error(`模型计划包含不支持的工具：${tool || '空值'}`)
    const label = String(rawStep.label || TOOL_LABELS[tool]).slice(0, 180)
    const step = { id: String(rawStep.id || `model-step-${index + 1}`), tool, label }
    if (tool === 'list_workspace' || tool === 'read_file' || tool === 'write_file') {
      step.inputPath = String(rawStep.inputPath || '.')
      resolveWorkspacePath(workspaceRoot, step.inputPath)
    }
    if (tool === 'write_file') {
      step.content = String(rawStep.content ?? '')
      if (!step.content.trim()) throw new Error('模型写入步骤缺少完整文件内容')
      if (Buffer.byteLength(step.content, 'utf8') > MAX_GENERATED_FILE_BYTES) throw new Error('模型生成文件超过 250 KB 上限')
      step.overwrite = rawStep.overwrite === true
    }
    if (tool === 'run_command') {
      step.command = String(rawStep.command || '').trim().slice(0, 600)
      if (!step.command) throw new Error('模型执行步骤缺少 command')
    }
    return step
  })
  const listIndex = steps.findIndex(step => step.tool === 'list_workspace')
  if (listIndex > 0) {
    const [listStep] = steps.splice(listIndex, 1)
    steps.unshift(listStep)
  } else if (listIndex < 0) {
    steps.unshift({ id: 'context-list', tool: 'list_workspace', label: '检查工作区上下文', inputPath: '.' })
  }
  return steps
}

export function buildPlan(task, taskId = 'task') {
  const text = String(task || '').trim()
  const filePath = extractFilePath(text)
  const plan = [{ id: 'step-1', tool: 'list_workspace', label: '检查工作区上下文', inputPath: '.' }]
  if (/(读取|查看|分析|打开|read|inspect|review|analy[sz]e|open)/iu.test(text) && filePath) {
    plan.push({ id: 'step-read', tool: 'read_file', label: `读取 ${filePath}`, inputPath: filePath })
  }
  if (/(写|修改|创建|实现|编码|重构|write|edit|create|implement|refactor|code)/iu.test(text)) {
    const target = filePath || `agent-output/${taskId}.md`
    plan.push({
      id: 'step-write',
      tool: 'write_file',
      label: `等待模型生成 ${target}`,
      inputPath: target,
      overwrite: Boolean(filePath),
      content: null,
      requiresModel: true,
    })
  }
  if (/(测试|构建|运行|执行|检查|test|build|run|lint|verify)/iu.test(text)) {
    const command = text.match(/`([^`]+)`/)?.[1] || (/(npm|pnpm|yarn)/iu.test(text) ? 'npm test' : 'npm test')
    plan.push({ id: 'step-command', tool: 'run_command', label: `运行 ${command}`, command })
  }
  return plan
}

function buildSafeFallbackPlan(task, taskId) {
  return buildPlan(task, taskId).filter(step => step.tool !== 'write_file')
}

function modelForGateway(model) {
  return String(model || '').toUpperCase() === 'DEEPSEEK' ? 'deepseek' : 'minimax'
}

export class AgentTaskManager {
  constructor({ workspaceRoot, permissionStore, deviceAuthorization, gatewayUrl, historyPath, authToken = '' }) {
    this.workspaceRoot = workspaceRoot
    this.permissionStore = permissionStore
    this.deviceAuthorization = deviceAuthorization
    this.gatewayUrl = gatewayUrl.replace(/\/$/, '')
    this.historyPath = historyPath
    this.authToken = authToken
    this.tasks = new Map()
    this.history = []
  }

  async load() {
    try {
      const parsed = JSON.parse(await fs.readFile(this.historyPath, 'utf8'))
      if (Array.isArray(parsed)) this.history = parsed.slice(-30)
    } catch {
      this.history = []
    }
  }

  snapshot() {
    const running = [...this.tasks.values()].map(task => ({ id: task.id, task: task.task, model: task.model, status: task.status, createdAt: task.createdAt }))
    return { workspaceRoot: this.workspaceRoot, history: [...this.history, ...running].slice(-30) }
  }

  send(state, event, data = {}) {
    if (state.closed || state.response.destroyed) return
    state.response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  create({ task, model, response, authToken = this.authToken }) {
    const id = crypto.randomUUID()
    const state = {
      id,
      task: String(task || '').trim(),
      model: model === 'DEEPSEEK' ? 'DEEPSEEK' : 'MINIMAX',
      response,
      createdAt: new Date().toISOString(),
      plan: [],
      index: 0,
      results: [],
      approvedOnce: new Set(),
      waiting: null,
      status: 'running',
      closed: false,
      authToken,
    }
    response.on('close', () => { state.closed = true })
    this.tasks.set(id, state)
    this.send(state, 'task.start', { id, task: state.task, model: state.model, mode: 'execute' })
    void this.preparePlan(state)
    return id
  }

  async preparePlan(state) {
    try {
      state.plan = await this.requestAgentPlan(state)
      state.planSource = 'model'
    } catch (error) {
      state.plan = buildSafeFallbackPlan(state.task, state.id)
      state.planSource = 'safe-fallback'
      this.send(state, 'agent.warning', { message: `模型计划不可用，已切换为安全本地计划：${error.message}` })
    }
    if (state.closed) return
    this.send(state, 'plan.ready', { source: state.planSource, steps: state.plan.map(step => ({ id: step.id, tool: step.tool, label: step.label, capability: capabilityForTool(step.tool) })) })
    void this.advance(state)
  }

  async requestAgentPlan(state) {
    const response = await fetch(`${this.gatewayUrl}/api/agent/plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${state.authToken}` },
      body: JSON.stringify({ model: modelForGateway(state.model), language: 'zh', task: state.task, taskId: state.id, visitorId: `desktop-${state.authToken.slice(-12)}`, conversationId: state.id }),
      signal: AbortSignal.timeout(90_000),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || `Agent 规划网关不可用（${response.status}）`)
    return parseAgentPlan(body.text, { workspaceRoot: this.workspaceRoot })
  }

  async approve(id, capability, remember = false) {
    const state = this.tasks.get(id)
    if (!state || !state.waiting) throw new Error('没有找到待批准的动作')
    if (state.waiting.capability !== capability) throw new Error('批准的权限与待执行动作不一致')
    if (requiresDeviceAuthorization(capability) && !this.deviceAuthorization.isAuthorized()) throw new Error('请先确认 Agent 只在当前设备执行')
    if (remember) await this.permissionStore.set(capability, true)
    else state.approvedOnce.add(capability)
    state.waiting = null
    state.status = 'running'
    void this.advance(state)
  }

  reject(id, reason = '用户拒绝了这一步') {
    const state = this.tasks.get(id)
    if (!state || !state.waiting) throw new Error('没有找到待批准的动作')
    this.send(state, 'task.blocked', { reason })
    this.finish(state, 'blocked')
  }

  async advance(state) {
    try {
      while (state.index < state.plan.length) {
        const step = state.plan[state.index]
        const capability = capabilityForTool(step.tool)
        const allowed = this.permissionStore.has(capability) || state.approvedOnce.has(capability)
        if (!allowed) {
          state.waiting = { capability, step }
          state.status = 'waiting_approval'
          this.send(state, 'approval.required', {
            taskId: state.id,
            capability,
            capabilityLabel: CAPABILITY_LABELS[capability],
            tool: step.tool,
            label: step.label,
            preview: step.tool === 'run_command' ? step.command : step.tool === 'write_file' ? `${step.inputPath}\n${step.content}` : step.label,
          })
          return
        }
        this.send(state, 'tool.start', { id: step.id, tool: step.tool, label: TOOL_LABELS[step.tool], capability })
        const result = await executeTool(step, { workspaceRoot: this.workspaceRoot, inputPath: step.inputPath, command: step.command, content: step.content, overwrite: step.overwrite })
        state.results.push({ step: step.id, tool: step.tool, result: compact(result) })
        this.send(state, 'tool.result', { id: step.id, tool: step.tool, result: compact(result) })
        state.index += 1
      }
      await this.streamSummary(state)
      this.finish(state, 'done')
    } catch (error) {
      this.send(state, 'task.error', { message: error.message })
      this.finish(state, 'error')
    }
  }

  async streamSummary(state) {
    this.send(state, 'agent.start', { model: state.model, mode: 'execute' })
    const transcript = state.results.map(item => `${item.tool}: ${item.result}`).join('\n')
    const response = await fetch(`${this.gatewayUrl}/api/agent/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${state.authToken}` },
      body: JSON.stringify({
        model: modelForGateway(state.model),
        language: 'zh',
        visitorId: `desktop-${state.authToken.slice(-12)}`,
        conversationId: state.id,
        messages: [{ role: 'user', content: `任务目标：${state.task}\n\n已执行步骤：\n${transcript}\n\n请用简洁中文汇总完成情况、证据、未完成项和下一步。` }],
      }),
      signal: AbortSignal.timeout(90_000),
    })
    if (!response.ok || !response.body) throw new Error(`Agent 网关不可用（${response.status}）`)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let summary = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        try {
          const data = JSON.parse(line.slice(5).trim())
          if (data.text) { summary += data.text; this.send(state, 'agent.delta', { text: data.text }) }
          if (data.message) this.send(state, 'agent.warning', { message: data.message })
        } catch {
          // Ignore incomplete SSE frames from the remote gateway.
        }
      }
    }
    state.summary = summary || '本机工具步骤已完成，但没有收到模型汇总。'
  }

  finish(state, status) {
    if (state.closed) return
    state.status = status
    this.send(state, 'task.done', { id: state.id, status, summary: state.summary || '' })
    state.response.end()
    state.closed = true
    this.tasks.delete(state.id)
    this.history.push({ id: state.id, task: state.task, model: state.model, status, createdAt: state.createdAt, summary: state.summary || '' })
    this.history = this.history.slice(-30)
    void fs.mkdir(path.dirname(this.historyPath), { recursive: true }).then(() => fs.writeFile(this.historyPath, `${JSON.stringify(this.history, null, 2)}\n`, 'utf8')).catch(() => {})
  }
}

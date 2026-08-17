import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { MiMoBuddyRuntime } from '../agent-desktop/src/mimocode/runtime.mjs'

const gatewayUrl = String(process.env.ZT_AI_GATEWAY_URL || 'https://zt-ai-gateway.onrender.com').replace(/\/$/, '')
const username = String(process.env.ZT_AI_LIVE_USERNAME || '').trim()
const password = String(process.env.ZT_AI_LIVE_PASSWORD || '')
const requireTool = process.argv.includes('--require-tool')

if (!username || !password) throw new Error('请设置 ZT_AI_LIVE_USERNAME 和 ZT_AI_LIVE_PASSWORD 后再执行真实 MiMoCode QA。')

const login = await fetch(`${gatewayUrl}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username, password }),
})
if (!login.ok) throw new Error(`真实 MiMoCode QA 登录失败（${login.status}）`)
const { token } = await login.json()

const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-mimo-live-qa-'))
const events = []
let runtime
let pendingApproval = null
let approvalSent = false

try {
  runtime = new MiMoBuddyRuntime({
    workspaceRoot: process.cwd(),
    statePath: path.join(dataRoot, 'sessions.json'),
    dataDir: path.join(dataRoot, 'mimocode-data'),
    gatewayUrl,
  })
  const started = await runtime.startTask({
    task: requireTool
      ? '使用读取工具读取当前工作区的 package.json；禁止猜测、禁止修改，读完后仅回答其中的 name 字段。'
      : '只回复“连接成功”，不要调用任何工具。',
    model: 'MINIMAX',
    conversationId: `live-qa-${Date.now()}`,
    accountToken: token,
    onEvent: event => {
      events.push(event)
      if (event.type === 'approval.required' && event.capability === 'workspace_read') pendingApproval = event
    },
  })

  const startedAt = Date.now()
  while (Date.now() - startedAt < 120_000 && !events.some(event => event.type === 'session.completed' || event.type === 'session.failed')) {
    if (pendingApproval && !approvalSent) {
      approvalSent = true
      await runtime.approve({ taskId: pendingApproval.taskId, permissionId: pendingApproval.permissionId })
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }

  const terminal = events.find(event => event.type === 'session.completed' || event.type === 'session.failed')
  const outputLength = events.filter(event => event.type === 'result.delta').map(event => event.text || '').join('').length
  const report = {
    officialRuntime: true,
    terminal: terminal?.type || null,
    eventTypes: [...new Set(events.map(event => event.type))],
    approvalSent,
    toolEvents: events.filter(event => event.type.startsWith('tool.')).length,
    outputLength,
    taskCreated: Boolean(started.taskId),
  }
  console.log(JSON.stringify(report))
  if (report.terminal !== 'session.completed' || report.outputLength === 0 || (requireTool && (!report.approvalSent || report.toolEvents === 0))) process.exitCode = 2
} finally {
  await runtime?.dispose().catch(() => {})
  await fs.rm(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }).catch(() => {})
}

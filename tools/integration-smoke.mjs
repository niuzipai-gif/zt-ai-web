import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const gatewayPort = 8795
const agentPort = 8796
const base = port => `http://127.0.0.1:${port}`
const dataFile = path.join(os.tmpdir(), `zt-ai-smoke-${process.pid}.json`)
const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-ai-workspace-'))

function spawnService(cwd, script, env) {
  const isolated = { ...process.env }
  for (const name of ['MINIMAX_API_KEY', 'DEEPSEEK_API_KEY', 'MMX_API_KEY', 'MIMOCODE_QA_BIN']) delete isolated[name]
  return spawn(process.execPath, [script], { cwd, env: { ...isolated, ...env }, stdio: 'ignore', windowsHide: true })
}

async function stop(child) {
  if (!child || child.exitCode !== null) return
  child.kill()
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 2_000))])
}

async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return server.address().port
}

async function readRequestBody(request) {
  let raw = ''
  for await (const chunk of request) raw += chunk
  return raw ? JSON.parse(raw) : {}
}

async function createMiMoFixture() {
  const events = new Set()
  const record = { health: 0, sessionCreates: 0, prompts: 0, permissionReplies: [] }
  const emit = payload => {
    for (const response of events) response.write(`data: ${JSON.stringify(payload)}\n\n`)
  }
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    if (request.method === 'GET' && url.pathname === '/global/health') {
      record.health += 1
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ healthy: true, version: '0.1.12-fixture' }))
      return
    }
    if (request.method === 'GET' && url.pathname === '/event') {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      response.flushHeaders()
      events.add(response)
      response.on('close', () => events.delete(response))
      return
    }
    const body = await readRequestBody(request)
    if (request.method === 'POST' && url.pathname === '/session') {
      record.sessionCreates += 1
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ id: 'ses_integration' }))
      return
    }
    if (request.method === 'POST' && url.pathname === '/session/ses_integration/message') {
      record.prompts += 1
      const text = body.parts?.find(part => part.type === 'text')?.text || ''
      response.writeHead(204)
      response.end()
      setTimeout(() => {
        emit({ type: 'session.status', properties: { sessionID: 'ses_integration', status: { type: 'busy' } } })
        if (/(写入|修改|创建)/u.test(text)) {
          emit({ type: 'permission.asked', properties: { sessionID: 'ses_integration', id: 'per_write', permission: 'edit', patterns: ['notes.md'] } })
          return
        }
        emit({ type: 'message.part.updated', properties: { sessionID: 'ses_integration', part: { type: 'tool', id: 'tool_read', tool: 'read', state: { status: 'running', input: { file_path: 'README.md' }, time: { start: 1 } } } } })
        emit({ type: 'message.part.updated', properties: { sessionID: 'ses_integration', part: { type: 'tool', id: 'tool_read', tool: 'read', state: { status: 'completed', input: { file_path: 'README.md' }, output: 'README fixture', title: 'Read README', metadata: {}, time: { start: 1, end: 2 } } } } })
        emit({ type: 'message.part.delta', properties: { sessionID: 'ses_integration', delta: '已读取 README.md。' } })
        emit({ type: 'session.status', properties: { sessionID: 'ses_integration', status: { type: 'idle' } } })
      }, 15)
      return
    }
    if (request.method === 'POST' && url.pathname === '/permission/per_write/reply') {
      record.permissionReplies.push(body)
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('true')
      if (body.reply === 'reject') return
      setTimeout(() => {
        emit({ type: 'message.part.updated', properties: { sessionID: 'ses_integration', part: { type: 'tool', id: 'tool_write', tool: 'edit', state: { status: 'completed', input: { file_path: 'notes.md' }, output: 'notes.md 已更新', title: 'Edit note', metadata: {}, time: { start: 1, end: 2 } } } } })
        emit({ type: 'message.part.delta', properties: { sessionID: 'ses_integration', delta: '已在授权后更新 notes.md。' } })
        emit({ type: 'session.status', properties: { sessionID: 'ses_integration', status: { type: 'idle' } } })
      }, 15)
      return
    }
    response.writeHead(404)
    response.end()
  })
  const port = await listen(server)
  return {
    url: base(port),
    record,
    close: async () => {
      for (const response of events) response.end()
      await new Promise(resolve => server.close(resolve))
    },
  }
}

async function waitFor(url, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    try { const response = await fetch(url); if (response.ok) return response } catch {}
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`service did not start: ${url}`)
}

async function responseJson(url, options) {
  const response = await fetch(url, options)
  return { response, body: await response.json() }
}

async function collectSse(response, onFrame = async () => {}) {
  if (!response.ok || !response.body) throw new Error(`SSE request failed: ${response.status}`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const frames = []
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split(/\r?\n\r?\n/)
    buffer = chunks.pop() || ''
    for (const chunk of chunks) {
      const event = chunk.split(/\r?\n/).find(line => line.startsWith('event:'))?.slice(6).trim()
      const payload = chunk.split(/\r?\n/).find(line => line.startsWith('data:'))?.slice(5).trim()
      if (!event || !payload) continue
      const data = JSON.parse(payload)
      const frame = { event, data }
      frames.push(frame)
      await onFrame(frame)
    }
  }
  return frames
}

let gateway
let agent
let fixture
try {
  await fs.writeFile(path.join(workspace, 'README.md'), '# ZT.buddy integration fixture\n', 'utf8')
  fixture = await createMiMoFixture()
  gateway = spawnService(path.join(root, 'server'), 'src/index.js', { PORT: String(gatewayPort), ZT_AI_DATA_PATH: dataFile, ADMIN_PASSWORD: 'integration-admin', ZT_AI_TEST_MODE: '1' })
  await waitFor(`${base(gatewayPort)}/api/health`)
  const health = await responseJson(`${base(gatewayPort)}/api/health`)

  const register = await responseJson(`${base(gatewayPort)}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'integration', password: 'strong-pass-123' }) })
  const admin = await responseJson(`${base(gatewayPort)}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'shali', password: 'integration-admin' }) })
  const approved = await responseJson(`${base(gatewayPort)}/api/admin/users/${encodeURIComponent(register.body.user.id)}/approve`, { method: 'POST', headers: { authorization: `Bearer ${admin.body.token}` } })
  const login = await responseJson(`${base(gatewayPort)}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'integration', password: 'strong-pass-123' }) })

  const agentEnv = {
    ZT_AI_AGENT_PORT: String(agentPort),
    ZT_AI_AGENT_SECRET: 'local-secret',
    ZT_AI_AGENT_REQUIRE_AUTH: '1',
    ZT_AI_GATEWAY_URL: base(gatewayPort),
    ZT_AI_WORKSPACE: workspace,
    ZT_AI_AGENT_DATA: path.join(workspace, '.agent-data'),
    ZT_AI_MIMOCODE_URL: fixture.url,
    ZT_AI_TEST_MODE: '1',
  }
  const startAgent = async () => {
    agent = spawnService(path.join(root, 'agent-desktop'), 'src/server.mjs', agentEnv)
    await waitFor(`${base(agentPort)}/api/config`)
  }
  await startAgent()

  const secretHeaders = { 'content-type': 'application/json', 'x-zt-agent-secret': 'local-secret', authorization: `Bearer ${login.body.token}` }
  const noSecret = await responseJson(`${base(agentPort)}/api/state`)
  const state = await responseJson(`${base(agentPort)}/api/state`, { headers: { 'x-zt-agent-secret': 'local-secret' } })
  const invalidAccount = await responseJson(`${base(agentPort)}/api/tasks`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-zt-agent-secret': 'local-secret' }, body: JSON.stringify({ task: '查看 README.md', accountToken: 'invalid-token' }) })
  const normalChat = await fetch(`${base(agentPort)}/api/tasks`, { method: 'POST', headers: secretHeaders, body: JSON.stringify({ task: '你好', accountToken: login.body.token }) })
  const browserBridge = await fetch(`${base(gatewayPort)}/api/agent/openai/v1/responses`, {
    method: 'POST',
    headers: { origin: 'http://127.0.0.1:8796', authorization: `Bearer ${login.body.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'zt-minimax-m3', input: 'browser must be blocked' }),
  })

  const readResponse = await fetch(`${base(agentPort)}/api/tasks`, { method: 'POST', headers: { ...secretHeaders, 'x-zt-conversation-id': 'shared-conversation' }, body: JSON.stringify({ task: '读取 README.md', accountToken: login.body.token, model: 'MINIMAX' }) })
  const readEvents = await collectSse(readResponse)
  await new Promise(resolve => setTimeout(resolve, 80))

  await stop(agent)
  await startAgent()
  const authorize = await responseJson(`${base(agentPort)}/api/authorization`, { method: 'POST', headers: secretHeaders, body: JSON.stringify({ authorized: true }) })
  let writeHeldForApproval = false
  let approvalResumedTask = false
  const writeResponse = await fetch(`${base(agentPort)}/api/tasks`, { method: 'POST', headers: { ...secretHeaders, 'x-zt-conversation-id': 'shared-conversation' }, body: JSON.stringify({ task: '写入 notes.md', accountToken: login.body.token, model: 'DEEPSEEK' }) })
  const writeEvents = await collectSse(writeResponse, async frame => {
    if (frame.event !== 'approval.required' || approvalResumedTask) return
    writeHeldForApproval = fixture.record.permissionReplies.length === 0
    const approvedOnce = await responseJson(`${base(agentPort)}/api/tasks/${encodeURIComponent(frame.data.taskId)}/approve`, { method: 'POST', headers: secretHeaders, body: JSON.stringify({ capability: frame.data.capability, permissionId: frame.data.permissionId, remember: false }) })
    approvalResumedTask = approvedOnce.response.ok
  })

  const adminPage = await fetch(`${base(gatewayPort)}/admin/`).then(response => response.text())
  const secondRegistration = await responseJson(`${base(gatewayPort)}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'isolated-user', password: 'strong-pass-456' }) })
  await responseJson(`${base(gatewayPort)}/api/admin/users/${encodeURIComponent(secondRegistration.body.user.id)}/approve`, { method: 'POST', headers: { authorization: `Bearer ${admin.body.token}` } })
  const secondLogin = await responseJson(`${base(gatewayPort)}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'isolated-user', password: 'strong-pass-456' }) })
  const foreignState = await responseJson(`${base(agentPort)}/api/state`, { headers: { 'x-zt-agent-secret': 'local-secret', authorization: `Bearer ${secondLogin.body.token}` } })
  const renderer = await fs.readFile(path.join(root, 'agent-desktop', 'public', 'app.js'), 'utf8')
  const checks = {
    registered: register.response.status === 201 && approved.response.ok && login.response.ok,
    localSecretGate: noSecret.response.status === 401,
    agentState: state.response.status === 200 && state.body.mode === 'execute',
    invalidAccount: invalidAccount.response.status === 401,
    controlRoom: admin.response.ok && adminPage.includes('产品监控中枢'),
    normalChatAvoidedTools: normalChat.status === 409 && fixture.record.prompts === 2,
    mimoRuntimeStarted: fixture.record.health >= 2,
    readTaskCompleted: readEvents.some(frame => frame.event === 'tool.result') && readEvents.some(frame => frame.event === 'task.done' && frame.data.status === 'done'),
    writeTaskHeldForApproval: writeHeldForApproval,
    approvalResumedTask: approvalResumedTask && writeEvents.some(frame => frame.event === 'task.done' && frame.data.status === 'done'),
    sessionRestored: fixture.record.sessionCreates === 1,
    noProviderKeyInRenderer: !/MINIMAX_API_KEY|DEEPSEEK_API_KEY|sk-[A-Za-z0-9_-]{12,}/.test(renderer),
    browserModelBridgeBlocked: browserBridge.status === 403 && !renderer.includes('/api/agent/openai/v1'),
    accountScopedHistory: foreignState.response.ok && foreignState.body.history.length === 0 && foreignState.body.runtime.sessions.length === 0,
    providerKeysIsolated: health.body.providers?.minimax === false && health.body.providers?.deepseek === false,
  }
  console.log(JSON.stringify(checks))
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name)
  if (failures.length) throw new Error(`integration checks failed: ${failures.join(', ')}`)
} finally {
  await stop(agent)
  await stop(gateway)
  await fixture?.close()
  await fs.rm(dataFile, { force: true })
  await fs.rm(workspace, { recursive: true, force: true })
}

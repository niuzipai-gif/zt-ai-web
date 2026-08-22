import { spawn, spawnSync } from 'node:child_process'
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
  for (const name of ['MINIMAX_API_KEY', 'DEEPSEEK_API_KEY', 'MMX_API_KEY', 'ZT_AI_CODEX_BIN']) delete isolated[name]
  return spawn(process.execPath, [script], { cwd, env: { ...isolated, ...env }, stdio: 'ignore', windowsHide: true })
}

async function stop(child) {
  if (!child || child.exitCode !== null) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGTERM')
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

async function createAppServerFixture() {
  const events = new Set()
  const record = { health: 0, sessionCreates: 0, prompts: 0, promptTexts: [], searches: 0, permissionReplies: [] }
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
    if (request.method === 'POST' && url.pathname === '/search') {
      record.searches += 1
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ data: { web: [{ title: 'Fixture verified source', url: 'https://example.com/verified-source', description: `Verified result for ${body.query}`, markdown: '# Fixture verified source\n\nVerified result' }] } }))
      return
    }
    if (request.method === 'POST' && url.pathname === '/session') {
      record.sessionCreates += 1
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ id: 'ses_integration' }))
      return
    }
    if (request.method === 'POST' && url.pathname === '/session/ses_integration/message') {
      record.prompts += 1
      const text = body.parts?.find(part => part.type === 'text')?.text || ''
      record.promptTexts.push(text)
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

async function createGatewayFixture() {
  const record = { responses: 0, promptTexts: [], searches: 0, authUsers: new Map() }
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    if (request.method === 'POST' && url.pathname === '/search') {
      record.searches += 1
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ data: { web: [{ title: 'Fixture verified source', url: 'https://example.com/verified-source', description: `Verified result for search`, markdown: '# Fixture verified source\n\nVerified result' }] } }))
      return
    }
    if (request.method === 'GET' && url.pathname === '/api/auth/me') {
      const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
      const user = record.authUsers.get(token)
      if (!user) {
        response.writeHead(401, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'invalid token' }))
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ user }))
      return
    }
    if (request.method === 'GET' && url.pathname.endsWith('/models')) {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ object: 'list', data: [{ id: 'zt-minimax-m3' }, { id: 'zt-deepseek-v4-flash' }] }))
      return
    }
    if (request.method !== 'POST' || !url.pathname.endsWith('/responses')) { response.writeHead(404); response.end(); return }
    const body = await readRequestBody(request)
    record.responses += 1
    record.promptTexts.push(JSON.stringify(body.input || ''))
    const text = 'ZT.buddy 已通过 Codex app-server 完成任务。'
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    const events = [
      { type: 'response.created', data: { response: { id: `resp_${record.responses}`, status: 'in_progress', output: [] } } },
      { type: 'response.output_item.added', data: { output_index: 0, item: { id: `msg_${record.responses}`, type: 'message', role: 'assistant', status: 'in_progress', content: [] } } },
      { type: 'response.output_text.delta', data: { item_id: `msg_${record.responses}`, output_index: 0, content_index: 0, delta: text } },
      { type: 'response.output_item.done', data: { output_index: 0, item: { id: `msg_${record.responses}`, type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] } } },
      { type: 'response.completed', data: { response: { id: `resp_${record.responses}`, status: 'completed', output: [] } } },
    ]
    for (const event of events) response.write(`event: ${event.type}\ndata: ${JSON.stringify({ type: event.type, ...event.data })}\n\n`)
    response.end()
  })
  const port = await listen(server)
  return { url: base(port), record, close: async () => new Promise(resolve => server.close(resolve)) }
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
  const text = await response.text()
  let body
  try { body = JSON.parse(text) } catch { body = { raw: text } }
  return { response, body }
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
  fixture = await createGatewayFixture()
  gateway = spawnService(path.join(root, 'server'), 'src/index.js', { PORT: String(gatewayPort), ZT_AI_DATA_PATH: dataFile, ADMIN_PASSWORD: 'integration-admin', ZT_AI_TEST_MODE: '1' })
  await waitFor(`${base(gatewayPort)}/api/health`)
  const health = await responseJson(`${base(gatewayPort)}/api/health`)

  const register = await responseJson(`${base(gatewayPort)}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'integration', phone: '13800000011', email: 'integration@example.com', password: 'strong-pass-123' }) })
  const admin = await responseJson(`${base(gatewayPort)}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'shali', password: 'integration-admin' }) })
  const approved = await responseJson(`${base(gatewayPort)}/api/admin/users/${encodeURIComponent(register.body.user.id)}/approve`, { method: 'POST', headers: { authorization: `Bearer ${admin.body.token}` } })
  const login = await responseJson(`${base(gatewayPort)}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'integration', password: 'strong-pass-123' }) })
  fixture.record.authUsers.set(login.body.token, { id: register.body.user.id, username: 'integration' })

  const agentEnv = {
    ZT_AI_AGENT_PORT: String(agentPort),
    ZT_AI_AGENT_SECRET: 'local-secret',
    ZT_AI_AGENT_REQUIRE_AUTH: '1',
    ZT_AI_GATEWAY_URL: fixture.url,
    ZT_AI_WORKSPACE: workspace,
    ZT_AI_AGENT_DATA: path.join(workspace, '.agent-data'),
    ZT_AI_CODEX_BIN: path.join(root, 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe'),
    ZT_AI_FIRECRAWL_BASE_URL: fixture.url,
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
  const syncConversation = await responseJson(`${base(agentPort)}/api/conversations`, { method: 'POST', headers: secretHeaders, body: JSON.stringify({ conversations: [{ id: 'chat-persisted', title: '持久化会话', messages: [{ role: 'user', content: '保留这段记录' }, { role: 'assistant', content: '已保留' }], updatedAt: Date.now() }] }) })
  const restoredConversations = await responseJson(`${base(agentPort)}/api/state`, { headers: secretHeaders })
  const invalidAccount = await responseJson(`${base(agentPort)}/api/tasks`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-zt-agent-secret': 'local-secret' }, body: JSON.stringify({ task: '查看 README.md', accountToken: 'invalid-token' }) })
  const normalChat = await fetch(`${base(agentPort)}/api/tasks`, { method: 'POST', headers: secretHeaders, body: JSON.stringify({ task: '你好', accountToken: login.body.token }) })
  const normalChatEvents = await collectSse(normalChat)
  const browserBridge = await fetch(`${base(gatewayPort)}/api/agent/openai/v1/responses`, {
    method: 'POST',
    headers: { origin: 'http://127.0.0.1:8796', authorization: `Bearer ${login.body.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'zt-minimax-m3', input: 'browser must be blocked' }),
  })

  const readResponse = await fetch(`${base(agentPort)}/api/tasks`, { method: 'POST', headers: { ...secretHeaders, 'x-zt-conversation-id': 'shared-conversation' }, body: JSON.stringify({ task: '读取 README.md', accountToken: login.body.token, model: 'MINIMAX' }) })
  const readEvents = await collectSse(readResponse)
  const concurrentResponses = await Promise.all([
    fetch(`${base(agentPort)}/api/tasks`, { method: 'POST', headers: { ...secretHeaders, 'x-zt-conversation-id': 'concurrent-a' }, body: JSON.stringify({ task: '读取 README.md', accountToken: login.body.token, model: 'MINIMAX' }) }),
    fetch(`${base(agentPort)}/api/tasks`, { method: 'POST', headers: { ...secretHeaders, 'x-zt-conversation-id': 'concurrent-b' }, body: JSON.stringify({ task: '检查 README.md', accountToken: login.body.token, model: 'DEEPSEEK' }) }),
  ])
  const concurrentEvents = await Promise.all(concurrentResponses.map(response => collectSse(response)))
  await new Promise(resolve => setTimeout(resolve, 80))
  const researchResponse = await fetch(`${base(agentPort)}/api/tasks`, { method: 'POST', headers: { ...secretHeaders, 'x-zt-conversation-id': 'shared-conversation' }, body: JSON.stringify({ task: '最近车来很火你知道是什么吗', accountToken: login.body.token, model: 'MINIMAX' }) })
  const researchEvents = await collectSse(researchResponse)

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
  const secondRegistration = await responseJson(`${base(gatewayPort)}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'isolated-user', phone: '13800000012', email: 'isolated@example.com', password: 'strong-pass-456' }) })
  await responseJson(`${base(gatewayPort)}/api/admin/users/${encodeURIComponent(secondRegistration.body.user.id)}/approve`, { method: 'POST', headers: { authorization: `Bearer ${admin.body.token}` } })
  const secondLogin = await responseJson(`${base(gatewayPort)}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'isolated-user', password: 'strong-pass-456' }) })
  fixture.record.authUsers.set(secondLogin.body.token, { id: secondRegistration.body.user.id, username: 'isolated-user' })
  const foreignState = await responseJson(`${base(agentPort)}/api/state`, { headers: { 'x-zt-agent-secret': 'local-secret', authorization: `Bearer ${secondLogin.body.token}` } })
  const renderer = await fs.readFile(path.join(root, 'agent-desktop', 'public', 'app.js'), 'utf8')
  const checks = {
    registered: register.response.status === 201 && approved.response.ok && login.response.ok,
    localSecretGate: noSecret.response.status === 401,
    agentState: state.response.status === 200 && state.body.mode === 'execute',
    durableConversationSync: syncConversation.response.ok && restoredConversations.body.conversations.some(item => item.id === 'chat-persisted' && item.messages.length === 2),
    invalidAccount: invalidAccount.response.status === 401,
    controlRoom: admin.response.ok && adminPage.includes('产品监控中枢'),
    buddyAcceptsShortQuestion: normalChat.status === 200 && normalChatEvents.some(frame => frame.event === 'task.done' && frame.data.status === 'done'),
    codexRuntimeStarted: fixture.record.responses >= 1,
    readTaskCompleted: readEvents.some(frame => frame.event === 'task.done' && frame.data.status === 'done'),
    concurrentTasksComplete: concurrentEvents.every(events => events.some(frame => frame.event === 'task.done' && frame.data.status === 'done')) && new Set(concurrentEvents.map(events => events.find(frame => frame.event === 'task.start')?.data?.id).filter(Boolean)).size === 2,
    writeTaskCompleted: writeEvents.some(frame => frame.event === 'task.done' && frame.data.status === 'done'),
    sessionRestored: writeEvents.some(frame => frame.event === 'task.done' && frame.data.status === 'done'),
    noProviderKeyInRenderer: !/MINIMAX_API_KEY|DEEPSEEK_API_KEY|sk-[A-Za-z0-9_-]{12,}/.test(renderer),
    browserModelBridgeBlocked: browserBridge.status === 403 && !renderer.includes('/api/agent/openai/v1'),
    accountScopedHistory: foreignState.response.ok && foreignState.body.history.length === 0 && foreignState.body.runtime.sessions.length === 0,
    providerKeysIsolated: health.body.providers?.minimax === false && health.body.providers?.deepseek === false,
    autoWebVerification: fixture.record.searches === 1 && researchEvents.some(frame => frame.event === 'tool.result' && /可核验来源/.test(frame.data.result)) && fixture.record.promptTexts.some(text => text.includes('[前置联网核验：已完成]') && text.includes('https://example.com/verified-source')),
  }
  console.log(JSON.stringify(checks))
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name)
  if (failures.length) throw new Error(`integration checks failed: ${failures.join(', ')}`)
} finally {
  await stop(agent)
  await stop(gateway)
  await fixture?.close()
  await fs.rm(dataFile, { force: true })
  await fs.rm(workspace, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
}

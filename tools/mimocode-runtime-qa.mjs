import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const lockPath = path.join(root, 'agent-desktop', 'mimocode.lock.json')
const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'))

assert.equal(lock.name, '@mimo-ai/cli')
assert.equal(lock.version, '0.1.12')
assert.equal(lock.repository, 'https://github.com/XiaomiMiMo/MiMo-Code')
assert.match(lock.commit, /^[0-9a-f]{40}$/)
assert.equal(lock.license, 'MIT')

const FIXTURE_TOKEN = 'zt-mimo-runtime-qa'

function basicAuth(password) {
  return `Basic ${Buffer.from(`mimocode:${password}`).toString('base64')}`
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return address.port
}

async function close(server) {
  if (!server.listening) return
  await new Promise(resolve => server.close(resolve))
}

function jsonResponse(response, status, body, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers })
  response.end(JSON.stringify(body))
}

function responseStream(response, events) {
  response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' })
  for (const event of events) response.write(`event: ${event.type}\ndata: ${JSON.stringify({ type: event.type, ...event.data })}\n\n`)
  response.end()
}

function createFixture(workspace) {
  const requests = []
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    const requestRecord = { method: request.method, path: url.pathname, authorized: request.headers.authorization === `Bearer ${FIXTURE_TOKEN}` }
    requests.push(requestRecord)
    if (request.headers.authorization !== `Bearer ${FIXTURE_TOKEN}`) {
      jsonResponse(response, 401, { error: { message: 'fixture authorization required' } })
      return
    }
    if (request.method === 'GET' && url.pathname === '/v1/models') {
      jsonResponse(response, 200, { object: 'list', data: [{ id: 'zt-buddy-test', object: 'model' }] })
      return
    }
    if (request.method !== 'POST' || url.pathname !== '/v1/responses') {
      jsonResponse(response, 404, { error: { message: 'fixture route not found' } })
      return
    }
    let raw = ''
    for await (const chunk of request) raw += chunk
    const body = JSON.parse(raw || '{}')
    requestRecord.body = body
    const hasToolResult = JSON.stringify(body.input || '').includes('function_call_output')
    if (!hasToolResult) {
      responseStream(response, [
        {
          type: 'response.created',
          data: { response: { id: 'resp_qa_1', object: 'response', status: 'in_progress', output: [] } },
        },
        {
          type: 'response.output_item.added',
          data: { output_index: 0, item: { id: 'fc_qa_1', type: 'function_call', status: 'in_progress', call_id: 'call_read_1', name: 'read', arguments: '' } },
        },
        {
          type: 'response.function_call_arguments.delta',
          data: { item_id: 'fc_qa_1', output_index: 0, delta: JSON.stringify({ file_path: path.join(workspace, 'README.md') }) },
        },
        {
          type: 'response.function_call_arguments.done',
          data: { item_id: 'fc_qa_1', output_index: 0, arguments: JSON.stringify({ file_path: path.join(workspace, 'README.md') }) },
        },
        {
          type: 'response.output_item.done',
          data: { output_index: 0, item: { id: 'fc_qa_1', type: 'function_call', status: 'completed', call_id: 'call_read_1', name: 'read', arguments: JSON.stringify({ file_path: path.join(workspace, 'README.md') }) } },
        },
        {
          type: 'response.completed',
          data: { response: { id: 'resp_qa_1', object: 'response', status: 'completed', output: [{ id: 'fc_qa_1', type: 'function_call', status: 'completed', call_id: 'call_read_1', name: 'read', arguments: JSON.stringify({ file_path: path.join(workspace, 'README.md') }) }] } },
        },
      ])
      return
    }
    responseStream(response, [
      {
        type: 'response.created',
        data: { response: { id: 'resp_qa_2', object: 'response', status: 'in_progress', output: [] } },
      },
      {
        type: 'response.output_item.added',
        data: { output_index: 0, item: { id: 'msg_qa_2', type: 'message', status: 'in_progress', role: 'assistant', content: [] } },
      },
      {
        type: 'response.output_text.delta',
        data: { item_id: 'msg_qa_2', output_index: 0, content_index: 0, delta: 'QA 完成：已通过 MiMoCode 的 read 工具读取 README.md。' },
      },
      {
        type: 'response.output_text.done',
        data: { item_id: 'msg_qa_2', output_index: 0, content_index: 0, text: 'QA 完成：已通过 MiMoCode 的 read 工具读取 README.md。' },
      },
      {
        type: 'response.output_item.done',
        data: { output_index: 0, item: { id: 'msg_qa_2', type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: 'QA 完成：已通过 MiMoCode 的 read 工具读取 README.md。' }] } },
      },
      {
        type: 'response.completed',
        data: { response: { id: 'resp_qa_2', object: 'response', status: 'completed', output: [{ id: 'msg_qa_2', type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: 'QA 完成：已通过 MiMoCode 的 read 工具读取 README.md。' }] }] } },
      },
    ])
  })
  return { server, requests }
}

async function waitForHealth(baseUrl, headers) {
  let lastError = 'server did not start'
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/global/health`, { headers, signal: AbortSignal.timeout(1_500) })
      if (response.ok) {
        const body = await response.json()
        assert.equal(body.healthy, true)
        return body
      }
      lastError = `health returned ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`MiMo runtime did not become healthy: ${lastError}`)
}

function resolveRuntimeBinary() {
  if (process.env.MIMOCODE_QA_BIN) return path.resolve(process.env.MIMOCODE_QA_BIN)
  const directory = process.arch === 'arm64' ? 'mimocode-windows-arm64' : 'mimocode-windows-x64'
  const candidate = path.join(root, '.runtime-qa', 'mimo-cli', 'node_modules', '@mimo-ai', directory, 'bin', process.platform === 'win32' ? 'mimo.exe' : 'mimo')
  return candidate
}

function startRuntime(binary, args, options) {
  const child = spawn(binary, args, { ...options, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', chunk => { output += String(chunk) })
  child.stderr.on('data', chunk => { output += String(chunk) })
  return { child, getOutput: () => output }
}

async function stopRuntime(child) {
  if (child.exitCode !== null) return
  child.kill()
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 4_000)),
  ])
}

async function collectEvents(response, events, signal) {
  assert.ok(response.body)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() || ''
      for (const frame of frames) {
        const line = frame.split(/\r?\n/).find(item => item.startsWith('data:'))
        if (!line) continue
        try { events.push(JSON.parse(line.slice(5).trim())) } catch { /* heartbeat or incomplete frame */ }
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }
}

const runtimeBinary = resolveRuntimeBinary()
await fs.access(runtimeBinary)

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-mimocode-runtime-qa-'))
const workspace = path.join(tempRoot, 'workspace')
const runtimeHome = path.join(tempRoot, 'mimocode-home')
const password = 'zt-mimo-qa-password'
let fixture
let runtime
let eventAbort
let observedEvents = []
let observedProviders

try {
  await fs.mkdir(workspace, { recursive: true })
  await fs.writeFile(path.join(workspace, 'README.md'), '# ZT.buddy runtime QA\n')
  fixture = createFixture(workspace)
  const fixturePort = await listen(fixture.server)
  const configPath = path.join(tempRoot, 'mimocode.json')
  await fs.writeFile(configPath, JSON.stringify({
    $schema: 'https://mimo.xiaomi.com/mimocode/config.json',
    model: 'openai/zt-buddy-test',
    provider: {
      openai: {
        options: { baseURL: `http://127.0.0.1:${fixturePort}/v1`, apiKey: FIXTURE_TOKEN },
        only_configured_models: true,
        models: {
          'zt-buddy-test': {
            name: 'ZT.buddy Runtime QA',
            tool_call: true,
            limit: { context: 1_000_000, output: 8_192 },
          },
        },
      },
    },
    permission: { read: 'allow', edit: 'ask', bash: 'ask', webfetch: 'ask' },
  }, null, 2))
  const portHolder = http.createServer()
  const runtimePort = await listen(portHolder)
  await close(portHolder)
  runtime = startRuntime(runtimeBinary, ['serve', '--hostname', '127.0.0.1', '--port', String(runtimePort), '--pure'], {
    cwd: workspace,
    env: {
      ...process.env,
      MIMOCODE_HOME: runtimeHome,
      MIMOCODE_CONFIG: configPath,
      MIMOCODE_DISABLE_PROJECT_CONFIG: 'true',
      MIMOCODE_SERVER_PASSWORD: password,
    },
  })
  const baseUrl = `http://127.0.0.1:${runtimePort}`
  const headers = { authorization: basicAuth(password), 'content-type': 'application/json' }
  const health = await waitForHealth(baseUrl, headers)
  assert.equal(health.version, lock.version)
  const providerResponse = await fetch(`${baseUrl}/provider`, { headers })
  assert.equal(providerResponse.status, 200)
  observedProviders = await providerResponse.json()
  assert.ok(observedProviders.all.some(provider => provider.id === 'openai'))
  assert.ok(observedProviders.all.find(provider => provider.id === 'openai')?.models?.['zt-buddy-test'])

  eventAbort = new AbortController()
  const eventResponse = await fetch(`${baseUrl}/global/event`, { headers, signal: eventAbort.signal })
  assert.equal(eventResponse.status, 200)
  const events = observedEvents
  const eventTask = collectEvents(eventResponse, events, eventAbort.signal)
  void eventTask.catch(() => {})
  const sessionResponse = await fetch(`${baseUrl}/session`, { method: 'POST', headers, body: JSON.stringify({ title: 'ZT.buddy runtime QA' }) })
  assert.equal(sessionResponse.status, 200)
  const session = await sessionResponse.json()
  assert.match(session.id, /^ses_/)
  const promptResponse = await fetch(`${baseUrl}/session/${encodeURIComponent(session.id)}/message`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: { providerID: 'openai', modelID: 'zt-buddy-test' },
      parts: [{ type: 'text', text: '请使用 read 工具读取当前工作区的 README.md，然后简短报告。' }],
    }),
    signal: AbortSignal.timeout(20_000),
  })
  assert.equal(promptResponse.status, 200)
  const prompt = await promptResponse.json()
  assert.equal(prompt.info.role, 'assistant')
  assert.ok(fixture.requests.filter(request => request.path === '/v1/responses').length >= 2, 'fixture should observe a tool round trip')
  await new Promise(resolve => setTimeout(resolve, 300))
  eventAbort.abort()
  await Promise.race([
    eventTask.catch(() => {}),
    new Promise(resolve => setTimeout(resolve, 1_000)),
  ])
  assert.ok(events.some(event => event.payload?.type === 'session.created'))
  assert.ok(events.some(event => event.payload?.type === 'message.part.updated' || event.payload?.type === 'message.part.delta'))
  process.stdout.write(`${JSON.stringify({ officialRuntime: true, session: true, events: true, fixtureOnly: true })}\n`)
} catch (error) {
  const output = runtime?.getOutput?.() || ''
  const requestSummary = fixture?.requests?.map(request => ({
    method: request.method,
    path: request.path,
    authorized: request.authorized,
    model: request.body?.model,
    messageRoles: Array.isArray(request.body?.messages) ? request.body.messages.map(message => message.role) : [],
  })) || []
  const eventSummary = observedEvents.slice(-30).map(event => {
    const properties = event.payload?.properties || {}
    return {
      type: event.payload?.type || event.type || 'unknown',
      status: properties.status?.type || properties.status,
      error: properties.error?.message || properties.info?.error?.message || properties.part?.state?.error?.message,
      model: properties.info?.model,
    }
  })
  const providerSummary = observedProviders?.all?.find(provider => provider.id === 'openai')
  throw new Error(`${error instanceof Error ? error.message : String(error)}\nMiMo provider: ${JSON.stringify(providerSummary)}\nMiMo fixture requests: ${JSON.stringify(requestSummary)}\nMiMo events: ${JSON.stringify(eventSummary)}\nMiMo runtime output:\n${output.slice(-8_000)}`)
} finally {
  eventAbort?.abort()
  await stopRuntime(runtime?.child)
  if (fixture) await close(fixture.server)
  await fs.rm(tempRoot, { recursive: true, force: true })
}

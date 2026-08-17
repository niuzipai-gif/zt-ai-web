import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { MiMoBuddyRuntime } from './runtime.mjs'

function waitFor(check, { timeout = 2_000, interval = 10 } = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const timer = setInterval(() => {
      if (check()) { clearInterval(timer); resolve() }
      else if (Date.now() - started > timeout) { clearInterval(timer); reject(new Error('timed out waiting for runtime event')) }
    }, interval)
  })
}

async function createFixture() {
  const record = []
  const permissionReplies = []
  const eventClients = new Set()
  let sessions = 0

  const sendEvent = event => {
    for (const response of eventClients) response.write(`data: ${JSON.stringify(event)}\n\n`)
  }
  const server = http.createServer(async (request, response) => {
    const body = await new Promise(resolve => {
      let raw = ''
      request.on('data', chunk => { raw += chunk })
      request.on('end', () => resolve(raw ? JSON.parse(raw) : {}))
    })
    if (request.method === 'GET' && request.url === '/global/health') {
      record.push('server ready')
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ healthy: true, version: '0.1.12' }))
      return
    }
    if (request.method === 'POST' && request.url === '/session') {
      sessions += 1
      record.push('session create')
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ id: 'ses_1' }))
      return
    }
    if (request.method === 'GET' && request.url === '/event') {
      record.push('sse subscribe')
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      response.flushHeaders()
      eventClients.add(response)
      request.on('close', () => eventClients.delete(response))
      return
    }
    if (request.method === 'POST' && request.url === '/session/ses_1/message') {
      record.push('prompt')
      assert.equal(body.model.providerID, 'openai')
      setTimeout(() => {
        sendEvent({ type: 'session.status', properties: { sessionID: 'ses_1', status: { type: 'busy' } } })
        if (record.filter(item => item === 'prompt').length === 1) {
          sendEvent({ type: 'permission.asked', properties: { sessionID: 'ses_1', id: 'per_1', permission: 'edit', patterns: ['src/app.js'] } })
        } else {
          sendEvent({ type: 'message.part.delta', properties: { sessionID: 'ses_1', delta: '第二次会话复用成功。' } })
          sendEvent({ type: 'session.status', properties: { sessionID: 'ses_1', status: { type: 'idle' } } })
        }
      }, 5)
      response.writeHead(204)
      response.end()
      return
    }
    if (request.method === 'POST' && request.url === '/permission/per_1/reply') {
      record.push('permission reply')
      permissionReplies.push(body)
      sendEvent({
        type: 'message.part.updated',
        properties: {
          sessionID: 'ses_1',
          part: { type: 'tool', id: 'part_1', tool: 'edit', state: { status: 'running', input: { file_path: 'src/app.js' }, time: { start: 1 } } },
        },
      })
      sendEvent({ type: 'message.part.delta', properties: { sessionID: 'ses_1', delta: '文件已更新。' } })
      sendEvent({ type: 'session.status', properties: { sessionID: 'ses_1', status: { type: 'idle' } } })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('true')
      return
    }
    response.writeHead(404)
    response.end()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return {
    url: `http://127.0.0.1:${address.port}`,
    record,
    permissionReplies,
    get sessionCreates() { return sessions },
    close: async () => {
      for (const client of eventClients) client.end()
      await new Promise(resolve => server.close(resolve))
    },
  }
}

test('bridges MiMo lifecycle, holds permission until approval, and persists the session', async () => {
  const fixture = await createFixture()
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-mimo-runtime-test-'))
  const events = []
  try {
    const runtime = new MiMoBuddyRuntime({
      workspaceRoot: root,
      statePath: path.join(root, 'sessions.json'),
      spawnRuntime: async () => ({ url: fixture.url, stop: async () => {} }),
    })
    const started = await runtime.startTask({
      task: '修改 src/app.js',
      model: 'MINIMAX',
      conversationId: 'conversation-1',
      onEvent: event => events.push(event),
    })
    await waitFor(() => events.some(event => event.type === 'approval.required'))

    assert.equal(events[0].type, 'session.started')
    assert.ok(events.some(event => event.type === 'approval.required' && event.capability === 'workspace_write'))
    assert.equal(fixture.permissionReplies.length, 0, 'write permission must not be auto-approved')
    assert.deepEqual(fixture.record.slice(0, 4), ['server ready', 'session create', 'sse subscribe', 'prompt'])

    assert.equal(await runtime.approve({ taskId: started.taskId, permissionId: 'per_1', remember: false }), true)
    await waitFor(() => events.at(-1)?.type === 'session.completed')
    assert.equal(fixture.permissionReplies[0].reply, 'once')

    const secondEvents = []
    await runtime.startTask({
      task: '继续检查同一项目',
      model: 'MINIMAX',
      conversationId: 'conversation-1',
      onEvent: event => secondEvents.push(event),
    })
    await waitFor(() => secondEvents.at(-1)?.type === 'session.completed')
    assert.equal(fixture.sessionCreates, 1, 'same conversation must reuse its MiMo session')
    await runtime.dispose()
  } finally {
    await fixture.close()
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('reject forwards a closed permission response and ends no task optimistically', async () => {
  const fixture = await createFixture()
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-mimo-runtime-test-'))
  const events = []
  try {
    const runtime = new MiMoBuddyRuntime({
      workspaceRoot: root,
      statePath: path.join(root, 'sessions.json'),
      spawnRuntime: async () => ({ url: fixture.url, stop: async () => {} }),
    })
    const started = await runtime.startTask({ task: '修改 src/app.js', model: 'DEEPSEEK', conversationId: 'conversation-reject', onEvent: event => events.push(event) })
    await waitFor(() => events.some(event => event.type === 'approval.required'))
    assert.equal(await runtime.reject({ taskId: started.taskId, permissionId: 'per_1' }), true)
    assert.equal(fixture.permissionReplies[0].reply, 'reject')
    assert.equal(events.at(-1)?.type, 'approval.required', 'only MiMo decides whether the rejected task is terminal')
    await runtime.dispose()
  } finally {
    await fixture.close()
    await fs.rm(root, { recursive: true, force: true })
  }
})

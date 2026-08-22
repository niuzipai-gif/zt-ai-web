import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CodexBuddyRuntime, resolveCodexBinary } from '../agent-desktop/src/runtime/codex-app-server.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const binary = resolveCodexBinary({ root: path.join(root, 'agent-desktop'), platform: process.platform })[0]
const token = 'zt-codex-runtime-qa'
const requests = []

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  })
}

function sse(response, frames) {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  for (const frame of frames) response.write(`event: ${frame.type}\ndata: ${JSON.stringify({ type: frame.type, ...frame.data })}\n\n`)
  response.end()
}

const gateway = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1')
  let raw = ''
  for await (const chunk of request) raw += chunk
  requests.push({ method: request.method, path: url.pathname, authorization: request.headers.authorization || '', body: raw })
  if (url.pathname.endsWith('/models')) {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ object: 'list', data: [{ id: 'zt-minimax-m3' }] }))
    return
  }
  assert.equal(url.pathname, '/api/agent/openai/v1/responses')
  sse(response, [
    { type: 'response.created', data: { response: { id: 'resp_qa', status: 'in_progress', output: [] } } },
    { type: 'response.output_item.added', data: { output_index: 0, item: { id: 'msg_qa', type: 'message', role: 'assistant', status: 'in_progress', content: [] } } },
    { type: 'response.output_text.delta', data: { item_id: 'msg_qa', output_index: 0, content_index: 0, delta: 'QA：Codex app-server 已通过 ZT.AI Gateway 返回。' } },
    { type: 'response.output_item.done', data: { output_index: 0, item: { id: 'msg_qa', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'QA：Codex app-server 已通过 ZT.AI Gateway 返回。' }] } } },
    { type: 'response.completed', data: { response: { id: 'resp_qa', status: 'completed', output: [] } } },
  ])
})

const port = await listen(gateway)
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-codex-runtime-qa-'))
const workspace = path.join(temp, 'workspace')
const events = []
await fs.mkdir(workspace, { recursive: true })
const runtime = new CodexBuddyRuntime({
  workspaceRoot: workspace,
  statePath: path.join(temp, 'sessions.json'),
  dataDir: path.join(temp, 'codex'),
  gatewayUrl: `http://127.0.0.1:${port}`,
  binary,
})

try {
  await runtime.startTask({ task: '用一句话回复 QA。', conversationId: 'qa', accountToken: token, onEvent: event => events.push(event) })
  for (let i = 0; i < 120 && !events.some(event => event.type === 'session.completed'); i += 1) await new Promise(resolve => setTimeout(resolve, 100))
  assert.ok(events.some(event => event.type === 'result.delta'))
  assert.ok(events.some(event => event.type === 'session.completed'))
  assert.equal(requests.at(-1)?.authorization, `Bearer ${token}`)
  console.log(JSON.stringify({ ok: true, events: events.map(event => event.type), authorized: true }))
} finally {
  await runtime.dispose()
  await new Promise(resolve => gateway.close(resolve))
}

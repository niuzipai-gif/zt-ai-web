import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EventEmitter } from 'node:events'
import { CodexAppServerConnection, CodexBuddyRuntime, CODEX_APP_SERVER_VERSION, resolveCodexBinary, verifyCodexBinary } from './codex-app-server.mjs'

function fakeChild() {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdin = { destroyed: false, write() {} }
  child.killed = false
  child.kill = () => { child.killed = true }
  child.stdout.setEncoding = () => {}
  child.stderr.setEncoding = () => {}
  return child
}

test('Codex app-server connection speaks JSONL initialize and maps server notifications', async () => {
  const child = fakeChild()
  const sent = []
  child.stdin.write = payload => {
    const message = JSON.parse(payload)
    sent.push(message)
    if (message.id) setImmediate(() => child.stdout.emit('data', `${JSON.stringify({ id: message.id, result: { thread: { id: 'thread-1' } } })}\n`))
  }
  const notifications = []
  const connection = new CodexAppServerConnection({ binary: 'codex.exe', cwd: '.', codexHome: '.', spawnImpl: () => child, onNotification: async (method, params) => notifications.push({ method, params }) })
  await connection.initialize()
  child.stdout.emit('data', `${JSON.stringify({ method: 'thread/tokenUsage/updated', params: { threadId: 'thread-1', tokenUsage: { total: 12 } } })}\n`)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(sent[0].method, 'initialize')
  assert.equal(sent[1].method, 'initialized')
  assert.equal(notifications[0].method, 'thread/tokenUsage/updated')
  connection.close()
})

test('Codex runtime maps file approvals to the local permission response vocabulary', async () => {
  const runtime = Object.create(CodexBuddyRuntime.prototype)
  const replies = []
  runtime.runtime = { connection: { send: message => replies.push(message) } }
  const state = { pending: new Map([['42', { rpcId: 42, method: 'item/fileChange/requestApproval', requested: {} }]]) }
  runtime.tasks = new Map([['task-1', state]])
  await runtime.respond({ taskId: 'task-1', permissionId: '42', decision: 'acceptForSession' })
  assert.deepEqual(replies, [{ id: 42, result: { decision: 'acceptForSession' } }])
  assert.equal(state.pending.size, 0)
})

test('Codex runtime maps expanded permission approvals to a scoped grant', async () => {
  const runtime = Object.create(CodexBuddyRuntime.prototype)
  const replies = []
  runtime.runtime = { connection: { send: message => replies.push(message) } }
  const requested = { network: { enabled: true } }
  const state = { pending: new Map([['7', { rpcId: 7, method: 'item/permissions/requestApproval', requested }]]) }
  runtime.tasks = new Map([['task-2', state]])
  await runtime.respond({ taskId: 'task-2', permissionId: '7', decision: 'acceptForSession' })
  assert.deepEqual(replies, [{ id: 7, result: { permissions: requested, scope: 'session' } }])
})

test('Codex runtime pins the packaged version and Windows binary path', () => {
  assert.equal(CODEX_APP_SERVER_VERSION, '0.148.0')
  const paths = resolveCodexBinary({ root: 'C:\\ZT.AI\\app\\agent-desktop', platform: 'win32', env: {} })
  assert.match(paths[0], /node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\bin\\codex\.exe$/)
  assert.equal(verifyCodexBinary('codex.exe', CODEX_APP_SERVER_VERSION, () => ({ status: 0, stdout: 'codex-cli 0.148.0', stderr: '' })), true)
})

test('Codex runtime serializes concurrent startup so a second chat cannot close the first connection', async () => {
  const source = await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), 'codex-app-server.mjs'), 'utf8')
  assert.match(source, /runtimeInitPromise/)
})

test('Codex runtime keeps retryable errors alive and exposes the final nested failure', async () => {
  const runtime = Object.create(CodexBuddyRuntime.prototype)
  const events = []
  const state = { taskId: 'task-3', threadId: 'thread-3', output: '', closed: false, onEvent: event => events.push(event), pending: new Map() }
  runtime.tasks = new Map([['task-3', state]])
  runtime.sessions = new Map()

  await runtime.routeNotification('error', {
    threadId: 'thread-3',
    willRetry: true,
    error: { message: 'Reconnecting... 1/5', additionalDetails: '网关流在响应完成前断开' },
  })
  assert.equal(events.at(-1).type, 'tool.progress')
  assert.match(events.at(-1).message, /网关流在响应完成前断开/)
  assert.equal(state.closed, false)

  await runtime.routeNotification('error', {
    threadId: 'thread-3',
    willRetry: false,
    error: { message: '网关流在响应完成前断开', additionalDetails: null },
  })
  assert.equal(events.at(-1).type, 'session.failed')
  assert.equal(events.at(-1).message, '网关流在响应完成前断开')
})

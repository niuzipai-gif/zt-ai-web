import test from 'node:test'
import assert from 'node:assert/strict'
import { capabilityForMiMoPermission, normalizeMiMoEvent } from './event-map.mjs'

test('maps an upstream session creation into a stable Buddy lifecycle event', () => {
  assert.deepEqual(normalizeMiMoEvent({
    type: 'session.created',
    properties: { sessionID: 'ses_1' },
  }), {
    type: 'session.started',
    sessionId: 'ses_1',
  })
})

test('unwraps MiMo global SSE events before normalizing them', () => {
  assert.deepEqual(normalizeMiMoEvent({
    directory: 'C:\\workspace',
    payload: {
      type: 'message.part.delta',
      properties: { sessionID: 'ses_1', delta: '你好' },
    },
  }), {
    type: 'result.delta',
    sessionId: 'ses_1',
    text: '你好',
  })
})

test('maps a MiMo permission request without leaking raw provider metadata', () => {
  assert.deepEqual(normalizeMiMoEvent({
    type: 'permission.asked',
    properties: {
      sessionID: 'ses_1',
      id: 'per_1',
      permission: 'bash',
      patterns: ['npm test'],
      metadata: { unsafe: 'do not render' },
    },
  }), {
    type: 'approval.required',
    sessionId: 'ses_1',
    permissionId: 'per_1',
    capability: 'command_exec',
    label: '运行命令',
    details: ['npm test'],
  })
})

test('maps tool lifecycle updates and keeps missing tool output safe', () => {
  const running = normalizeMiMoEvent({
    type: 'message.part.updated',
    properties: {
      sessionID: 'ses_1',
      part: {
        type: 'tool',
        id: 'part_1',
        tool: 'read',
        state: { status: 'running', input: { file_path: 'README.md' }, time: { start: 1 } },
      },
    },
  })
  assert.deepEqual(running, {
    type: 'tool.started',
    sessionId: 'ses_1',
    toolId: 'part_1',
    label: '读取文件',
    details: ['README.md'],
  })

  const completed = normalizeMiMoEvent({
    type: 'message.part.updated',
    properties: {
      sessionID: 'ses_1',
      part: {
        type: 'tool',
        id: 'part_1',
        tool: 'read',
        state: { status: 'completed', input: {}, output: '', title: 'Read file', metadata: {}, time: { start: 1, end: 2 } },
      },
    },
  })
  assert.deepEqual(completed, {
    type: 'tool.completed',
    sessionId: 'ses_1',
    toolId: 'part_1',
    label: '读取文件',
    result: '',
  })
})

test('maps terminal and failure states while dropping heartbeat and unknown events', () => {
  assert.deepEqual(normalizeMiMoEvent({
    type: 'session.status',
    properties: { sessionID: 'ses_1', status: { type: 'idle' } },
  }), {
    type: 'session.completed',
    sessionId: 'ses_1',
  })
  assert.deepEqual(normalizeMiMoEvent({
    type: 'session.error',
    properties: { sessionID: 'ses_1', error: { data: { message: 'provider secret body' } } },
  }), {
    type: 'session.failed',
    sessionId: 'ses_1',
    message: '执行暂时未完成，请检查权限或稍后重试。',
  })
  assert.equal(normalizeMiMoEvent({ type: 'server.heartbeat', properties: {} }), null)
  assert.equal(normalizeMiMoEvent({ type: 'something.unknown', properties: {} }), null)
})

test('permission capabilities use the local safety vocabulary', () => {
  assert.equal(capabilityForMiMoPermission('read'), 'workspace_read')
  assert.equal(capabilityForMiMoPermission('edit'), 'workspace_write')
  assert.equal(capabilityForMiMoPermission('bash'), 'command_exec')
  assert.equal(capabilityForMiMoPermission('webfetch'), 'web_access')
  assert.equal(capabilityForMiMoPermission('unknown'), 'sensitive_action')
})

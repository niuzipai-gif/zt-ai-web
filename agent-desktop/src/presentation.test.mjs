import test from 'node:test'
import assert from 'node:assert/strict'
import { conversationFailurePresentation, executionDrawerPresentation, executionPresentation } from './presentation.mjs'

test('ordinary chat does not promise local execution', () => {
  assert.deepEqual(executionPresentation({ route: 'chat', kind: 'chat' }), {
    title: '普通聊天',
    summary: '我会直接回答，不会读取文件或调用本机工具。',
    approval: false,
  })
})

test('write and command tasks name the capability needing confirmation', () => {
  assert.match(executionPresentation({ route: 'agent', kind: 'write', requiresApproval: true }).summary, /写入/)
  assert.match(executionPresentation({ route: 'agent', kind: 'command', requiresApproval: true }).summary, /命令/)
})

test('provider failures stay actionable and do not expose raw upstream details', () => {
  const copy = conversationFailurePresentation('上游模型请求失败（401）：secret diagnostics')
  assert.match(copy, /稍后重试/)
  assert.doesNotMatch(copy, /401|secret|上游模型/)
})

test('terminal Buddy executions collapse into a concise audit drawer label', () => {
  assert.deepEqual(executionDrawerPresentation({ status: 'done', elapsedMs: 1240, stepCount: 3 }), {
    open: false,
    label: '执行详情 · 已完成 · 1.2 秒 · 3 步',
  })
  assert.equal(executionDrawerPresentation({ status: 'running', elapsedMs: 0, stepCount: 1 }).open, true)
  assert.match(executionDrawerPresentation({ status: 'blocked', elapsedMs: 60_000, stepCount: 2 }).label, /等待确认/)
})

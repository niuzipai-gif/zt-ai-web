import test from 'node:test'
import assert from 'node:assert/strict'
import { conversationFailurePresentation, executionDrawerPresentation, executionPresentation, sanitizeAssistantPresentation } from './presentation.mjs'

test('direct answers do not promise local execution', () => {
  assert.deepEqual(executionPresentation({ route: 'chat', kind: 'chat' }), {
    title: '直接回答',
    summary: '这个问题不需要读取文件或调用本机工具，我会在当前 ZT.buddy 会话中直接回答。',
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

test('Buddy execution details stay collapsed by default while retaining a concise audit label', () => {
  assert.deepEqual(executionDrawerPresentation({ status: 'done', elapsedMs: 1240, stepCount: 3 }), {
    open: false,
    label: '执行详情 · 已完成 · 1.2 秒 · 3 步',
  })
  assert.equal(executionDrawerPresentation({ status: 'running', elapsedMs: 0, stepCount: 1 }).open, false)
  assert.match(executionDrawerPresentation({ status: 'blocked', elapsedMs: 60_000, stepCount: 2 }).label, /等待确认/)
})

test('assistant presentation removes vendor tool protocol and hidden reasoning', () => {
  const value = sanitizeAssistantPresentation('<think>private</think><minimax><toolcall>{"name":"websearch"}</toolcall></minimax>已完成检索')
  assert.equal(value, '已完成检索')
})

test('assistant presentation returns empty text for protocol-only output', () => {
  assert.equal(sanitizeAssistantPresentation('<toolcall>{"name":"read"}</toolcall>'), '')
})

test('assistant presentation removes malformed vendor wrappers from streamed output', () => {
  assert.equal(sanitizeAssistantPresentation('|<minimax>[<toolcall>{\"name\":\"websearch\"}</toolcall>]</minimax>结果'), '结果')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { executionPresentation } from './presentation.mjs'

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

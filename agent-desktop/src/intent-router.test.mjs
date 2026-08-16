import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyIntent } from './intent-router.mjs'

test('routes greetings and ordinary questions to chat inside Buddy', () => {
  assert.equal(classifyIntent('你好', { mode: 'BUDDY' }).route, 'chat')
  assert.equal(classifyIntent('你是谁？', { mode: 'BUDDY' }).route, 'chat')
  assert.equal(classifyIntent('你觉得这个方案怎么样？', { mode: 'BUDDY' }).route, 'chat')
})

test('routes explicit workspace inspection to the read-only agent path', () => {
  const result = classifyIntent('看看我的桌面上都有些什么', { mode: 'BUDDY' })
  assert.equal(result.route, 'agent')
  assert.equal(result.kind, 'read')
})

test('routes research and explicit file changes to the agent path', () => {
  assert.equal(classifyIntent('查一下 MiniMax 官方 API 文档', { mode: 'BUDDY' }).kind, 'research')
  assert.equal(classifyIntent('帮我整理桌面文件', { mode: 'BUDDY' }).kind, 'write')
  assert.equal(classifyIntent('创建脚本并运行测试', { mode: 'BUDDY' }).kind, 'command')
})

test('does not let a greeting prefix hide an explicit action', () => {
  const result = classifyIntent('你好，帮我读取 README.md', { mode: 'BUDDY' })
  assert.equal(result.route, 'agent')
  assert.equal(result.kind, 'read')
})

test('keeps ordinary chat mode on the chat route regardless of wording', () => {
  assert.equal(classifyIntent('帮我删除这个文件', { mode: 'CHAT' }).route, 'chat')
})

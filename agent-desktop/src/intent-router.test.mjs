import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyIntent } from './intent-router.mjs'
import { executionPresentation } from './presentation.mjs'

test('routes greetings and short questions to direct answers inside ZT.buddy', () => {
  const greeting = classifyIntent('你好', { mode: 'BUDDY' })
  assert.equal(greeting.route, 'chat')
  assert.equal(executionPresentation(greeting).title, '直接回答')
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
  assert.equal(classifyIntent('上网搜一下这个是什么角色', { mode: 'BUDDY' }).kind, 'research')
  assert.equal(classifyIntent('上网搜一下这个是什么角色', { mode: 'CHAT' }).kind, 'research')
  assert.equal(classifyIntent('帮我分析这个链接 https://www.amazon.co.uk/dp/B0EXAMPLE', { mode: 'BUDDY' }).route, 'agent')
  assert.equal(classifyIntent('帮我整理桌面文件', { mode: 'BUDDY' }).kind, 'write')
  assert.equal(classifyIntent('创建脚本并运行测试', { mode: 'BUDDY' }).kind, 'command')
})

test('routes uncertain and time-sensitive factual questions to mandatory web verification', () => {
  const recent = classifyIntent('最近车来很火你知道是什么吗', { mode: 'BUDDY' })
  assert.equal(recent.route, 'agent')
  assert.equal(recent.kind, 'research')
  assert.equal(classifyIntent('OpenClaw 是什么？', { mode: 'BUDDY' }).route, 'agent')
})

test('does not let a greeting prefix hide an explicit action', () => {
  const result = classifyIntent('你好，帮我读取 README.md', { mode: 'BUDDY' })
  assert.equal(result.route, 'agent')
  assert.equal(result.kind, 'read')
})

test('keeps ordinary chat mode on the chat route regardless of wording', () => {
  assert.equal(classifyIntent('帮我删除这个文件', { mode: 'CHAT' }).route, 'chat')
})

test('keeps short progress follow-ups inside an existing Buddy agent conversation', () => {
  const followup = classifyIntent('调查好了没', { mode: 'BUDDY', hasAgentContext: true })

  assert.equal(followup.route, 'agent')
  assert.equal(followup.kind, 'followup')
  assert.equal(classifyIntent('调查好了没', { mode: 'BUDDY', hasAgentContext: false }).route, 'chat')
})

test('ordinary chat also verifies explicit or time-sensitive web facts without enabling device actions', () => {
  const recent = classifyIntent('最近网上牛来很火，调查一下', { mode: 'CHAT' })

  assert.equal(recent.route, 'agent')
  assert.equal(recent.kind, 'research')
  assert.equal(classifyIntent('帮我删除这个文件', { mode: 'CHAT' }).route, 'chat')
})

test('调查一下 is treated as public web research in both chat modes', () => {
  for (const mode of ['CHAT', 'BUDDY']) {
    const intent = classifyIntent('最近网上牛来很火，调查一下', { mode })
    assert.equal(intent.kind, 'research')
    assert.equal(intent.route, 'agent')
  }
})

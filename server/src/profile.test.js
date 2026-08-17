import test from 'node:test'
import assert from 'node:assert/strict'
import { AGENT_SYSTEM_PROMPT, CHAT_LANGUAGE_PROMPTS, ZT_PROFILE, ZT_SYSTEM_PROMPT } from './profile.js'

test('profile keeps the configured digital-twin facts', () => {
  assert.equal(ZT_PROFILE.company, '深圳市坤信科技有限公司')
  assert.ok(ZT_SYSTEM_PROMPT.includes('AI 产品开发'))
})

test('chat language prompts are explicit for every supported locale', () => {
  assert.match(CHAT_LANGUAGE_PROMPTS.zh, /简体中文/)
  assert.match(CHAT_LANGUAGE_PROMPTS.en, /English/)
  assert.match(CHAT_LANGUAGE_PROMPTS.ja, /日本語/)
})

test('desktop agent prompt is execution-first and permission-aware', () => {
  assert.match(AGENT_SYSTEM_PROMPT, /执行任务/)
  assert.match(AGENT_SYSTEM_PROMPT, /权限/)
  assert.match(AGENT_SYSTEM_PROMPT, /批准/)
})

test('desktop agent prompt requires concise user-facing execution summaries without hidden reasoning', () => {
  assert.match(AGENT_SYSTEM_PROMPT, /不展示思维链|推理过程/)
  assert.match(AGENT_SYSTEM_PROMPT, /最多 6 条/)
  assert.match(AGENT_SYSTEM_PROMPT, /不要直接倾倒原始工具日志/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { CHAT_LANGUAGE_PROMPTS, ZT_PROFILE, ZT_SYSTEM_PROMPT } from './profile.js'

test('profile keeps the configured digital-twin facts', () => {
  assert.equal(ZT_PROFILE.company, '深圳市坤信科技有限公司')
  assert.ok(ZT_SYSTEM_PROMPT.includes('AI 产品开发'))
})

test('chat language prompts are explicit for every supported locale', () => {
  assert.match(CHAT_LANGUAGE_PROMPTS.zh, /简体中文/)
  assert.match(CHAT_LANGUAGE_PROMPTS.en, /English/)
  assert.match(CHAT_LANGUAGE_PROMPTS.ja, /日本語/)
})

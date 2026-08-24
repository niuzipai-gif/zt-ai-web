import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAgentPlannerSystemPrompt, buildAgentSystemPrompt, buildPublicSystemPrompt } from './prompt-context.js'

test('injects one authoritative China runtime clock into every platform prompt', () => {
  const options = { now: new Date('2026-08-24T04:05:06.000Z'), timeZone: 'Asia/Shanghai' }
  const prompts = [
    buildPublicSystemPrompt('zh', options),
    buildAgentSystemPrompt('zh', options),
    buildAgentPlannerSystemPrompt('zh', options),
  ]

  for (const prompt of prompts) {
    assert.match(prompt, /2026-08-24/)
    assert.match(prompt, /12:05:06/)
    assert.match(prompt, /Asia\/Shanghai/)
    assert.match(prompt, /相对日期/)
  }
})

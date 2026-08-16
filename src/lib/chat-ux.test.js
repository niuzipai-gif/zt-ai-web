import test from 'node:test'
import assert from 'node:assert/strict'
import { buildStarterPrompts, formatRelativeSessionTime, shouldUseCompactProfile } from './chat-ux.js'

test('starter prompts stay localised and actionable', () => {
  const prompts = buildStarterPrompts({ starterPrompts: ['A', 'B', 'C'] })
  assert.deepEqual(prompts, ['A', 'B', 'C'])
})

test('history uses a short human label instead of a technical date string', () => {
  const now = new Date('2026-08-16T12:00:00Z').getTime()
  assert.equal(formatRelativeSessionTime(now - 60_000, now, 'zh'), '1 分钟前')
  assert.equal(formatRelativeSessionTime(now - 3_600_000, now, 'en'), '1h ago')
})

test('profile compacts only on a narrow screen after chat has started', () => {
  assert.equal(shouldUseCompactProfile({ viewportWidth: 390, messageCount: 2 }), true)
  assert.equal(shouldUseCompactProfile({ viewportWidth: 390, messageCount: 0 }), false)
  assert.equal(shouldUseCompactProfile({ viewportWidth: 1024, messageCount: 2 }), false)
})

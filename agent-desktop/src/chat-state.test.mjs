import test from 'node:test'
import assert from 'node:assert/strict'
import { MODEL_CONTEXTS, contextMeter, normalizeModel, nextMode } from '../public/chat-state.mjs'

test('normalizes only the two supported desktop models', () => {
  assert.equal(normalizeModel('DEEPSEEK'), 'DEEPSEEK')
  assert.equal(normalizeModel('unknown'), 'MINIMAX')
})

test('uses the unified 1M context window and calculates remaining tokens', () => {
  const meter = contextMeter('MINIMAX', 12_400)
  assert.equal(MODEL_CONTEXTS.MINIMAX.contextLimit, 1_000_000)
  assert.equal(meter.usedTokens, 12_400)
  assert.equal(meter.remainingTokens, 987_600)
  assert.equal(meter.percent, 1)
})

test('switches between ordinary chat and ZT.buddy without creating a third mode', () => {
  assert.equal(nextMode('CHAT'), 'BUDDY')
  assert.equal(nextMode('BUDDY'), 'CHAT')
  assert.equal(nextMode('other'), 'CHAT')
})

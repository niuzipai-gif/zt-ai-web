import test from 'node:test'
import assert from 'node:assert/strict'
import { clampLevel, orbVisualState, readAnalyserLevel, shouldAnimateOrb } from './audio-reactivity.js'

test('audio level is finite and bounded', () => {
  assert.equal(clampLevel(Number.NaN), 0)
  assert.equal(clampLevel(-2), 0)
  assert.equal(clampLevel(2), 1)
  assert.equal(clampLevel(0.35), 0.35)
})

test('analyser level uses the time-domain RMS', () => {
  const analyser = { getByteTimeDomainData: target => target.set([128, 160, 96, 128]) }
  const level = readAnalyserLevel(analyser, new Uint8Array(4))
  assert.ok(level > 0.1 && level < 0.2)
  assert.equal(readAnalyserLevel(null, new Uint8Array(4)), 0)
})

test('orb maps lifecycle states to stable visual states', () => {
  assert.equal(orbVisualState('idle').motion, 'rest')
  assert.equal(orbVisualState('listening').motion, 'input')
  assert.equal(orbVisualState('processing').motion, 'breathing')
  assert.equal(orbVisualState('speaking').motion, 'output')
  assert.equal(orbVisualState('error').motion, 'error')
})

test('orb only animates while listening, processing or speaking', () => {
  assert.equal(shouldAnimateOrb('idle'), false)
  assert.equal(shouldAnimateOrb('error'), false)
  assert.equal(shouldAnimateOrb('listening'), true)
  assert.equal(shouldAnimateOrb('processing'), true)
  assert.equal(shouldAnimateOrb('speaking'), true)
})

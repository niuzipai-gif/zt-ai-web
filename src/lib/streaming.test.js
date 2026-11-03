import test from 'node:test'
import assert from 'node:assert/strict'
import { getStreamBatchSize } from './streaming.js'

test('received text is visible on the next paint tick instead of seconds of artificial typing', () => {
  assert.equal(getStreamBatchSize(0), 1)
  assert.equal(getStreamBatchSize(1), 1)
  for (const length of [4, 80, 1000, 8000]) {
    let queue = length, ticks = 0
    while (queue > 0 && ticks < 1000) { queue -= getStreamBatchSize(queue); ticks++ }
    assert.ok(ticks * 30 <= 60, `${length} received characters took ${ticks * 30} ms to display`)
  }
})

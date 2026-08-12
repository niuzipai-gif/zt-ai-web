import test from 'node:test'
import assert from 'node:assert/strict'
import { getStreamBatchSize } from './streaming.js'

test('keeps the first streamed characters smooth and catches up when the queue grows', () => {
  assert.equal(getStreamBatchSize(0), 1)
  assert.equal(getStreamBatchSize(1), 1)
  assert.ok(getStreamBatchSize(80) > 1)
  assert.ok(getStreamBatchSize(80) <= 8)
  assert.ok(getStreamBatchSize(1000) <= 8)
})

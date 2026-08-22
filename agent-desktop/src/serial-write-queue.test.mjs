import test from 'node:test'
import assert from 'node:assert/strict'
import { createSerialWriteQueue } from './serial-write-queue.mjs'

test('serial write queue prevents concurrent session snapshots from overlapping', async () => {
  const queue = createSerialWriteQueue()
  let active = 0
  let peak = 0
  const order = []
  const first = queue.enqueue(async () => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 15))
    order.push('first')
    active -= 1
  })
  const second = queue.enqueue(async () => {
    active += 1
    peak = Math.max(peak, active)
    order.push('second')
    active -= 1
  })
  await Promise.all([first, second])
  assert.equal(peak, 1)
  assert.deepEqual(order, ['first', 'second'])
})

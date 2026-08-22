import assert from 'node:assert/strict'
import test from 'node:test'
import { createTaskRunRegistry } from '../public/task-runs.mjs'

test('task runs stay isolated when two conversations execute concurrently', () => {
  const registry = createTaskRunRegistry()
  const first = registry.create('chat-a', { task: '读取 A' })
  const second = registry.create('chat-b', { task: '读取 B' })

  first.output = 'A 已完成'
  second.output = 'B 仍在执行'
  registry.delete('chat-a')

  assert.equal(registry.get('chat-a'), null)
  assert.equal(registry.get('chat-b'), second)
  assert.equal(registry.get('chat-b').output, 'B 仍在执行')
  assert.equal(registry.size(), 1)
})

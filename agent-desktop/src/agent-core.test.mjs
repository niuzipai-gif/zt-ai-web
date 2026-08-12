import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPlan, extractFilePath } from './agent-core.mjs'

test('execution-first planning identifies read, write and test work', () => {
  assert.equal(extractFilePath('请读取 README.md'), 'README.md')
  const plan = buildPlan('请读取 README.md，修改代码并运行测试', 'task-1')
  assert.deepEqual(plan.map(step => step.tool), ['list_workspace', 'read_file', 'write_file', 'run_command'])
  assert.equal(plan[2].inputPath, 'README.md')
  assert.equal(plan[3].command, 'npm test')
})

test('a vague execution task stays safe and does not invent a target file', () => {
  const plan = buildPlan('帮我分析当前项目的结构', 'task-2')
  assert.deepEqual(plan.map(step => step.tool), ['list_workspace'])
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { nextFlowIndex, flowProgress } from './project-flow.js'
import { getProjectDetails } from './project-details.js'

const STEP_IDS = ['input', 'decision', 'execution', 'qa', 'result']

test('each project exposes five localized demo steps', () => {
  for (const language of ['zh', 'en', 'ja']) {
    for (const detail of getProjectDetails(language)) {
      assert.deepEqual(detail.flowDemo.steps.map(step => step.id), STEP_IDS)
      assert.ok(detail.flowDemo.steps.every(step => step.label && step.description))
    }
  }
})

test('flow state advances without passing the result step', () => {
  assert.equal(nextFlowIndex(0, 5), 1)
  assert.equal(nextFlowIndex(4, 5), 4)
  assert.equal(flowProgress(0, 5), 0)
  assert.equal(flowProgress(4, 5), 1)
})

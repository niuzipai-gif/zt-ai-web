import test from 'node:test'
import assert from 'node:assert/strict'
import { createFlowDemoState, finishFlowDemo, selectFlowStep } from './project-flow-ui.js'

test('flow demo contract supports replay and manual selection', () => {
  const state = createFlowDemoState(5)
  assert.equal(state.index, 0)
  assert.equal(state.mode, 'auto')
  assert.equal(selectFlowStep(state, 3).index, 3)
  assert.equal(selectFlowStep(state, 3).mode, 'manual')
  assert.equal(finishFlowDemo(state).index, 4)
  assert.equal(finishFlowDemo(state).mode, 'complete')
})

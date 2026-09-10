import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceFlowDemo, createFlowDemoState, finishFlowDemo, replayFlowDemo, selectFlowStep, toggleFlowPlayback } from './project-flow-ui.js'

test('flow demo contract supports replay and manual selection', () => {
  const state = createFlowDemoState(5)
  assert.equal(state.index, 0)
  assert.equal(state.mode, 'auto')
  assert.equal(selectFlowStep(state, 3).index, 3)
  assert.equal(selectFlowStep(state, 3).mode, 'manual')
  assert.equal(finishFlowDemo(state).index, 4)
  assert.equal(finishFlowDemo(state).mode, 'complete')
})

test('pause preserves the current step; replay starts a fresh run and final step receives its own dwell', () => {
  let state = advanceFlowDemo(createFlowDemoState(5))
  state = toggleFlowPlayback(state)
  assert.equal(state.index, 1)
  assert.equal(state.mode, 'paused')
  assert.strictEqual(advanceFlowDemo(state), state)
  state = toggleFlowPlayback(state)
  for (let tick = 0; tick < 3; tick++) state = advanceFlowDemo(state)
  assert.equal(state.index, 4)
  assert.equal(state.mode, 'auto')
  state = advanceFlowDemo(state)
  assert.equal(state.mode, 'complete')
  const replay = toggleFlowPlayback(state)
  assert.equal(replay.index, 0)
  assert.equal(replay.mode, 'auto')
  assert.ok(replay.run > state.run)
})

test('manual navigation clamps bounds and stops stale auto ticks', () => {
  const initial = createFlowDemoState(5)
  const manual = selectFlowStep(initial, 999)
  assert.equal(manual.index, 4)
  assert.strictEqual(advanceFlowDemo(manual), manual)
  assert.equal(selectFlowStep(manual, -9).index, 0)
  assert.equal(selectFlowStep(manual, Number.NaN).index, 0)
  assert.equal(replayFlowDemo(manual).index, 0)
  assert.equal(initial.index, 0)
})

test('empty and single-step demos cannot advance beyond available content', () => {
  for (const count of [0, 1, Number.NaN]) {
    const state = createFlowDemoState(count)
    assert.equal(state.mode, 'complete')
    assert.equal(advanceFlowDemo(state).index, 0)
    assert.equal(selectFlowStep(state, 99).index, 0)
  }
})

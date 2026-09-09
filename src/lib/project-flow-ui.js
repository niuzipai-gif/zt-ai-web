function lastFlowIndex(stepCount) {
  return Math.max(0, Number(stepCount) - 1)
}

function clampIndex(index, stepCount) {
  return Math.min(lastFlowIndex(stepCount), Math.max(0, Number(index)))
}

export function createFlowDemoState(stepCount) {
  const count = Math.max(0, Number(stepCount))
  return { index: 0, mode: count > 1 ? 'auto' : 'complete', stepCount: count }
}

export function selectFlowStep(state, index) {
  return { ...state, index: clampIndex(index, state.stepCount), mode: 'manual' }
}

export function finishFlowDemo(state) {
  return { ...state, index: lastFlowIndex(state.stepCount), mode: 'complete' }
}

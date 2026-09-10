import { clampFlowIndex, flowCount, nextFlowIndex } from './project-flow.js'

export const FLOW_STEP_MS = 3800

export function createFlowDemoState(stepCount) {
  const count = flowCount(stepCount)
  return { index: 0, mode: count > 1 ? 'auto' : 'complete', stepCount: count, run: 0 }
}

export function selectFlowStep(state, index) {
  return { ...state, index: clampFlowIndex(index, state.stepCount), mode: 'manual', run: state.run + 1 }
}

export function finishFlowDemo(state) {
  return { ...state, index: Math.max(0, state.stepCount - 1), mode: 'complete' }
}

export function advanceFlowDemo(state) {
  if (state.mode !== 'auto') return state
  return state.index >= state.stepCount - 1
    ? finishFlowDemo(state)
    : { ...state, index: nextFlowIndex(state.index, state.stepCount) }
}

export function replayFlowDemo(state) {
  return { ...createFlowDemoState(state.stepCount), run: state.run + 1 }
}

export function toggleFlowPlayback(state) {
  if (state.mode === 'complete') return replayFlowDemo(state)
  return { ...state, mode: state.mode === 'auto' ? 'paused' : 'auto' }
}

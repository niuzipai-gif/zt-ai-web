export function flowCount(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0
}

export function clampFlowIndex(index, stepCount) {
  return Math.min(Math.max(0, flowCount(stepCount) - 1), flowCount(index))
}

export function nextFlowIndex(currentIndex, stepCount) {
  return clampFlowIndex(flowCount(currentIndex) + 1, stepCount)
}

export function flowProgress(index, stepCount) {
  const lastIndex = Math.max(0, flowCount(stepCount) - 1)
  return lastIndex === 0 ? 1 : clampFlowIndex(index, stepCount) / lastIndex
}

export function nextFlowIndex(currentIndex, stepCount) {
  const lastIndex = Math.max(0, Number(stepCount) - 1)
  return Math.min(lastIndex, Math.max(0, Number(currentIndex) + 1))
}

export function flowProgress(index, stepCount) {
  const lastIndex = Math.max(0, Number(stepCount) - 1)
  return lastIndex === 0 ? 1 : Math.min(1, Math.max(0, Number(index) / lastIndex))
}

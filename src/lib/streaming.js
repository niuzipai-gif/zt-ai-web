export function getStreamBatchSize(queueLength) {
  if (queueLength < 5) return 1
  if (queueLength < 20) return 2
  if (queueLength < 60) return 4
  return 8
}

export function getStreamBatchSize(queueLength) {
  // Network streaming already controls the reveal rate. Flush each UI tick so
  // completed answers do not sit behind a second, artificial typing queue.
  return Math.max(1, queueLength)
}

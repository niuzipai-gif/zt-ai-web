export function createSerialWriteQueue() {
  let tail = Promise.resolve()
  return {
    enqueue(operation) {
      const next = tail.catch(() => {}).then(operation)
      tail = next.catch(() => {})
      return next
    },
  }
}

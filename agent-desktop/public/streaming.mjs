export function getStreamBatchSize(queueLength) {
  if (queueLength < 5) return 1
  if (queueLength < 20) return 2
  if (queueLength < 60) return 4
  return 8
}

export function createSmoothStream({ onUpdate = () => {}, intervalMs = 30 } = {}) {
  let queue = ''
  let output = ''
  let finished = false
  let cancelled = false
  let resolveDone
  const done = new Promise(resolve => { resolveDone = resolve })
  const timer = setInterval(() => {
    if (cancelled) return
    if (queue) {
      const size = getStreamBatchSize(queue.length)
      output += queue.slice(0, size)
      queue = queue.slice(size)
      onUpdate(output)
      return
    }
    if (finished) {
      clearInterval(timer)
      resolveDone(output)
    }
  }, intervalMs)

  return {
    push(text) { if (!cancelled) queue += String(text || '') },
    finish() { finished = true },
    cancel() { cancelled = true; clearInterval(timer); resolveDone(output) },
    done,
    get value() { return output },
  }
}

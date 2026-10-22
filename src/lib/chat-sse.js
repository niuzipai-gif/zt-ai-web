export async function consumeChatSse(response, onEvent) {
  if (!response.ok || !response.body) throw new Error(`聊天网关不可用（${response.status}）`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = '', completed = false
  const consumeFrame = frame => {
    const lines = frame.split(/\r?\n/)
    const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim() || 'message.delta'
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n')
    if (!data) return
    let parsed
    try { parsed = JSON.parse(data) } catch { throw new Error('聊天数据不完整，请重试。') }
    onEvent(event, parsed)
  }
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      if (buffer.length > 4_000_000) throw new Error('聊天数据超过限制。')
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() || ''
      frames.forEach(consumeFrame)
    }
    buffer += decoder.decode()
    if (buffer.trim()) consumeFrame(buffer)
    completed = true
  } finally {
    if (!completed) { try { await reader.cancel() } catch {} }
    reader.releaseLock()
  }
}

export async function* streamOpenAICompatible({ baseUrl, apiKey, model, messages, extra = {} }) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.7, ...extra }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300)
    throw new Error(`上游模型请求失败（${response.status}）${detail ? `：${detail}` : ''}`)
  }
  if (!response.body) throw new Error('上游模型没有返回流')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let thinkBuffer = ''
  let inThink = false

  function emitWithoutThinking(raw) {
    thinkBuffer += raw
    let visible = ''
    while (thinkBuffer) {
      if (inThink) {
        const end = thinkBuffer.indexOf('</think>')
        if (end === -1) {
          thinkBuffer = ''
          break
        }
        thinkBuffer = thinkBuffer.slice(end + '</think>'.length)
        inThink = false
        continue
      }
      const start = thinkBuffer.indexOf('<think>')
      if (start !== -1) {
        visible += thinkBuffer.slice(0, start)
        thinkBuffer = thinkBuffer.slice(start + '<think>'.length)
        inThink = true
        continue
      }
      const marker = '<think>'
      let keep = ''
      for (let size = Math.min(marker.length - 1, thinkBuffer.length); size > 0; size -= 1) {
        const suffix = thinkBuffer.slice(-size)
        if (marker.startsWith(suffix)) { keep = suffix; break }
      }
      visible += keep ? thinkBuffer.slice(0, -keep.length) : thinkBuffer
      thinkBuffer = keep
      break
    }
    return visible
  }
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          const json = JSON.parse(payload)
          const delta = json.choices?.[0]?.delta?.content || ''
          if (delta) {
            const visible = emitWithoutThinking(delta)
            if (visible) yield visible
          }
        } catch {
          // Ignore an incomplete or provider-specific SSE frame.
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

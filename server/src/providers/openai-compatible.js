const TOOL_START = /<\|(?:tool_?call|function_?call)\|>|<(?:tool_?call|function_?call)>/i
const TOOL_END = /<\|\/(?:tool_?call|function_?call)\|>|<\/(?:tool_?call|function_?call)>/i
const MODEL_MARKER = /<\|(?:minimax|assistant|user|system)\|>/i
const STREAM_MARKERS = ['<think>', '</think>', '<|toolcall|>', '<|tool_call|>', '<|functioncall|>', '<|function_call|>', '<toolcall>', '<tool_call>', '<functioncall>', '<function_call>', '<|minimax|>', '<|assistant|>', '<|user|>', '<|system|>']
const THINK_END_MARKERS = ['</think>']
const TOOL_END_MARKERS = ['<|/toolcall|>', '<|/tool_call|>', '<|/functioncall|>', '<|/function_call|>', '</toolcall>', '</tool_call>', '</functioncall>', '</function_call>']

function suffixPrefixLength(value, markers = STREAM_MARKERS) {
  let longest = 0
  for (const marker of markers) {
    const max = Math.min(marker.length - 1, value.length)
    for (let size = max; size > longest; size -= 1) {
      if (value.endsWith(marker.slice(0, size))) { longest = size; break }
    }
  }
  return longest
}

function nextMarker(value) {
  const candidates = []
  const thinkIndex = value.indexOf('<think>')
  if (thinkIndex !== -1) candidates.push({ index: thinkIndex, length: '<think>'.length, type: 'think' })
  const toolMatch = value.match(TOOL_START)
  if (toolMatch) candidates.push({ index: toolMatch.index, length: toolMatch[0].length, type: 'tool' })
  const modelMatch = value.match(MODEL_MARKER)
  if (modelMatch) candidates.push({ index: modelMatch.index, length: modelMatch[0].length, type: 'marker' })
  return candidates.sort((left, right) => left.index - right.index)[0] || null
}

function createVisibleTextFilter() {
  let pending = ''
  let mode = 'visible'

  function drain(final = false) {
    let visible = ''
    while (pending) {
      if (mode === 'think') {
        const end = pending.indexOf('</think>')
        if (end === -1) {
          const keep = suffixPrefixLength(pending, THINK_END_MARKERS)
          pending = keep ? pending.slice(-keep) : ''
          break
        }
        pending = pending.slice(end + '</think>'.length)
        mode = 'visible'
        continue
      }
      if (mode === 'tool') {
        const end = pending.match(TOOL_END)
        if (!end) {
          const keep = suffixPrefixLength(pending, TOOL_END_MARKERS)
          pending = keep ? pending.slice(-keep) : ''
          break
        }
        pending = pending.slice(end.index + end[0].length)
        mode = 'visible'
        continue
      }
      const marker = nextMarker(pending)
      if (!marker) {
        const keep = suffixPrefixLength(pending)
        visible += pending.slice(0, pending.length - keep)
        pending = pending.slice(pending.length - keep)
        break
      }
      visible += pending.slice(0, marker.index)
      pending = pending.slice(marker.index + marker.length)
      if (marker.type === 'think') mode = 'think'
      else if (marker.type === 'tool') mode = 'tool'
    }
    if (final && mode === 'visible') {
      const keep = suffixPrefixLength(pending)
      visible += pending.slice(0, pending.length - keep)
      pending = ''
    }
    return visible
  }

  return {
    push(value) { pending += String(value || ''); return drain() },
    finish() { return drain(true) },
  }
}

export async function* streamOpenAICompatible({ baseUrl, apiKey, model, messages, extra = {}, fetchImpl = fetch }) {
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
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
  const textFilter = createVisibleTextFilter()
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
            const visible = textFilter.push(delta)
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
  const trailing = textFilter.finish()
  if (trailing) yield trailing
}

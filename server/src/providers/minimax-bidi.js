import WebSocket from 'ws'

// One connection per answer: cancelling a turn cannot leak audio into the next.
export function createBidiSpeech({ apiKey, baseUrl, settings, signal, onAudio, WebSocketImpl = WebSocket, timeoutMs = 90_000, maxTextChars = 10_000 }) {
  const url = new URL('/ws/v1/t2a_v2_bidi', baseUrl)
  if (url.protocol !== 'https:') throw new Error('语音服务需要安全连接。')
  url.protocol = 'wss:'
  signal?.throwIfAborted()
  const socket = new WebSocketImpl(url.href, { headers: { Authorization: `Bearer ${apiKey}` }, maxPayload: 2_000_000, handshakeTimeout: 12_000 })
  let state = 'connecting', failure = null, textChars = 0, bytes = 0, sequence = 0
  let resolveReady, rejectReady, resolveDone, rejectDone
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject })
  // Callers may be generating the next text chunk when an asynchronous error arrives.
  ready.catch(() => {}); done.catch(() => {})
  const send = payload => { if (socket.readyState === 1) socket.send(JSON.stringify(payload)); else throw new Error('语音连接中断。') }
  function cleanup() { clearTimeout(timer); clearInterval(heartbeat); signal?.removeEventListener('abort', cancel) }
  function fail(error) {
    if (['done', 'failed'].includes(state)) return
    failure = error; state = 'failed'; cleanup()
    rejectReady(error); rejectDone(error)
    socket.terminate()
  }
  function cancel() {
    if (['done', 'failed'].includes(state)) return
    if (state === 'ready' || state === 'finishing') { try { send({ event: 'task_cancel' }) } catch {} }
    fail(new DOMException('Cancelled', 'AbortError'))
  }
  const timer = setTimeout(() => fail(Object.assign(new Error('语音生成超时。'), { code: 'voice_connection' })), timeoutMs)
  const heartbeat = setInterval(() => { if (socket.readyState === 1) socket.ping() }, 25_000)
  timer.unref?.(); heartbeat.unref?.()
  signal?.addEventListener('abort', cancel, { once: true })
  socket.on('error', () => fail(new Error('语音连接中断。')))
  socket.on('close', () => { if (state !== 'done') fail(new Error('语音连接中断，音频尚未完整生成。')) })
  socket.on('message', raw => {
    if (['failed', 'done'].includes(state)) return
    try {
      const frame = JSON.parse(raw.toString())
      if (frame.base_resp?.status_code || frame.event === 'task_failed') {
        // No blind replay: 2205 lacks an unambiguous acknowledgement of queued text.
        throw Object.assign(new Error('语音合成暂时不可用，请重试。'), { providerCode: Number(frame.base_resp?.status_code) || 0 })
      }
      if (frame.event === 'connected_success' && state === 'connecting') {
        state = 'starting'
        send({ ...settings, event: 'task_start', audio_setting: { format: 'pcm', sample_rate: 32_000, channel: 1 } })
      } else if (frame.event === 'task_started' && state === 'starting') { state = 'ready'; resolveReady() }
      else if (frame.event === 'task_finished') {
        if (state !== 'finishing' || !bytes) throw new Error('语音没有返回完整音频。')
        state = 'done'; cleanup(); resolveDone({ bytes, chunks: sequence }); socket.close()
      }
      if (frame.data?.audio) {
        const hex = frame.data.audio
        if (!['ready', 'finishing'].includes(state) || typeof hex !== 'string' || hex.length % 4 || !/^[a-f0-9]+$/i.test(hex)) throw new Error('语音返回了无效音频。')
        const audio = Buffer.from(hex, 'hex')
        bytes += audio.length
        if (bytes > 19_200_000) throw new Error('语音回答过长，请分段提问。')
        onAudio({ audio: audio.toString('base64'), sampleRate: 32_000, sequence: sequence++ })
      }
    } catch (error) { fail(error) }
  })
  return {
    async write(text) {
      signal?.throwIfAborted()
      textChars += text.length
      if (textChars > maxTextChars) { const error = new Error('语音回答超过长度限制。'); fail(error); throw error }
      await ready
      if (failure) throw failure
      if (state !== 'ready') throw new Error('语音会话已结束。')
      if (socket.bufferedAmount > 128_000) { const error = new Error('语音队列已满。'); fail(error); throw error }
      if (text) send({ event: 'task_continue', text })
    },
    async finish() {
      await ready
      if (failure) throw failure
      if (state === 'ready') { state = 'finishing'; send({ event: 'task_finish' }) }
      return done
    },
    cancel,
  }
}

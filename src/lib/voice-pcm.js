// AudioBuffer scheduling supports raw PCM without codec-dependent chunk decoding.
// The context is unlocked on the entry-button gesture, before asynchronous work.
export function createPcmSpeechPlayer({ Context = globalThis.AudioContext || globalThis.webkitAudioContext, onStateChange = () => {} } = {}) {
  let context, analyser, generation = 0, sequence = 0, nextTime = 0, finished = false, received = false
  let resolveDone, rejectDone, completion, notifyTimer
  let callback = onStateChange
  const sources = new Set()
  const notify = status => callback({ status, analyser })
  function stop() {
    generation += 1
    clearTimeout(notifyTimer)
    for (const source of sources) { source.onended = null; try { source.stop(); source.disconnect() } catch {} }
    sources.clear()
    rejectDone?.(new DOMException('Cancelled', 'AbortError'))
    resolveDone = rejectDone = null
    finished = true
    notify('idle')
  }
  return {
    async unlock() {
      if (!Context) return false
      try {
        context ||= new Context()
        if (!analyser) { analyser = context.createAnalyser(); analyser.fftSize = 256; analyser.connect(context.destination) }
        await context.resume()
        return context.state === 'running'
      } catch { return false }
    },
    isReady: () => context?.state === 'running',
    setOnStateChange(fn) { callback = fn || (() => {}) },
    begin() {
      stop()
      if (context?.state !== 'running') throw new Error('请点击语音按钮启用播放。')
      sequence = 0; received = false; finished = false
      nextTime = context.currentTime + Math.max(0.25, Number(context.baseLatency || 0) + 0.1)
      completion = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject })
      completion.catch(() => {})
      notify('processing')
    },
    push({ audio, sampleRate, sequence: index }) {
      if (finished) throw new Error('语音会话已结束。')
      if (index !== sequence) throw new Error('音频顺序异常，请重试。')
      if (sampleRate !== 32000 || typeof audio !== 'string' || audio.length > 3_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio) || audio.length % 4) throw new Error('音频格式异常。')
      const raw = atob(audio)
      if (raw.length % 2 || !raw.length) throw new Error('音频格式异常。')
      const start = Math.max(context.currentTime + 0.04, nextTime)
      if (start - context.currentTime + raw.length / 2 / sampleRate > 120) throw new Error('语音播放队列过长。')
      const buffer = context.createBuffer(1, raw.length / 2, sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i += 1) { const value = raw.charCodeAt(i * 2) | raw.charCodeAt(i * 2 + 1) << 8; data[i] = (value >= 32768 ? value - 65536 : value) / 32768 }
      const source = context.createBufferSource(), token = generation
      source.buffer = buffer; source.connect(analyser); sources.add(source)
      source.onended = () => {
        source.disconnect(); sources.delete(source)
        if (token === generation && !sources.size) {
          clearTimeout(notifyTimer)
          notify(finished ? 'idle' : 'processing')
          if (finished) resolveDone?.()
        }
      }
      source.start(start); nextTime = start + buffer.duration; sequence += 1
      received = true
      if (sources.size === 1) notifyTimer = setTimeout(() => { if (token === generation && sources.size) notify('speaking') }, Math.max(0, (start - context.currentTime) * 1000))
    },
    finish() {
      if (!received) return Promise.reject(new Error('没有收到可播放的音频。'))
      finished = true
      if (!sources.size) { clearTimeout(notifyTimer); notify('idle'); resolveDone?.() }
      return completion
    },
    stop,
    dispose() { stop(); analyser?.disconnect(); void context?.close?.(); analyser = context = null },
  }
}

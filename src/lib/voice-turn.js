import { loadVoiceWasm } from './voice-vad-loader.js'
// Silero runs locally. Only completed speech segments leave the browser for ASR.
export function pcm16Wav(samples) {
  if (!(samples instanceof Float32Array) || !samples.length || samples.length > 16000 * 90) throw new Error('Invalid audio length')
  const bytes = new Uint8Array(44 + samples.length * 2), view = new DataView(bytes.buffer)
  const ascii = (at, text) => [...text].forEach((c, i) => { bytes[at + i] = c.charCodeAt(0) })
  ascii(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); ascii(8, 'WAVEfmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  ascii(36, 'data'); view.setUint32(40, samples.length * 2, true)
  samples.forEach((s, i) => { const v = Number.isFinite(s) ? Math.max(-1, Math.min(1, s)) : 0; view.setInt16(44 + i * 2, v < 0 ? v * 32768 : v * 32767, true) })
  return new Blob([bytes], { type: 'audio/wav' })
}

export function createAutomaticVoiceCapture({
  Context = globalThis.AudioContext || globalThis.webkitAudioContext,
  mediaDevices = globalThis.navigator?.mediaDevices,
  loadVad = () => import('@ricky0123/vad-web'),
  loadWasm = loadVoiceWasm, startupTimeoutMs = 120000, onLoadProgress = () => {},
  assetPath = import.meta.env?.VITE_VOICE_ASSET_BASE_URL || `${import.meta.env?.BASE_URL || '/'}voice-vad/`,
  isOutputActive = () => false, onSpeechStart = () => {}, onSpeechEnd = () => {}, onStop = () => {},
} = {}) {
  let generation = 0, resources = null
  const release = async r => {
    if (!r || r.released) return
    r.released = true
    clearTimeout(r.idleTimer); clearTimeout(r.takeTimer); clearTimeout(r.startupTimer)
    r.abort?.abort()
    r.stream?.getTracks().forEach(t => { t.removeEventListener?.('ended', r.trackEnded); t.stop() })
    r.source?.disconnect(); r.analyser?.disconnect()
    // Keep only the context alive until in-flight model/node initialization settles.
    // Tracks are stopped above immediately; MicVAD cannot destroy a half-created node.
    try { await r.initializing } catch {}
    try { await r.vad?.destroy() } catch {}
    try { await r.context?.close() } catch {}
  }
  async function stop(reason = '') {
    generation++
    const r = resources; resources = null
    if (reason) onStop(reason)
    await release(r)
  }
  async function start() {
    if (resources) return { status: 'recording', analyser: resources.analyser }
    const token = ++generation, r = { accepted: false, released: false, abort: new AbortController() }
    resources = r
    const live = () => generation === token && !r.released
    const idleTimer = () => { clearTimeout(r.idleTimer); r.idleTimer = setTimeout(() => { if (live()) void stop('idle') }, 5 * 60_000) }
    try {
      if (!Context || !mediaDevices?.getUserMedia) throw new Error('unsupported')
      // Resume synchronously in the microphone-button gesture, before loading weights.
      r.context = new Context()
      const resume = r.context.resume(); resume?.catch?.(() => {})
      const stream = await mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      if (!live()) { stream.getTracks().forEach(t => t.stop()); return { status: 'cancelled' } }
      r.stream = stream
      await resume
      if (!live()) return { status: 'cancelled' }
      if (r.context.state !== 'running') throw new Error('audio-context-unavailable')
      r.echoCancellation = stream.getAudioTracks()[0]?.getSettings?.().echoCancellation !== false
      r.trackEnded = () => { if (live()) void stop('device') }
      stream.getTracks().forEach(t => t.addEventListener?.('ended', r.trackEnded))
      r.analyser = r.context.createAnalyser(); r.analyser.fftSize = 256
      r.source = r.context.createMediaStreamSource(stream); r.source.connect(r.analyser)
      r.startupTimer = setTimeout(() => { if (live()) void stop('startup') }, startupTimeoutMs)
      const [{ MicVAD }, wasm] = await Promise.all([loadVad(), loadWasm(assetPath, { signal: r.abort.signal, onProgress: progress => { if (live()) onLoadProgress(progress) } })])
      if (!live()) return { status: 'cancelled' }
      r.initializing = (async () => {
      r.vad = await MicVAD.new({
        model: 'v5', startOnLoad: false, audioContext: r.context,
        baseAssetPath: assetPath, onnxWASMBasePath: assetPath,
        ortConfig: ort => { ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; ort.env.wasm.initTimeout = 20000; if (wasm) ort.env.wasm.wasmBinary = wasm; ort.env.logLevel = 'error' },
        getStream: async () => stream, resumeStream: async () => stream, pauseStream: async () => {},
        positiveSpeechThreshold: .7, negativeSpeechThreshold: .35,
        minSpeechMs: 320, preSpeechPadMs: 800, redemptionMs: 1000, submitUserSpeechOnPause: false,
        onSpeechStart: () => {}, // A single high-energy/noisy frame is not a turn.
        onSpeechRealStart: () => {
          if (!live() || (isOutputActive() && !r.echoCancellation)) return
          r.accepted = true; idleTimer()
          onSpeechStart({ analyser: r.analyser })
          clearTimeout(r.takeTimer)
          // Bound memory, ASR size and accidentally unattended recordings.
          r.takeTimer = setTimeout(() => { if (live()) void stop('limit') }, 60_000)
        },
        onSpeechEnd: audio => {
          if (!live()) return
          clearTimeout(r.takeTimer)
          const accepted = r.accepted; r.accepted = false
          if (!accepted) return
          idleTimer()
          if (audio.length && audio.length <= 16000 * 90) onSpeechEnd(pcm16Wav(audio))
        },
        onVADMisfire: () => { r.accepted = false; clearTimeout(r.takeTimer) },
      })
      await r.vad.start()
      })()
      await r.initializing
      if (!live()) { await release(r); return { status: 'cancelled' } }
      clearTimeout(r.startupTimer)
      idleTimer()
      return { status: 'recording', analyser: r.analyser, echoCancellation: r.echoCancellation }
    } catch (error) {
      if (!live()) return { status: 'cancelled' }
      resources = null; generation++; await release(r)
      return { status: 'unavailable', error: error?.name === 'NotAllowedError' ? 'permission-denied' : 'voice_auto_unavailable' }
    }
  }
  return { start, stop, dispose: stop }
}

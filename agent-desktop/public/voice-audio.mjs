const RECORDER_MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

export function chooseRecorderMime(isTypeSupported = () => false) {
  return RECORDER_MIMES.find(type => { try { return Boolean(isTypeSupported(type)) } catch { return false } }) || ''
}

function stopTracks(stream) { stream?.getTracks?.().forEach(track => track.stop?.()) }

export function createPcmVoiceRecorder({ mediaDevices = globalThis.navigator?.mediaDevices || null, audioContextFactory = globalThis.AudioContext || globalThis.webkitAudioContext, maxTakeMs = 90_000, onLimit = () => {} } = {}) {
  let stream = null, context = null, source = null, processor = null, gain = null, analyser = null, timer = null
  let samples = [], frames = 0, rate = 16000, generation = 0, finished = null
  function release() {
    clearTimeout(timer); timer = null
    if (processor) processor.onaudioprocess = null
    source?.disconnect?.(); processor?.disconnect?.(); gain?.disconnect?.()
    stopTracks(stream); stream = null
    context?.close?.()?.catch?.(() => {})
    context = source = processor = gain = analyser = null
  }
  function cancel() { generation += 1; release(); samples = []; frames = 0; finished = null; return { status: 'cancelled' } }
  async function start() {
    cancel()
    const token = generation
    if (!mediaDevices?.getUserMedia || !audioContextFactory) return { status: 'unavailable', error: '当前设备不支持录音，请使用文字输入。' }
    try {
      context = new audioContextFactory()
      const captureContext = context
      const resume = captureContext.resume?.()
      resume?.catch?.(() => {})
      const acquired = await mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      if (token !== generation) { stopTracks(acquired); return { status: 'cancelled' } }
      stream = acquired
      rate = captureContext.sampleRate
      source = captureContext.createMediaStreamSource(stream)
      analyser = captureContext.createAnalyser(); analyser.fftSize = 256
      // PCM avoids browser-dependent WebM codecs and needs no server converter.
      processor = captureContext.createScriptProcessor(4096, 1, 1)
      gain = captureContext.createGain(); gain.gain.value = 0
      source.connect(analyser); source.connect(processor); processor.connect(gain); gain.connect(captureContext.destination)
      processor.onaudioprocess = event => {
        if (token !== generation) return
        const data = event.inputBuffer.getChannelData(0)
        const remaining = Math.max(0, Math.floor(rate * maxTakeMs / 1000) - frames)
        if (remaining) { const chunk = new Float32Array(data.slice(0, remaining)); samples.push(chunk); frames += chunk.length }
      }
      timer = setTimeout(() => { if (token === generation) { void stop(); onLimit() } }, maxTakeMs)
      return { status: 'recording', stream, analyser, mimeType: 'audio/wav' }
    } catch (error) {
      if (token !== generation) return { status: 'cancelled' }
      release()
      return { status: 'unavailable', error: error?.name === 'NotAllowedError' ? '麦克风权限未开启' : '录音启动失败，请重试。' }
    }
  }
  function stop() {
    if (finished) return Promise.resolve(finished)
    if (!context) return Promise.resolve({ status: 'unavailable', error: '当前没有正在进行的录音' })
    const pcm = new Float32Array(frames)
    let offset = 0
    for (const chunk of samples) { pcm.set(chunk, offset); offset += chunk.length }
    const count = Math.floor(frames * 16000 / rate)
    const buffer = new ArrayBuffer(44 + count * 2)
    const view = new DataView(buffer), bytes = new Uint8Array(buffer)
    const ascii = (at, value) => [...value].forEach((character, index) => { bytes[at + index] = character.charCodeAt(0) })
    ascii(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); ascii(8, 'WAVE'); ascii(12, 'fmt ')
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
    view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
    ascii(36, 'data'); view.setUint32(40, count * 2, true)
    for (let index = 0; index < count; index += 1) {
      const begin = Math.floor(index * rate / 16000), end = Math.min(frames, Math.max(begin + 1, Math.floor((index + 1) * rate / 16000)))
      let sum = 0
      for (let at = begin; at < end; at += 1) sum += pcm[at]
      const value = Math.max(-1, Math.min(1, sum / (end - begin)))
      view.setInt16(44 + index * 2, value < 0 ? value * 32768 : value * 32767, true)
    }
    finished = { status: 'ready', blob: new Blob([buffer], { type: 'audio/wav' }), mimeType: 'audio/wav', durationMs: Math.round(frames / rate * 1000) }
    generation += 1; release(); samples = []; frames = 0
    return Promise.resolve(finished)
  }
  return { start, stop, cancel, dispose: cancel, getAnalyser: () => analyser }
}

function defaultRecognitionFactory() {
  const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition
  return Recognition ? () => new Recognition() : null
}

function recognitionLanguage(language) {
  const value = String(language || 'zh').toLowerCase()
  if (value === 'auto' || value === 'und' || value === 'automatic') return ''
  if (value.startsWith('en')) return 'en-US'
  if (value.startsWith('ja') || value.startsWith('jp')) return 'ja-JP'
  return 'zh-CN'
}

export function createVoiceAudioController({ mediaDevices = globalThis.navigator?.mediaDevices || null, recorderFactory = globalThis.MediaRecorder ? (stream, options) => new globalThis.MediaRecorder(stream, options) : null, audioContextFactory = globalThis.AudioContext || globalThis.webkitAudioContext } = {}) {
  let recorder = null
  let stream = null
  let chunks = []
  let audioContext = null
  let analyser = null
  const unavailable = error => ({ status: 'unavailable', error: String(error || '当前设备不支持语音输入') })
  const closeAudioContext = () => { if (audioContext?.close) void audioContext.close(); audioContext = null; analyser = null }
  async function start() {
    if (!mediaDevices?.getUserMedia || !recorderFactory) return unavailable('当前设备不支持语音输入')
    try {
      stream = await mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      const mimeType = chooseRecorderMime(globalThis.MediaRecorder?.isTypeSupported?.bind(globalThis.MediaRecorder) || (() => false))
      recorder = recorderFactory(stream, mimeType ? { mimeType } : undefined)
      chunks = []
      recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data) }
      recorder.start?.()
      if (audioContextFactory && stream.getAudioTracks?.().length) {
        audioContext = new audioContextFactory()
        analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        audioContext.createMediaStreamSource(stream).connect(analyser)
      }
      return { status: 'recording', stream, analyser, mimeType: recorder.mimeType || mimeType }
    } catch (error) { stopTracks(stream); stream = null; recorder = null; closeAudioContext(); return unavailable(error?.message || '麦克风暂时不可用') }
  }
  function stop() {
    if (!recorder) return Promise.resolve(unavailable('当前没有正在进行的录音'))
    const active = recorder
    return new Promise(resolve => {
      active.onstop = () => { const blob = new Blob(chunks, { type: active.mimeType || 'audio/webm' }); stopTracks(stream); recorder = null; stream = null; chunks = []; closeAudioContext(); resolve({ status: 'ready', blob, durationMs: 0, mimeType: blob.type }) }
      try { active.state === 'inactive' ? active.onstop() : active.stop() } catch (error) { resolve(unavailable(error.message || '录音停止失败')) }
    })
  }
  async function cancel() { try { recorder?.stop?.() } catch {}; stopTracks(stream); recorder = null; stream = null; chunks = []; closeAudioContext(); return { status: 'cancelled' } }
  return { start, stop, cancel, dispose: cancel, getAnalyser: () => analyser }
}

export function createVoiceRecognition({ language = 'zh', recognitionFactory = defaultRecognitionFactory(), bridge = globalThis.ztaiAndroidVoice, onTranscript = () => {}, onError = () => {}, onEnd = () => {} } = {}) {
  let recognition = null
  let listening = false
  const bridgeCallbacks = { result: globalThis.__ztaiAndroidVoiceOnResult, error: globalThis.__ztaiAndroidVoiceOnError }
  const unavailable = error => ({ status: 'unavailable', error: String(error || '当前设备不支持语音识别') })
  const resetAfterError = () => {
    listening = false
    try { recognition?.stop?.() } catch {}
    recognition = null
    restoreBridgeCallbacks()
  }
  const handleError = error => {
    resetAfterError()
    onError(error)
  }
  const installBridgeCallbacks = () => {
    globalThis.__ztaiAndroidVoiceOnResult = (text, isFinal = true) => onTranscript(String(text || '').trim(), Boolean(isFinal))
    globalThis.__ztaiAndroidVoiceOnError = error => handleError(String(error || '语音识别暂时不可用'))
  }
  const restoreBridgeCallbacks = () => {
    if (bridgeCallbacks.result) globalThis.__ztaiAndroidVoiceOnResult = bridgeCallbacks.result
    else delete globalThis.__ztaiAndroidVoiceOnResult
    if (bridgeCallbacks.error) globalThis.__ztaiAndroidVoiceOnError = bridgeCallbacks.error
    else delete globalThis.__ztaiAndroidVoiceOnError
  }
  function start() {
    if (listening) return { status: 'listening' }
    if (bridge?.start) {
      try { installBridgeCallbacks(); bridge.start(recognitionLanguage(language)); listening = true; return { status: 'listening', mode: 'android' } }
      catch (error) { restoreBridgeCallbacks(); return unavailable(error?.message || '安卓语音识别暂时不可用') }
    }
    if (!recognitionFactory) return unavailable('当前设备没有可用的语音识别服务')
    try {
      recognition = recognitionFactory()
      const active = recognition
      const locale = recognitionLanguage(language)
      if (locale) recognition.lang = locale
      recognition.continuous = true
      recognition.interimResults = true
      recognition.maxAlternatives = 1
      recognition.onresult = event => {
        if (active !== recognition) return
        let text = ''
        let final = true
        const startIndex = Number(event?.resultIndex) || 0
        for (let index = startIndex; index < (event?.results?.length || 0); index += 1) {
          const result = event.results[index]
          text += result?.[0]?.transcript || ''
          final = final && result?.isFinal !== false
        }
        if (text.trim()) onTranscript(text.trim(), final)
      }
    recognition.onerror = event => { if (active === recognition && listening) handleError(event?.error || '语音识别暂时不可用') }
    recognition.onend = () => { if (active === recognition) { listening = false; recognition = null; onEnd() } }
      listening = true
    recognition.start()
      return { status: 'listening', mode: 'browser' }
    } catch (error) { recognition = null; return unavailable(error?.message || '语音识别启动失败') }
  }
  function stop() {
    const wasListening = listening
    listening = false
    if (bridge?.stop && wasListening) { try { bridge.stop() } catch {} }
    try { recognition?.stop?.() } catch {}
    recognition = null
    listening = false
    restoreBridgeCallbacks()
    return { status: 'stopped' }
  }
  return { start, stop, dispose: stop, isListening: () => listening }
}

export function formatVoiceRecognitionError(error) {
  const code = String(error || '').trim().toLowerCase()
  if (code === 'service-not-allowed' || code === 'language-not-supported') return '当前环境不提供语音识别服务，请检查系统语音服务或改用文字输入。'
  if (code === 'not-allowed' || code === 'permission-denied' || code.includes('permission')) return '麦克风或语音识别权限未开启，请允许后重试。'
  if (code === 'network') return '语音识别网络连接失败，请检查网络后重试。'
  return String(error || '语音识别暂时不可用').trim()
}

function secureAudioUrl(url) {
  const parsed = new URL(String(url || ''), globalThis.location?.href || 'https://zt.ai.invalid')
  if (parsed.protocol !== 'https:') throw new Error('音频地址必须使用 HTTPS')
  return parsed.href
}

function canUseAudioAnalyser(url) {
  const pageOrigin = String(globalThis.location?.origin || '').trim()
  if (!pageOrigin || pageOrigin === 'null') return false
  try { return new URL(url).origin === pageOrigin } catch { return false }
}

export function createVoicePlayback({ audioFactory = () => new Audio(), audioContextFactory = globalThis.AudioContext || globalThis.webkitAudioContext, onStateChange = () => {} } = {}) {
  let audio = null
  let context = null
  let analyser = null
  let source = null
  const notify = status => onStateChange({ status, analyser })
  const onEnded = () => notify('idle')
  const onError = () => notify('error')
  const onPause = () => notify('paused')
  const onPlay = () => {}
  const onPlaying = () => notify('speaking')
  const detach = () => {
    if (!audio) return
    audio.pause?.()
    audio.removeEventListener?.('ended', onEnded)
    audio.removeEventListener?.('error', onError)
    audio.removeEventListener?.('pause', onPause)
    audio.removeEventListener?.('play', onPlay)
    audio.removeEventListener?.('playing', onPlaying)
  }
  const waitForPlayableAudio = target => {
    if (!target || target.readyState === undefined || target.readyState >= 3) return Promise.resolve()
    return new Promise(resolve => {
      let settled = false
      const readyEvents = ['loadeddata', 'canplay', 'canplaythrough']
      const terminalEvents = ['error', 'abort']
      const finish = force => {
        if (settled) return
        if (!force && target.readyState !== undefined && target.readyState < 3) return
        settled = true
        clearTimeout(timer)
        readyEvents.forEach(event => target.removeEventListener?.(event, onReady))
        terminalEvents.forEach(event => target.removeEventListener?.(event, onTerminal))
        resolve()
      }
      const onReady = () => finish(false)
      const onTerminal = () => finish(true)
      const timer = setTimeout(() => finish(true), 5_000)
      readyEvents.forEach(event => target.addEventListener?.(event, onReady))
      terminalEvents.forEach(event => target.addEventListener?.(event, onTerminal))
    })
  }
  function load(url) {
    const safeUrl = secureAudioUrl(url)
    detach()
    audio = audioFactory()
    audio.preload = 'auto'
    audio.src = safeUrl
    audio.currentTime = 0
    audio.load?.()
    audio.addEventListener?.('ended', onEnded)
    audio.addEventListener?.('error', onError)
    audio.addEventListener?.('pause', onPause)
    audio.addEventListener?.('play', onPlay)
    audio.addEventListener?.('playing', onPlaying)
    if (audioContextFactory && audioContextFactory.prototype && canUseAudioAnalyser(safeUrl)) {
      try {
        context = context || new audioContextFactory()
        analyser = context.createAnalyser()
        analyser.fftSize = 256
        source = context.createMediaElementSource(audio)
        source.connect(analyser)
        analyser.connect(context.destination)
      } catch { analyser = null; source = null }
    }
    notify('ready')
    return { status: 'ready', audio, analyser }
  }
  async function play() {
    if (!audio) return { status: 'unavailable', error: '还没有可播放的语音' }
    const target = audio
    try {
      await waitForPlayableAudio(target)
      if (target !== audio) return { status: 'idle' }
      if (audio.ended) audio.currentTime = 0
      const playPromise = audio.play()
      if (context?.resume) await context.resume()
      await playPromise
      notify('speaking')
      return { status: 'speaking' }
    }
    catch (error) { notify('blocked'); return { status: 'blocked', error: error.message || '需要点击播放' } }
  }
  function pause() { audio?.pause?.(); notify('paused'); return { status: 'paused' } }
  function stop() { if (audio) { audio.pause?.(); audio.currentTime = 0 }; notify('idle'); return { status: 'idle' } }
  function dispose() { detach(); source?.disconnect?.(); if (context?.close) void context.close(); audio = null; context = null; source = null; analyser = null }
  return { load, play, pause, stop, dispose, attachAnalyser: () => analyser }
}

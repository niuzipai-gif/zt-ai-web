const RECORDER_MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

export function chooseRecorderMime(isTypeSupported = () => false) {
  return RECORDER_MIMES.find(type => { try { return Boolean(isTypeSupported(type)) } catch { return false } }) || ''
}

function stopTracks(stream) { stream?.getTracks?.().forEach(track => track.stop?.()) }

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

export function createVoiceRecognition({ language = 'zh', recognitionFactory = defaultRecognitionFactory(), bridge = globalThis.ztaiAndroidVoice, onTranscript = () => {}, onError = () => {} } = {}) {
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
      const locale = recognitionLanguage(language)
      if (locale) recognition.lang = locale
      recognition.continuous = true
      recognition.interimResults = true
      recognition.maxAlternatives = 1
      recognition.onresult = event => {
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
      recognition.onerror = event => handleError(event?.error || '语音识别暂时不可用')
      recognition.start()
      listening = true
      return { status: 'listening', mode: 'browser' }
    } catch (error) { recognition = null; return unavailable(error?.message || '语音识别启动失败') }
  }
  function stop() {
    if (bridge?.stop && listening) { try { bridge.stop() } catch {} }
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
  const onPlay = () => notify('speaking')
  const detach = () => {
    if (!audio) return
    audio.pause?.()
    audio.removeEventListener?.('ended', onEnded)
    audio.removeEventListener?.('error', onError)
    audio.removeEventListener?.('pause', onPause)
    audio.removeEventListener?.('play', onPlay)
  }
  function load(url) {
    const safeUrl = secureAudioUrl(url)
    detach()
    audio = audioFactory()
    audio.preload = 'auto'
    audio.src = safeUrl
    audio.addEventListener?.('ended', onEnded)
    audio.addEventListener?.('error', onError)
    audio.addEventListener?.('pause', onPause)
    audio.addEventListener?.('play', onPlay)
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
    try { const playPromise = audio.play(); if (context?.resume) await context.resume(); await playPromise; notify('speaking'); return { status: 'speaking' } }
    catch (error) { notify('blocked'); return { status: 'blocked', error: error.message || '需要点击播放' } }
  }
  function pause() { audio?.pause?.(); notify('paused'); return { status: 'paused' } }
  function stop() { if (audio) { audio.pause?.(); audio.currentTime = 0 }; notify('idle'); return { status: 'idle' } }
  function dispose() { detach(); source?.disconnect?.(); if (context?.close) void context.close(); audio = null; context = null; source = null; analyser = null }
  return { load, play, pause, stop, dispose, attachAnalyser: () => analyser }
}

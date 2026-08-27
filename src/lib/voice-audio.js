const RECORDER_MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
const MAX_TAKE_MS = 90_000

export function chooseRecorderMime(isTypeSupported = () => false) {
  return RECORDER_MIMES.find(type => {
    try { return Boolean(isTypeSupported(type)) } catch { return false }
  }) || ''
}

function defaultMediaDevices() {
  return globalThis.navigator?.mediaDevices || null
}

function defaultRecorderFactory() {
  const Recorder = globalThis.MediaRecorder
  return Recorder ? (stream, options) => new Recorder(stream, options) : null
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

export function mergeVoiceTranscript(stableText = '', nextText = '', isFinal = false) {
  const stable = String(stableText || '').trim()
  const next = String(nextText || '').trim()
  if (!next) return { stable, display: stable }
  const display = `${stable} ${next}`.trim()
  return { stable: isFinal ? display : stable, display }
}

export function formatVoiceRecognitionError(error, copy = {}) {
  const code = String(error || '').trim().toLowerCase()
  if (code === 'service-not-allowed' || code === 'language-not-supported') return copy.voiceBrowserUnsupported || copy.voiceUnavailable || '当前浏览器不提供语音识别，请改用 Safari、安卓 App 或桌面端。'
  if (code === 'not-allowed' || code === 'permission-denied' || code.includes('permission')) return copy.voicePermissionDenied || copy.voiceUnavailable || '麦克风或语音识别权限未开启。'
  if (code === 'network') return copy.voiceNetworkError || copy.voiceUnavailable || '语音识别网络连接失败，请检查网络后重试。'
  return String(error || copy.voiceUnavailable || '语音识别暂时不可用').trim()
}

function stopTracks(stream) {
  stream?.getTracks?.().forEach(track => track.stop?.())
}

export function createVoiceAudioController({ mediaDevices = defaultMediaDevices(), recorderFactory = defaultRecorderFactory(), audioContextFactory = globalThis.AudioContext || globalThis.webkitAudioContext, now = () => Date.now(), maxTakeMs = MAX_TAKE_MS } = {}) {
  let recorder = null
  let stream = null
  let audioContext = null
  let analyser = null
  let timer = null
  let startedAt = 0
  let chunks = []

  const unavailable = error => ({ status: 'unavailable', error: String(error || '当前设备不支持语音输入') })
  const closeAudioContext = () => { if (audioContext?.close) void audioContext.close(); audioContext = null; analyser = null }
  const clear = () => { if (timer) clearTimeout(timer); timer = null; stopTracks(stream); stream = null; recorder = null; chunks = []; closeAudioContext() }

  async function start() {
    if (!mediaDevices?.getUserMedia || !recorderFactory) return unavailable('当前设备不支持语音输入')
    await cancel()
    try {
      stream = await mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      const isTypeSupported = globalThis.MediaRecorder?.isTypeSupported?.bind(globalThis.MediaRecorder) || (() => false)
      const mimeType = chooseRecorderMime(isTypeSupported)
      recorder = recorderFactory(stream, mimeType ? { mimeType } : undefined)
      chunks = []
      recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data) }
      recorder.start?.()
      startedAt = now()
      if (audioContextFactory && stream.getAudioTracks?.().length) {
        audioContext = new audioContextFactory()
        analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        audioContext.createMediaStreamSource(stream).connect(analyser)
      }
      timer = setTimeout(() => { void stop() }, maxTakeMs)
      return { status: 'recording', stream, analyser, mimeType: recorder.mimeType || mimeType }
    } catch (error) {
      clear()
      return unavailable(error?.name === 'NotAllowedError' ? '麦克风权限未开启' : error?.message || '麦克风暂时不可用')
    }
  }

  function stop() {
    if (!recorder) return Promise.resolve(unavailable('当前没有正在进行的录音'))
    const activeRecorder = recorder
    const mimeType = activeRecorder.mimeType || 'audio/webm'
    return new Promise(resolve => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        const blob = new Blob(chunks, { type: mimeType })
        const durationMs = Math.max(0, now() - startedAt)
        clear()
        resolve({ status: 'ready', blob, durationMs, mimeType })
      }
      activeRecorder.onstop = finish
      try { activeRecorder.state === 'inactive' ? finish() : activeRecorder.stop() } catch (error) { clear(); resolve(unavailable(error.message || '录音停止失败')) }
    })
  }

  async function cancel() {
    if (!recorder && !stream) return { status: 'idle' }
    try { recorder?.stop?.() } catch {}
    clear()
    return { status: 'cancelled' }
  }

  function dispose() { void cancel(); closeAudioContext() }
  return { start, stop, cancel, dispose, getAnalyser: () => analyser }
}

export function createVoiceRecognition({ language = 'zh', recognitionFactory = defaultRecognitionFactory(), bridge = globalThis.ztaiAndroidVoice, onTranscript = () => {}, onError = () => {}, onEnd = () => {} } = {}) {
  let recognition = null
  let listening = false
  const bridgeCallbacks = {
    result: globalThis.__ztaiAndroidVoiceOnResult,
    error: globalThis.__ztaiAndroidVoiceOnError,
  }

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
      try {
        installBridgeCallbacks()
        bridge.start(recognitionLanguage(language))
        listening = true
        return { status: 'listening', mode: 'android' }
      } catch (error) {
        restoreBridgeCallbacks()
        return unavailable(error?.message || '安卓语音识别暂时不可用')
      }
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
      recognition.onend = () => onEnd()
      recognition.start()
      listening = true
      return { status: 'listening', mode: 'browser' }
    } catch (error) {
      recognition = null
      return unavailable(error?.message || '语音识别启动失败')
    }
  }

  function stop() {
    if (bridge?.stop && listening) { try { bridge.stop() } catch {} }
    try { recognition?.stop?.() } catch {}
    recognition = null
    listening = false
    restoreBridgeCallbacks()
    return { status: 'stopped' }
  }

  function dispose() { return stop() }
  return { start, stop, dispose, isListening: () => listening }
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
  const detach = () => {
    if (!audio) return
    audio.pause?.()
    audio.removeEventListener?.('ended', onEnded)
    audio.removeEventListener?.('error', onError)
    audio.removeEventListener?.('pause', onPause)
    audio.removeEventListener?.('play', onPlay)
  }
  const onEnded = () => notify('idle')
  const onError = () => notify('error')
  const onPause = () => notify('paused')
  const onPlay = () => notify('speaking')

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
  return { load, play, pause, stop, attachAnalyser: () => analyser, dispose }
}

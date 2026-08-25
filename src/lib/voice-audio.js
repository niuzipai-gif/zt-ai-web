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
    const activeStream = stream
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
      activeRecorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data) }
      activeRecorder.onstop = finish
      try { activeRecorder.state === 'inactive' ? finish() : activeRecorder.stop() } catch (error) { clear(); resolve(unavailable(error.message || '录音停止失败')) }
      stopTracks(activeStream)
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

function secureAudioUrl(url) {
  const parsed = new URL(String(url || ''), globalThis.location?.href || 'https://zt.ai.invalid')
  if (parsed.protocol !== 'https:') throw new Error('音频地址必须使用 HTTPS')
  return parsed.href
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
    audio.addEventListener?.('ended', onEnded)
    audio.addEventListener?.('error', onError)
    audio.addEventListener?.('pause', onPause)
    audio.addEventListener?.('play', onPlay)
    if (audioContextFactory && audioContextFactory.prototype) {
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
    try { if (context?.resume) await context.resume(); await audio.play(); notify('speaking'); return { status: 'speaking' } }
    catch (error) { notify('blocked'); return { status: 'blocked', error: error.message || '需要点击播放' } }
  }

  function pause() { audio?.pause?.(); notify('paused'); return { status: 'paused' } }
  function stop() { if (audio) { audio.pause?.(); audio.currentTime = 0 }; notify('idle'); return { status: 'idle' } }
  function dispose() { detach(); source?.disconnect?.(); if (context?.close) void context.close(); audio = null; context = null; source = null; analyser = null }
  return { load, play, pause, stop, attachAnalyser: () => analyser, dispose }
}

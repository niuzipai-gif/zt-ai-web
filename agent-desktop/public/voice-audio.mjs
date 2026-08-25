const RECORDER_MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

export function chooseRecorderMime(isTypeSupported = () => false) {
  return RECORDER_MIMES.find(type => { try { return Boolean(isTypeSupported(type)) } catch { return false } }) || ''
}

function stopTracks(stream) { stream?.getTracks?.().forEach(track => track.stop?.()) }

export function createVoiceAudioController({ mediaDevices = globalThis.navigator?.mediaDevices || null, recorderFactory = globalThis.MediaRecorder ? (stream, options) => new globalThis.MediaRecorder(stream, options) : null } = {}) {
  let recorder = null
  let stream = null
  let chunks = []
  const unavailable = error => ({ status: 'unavailable', error: String(error || '当前设备不支持语音输入') })
  async function start() {
    if (!mediaDevices?.getUserMedia || !recorderFactory) return unavailable('当前设备不支持语音输入')
    try {
      stream = await mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      const mimeType = chooseRecorderMime(globalThis.MediaRecorder?.isTypeSupported?.bind(globalThis.MediaRecorder) || (() => false))
      recorder = recorderFactory(stream, mimeType ? { mimeType } : undefined)
      chunks = []
      return { status: 'recording', stream, analyser: null, mimeType: recorder.mimeType || mimeType }
    } catch (error) { stopTracks(stream); stream = null; recorder = null; return unavailable(error?.message || '麦克风暂时不可用') }
  }
  function stop() {
    if (!recorder) return Promise.resolve(unavailable('当前没有正在进行的录音'))
    const active = recorder
    return new Promise(resolve => {
      active.ondataavailable = event => { if (event.data?.size) chunks.push(event.data) }
      active.onstop = () => { const blob = new Blob(chunks, { type: active.mimeType || 'audio/webm' }); stopTracks(stream); recorder = null; stream = null; chunks = []; resolve({ status: 'ready', blob, durationMs: 0, mimeType: blob.type }) }
      try { active.state === 'inactive' ? active.onstop() : active.stop() } catch (error) { resolve(unavailable(error.message || '录音停止失败')) }
    })
  }
  async function cancel() { try { recorder?.stop?.() } catch {}; stopTracks(stream); recorder = null; stream = null; chunks = []; return { status: 'cancelled' } }
  return { start, stop, cancel, dispose: cancel, getAnalyser: () => null }
}

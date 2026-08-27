const STATUSES = new Set(['idle', 'listening', 'processing', 'speaking', 'error'])

export function createVoiceState() {
  return { status: 'idle', transcript: '', error: '', audioUrl: '' }
}

export async function startVoiceCapture({ recognition, recorder }) {
  let recognitionResult
  try {
    recognitionResult = recognition?.start?.()
  } catch (error) {
    return { status: 'unavailable', error: error?.message || '语音识别启动失败' }
  }
  if (recognitionResult?.status !== 'listening') return recognitionResult || { status: 'unavailable', error: '当前设备没有可用的语音识别服务' }
  let recordingResult
  try {
    recordingResult = await recorder?.start?.()
  } catch (error) {
    recognition?.stop?.()
    return { status: 'unavailable', error: error?.message || '麦克风暂时不可用' }
  }
  if (recordingResult?.status !== 'recording') recognition?.stop?.()
  return recordingResult || { status: 'unavailable', error: '当前设备无法使用麦克风' }
}

function idleState() {
  return createVoiceState()
}

export function transitionVoiceState(current, event = {}) {
  const state = { ...createVoiceState(), ...(current || {}) }
  if (!STATUSES.has(state.status)) return createVoiceState()
  const type = String(event.type || '')
  if (type === 'reset' || type === 'cancel') return idleState()
  if (type === 'fail') {
    const error = String(event.error || '语音暂时不可用').trim()
    return { ...state, status: 'error', error: error || '语音暂时不可用', audioUrl: '' }
  }
  if (type === 'start-listening' && (state.status === 'idle' || state.status === 'error')) {
    return { status: 'listening', transcript: '', error: '', audioUrl: '' }
  }
  if (type === 'update-transcript' && state.status === 'listening') {
    return { ...state, transcript: String(event.transcript || '').trim() }
  }
  if (type === 'finish-listening' && state.status === 'listening') {
    return { status: 'processing', transcript: String(event.transcript || '').trim(), error: '', audioUrl: '' }
  }
  if (type === 'start-speaking' && state.status === 'processing') {
    const audioUrl = String(event.audioUrl || '').trim()
    if (!/^https:\/\//i.test(audioUrl)) return state
    return { ...state, status: 'speaking', audioUrl, error: '' }
  }
  if (type === 'finish-speaking' && state.status === 'speaking') return idleState()
  return state
}

export { STATUSES }

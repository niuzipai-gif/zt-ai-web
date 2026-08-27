const STATUSES = new Set(['idle', 'listening', 'processing', 'ready', 'speaking', 'blocked', 'error'])
const GREETING_STATUSES = new Set(['idle', 'loading', 'ready', 'speaking', 'blocked', 'error'])

export function createVoiceState() {
  return { status: 'idle', transcript: '', error: '', audioUrl: '' }
}

export function createVoiceGreetingState(text = '') {
  return { status: 'idle', text: String(text || '').trim(), audioUrl: '', error: '' }
}

export function transitionVoiceGreeting(current, event = {}) {
  const state = { ...createVoiceGreetingState(), ...(current || {}) }
  if (!GREETING_STATUSES.has(state.status)) return createVoiceGreetingState(state.text)
  const type = String(event.type || '')
  if (type === 'reset') return createVoiceGreetingState(state.text)
  if (type === 'start') return { ...state, status: 'loading', text: String(event.text || state.text).trim(), audioUrl: '', error: '' }
  if (type === 'ready') {
    const audioUrl = String(event.audioUrl || '').trim()
    if (!/^https:\/\//i.test(audioUrl)) return { ...state, status: 'error', error: '开场问候没有可播放的音频。', audioUrl: '' }
    return { ...state, status: 'ready', audioUrl, error: '' }
  }
  if (type === 'start-speaking' && (state.status === 'ready' || state.status === 'blocked')) return { ...state, status: 'speaking', error: '' }
  if (type === 'finish-speaking' && state.status === 'speaking') return createVoiceGreetingState(state.text)
  if (type === 'pause' && state.status === 'speaking') return { ...state, status: 'ready' }
  if (type === 'blocked' && (state.status === 'ready' || state.status === 'blocked')) return { ...state, status: 'blocked', error: String(event.error || '请点击播放按钮重试。').trim() }
  if (type === 'fail') return { ...state, status: 'error', error: String(event.error || '开场问候暂时无法播放。').trim(), audioUrl: state.audioUrl }
  return state
}

export function detectVoiceLanguage(text, fallback = 'zh') {
  const value = String(text || '').trim()
  const normalizedFallback = ['zh', 'en', 'ja'].includes(String(fallback || '').toLowerCase()) ? String(fallback).toLowerCase() : 'zh'
  if (!value) return normalizedFallback
  if (/[\u3040-\u30ff]/u.test(value)) return 'ja'
  const latin = (value.match(/[A-Za-z]/g) || []).length
  const han = (value.match(/[\u3400-\u9fff]/g) || []).length
  if (latin >= 2 && latin >= han) return 'en'
  if (han > 0) return 'zh'
  return normalizedFallback
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

export function transitionVoiceState(current, event = {}) {
  const state = { ...createVoiceState(), ...(current || {}) }
  if (!STATUSES.has(state.status)) return createVoiceState()
  const type = String(event.type || '')
  if (type === 'reset' || type === 'cancel') return createVoiceState()
  if (type === 'fail') return { ...state, status: 'error', error: String(event.error || '语音暂时不可用').trim() || '语音暂时不可用', audioUrl: '' }
  if (type === 'start-listening' && (state.status === 'idle' || state.status === 'error')) return { status: 'listening', transcript: '', error: '', audioUrl: '' }
  if (type === 'finish-listening' && state.status === 'listening') return { status: 'processing', transcript: String(event.transcript || '').trim(), error: '', audioUrl: '' }
  if (type === 'start-processing' && ['idle', 'error', 'processing', 'ready', 'blocked'].includes(state.status)) {
    return { status: 'processing', transcript: String(event.transcript || '').trim(), error: '', audioUrl: '' }
  }
  if (type === 'ready' && state.status === 'processing') {
    const audioUrl = String(event.audioUrl || '').trim()
    if (!/^https:\/\//i.test(audioUrl)) return { ...state, status: 'error', error: '没有可播放的语音回答。', audioUrl: '' }
    return { ...state, status: 'ready', audioUrl, error: '' }
  }
  if (type === 'start-speaking' && ['processing', 'ready', 'blocked'].includes(state.status)) {
    const audioUrl = String(event.audioUrl || '').trim()
    if (!/^https:\/\//i.test(audioUrl) && !state.audioUrl) return state
    return { ...state, status: 'speaking', audioUrl: audioUrl || state.audioUrl, error: '' }
  }
  if (type === 'blocked' && ['processing', 'ready', 'blocked'].includes(state.status)) {
    return { ...state, status: 'blocked', error: String(event.error || '回答已准备好，请点击播放按钮。').trim() }
  }
  if (type === 'finish-speaking' && state.status === 'speaking') return createVoiceState()
  return state
}

export { STATUSES }

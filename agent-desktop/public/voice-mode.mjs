const STATUSES = new Set(['idle', 'listening', 'processing', 'speaking', 'error'])

export function createVoiceState() {
  return { status: 'idle', transcript: '', error: '', audioUrl: '' }
}

export function transitionVoiceState(current, event = {}) {
  const state = { ...createVoiceState(), ...(current || {}) }
  if (!STATUSES.has(state.status)) return createVoiceState()
  const type = String(event.type || '')
  if (type === 'reset' || type === 'cancel') return createVoiceState()
  if (type === 'fail') return { ...state, status: 'error', error: String(event.error || '语音暂时不可用').trim() || '语音暂时不可用', audioUrl: '' }
  if (type === 'start-listening' && (state.status === 'idle' || state.status === 'error')) return { status: 'listening', transcript: '', error: '', audioUrl: '' }
  if (type === 'finish-listening' && state.status === 'listening') return { status: 'processing', transcript: String(event.transcript || '').trim(), error: '', audioUrl: '' }
  if (type === 'start-speaking' && state.status === 'processing') {
    const audioUrl = String(event.audioUrl || '').trim()
    return /^https:\/\//i.test(audioUrl) ? { ...state, status: 'speaking', audioUrl, error: '' } : state
  }
  if (type === 'finish-speaking' && state.status === 'speaking') return createVoiceState()
  return state
}

export { STATUSES }

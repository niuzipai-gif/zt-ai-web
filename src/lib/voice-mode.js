const STATUSES = new Set(['idle', 'listening', 'processing', 'speaking', 'error'])

export function createVoiceState() {
  return { status: 'idle', transcript: '', error: '', audioUrl: '' }
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

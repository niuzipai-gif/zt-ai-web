export const CHAT_SESSION_KEY = 'zt-ai:public-chat:v2'

function getItem(storage, key) {
  return typeof storage.getItem === 'function' ? storage.getItem(key) : storage.get(key)
}

function setItem(storage, key, value) {
  if (typeof storage.setItem === 'function') storage.setItem(key, value)
  else storage.set(key, value)
}

export function createSessionState(messages = [], model = 'MINIMAX') {
  return { version: 2, model, messages, updatedAt: Date.now() }
}

export function loadSessionState(storage = globalThis.localStorage) {
  try {
    const raw = getItem(storage, CHAT_SESSION_KEY)
    if (!raw) return null
    const state = JSON.parse(raw)
    if (state?.version !== 2 || !Array.isArray(state.messages)) return null
    return state
  } catch {
    return null
  }
}

export function saveSessionState(storage = globalThis.localStorage, state) {
  try {
    const messages = (state.messages || []).map(message => ({
      ...message,
      content: Array.isArray(message.content) ? message.content.filter(part => part?.type !== 'image_url') : message.content,
      attachments: Array.isArray(message.attachments) ? message.attachments.map(({ preview, ...file }) => file) : message.attachments,
    }))
    setItem(storage, CHAT_SESSION_KEY, JSON.stringify({ ...state, messages, version: 2, updatedAt: Date.now() }))
  } catch { /* storage can be unavailable or full */ }
}

export function clearSessionState(storage = globalThis.localStorage) {
  if (typeof storage.removeItem === 'function') storage.removeItem(CHAT_SESSION_KEY)
  else storage.delete(CHAT_SESSION_KEY)
}

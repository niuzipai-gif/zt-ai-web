export const VISITOR_STATE_KEY = 'zt-ai:visitor-state:v3'
export const VISITOR_ID_KEY = 'zt-ai:visitor-id:v1'
export const LEGACY_CHAT_SESSION_KEY = 'zt-ai:public-chat:v2'
export const MAX_PERSISTED_IMAGE_DATA_URL_CHARS = 2_000_000

function getItem(storage, key) {
  return typeof storage.getItem === 'function' ? storage.getItem(key) : storage.get(key)
}

function setItem(storage, key, value) {
  if (typeof storage.setItem === 'function') storage.setItem(key, value)
  else storage.set(key, value)
}

function removeItem(storage, key) {
  if (typeof storage.removeItem === 'function') storage.removeItem(key)
  else storage.delete(key)
}

function hasItem(storage, key) {
  return Boolean(getItem(storage, key))
}

function randomToken() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 12)
  return Math.random().toString(36).slice(2, 14)
}

export function createVisitorId() {
  return `visitor-${Date.now().toString(36)}-${randomToken()}`
}

export function createSessionTitle(messages = []) {
  const firstUserMessage = messages.find(message => message?.role === 'user')
  const raw = String(firstUserMessage?.text || '').replace(/\s+/g, ' ').trim()
  return raw ? `${raw.slice(0, 28)}${raw.length > 28 ? '…' : ''}` : '新建聊天'
}

export function createChatSession({ id, messages = [], model = 'MINIMAX', title, createdAt = Date.now(), updatedAt = createdAt } = {}) {
  return {
    id: id || `chat-${Date.now().toString(36)}-${randomToken()}`,
    title: title || createSessionTitle(messages),
    model,
    messages: Array.isArray(messages) ? messages : [],
    createdAt,
    updatedAt,
  }
}

export function createVisitorState({ visitorId = createVisitorId(), sessions, activeSessionId } = {}) {
  const nextSessions = Array.isArray(sessions) && sessions.length ? sessions : [createChatSession()]
  return {
    version: 3,
    visitorId,
    activeSessionId: activeSessionId || nextSessions[0].id,
    sessions: nextSessions,
  }
}

export function getVisitorStateKey(visitorId) {
  return `${VISITOR_STATE_KEY}:${visitorId}`
}

function getOrCreateVisitorId(identityStorage) {
  try {
    const stored = getItem(identityStorage, VISITOR_ID_KEY)
    if (stored) return stored
    const visitorId = createVisitorId()
    setItem(identityStorage, VISITOR_ID_KEY, visitorId)
    return visitorId
  } catch {
    return createVisitorId()
  }
}

function normalizeSession(session) {
  const messages = Array.isArray(session?.messages) ? session.messages : []
  const createdAt = Number(session?.createdAt) || Date.now()
  return createChatSession({
    id: session?.id,
    title: session?.title || createSessionTitle(messages),
    model: session?.model || 'MINIMAX',
    messages,
    createdAt,
    updatedAt: Number(session?.updatedAt) || createdAt,
  })
}

function normalizeVisitorState(state) {
  if (!state || state.version !== 3 || typeof state.visitorId !== 'string' || !Array.isArray(state.sessions)) return null
  const sessions = state.sessions.map(normalizeSession)
  if (!sessions.length) return createVisitorState({ visitorId: state.visitorId })
  const activeSessionId = sessions.some(session => session.id === state.activeSessionId) ? state.activeSessionId : sessions[0].id
  return createVisitorState({ visitorId: state.visitorId, sessions, activeSessionId })
}

function migrateLegacyState(storage, defaultMessages = []) {
  try {
    const raw = getItem(storage, LEGACY_CHAT_SESSION_KEY)
    if (!raw) return null
    const legacy = JSON.parse(raw)
    if (legacy?.version !== 2 || !Array.isArray(legacy.messages)) return null
    return createVisitorState({
      sessions: [createChatSession({ messages: legacy.messages.length ? legacy.messages : defaultMessages, model: legacy.model || 'MINIMAX' })],
    })
  } catch {
    return null
  }
}

export function loadVisitorState(storage = globalThis.localStorage, defaultMessages = [], identityStorage = globalThis.sessionStorage) {
  const visitorId = getOrCreateVisitorId(identityStorage || storage)
  try {
    const raw = getItem(storage, getVisitorStateKey(visitorId))
    if (raw) {
      const state = normalizeVisitorState(JSON.parse(raw))
      if (state) return state
    }
    const migrated = migrateLegacyState(storage, defaultMessages)
    if (migrated) {
      migrated.visitorId = visitorId
      removeItem(storage, LEGACY_CHAT_SESSION_KEY)
      return migrated
    }
    return createVisitorState({ visitorId, sessions: [createChatSession({ messages: defaultMessages })] })
  } catch {
    return createVisitorState({ visitorId, sessions: [createChatSession({ messages: defaultMessages })] })
  }
}

function sanitizeMessage(message) {
  return {
    ...message,
    content: Array.isArray(message.content) ? message.content.filter(part => {
      if (part?.type !== 'image_url') return true
      const url = part.image_url?.url
      return typeof url === 'string'
        && /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(url)
        && url.length <= MAX_PERSISTED_IMAGE_DATA_URL_CHARS
    }) : message.content,
    attachments: Array.isArray(message.attachments) ? message.attachments.map(({ preview, ...file }) => file) : message.attachments,
  }
}

function sanitizeState(state) {
  const sessions = (state.sessions || []).map(session => ({
    ...session,
    title: session.title || createSessionTitle(session.messages),
    messages: (session.messages || []).map(sanitizeMessage),
  }))
  return { ...state, version: 3, sessions, updatedAt: Date.now() }
}

export function saveVisitorState(storage = globalThis.localStorage, state) {
  try { setItem(storage, getVisitorStateKey(state.visitorId), JSON.stringify(sanitizeState(state))) } catch { /* storage can be unavailable or full */ }
}

export function clearVisitorState(storage = globalThis.localStorage, visitorId) {
  if (visitorId) removeItem(storage, getVisitorStateKey(visitorId))
  removeItem(storage, LEGACY_CHAT_SESSION_KEY)
}

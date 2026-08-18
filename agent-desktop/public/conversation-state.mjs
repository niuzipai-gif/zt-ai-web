export const CHAT_WELCOME = Object.freeze([
  Object.freeze({ role: 'assistant', content: '你好，我是 ZT.AI。普通聊天模式下，我可以围绕你的项目、简历和产品想法进行交流。' }),
])

export function conversationStorageKeys(accountId) {
  const scope = encodeURIComponent(String(accountId || 'signed-out'))
  return {
    chats: `zt-ai:desktop-chats:${scope}`,
    active: `zt-ai:desktop-active-chat:${scope}`,
  }
}

function cleanMessage(message) {
  const role = message?.role === 'user' ? 'user' : 'assistant'
  const content = String(message?.content || '').trim()
  return content ? { role, content } : null
}

function titleFromMessages(messages, fallback = '新对话') {
  const firstUser = messages.find(message => message.role === 'user' && message.content.trim())
  return firstUser ? firstUser.content.trim().slice(0, 28) : fallback
}

export function createConversation(id, now = Date.now()) {
  return { id: String(id), title: '新对话', messages: CHAT_WELCOME.map(message => ({ ...message })), createdAt: now, updatedAt: now }
}

export function createEmptyConversation(id, now = Date.now()) {
  return { id: String(id), title: '新对话', messages: [], createdAt: now, updatedAt: now }
}

export function prependConversation(conversations, conversation, limit = 30) {
  const existing = normalizeConversations(conversations).filter(item => item.id !== conversation.id)
  return [conversation, ...existing].slice(0, Math.max(1, limit))
}

export function messageContentWithImages(text, attachments = []) {
  const content = [{ type: 'text', text: String(text || '') }]
  for (const attachment of Array.isArray(attachments) ? attachments.slice(0, 4) : []) {
    const url = String(attachment?.dataUrl || '')
    if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(url)) content.push({ type: 'image_url', image_url: { url } })
  }
  return content.length === 1 ? String(text || '') : content
}

export function addConversationMessage(conversation, message, now = Date.now()) {
  const clean = cleanMessage(message)
  if (!clean) return conversation
  const messages = [...conversation.messages, clean]
  return { ...conversation, title: titleFromMessages(messages, conversation.title), messages, updatedAt: now }
}

export function normalizeConversations(value) {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item?.id) return []
    const messages = Array.isArray(item.messages) ? item.messages.map(cleanMessage).filter(Boolean) : []
    return [{
      id: String(item.id),
      title: String(item.title || titleFromMessages(messages)),
      messages,
      createdAt: Number(item.createdAt) || Date.now(),
      updatedAt: Number(item.updatedAt) || Number(item.createdAt) || Date.now(),
    }]
  })
}

export function conversationTitle(conversation) {
  return titleFromMessages(conversation.messages, conversation.title)
}

function hasRealAssistantMessage(conversation) {
  return conversation.messages.some(message => message.role === 'assistant' && !CHAT_WELCOME.some(welcome => welcome.content === message.content))
}

export function mergeServerConversations(localValue, serverValue) {
  const local = normalizeConversations(localValue)
  const remote = normalizeConversations(serverValue)
  const merged = new Map(local.map(item => [item.id, item]))
  for (const incoming of remote) {
    const existing = merged.get(incoming.id)
    if (!existing) {
      merged.set(incoming.id, incoming)
      continue
    }
    const keepLocal = hasRealAssistantMessage(existing) && existing.messages.length >= incoming.messages.length
    merged.set(incoming.id, keepLocal ? existing : {
      ...existing,
      ...incoming,
      messages: incoming.messages.length >= existing.messages.length ? incoming.messages : existing.messages,
      title: incoming.title || existing.title,
      createdAt: Math.min(existing.createdAt, incoming.createdAt),
      updatedAt: Math.max(existing.updatedAt, incoming.updatedAt),
    })
  }
  return [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30)
}

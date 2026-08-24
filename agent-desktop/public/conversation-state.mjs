export const CHAT_WELCOME = Object.freeze([
  Object.freeze({ role: 'assistant', content: '你好，我是 ZT.AI。这里是 ZT.buddy 工作区：你可以直接交给我一个目标，我会先判断是回答、联网核验，还是在你授权的本机工作区执行。' }),
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
  const attachments = Array.isArray(message?.attachments) ? message.attachments.slice(0, 4).map(item => ({
    name: String(item?.name || '附件').slice(0, 160),
    type: String(item?.type || 'application/octet-stream').slice(0, 100),
    size: Number(item?.size) || 0,
    ...(item?.dataUrl ? { dataUrl: String(item.dataUrl).slice(0, 8_000_000) } : {}),
    ...(item?.text ? { text: String(item.text).slice(0, 20_000) } : {}),
    ...(item?.readError ? { readError: String(item.readError).slice(0, 300) } : {}),
  })) : []
  const sources = Array.isArray(message?.sources) ? message.sources.slice(0, 6).flatMap((item, index) => {
    const url = String(item?.url || '').trim()
    if (!/^https?:\/\//i.test(url)) return []
    return [{
      rank: Number(item?.rank) || index + 1,
      title: String(item?.title || '未命名来源').slice(0, 240),
      url: url.slice(0, 2_000),
      ...(item?.snippet ? { snippet: String(item.snippet).slice(0, 1_000) } : {}),
      ...(item?.fingerprint ? { fingerprint: String(item.fingerprint).slice(0, 1_000) } : {}),
    }]
  }) : []
  const mediaUrl = String(message?.media?.url || '').trim()
  const media = /^https?:\/\//i.test(mediaUrl) ? {
    kind: String(message?.media?.kind || '').toLowerCase() === 'video' ? 'video' : 'image',
    url: mediaUrl.slice(0, 2_000),
  } : null
  return content ? { role, content, ...(attachments.length ? { attachments } : {}), ...(sources.length ? { sources } : {}), ...(media ? { media } : {}) } : null
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
      agentContext: item.agentContext === true,
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
    merged.set(incoming.id, keepLocal ? {
      ...existing,
      agentContext: existing.agentContext === true || incoming.agentContext === true,
    } : {
      ...existing,
      ...incoming,
      agentContext: existing.agentContext === true || incoming.agentContext === true,
      messages: incoming.messages.length >= existing.messages.length ? incoming.messages : existing.messages,
      title: incoming.title || existing.title,
      createdAt: Math.min(existing.createdAt, incoming.createdAt),
      updatedAt: Math.max(existing.updatedAt, incoming.updatedAt),
    })
  }
  return [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30)
}

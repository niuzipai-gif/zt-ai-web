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

export const CHAT_MODELS = Object.freeze({
  get minimax() { return process.env.MINIMAX_TEXT_MODEL || 'MiniMax-M3' },
  get deepseek() { return process.env.DEEPSEEK_TEXT_MODEL || 'deepseek-v4-flash' },
})

export const MAX_MESSAGES = 24
export const MAX_MESSAGE_CHARS = 8000

export function normalizeChatRequest(body) {
  const model = String(body?.model || '').toLowerCase() === 'deepseek' ? 'deepseek' : 'minimax'
  const rawMessages = Array.isArray(body?.messages) ? body.messages : []
  const messages = rawMessages
    .slice(-MAX_MESSAGES)
    .filter(message => message && ['user', 'assistant', 'system'].includes(message.role))
    .map(message => ({ role: message.role, content: String(message.content || '').slice(0, MAX_MESSAGE_CHARS) }))
    .filter(message => message.content)
  if (!messages.length || !messages.some(message => message.role === 'user')) {
    throw new Error('至少需要一条用户消息')
  }
  return { model, messages }
}

export function isMediaIntent(text = '') {
  return /(?:生成|做一张|画一张|制作|帮我做|帮我生成|create|generate)[\s\S]{0,100}(?:图片|图像|海报|封面|背景图|视频|短片|image|video)/iu.test(text)
}

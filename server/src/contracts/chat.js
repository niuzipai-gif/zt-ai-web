export const CHAT_MODELS = Object.freeze({
  get minimax() { return process.env.MINIMAX_TEXT_MODEL || 'MiniMax-M3' },
  get deepseek() { return process.env.DEEPSEEK_TEXT_MODEL || 'deepseek-v4-flash' },
})

export const MAX_MESSAGES = 24
export const MAX_MESSAGE_CHARS = 8000
export const MAX_CONTENT_PARTS = 8
export const MAX_IMAGE_DATA_URL_CHARS = 7_000_000

export function contentToText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter(part => part?.type === 'text').map(part => String(part.text || '')).join('\n')
}

function normalizeContent(content) {
  if (typeof content === 'string') return content.slice(0, MAX_MESSAGE_CHARS)
  if (!Array.isArray(content)) return ''
  return content.slice(0, MAX_CONTENT_PARTS).map(part => {
    if (part?.type === 'text') return { type: 'text', text: String(part.text || '').slice(0, MAX_MESSAGE_CHARS) }
    if (part?.type === 'image_url' && typeof part.image_url?.url === 'string') {
      const url = part.image_url.url
      if (/^(?:https?:\/\/|data:image\/(?:png|jpe?g|webp|gif);base64,)/i.test(url) && url.length <= MAX_IMAGE_DATA_URL_CHARS) {
        return { type: 'image_url', image_url: { url } }
      }
    }
    return null
  }).filter(Boolean)
}

export function normalizeChatRequest(body) {
  const model = String(body?.model || '').toLowerCase() === 'deepseek' ? 'deepseek' : 'minimax'
  const rawMessages = Array.isArray(body?.messages) ? body.messages : []
  const messages = rawMessages
    .slice(-MAX_MESSAGES)
    .filter(message => message && ['user', 'assistant', 'system'].includes(message.role))
    .map(message => ({ role: message.role, content: normalizeContent(message.content) }))
    .filter(message => contentToText(message.content) || (Array.isArray(message.content) && message.content.some(part => part.type === 'image_url')))
  if (!messages.length || !messages.some(message => message.role === 'user')) {
    throw new Error('至少需要一条用户消息')
  }
  return { model, messages }
}

export function isMediaIntent(text = '') {
  return /(?:生成|做一张|画一张|制作|帮我做|帮我生成|create|generate)[\s\S]{0,100}(?:图片|图像|海报|封面|背景图|视频|短片|image|video)/iu.test(text)
}

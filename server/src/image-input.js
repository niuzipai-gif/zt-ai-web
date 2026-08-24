const IMAGE_PART_TYPE = 'image_url'
const IMAGE_REFERENCE = /(?:图片|图像|照片|截图|这张|这个|那个|看图|看这个|图中|图里|识别|辨认|是什么|哪家|品牌|型号|产品|物品|文字|内容|image|photo|picture|screenshot|identify|what(?:'s| is) this)/iu

function imageParts(content) {
  if (!Array.isArray(content)) return []
  return content.filter(part => part?.type === IMAGE_PART_TYPE && typeof part.image_url?.url === 'string')
}

function textFromContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter(part => part?.type === 'text').map(part => String(part.text || '')).join('\n')
}

export function hasImageContent(content) {
  return imageParts(content).length > 0
}

export function hasImageInput(messages = []) {
  return (Array.isArray(messages) ? messages : []).some(message => message?.role === 'user' && hasImageContent(message.content))
}

export function isImageIdentificationRequest(text = '') {
  return IMAGE_REFERENCE.test(String(text || '').trim())
}

export function buildImageVerificationQuery(inputText = '', visualHint = '') {
  const question = String(inputText || '')
    .replace(/\[附件：[^\]]+\]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 120)
  const hint = String(visualHint || '').replace(/\s+/gu, ' ').trim().slice(0, 140)
  if (!hint) return `图片识别核验：${question || '请识别图片中的具体对象'}`.slice(0, 240)
  return `图片识别核验：${hint}；用户问题：${question || '请识别图片中的具体对象'}`.slice(0, 240)
}

export function carryForwardImages(messages = []) {
  const items = Array.isArray(messages) ? messages : []
  const latestUserIndex = items.findLastIndex(message => message?.role === 'user')
  if (latestUserIndex < 0 || hasImageContent(items[latestUserIndex]?.content)) return items
  if (!isImageIdentificationRequest(textFromContent(items[latestUserIndex]?.content))) return items

  const previousImages = items
    .slice(0, latestUserIndex)
    .toReversed()
    .flatMap(message => imageParts(message?.content))
    .slice(0, 2)
  if (!previousImages.length) return items

  const latestContent = items[latestUserIndex].content
  const content = typeof latestContent === 'string'
    ? [{ type: 'text', text: latestContent }, ...previousImages]
    : [...(Array.isArray(latestContent) ? latestContent : []), ...previousImages]
  return items.map((message, index) => index === latestUserIndex ? { ...message, content } : message)
}

export function latestImage(messages = []) {
  const items = Array.isArray(messages) ? messages : []
  for (const message of items.toReversed()) {
    const part = imageParts(message?.content)[0]
    if (part) return part
  }
  return null
}

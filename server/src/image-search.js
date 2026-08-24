const MAX_IMAGE_RESULTS = 24
const DEFAULT_TIMEOUT_MS = 25_000
const GOOGLE_VISION_BASE_URL = 'https://vision.googleapis.com/v1'
const TINEYE_BASE_URL = 'https://api.tineye.com/rest'

function cleanText(value, limit = 420) {
  return String(value || '').replace(/\s+/gu, ' ').trim().slice(0, limit)
}

function validUrl(value) {
  const url = String(value || '').trim()
  return /^https?:\/\//iu.test(url) ? url : ''
}

function parseDataUrl(value) {
  const match = String(value || '').match(/^data:([^;,]+)?;base64,([\da-z+/=]+)$/iu)
  if (!match) throw new Error('图片不是可检索的 base64 数据')
  return { mimeType: match[1] || 'application/octet-stream', base64: match[2] }
}

function errorMessage(provider, response) {
  return `${provider} 图片检索返回 ${response.status}`
}

export function resolveImageSearchConfig({ env = process.env } = {}) {
  return {
    googleApiKey: String(env.ZT_AI_GOOGLE_VISION_API_KEY || env.GOOGLE_CLOUD_VISION_API_KEY || ''),
    googleBaseUrl: String(env.ZT_AI_GOOGLE_VISION_BASE_URL || GOOGLE_VISION_BASE_URL).replace(/\/$/u, ''),
    tineyeApiKey: String(env.ZT_AI_TINEYE_API_KEY || env.TINEYE_API_KEY || ''),
    tineyeBaseUrl: String(env.ZT_AI_TINEYE_BASE_URL || TINEYE_BASE_URL).replace(/\/$/u, ''),
  }
}

function resolvedConfig(config = {}, provider) {
  const defaults = resolveImageSearchConfig()
  if (provider === 'google') return {
    apiKey: String(config.apiKey || config.googleApiKey || defaults.googleApiKey),
    baseUrl: String(config.baseUrl || config.googleBaseUrl || defaults.googleBaseUrl).replace(/\/$/u, ''),
  }
  return {
    apiKey: String(config.apiKey || config.tineyeApiKey || defaults.tineyeApiKey),
    baseUrl: String(config.baseUrl || config.tineyeBaseUrl || defaults.tineyeBaseUrl).replace(/\/$/u, ''),
  }
}

export function normalizeGoogleWebDetection(body, limit = MAX_IMAGE_RESULTS) {
  const detection = body?.responses?.[0]?.webDetection || {}
  const entities = (Array.isArray(detection.webEntities) ? detection.webEntities : [])
    .map(item => ({ description: cleanText(item?.description, 180), score: Number(item?.score) || 0 }))
    .filter(item => item.description)
    .slice(0, 12)
  const groups = [
    ['pagesWithMatchingImages', 'image-match-page', item => item?.pageTitle || '包含匹配图片的网页'],
    ['fullMatchingImages', 'image-full-match', () => '完整匹配图片'],
    ['partialMatchingImages', 'image-partial-match', () => '部分匹配图片'],
    ['visuallySimilarImages', 'image-similar', () => '视觉相似图片'],
  ]
  const results = []
  for (const [field, evidenceType, title] of groups) {
    for (const item of Array.isArray(detection[field]) ? detection[field] : []) {
      const url = validUrl(item?.url)
      if (!url) continue
      results.push({
        rank: results.length + 1,
        title: cleanText(title(item), 200),
        url,
        snippet: cleanText(item?.pageTitle || item?.description || `Google Web Detection：${evidenceType}`, 420),
        provider: 'google-vision',
        evidenceType,
      })
      if (results.length >= Math.max(1, Number(limit) || MAX_IMAGE_RESULTS)) break
    }
    if (results.length >= Math.max(1, Number(limit) || MAX_IMAGE_RESULTS)) break
  }
  return { provider: 'google-vision', entities, results }
}

export function normalizeTinEye(body, limit = MAX_IMAGE_RESULTS) {
  const rawMatches = Array.isArray(body?.results?.matches)
    ? body.results.matches
    : Array.isArray(body?.matches) ? body.matches : []
  const results = []
  for (const match of rawMatches) {
    const backlinks = Array.isArray(match?.backlinks) ? match.backlinks : []
    for (const backlink of backlinks) {
      const url = validUrl(backlink?.url || backlink?.backlink)
      if (!url) continue
      results.push({
        rank: results.length + 1,
        title: cleanText(backlink?.title || match?.domain || 'TinEye 匹配页面', 200),
        url,
        snippet: cleanText(`TinEye 匹配分数：${Number(match?.score ?? match?.match_score) || 0}`, 420),
        provider: 'tineye',
        evidenceType: 'image-reverse-match',
      })
      if (results.length >= Math.max(1, Number(limit) || MAX_IMAGE_RESULTS)) return { provider: 'tineye', results }
    }
  }
  return { provider: 'tineye', results }
}

export async function searchGoogleWebDetection({ imageDataUrl, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, config = {} } = {}) {
  const resolved = resolvedConfig(config, 'google')
  if (!resolved.apiKey) throw new Error('未配置 Google Vision 图片检索')
  const { base64 } = parseDataUrl(imageDataUrl)
  const response = await fetchImpl(`${resolved.baseUrl}/images:annotate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': resolved.apiKey },
    body: JSON.stringify({ requests: [{ image: { content: base64 }, features: [{ type: 'WEB_DETECTION', maxResults: MAX_IMAGE_RESULTS }] }] }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(errorMessage('Google Vision', response))
  const body = await response.json()
  if (body?.responses?.[0]?.error) throw new Error('Google Vision 图片检索失败')
  return normalizeGoogleWebDetection(body)
}

export async function searchTinEye({ imageDataUrl, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, config = {} } = {}) {
  const resolved = resolvedConfig(config, 'tineye')
  if (!resolved.apiKey) throw new Error('未配置 TinEye 图片检索')
  const { mimeType, base64 } = parseDataUrl(imageDataUrl)
  const blob = new Blob([Buffer.from(base64, 'base64')], { type: mimeType })
  const form = new FormData()
  form.append('image_upload', blob, `zt-ai-image.${mimeType.split('/')[1] || 'bin'}`)
  form.append('limit', String(MAX_IMAGE_RESULTS))
  const response = await fetchImpl(`${resolved.baseUrl}/search/`, {
    method: 'POST',
    headers: { 'x-api-key': resolved.apiKey },
    body: form,
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(errorMessage('TinEye', response))
  const body = await response.json()
  if (Number(body?.code) && Number(body.code) !== 200) throw new Error('TinEye 图片检索失败')
  return normalizeTinEye(body)
}

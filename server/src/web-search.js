const DEFAULT_SEARCH_RESULTS = 6
export const MAX_SEARCH_RESULTS = 24
const DEFAULT_WEB_TIMEOUT_MS = 25_000
const DUCKDUCKGO_HTML_URL = 'https://html.duckduckgo.com/html/'

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")
}

function cleanFingerprint(value) {
  return String(value || '')
    .replace(/^\s*#{1,6}\s+.*$/gm, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/[*_>`#~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 260)
}

export function resolveWebSearchConfig({ env = process.env } = {}) {
  const baseUrl = String(env.ZT_AI_FIRECRAWL_BASE_URL || env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev/v2').replace(/\/$/, '')
  const apiKey = String(env.ZT_AI_FIRECRAWL_API_KEY || env.FIRECRAWL_API_KEY || '')
  return { baseUrl, apiKey }
}

function boundedLimit(value, fallback = DEFAULT_SEARCH_RESULTS) {
  return Math.min(MAX_SEARCH_RESULTS, Math.max(1, Number(value) || fallback))
}

export function parseSearchResults(html, limit = DEFAULT_SEARCH_RESULTS) {
  const links = [...String(html || '').matchAll(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  return links.slice(0, boundedLimit(limit)).map((match, index) => {
    const href = decodeHtml(match[1]).replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/i, '')
    const url = decodeURIComponent(href).split('&rut=')[0]
    const title = decodeHtml(match[2]).replace(/<[^>]+>/g, '').trim()
    const after = String(html).slice(match.index + match[0].length)
    const snippetMatch = after.match(/<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)
    const snippet = decodeHtml(snippetMatch?.[1] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    return { rank: index + 1, title, url, snippet, fingerprint: cleanFingerprint(snippet) }
  }).filter(item => item.title && /^https?:\/\//i.test(item.url))
}

export function normalizeFirecrawlSearch(body, limit = DEFAULT_SEARCH_RESULTS) {
  const raw = Array.isArray(body?.data?.web) ? body.data.web : Array.isArray(body?.data) ? body.data : []
  return raw.slice(0, boundedLimit(limit)).map((item, index) => ({
    rank: index + 1,
    title: String(item?.title || item?.metadata?.title || '未命名页面').trim(),
    url: String(item?.url || item?.metadata?.sourceURL || '').trim(),
    snippet: String(item?.description || item?.metadata?.description || '').replace(/\s+/g, ' ').trim().slice(0, 420),
    fingerprint: cleanFingerprint(item?.markdown || item?.description || item?.metadata?.description || ''),
  })).filter(item => /^https?:\/\//i.test(item.url))
}

async function firecrawlRequest(pathname, body, { fetchImpl = fetch, timeoutMs = DEFAULT_WEB_TIMEOUT_MS, config } = {}) {
  const resolvedConfig = config || resolveWebSearchConfig()
  const authorization = resolvedConfig.apiKey ? { authorization: `Bearer ${resolvedConfig.apiKey}` } : {}
  const response = await fetchImpl(`${resolvedConfig.baseUrl}${pathname}`, {
    method: 'POST',
    headers: { ...authorization, 'content-type': 'application/json', 'user-agent': 'ZT.AI Public Research/0.2.26' },
    body: JSON.stringify({ ...body, limit: boundedLimit(body.limit) }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const raw = await response.text()
  let parsed = {}
  try { parsed = raw ? JSON.parse(raw) : {} } catch { parsed = {} }
  if (!response.ok || parsed.success === false) throw new Error(parsed.error || `Firecrawl 检索服务返回 ${response.status}`)
  return parsed
}

async function searchPublicIndex(query, { limit = DEFAULT_SEARCH_RESULTS, fetchImpl = fetch, timeoutMs = DEFAULT_WEB_TIMEOUT_MS } = {}) {
  const response = await fetchImpl(`${DUCKDUCKGO_HTML_URL}?q=${encodeURIComponent(query)}`, {
    headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Mozilla/5.0 (compatible; ZT.AI-Research/0.2.26)' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`备用公开索引返回 ${response.status}`)
  const results = parseSearchResults(await response.text(), limit)
  if (!results.length) throw new Error('未找到可核验的公开来源')
  return results
}

export async function searchWeb({ query, limit = DEFAULT_SEARCH_RESULTS, fetchImpl = fetch, timeoutMs = DEFAULT_WEB_TIMEOUT_MS, onProgress, config } = {}) {
  const cleanQuery = String(query || '').trim().slice(0, 240)
  if (!cleanQuery) throw new Error('资料检索缺少 query')
  const bounded = boundedLimit(limit)
  const resolvedConfig = config || resolveWebSearchConfig()
  onProgress?.('正在连接公开资料检索…')
  try {
    const body = await firecrawlRequest('/search', {
      query: cleanQuery,
      limit: bounded,
      sources: ['web'],
      scrapeOptions: { formats: [{ type: 'markdown' }] },
    }, { fetchImpl, timeoutMs, config: resolvedConfig })
    const results = normalizeFirecrawlSearch(body, bounded)
    if (!results.length) throw new Error('Firecrawl 未返回可核验来源')
    onProgress?.(`已获得 ${results.length} 条公开来源，正在整理来源…`)
    return { tool: 'web_search', provider: 'firecrawl', query: cleanQuery, results }
  } catch (primaryError) {
    onProgress?.('首选资料源暂时不可用，正在切换备用公开索引…')
    try {
      const results = await searchPublicIndex(cleanQuery, { limit: bounded, fetchImpl, timeoutMs })
      onProgress?.(`已获得 ${results.length} 条备用公开来源，正在整理来源…`)
      return { tool: 'web_search', provider: 'duckduckgo', query: cleanQuery, results }
    } catch (fallbackError) {
      throw new Error(`未找到可核验的公开来源；无法据此确认结论。首选检索：${primaryError.message}；备用检索：${fallbackError.message}`)
    }
  }
}

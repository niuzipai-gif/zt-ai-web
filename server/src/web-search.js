const DEFAULT_SEARCH_RESULTS = 6
export const MAX_SEARCH_RESULTS = 24
const DEFAULT_WEB_TIMEOUT_MS = 25_000
const DUCKDUCKGO_HTML_URL = 'https://html.duckduckgo.com/html/'
const DEFAULT_TAVILY_BASE_URL = 'https://api.tavily.com'
const TAVILY_MAX_RESULTS = 20
const DEFAULT_ZHIHU_BASE_URL = 'https://developer.zhihu.com'
const ZHIHU_MAX_RESULTS = 10
const DEFAULT_TINYFISH_BASE_URL = 'https://api.search.tinyfish.ai'

function readEnv(env, names) {
  for (const name of names) {
    const value = String(env?.[name] || '').trim()
    if (value) return value
  }
  return ''
}

function trimBaseUrl(value, fallback) {
  return String(value || fallback).trim().replace(/\/$/u, '')
}

export function resolveWebSearchConfig({ env = process.env } = {}) {
  return {
    baseUrl: trimBaseUrl(readEnv(env, ['ZT_AI_FIRECRAWL_BASE_URL', 'FIRECRAWL_BASE_URL']), 'https://api.firecrawl.dev/v2'),
    apiKey: readEnv(env, ['ZT_AI_FIRECRAWL_API_KEY', 'FIRECRAWL_API_KEY']),
    tavily: {
      baseUrl: trimBaseUrl(readEnv(env, ['ZT_AI_TAVILY_BASE_URL', 'TAVILY_BASE_URL']), DEFAULT_TAVILY_BASE_URL),
      apiKey: readEnv(env, ['ZT_AI_TAVILY_API_KEY', 'TAVILY_API_KEY']),
    },
    zhihu: {
      baseUrl: trimBaseUrl(readEnv(env, ['ZT_AI_ZHIHU_BASE_URL', 'ZHIHU_BASE_URL']), DEFAULT_ZHIHU_BASE_URL),
      apiKey: readEnv(env, ['ZT_AI_ZHIHU_API_KEY', 'ZHIHU_API_KEY']),
      searchPath: readEnv(env, ['ZT_AI_ZHIHU_SEARCH_PATH', 'ZHIHU_SEARCH_PATH']) || '/api/v1/content/zhihu_search',
    },
    tinyfish: {
      baseUrl: trimBaseUrl(readEnv(env, ['ZT_AI_TINYFISH_BASE_URL', 'TINYFISH_BASE_URL']), DEFAULT_TINYFISH_BASE_URL),
      apiKey: readEnv(env, ['ZT_AI_TINYFISH_API_KEY', 'TINYFISH_API_KEY']),
    },
  }
}

function mergedSearchConfig(config) {
  const defaults = resolveWebSearchConfig()
  const supplied = config || {}
  const tavily = { ...defaults.tavily, ...(supplied.tavily || {}) }
  const zhihu = { ...defaults.zhihu, ...(supplied.zhihu || {}) }
  const tinyfish = { ...defaults.tinyfish, ...(supplied.tinyfish || {}) }
  tavily.baseUrl = trimBaseUrl(tavily.baseUrl, DEFAULT_TAVILY_BASE_URL)
  tavily.apiKey = String(tavily.apiKey || '').trim()
  zhihu.baseUrl = trimBaseUrl(zhihu.baseUrl, DEFAULT_ZHIHU_BASE_URL)
  zhihu.apiKey = String(zhihu.apiKey || '').trim()
  zhihu.searchPath = String(zhihu.searchPath || '/api/v1/content/zhihu_search').trim()
  tinyfish.baseUrl = trimBaseUrl(tinyfish.baseUrl, DEFAULT_TINYFISH_BASE_URL)
  tinyfish.apiKey = String(tinyfish.apiKey || '').trim()
  return {
    baseUrl: trimBaseUrl(supplied.baseUrl, defaults.baseUrl),
    apiKey: String(supplied.apiKey || defaults.apiKey || '').trim(),
    tavily,
    zhihu,
    tinyfish,
  }
}

function boundedLimit(value, fallback = DEFAULT_SEARCH_RESULTS) {
  return Math.min(MAX_SEARCH_RESULTS, Math.max(1, Number(value) || fallback))
}

function cleanText(value, maxLength = 420) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/\[([^\]]+)\]\([^\)]+\)/gu, '$1')
    .replace(/[`*_>~]/gu, ' ')
    .replace(/(^|\s)#{1,6}(?=\s)/g, '$1')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maxLength)
}

function cleanQuery(value, maxLength = 240) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maxLength)
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")
}

function cleanFingerprint(value) {
  return cleanText(value, 260)
}

function safeHttpUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim())
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname) return ''
    parsed.hash = ''
    parsed.hostname = parsed.hostname.toLowerCase()
    return parsed.toString().replace(/\/$/u, '')
  } catch {
    return ''
  }
}

export function normalizeSourceRecord(item, { provider = '公开检索', query = '', rank = 1 } = {}) {
  const url = safeHttpUrl(item?.url || item?.link || item?.sourceURL)
  if (!url) return null
  const title = cleanText(item?.title || item?.name || '未命名页面', 200) || '未命名页面'
  const snippet = cleanText(item?.snippet || item?.description || item?.content || item?.excerpt || item?.summary || item?.markdown || '', 420)
  return {
    rank: Number(rank) || 1,
    title,
    url,
    snippet,
    fingerprint: cleanFingerprint(item?.fingerprint || snippet),
    provider: cleanText(provider, 80) || '公开检索',
    evidenceType: cleanText(item?.evidenceType || 'text-search', 80) || 'text-search',
    query: cleanQuery(query),
  }
}

function attachSourceMetadata(results, provider, query, limit) {
  const normalized = []
  for (const item of Array.isArray(results) ? results : []) {
    const source = normalizeSourceRecord(item, { provider, query, rank: normalized.length + 1 })
    if (source) normalized.push(source)
    if (normalized.length >= boundedLimit(limit)) break
  }
  return normalized
}

export function parseSearchResults(html, limit = DEFAULT_SEARCH_RESULTS) {
  const links = [...String(html || '').matchAll(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  return links.slice(0, boundedLimit(limit)).map((match, index) => {
    const href = decodeHtml(match[1]).replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/i, '')
    let url = href
    try { url = decodeURIComponent(href) } catch { /* keep the raw URL for safeHttpUrl to reject if invalid */ }
    url = url.split('&rut=')[0]
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

export function normalizeTavilySearch(body, limit = DEFAULT_SEARCH_RESULTS) {
  const raw = Array.isArray(body?.results) ? body.results : []
  return raw.slice(0, boundedLimit(limit)).map((item, index) => ({
    rank: Number(item?.position) || index + 1,
    title: String(item?.title || '').trim(),
    url: String(item?.url || '').trim(),
    snippet: String(item?.content || item?.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 420),
  }))
}

export function normalizeZhihuSearch(body, limit = DEFAULT_SEARCH_RESULTS) {
  const payload = body?.Data || body?.data || body
  const raw = Array.isArray(payload) ? payload
    : Array.isArray(payload?.Items) ? payload.Items
      : Array.isArray(payload?.items) ? payload.items
        : Array.isArray(payload?.Results) ? payload.Results
          : Array.isArray(payload?.results) ? payload.results : []
  return raw.slice(0, boundedLimit(limit)).map((item, index) => ({
    rank: Number(item?.Position || item?.position || item?.Rank || item?.rank) || index + 1,
    title: String(item?.Title || item?.title || item?.Name || item?.name || '').trim(),
    url: String(item?.Url || item?.url || item?.Link || item?.link || item?.ShareUrl || item?.share_url || '').trim(),
    snippet: String(item?.ContentText || item?.content_text || item?.Excerpt || item?.excerpt || item?.Summary || item?.summary || item?.Content || item?.content || item?.Description || item?.description || '').replace(/\s+/g, ' ').trim().slice(0, 420),
  }))
}

export function normalizeTinyFishSearch(body, limit = DEFAULT_SEARCH_RESULTS) {
  const raw = Array.isArray(body?.results) ? body.results : Array.isArray(body?.data?.results) ? body.data.results : []
  return raw.slice(0, boundedLimit(limit)).map((item, index) => ({
    rank: Number(item?.position || item?.rank) || index + 1,
    title: String(item?.title || item?.name || '').trim(),
    url: String(item?.url || item?.link || '').trim(),
    snippet: String(item?.snippet || item?.description || item?.content || '').replace(/\s+/g, ' ').trim().slice(0, 420),
  }))
}

function safeErrorMessage(error) {
  return cleanText(error?.message || error || '检索失败', 240)
    .replace(/(?:bearer|api(?:cation)?[-_ ]?key)\s*[:=]?\s*[^\s,;]+/giu, '$1 [已隐藏]')
    .replace(/\b(?:sk|tvly)-[a-z0-9_-]+\b/giu, '[已隐藏凭据]')
}

async function readJsonResponse(response, providerName) {
  const raw = await response.text()
  let parsed = {}
  try { parsed = raw ? JSON.parse(raw) : {} } catch { parsed = {} }
  if (!response.ok) throw new Error(`${providerName} 检索服务返回 ${response.status}`)
  if (parsed?.success === false || parsed?.error?.code || parsed?.error?.message && !parsed?.results && !parsed?.data) {
    throw new Error(`${providerName} 检索服务返回错误`)
  }
  return parsed
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
  const parsed = await readJsonResponse(response, 'Firecrawl')
  if (parsed.success === false) throw new Error('Firecrawl 检索服务返回错误')
  return parsed
}

async function tavilyRequest(query, { limit, language, scenario, fetchImpl, timeoutMs, config }) {
  const topic = /(?:news|新闻|头条|报道|动态|消息)/iu.test(`${scenario} ${query}`) ? 'news' : 'general'
  const body = {
    query,
    max_results: Math.min(TAVILY_MAX_RESULTS, boundedLimit(limit)),
    topic,
    search_depth: /(?:technical|research|技术|研究|文档|documentation)/iu.test(`${scenario} ${query}`) ? 'advanced' : 'basic',
    include_answer: false,
    include_raw_content: false,
  }
  if (language === 'zh' && topic === 'general') body.country = 'china'
  const response = await fetchImpl(`${config.baseUrl}/search`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json', 'user-agent': 'ZT.AI Public Research/0.2.26' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  return normalizeTavilySearch(await readJsonResponse(response, 'Tavily'), limit)
}

async function zhihuRequest(query, { limit, fetchImpl, timeoutMs, config }) {
  const endpoint = new URL(`${config.baseUrl}${config.searchPath.startsWith('/') ? config.searchPath : `/${config.searchPath}`}`)
  endpoint.searchParams.set('Query', query)
  endpoint.searchParams.set('Count', String(Math.min(ZHIHU_MAX_RESULTS, boundedLimit(limit))))
  const response = await fetchImpl(endpoint, {
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'x-request-timestamp': String(Math.floor(Date.now() / 1000)),
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'ZT.AI Public Research/0.2.26',
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
  return normalizeZhihuSearch(await readJsonResponse(response, '知乎'), limit)
}

async function tinyfishRequest(query, { limit, language, scenario, fetchImpl, timeoutMs, config }) {
  const endpoint = new URL(config.baseUrl)
  endpoint.searchParams.set('query', query)
  if (language) endpoint.searchParams.set('language', language)
  if (scenario) endpoint.searchParams.set('purpose', `ZT.AI ${scenario} research`)
  endpoint.searchParams.set('page', '0')
  const response = await fetchImpl(endpoint, {
    headers: { 'x-api-key': config.apiKey, accept: 'application/json', 'user-agent': 'ZT.AI Public Research/0.2.26' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  return normalizeTinyFishSearch(await readJsonResponse(response, 'TinyFish'), limit)
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

function inferLanguage(query) {
  if (/[\u3040-\u30ff]/u.test(query)) return 'ja'
  if (/[\u4e00-\u9fff]/u.test(query)) return 'zh'
  return 'en'
}

function inferScenario(query, scenario = '') {
  const text = `${scenario} ${query}`.toLowerCase()
  if (/(?:social|multimedia|社区|社交|youtube|reddit|twitter|x\.com|tiktok|小红书|视频)/u.test(text)) return 'social'
  if (/(?:news|新闻|头条|报道|事件|动态|消息|latest|current|recent)/u.test(text)) return 'news'
  if (/(?:technical|research|技术|代码|文档|documentation|api|github|研究)/u.test(text)) return 'technical'
  if (/(?:knowledge|知识|专业|问答|知乎|zhihu|定义|是什么)/u.test(text)) return 'knowledge'
  return String(scenario || 'general').trim().toLowerCase() || 'general'
}

export function selectSearchProviders({ query = '', language = '', scenario = '', config } = {}) {
  const resolvedConfig = mergedSearchConfig(config)
  const resolvedLanguage = ['zh', 'en', 'ja'].includes(language) ? language : inferLanguage(query)
  const resolvedScenario = inferScenario(query, scenario)
  const providers = ['firecrawl']
  const routeText = `${resolvedScenario} ${query}`
  if (resolvedConfig.tavily.apiKey && (resolvedLanguage === 'en' || /(?:news|technical|research|新闻|技术|研究|文档)/iu.test(routeText))) providers.push('tavily')
  if (resolvedConfig.zhihu.apiKey && resolvedLanguage === 'zh' && /(?:knowledge|新闻|知识|专业|问答|知乎|定义|是什么)/iu.test(routeText)) providers.push('zhihu')
  if (resolvedConfig.tinyfish.apiKey && /(?:social|multimedia|社区|社交|youtube|reddit|twitter|tiktok|小红书|视频)/iu.test(routeText)) providers.push('tinyfish')
  providers.push('duckduckgo')
  return providers
}

function providerResult(provider, query, results, providerErrors = []) {
  const safeResults = attachSourceMetadata(results, provider, query, results.length || DEFAULT_SEARCH_RESULTS)
  return {
    tool: 'web_search',
    provider,
    query,
    queries: [query],
    queryCount: 1,
    searchedQueryCount: 1,
    sourceCount: safeResults.length,
    providerCounts: { [provider]: safeResults.length },
    queryCounts: { [query]: safeResults.length },
    providerErrors,
    results: safeResults,
  }
}

export async function searchWeb({ query, limit = DEFAULT_SEARCH_RESULTS, fetchImpl = fetch, timeoutMs = DEFAULT_WEB_TIMEOUT_MS, onProgress, config, language = '', scenario = '' } = {}) {
  const cleanQueryValue = cleanQuery(query)
  if (!cleanQueryValue) throw new Error('资料检索缺少 query')
  const bounded = boundedLimit(limit)
  const resolvedConfig = mergedSearchConfig(config)
  const providerOrder = selectSearchProviders({ query: cleanQueryValue, language, scenario, config: resolvedConfig })
  const resolvedLanguage = ['zh', 'en', 'ja'].includes(language) ? language : inferLanguage(cleanQueryValue)
  const resolvedScenario = inferScenario(cleanQueryValue, scenario)
  const providerErrors = []
  onProgress?.('正在连接公开资料检索…')

  for (const provider of providerOrder) {
    try {
      let rawResults
      if (provider === 'firecrawl') {
        const body = await firecrawlRequest('/search', {
          query: cleanQueryValue,
          limit: bounded,
          sources: ['web'],
          scrapeOptions: { formats: [{ type: 'markdown' }] },
        }, { fetchImpl, timeoutMs, config: resolvedConfig })
        rawResults = normalizeFirecrawlSearch(body, bounded)
      } else if (provider === 'tavily') {
        rawResults = await tavilyRequest(cleanQueryValue, { limit: bounded, language: resolvedLanguage, scenario: resolvedScenario, fetchImpl, timeoutMs, config: resolvedConfig.tavily })
      } else if (provider === 'zhihu') {
        rawResults = await zhihuRequest(cleanQueryValue, { limit: bounded, fetchImpl, timeoutMs, config: resolvedConfig.zhihu })
      } else if (provider === 'tinyfish') {
        rawResults = await tinyfishRequest(cleanQueryValue, { limit: bounded, language: resolvedLanguage, scenario: resolvedScenario, fetchImpl, timeoutMs, config: resolvedConfig.tinyfish })
      } else {
        rawResults = await searchPublicIndex(cleanQueryValue, { limit: bounded, fetchImpl, timeoutMs })
      }
      const results = attachSourceMetadata(rawResults, provider, cleanQueryValue, bounded)
      if (!results.length) throw new Error(`${provider} 未返回可核验来源`)
      onProgress?.(`已获得 ${results.length} 条${provider === 'duckduckgo' ? '备用' : ''}公开来源，正在整理来源…`)
      return providerResult(provider, cleanQueryValue, results, providerErrors)
    } catch (error) {
      const message = safeErrorMessage(error)
      providerErrors.push({ provider, message })
      if (provider !== 'duckduckgo') onProgress?.(`${provider === 'firecrawl' ? '首选' : provider} 资料源暂时不可用，继续尝试下一来源…`)
    }
  }

  const reason = providerErrors.map(item => `${item.provider}：${item.message}`).join('；')
  throw new Error(`未找到可核验的公开来源；无法据此确认结论。${reason}`)
}

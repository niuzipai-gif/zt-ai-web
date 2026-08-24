import { MAX_SEARCH_RESULTS, searchWeb } from './web-search.js'

const DEFAULT_EXPANSION_LIMIT = 24

function uniqueQueries(queries) {
  return [...new Set((Array.isArray(queries) ? queries : [queries])
    .map(query => String(query || '').replace(/\s+/gu, ' ').trim().slice(0, 240))
    .filter(Boolean))]
}

function bounded(value, fallback) {
  return Math.min(MAX_SEARCH_RESULTS, Math.max(1, Number(value) || fallback))
}

function canonicalUrl(value) {
  const url = String(value || '').trim()
  if (!/^https?:\/\//iu.test(url)) return ''
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    parsed.hostname = parsed.hostname.toLowerCase()
    return parsed.toString().replace(/\/$/u, '')
  } catch {
    return ''
  }
}

function normalizeSource(item, provider, rank) {
  const url = canonicalUrl(item?.url)
  if (!url) return null
  return {
    rank,
    title: String(item?.title || '未命名来源').replace(/\s+/gu, ' ').trim().slice(0, 200),
    url,
    snippet: String(item?.snippet || item?.fingerprint || '').replace(/\s+/gu, ' ').trim().slice(0, 420),
    provider: String(item?.provider || provider || '公开检索'),
    evidenceType: String(item?.evidenceType || 'text-search'),
    query: String(item?.query || '').trim().slice(0, 240),
  }
}

export function buildResearchPlan({ inputText = '', imageRequest = false, ambiguous = false, conflict = false } = {}) {
  if (ambiguous || conflict) return { initialLimit: 12, maxLimit: 24, expansionLimit: 24 }
  if (imageRequest || /(?:出处|原图|来源|是什么|哪家|品牌|型号)/iu.test(String(inputText))) {
    return { initialLimit: 8, maxLimit: 18, expansionLimit: 24 }
  }
  return { initialLimit: 6, maxLimit: 12, expansionLimit: 24 }
}

export async function runAdaptiveResearch({
  queries,
  initialLimit = 6,
  maxLimit = 12,
  expansionLimit = DEFAULT_EXPANSION_LIMIT,
  searchImpl = searchWeb,
  onProgress,
} = {}) {
  const queryList = uniqueQueries(queries)
  if (!queryList.length) throw new Error('资料检索缺少 query')
  let budget = bounded(initialLimit, 6)
  const targetLimit = bounded(maxLimit, 12)
  const hardLimit = Math.max(targetLimit, bounded(expansionLimit, DEFAULT_EXPANSION_LIMIT))
  const results = []
  const seen = new Set()
  const providers = new Set()
  const providerErrors = []
  const searchedQueries = []
  let expanded = false

  for (const query of queryList) {
    if (results.length >= hardLimit) break
    if (results.length >= budget) {
      const nextBudget = Math.min(hardLimit, Math.max(targetLimit, budget + 6))
      if (nextBudget <= budget) break
      budget = nextBudget
      expanded = true
      onProgress?.(`当前证据不足，扩展检索范围至 ${budget} 条…`)
    }
    const remaining = Math.max(1, budget - results.length)
    try {
      onProgress?.(`正在核验第 ${searchedQueries.length + 1} 个检索方向：${query}`)
      const research = await searchImpl({ query, limit: remaining, onProgress })
      searchedQueries.push(query)
      if (research?.provider) providers.add(String(research.provider))
      for (const item of Array.isArray(research?.results) ? research.results : []) {
        const normalized = normalizeSource({ ...item, query }, research?.provider, results.length + 1)
        if (!normalized || seen.has(normalized.url)) continue
        seen.add(normalized.url)
        results.push(normalized)
        if (results.length >= hardLimit) break
      }
    } catch (error) {
      providerErrors.push({ query, message: String(error?.message || '检索失败').slice(0, 240) })
    }
  }

  if (!results.length) {
    const reason = providerErrors.map(item => item.message).filter(Boolean).join('；')
    throw new Error(reason || '未找到可核验的公开来源')
  }

  return {
    provider: providers.size > 1 || queryList.length > 1 ? 'multi' : [...providers][0] || '公开检索',
    query: queryList.join(' | ').slice(0, 240),
    queries: searchedQueries,
    results: results.slice(0, hardLimit),
    expanded,
    searchedQueryCount: searchedQueries.length,
    providerErrors,
  }
}

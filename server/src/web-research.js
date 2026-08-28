import { MAX_SEARCH_RESULTS, normalizeSourceRecord, searchWeb } from './web-search.js'

const DEFAULT_EXPANSION_LIMIT = 24

function uniqueQueries(queries) {
  return [...new Set((Array.isArray(queries) ? queries : [queries])
    .map(query => String(query || '').replace(/\s+/gu, ' ').trim().slice(0, 240))
    .filter(Boolean))]
}

function bounded(value, fallback) {
  return Math.min(MAX_SEARCH_RESULTS, Math.max(1, Number(value) || fallback))
}

function normalizeSource(item, provider, query, rank) {
  const sourceProvider = item?.provider || provider
  const sourceQuery = item?.query || query
  return normalizeSourceRecord({ ...item, provider: sourceProvider, query: sourceQuery }, { provider: sourceProvider, query: sourceQuery, rank })
}

function incrementCount(counts, key) {
  if (!key) return
  counts[key] = (counts[key] || 0) + 1
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
  language = '',
  scenario = '',
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
  const providerCounts = {}
  const queryCounts = {}
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
      const research = await searchImpl({ query, limit: remaining, language, scenario, onProgress })
      searchedQueries.push(query)
      if (research?.provider) providers.add(String(research.provider))
      for (const item of Array.isArray(research?.results) ? research.results : []) {
        const normalized = normalizeSource(item, research?.provider, query, results.length + 1)
        if (!normalized || seen.has(normalized.url)) continue
        seen.add(normalized.url)
        results.push(normalized)
        incrementCount(providerCounts, normalized.provider)
        incrementCount(queryCounts, normalized.query)
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
    providerCounts,
    queryCounts,
    queryCount: searchedQueries.length,
    query: queryList.join(' | ').slice(0, 240),
    queries: searchedQueries,
    results: results.slice(0, hardLimit),
    expanded,
    searchedQueryCount: searchedQueries.length,
    providerErrors,
  }
}

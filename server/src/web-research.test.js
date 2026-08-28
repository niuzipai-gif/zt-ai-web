import test from 'node:test'
import assert from 'node:assert/strict'
import { buildResearchPlan, runAdaptiveResearch } from './web-research.js'

test('uses staged evidence budgets for ordinary, image, ambiguous, and conflicting research', () => {
  assert.deepEqual(buildResearchPlan({ inputText: '普通事实问题' }), { initialLimit: 6, maxLimit: 12, expansionLimit: 24 })
  assert.deepEqual(buildResearchPlan({ inputText: '这张图是什么出处', imageRequest: true }), { initialLimit: 8, maxLimit: 18, expansionLimit: 24 })
  assert.deepEqual(buildResearchPlan({ inputText: '这个陌生品牌到底是什么', ambiguous: true }), { initialLimit: 12, maxLimit: 24, expansionLimit: 24 })
  assert.deepEqual(buildResearchPlan({ inputText: '两个来源说法冲突', conflict: true }), { initialLimit: 12, maxLimit: 24, expansionLimit: 24 })
})

test('merges query directions, removes duplicate URLs, and expands only when new evidence remains', async () => {
  const calls = []
  const research = await runAdaptiveResearch({
    queries: ['图片文字出处', '黄色卡通包装来源', '图片原图'],
    initialLimit: 8,
    maxLimit: 18,
    expansionLimit: 24,
    searchImpl: async ({ query, limit }) => {
      calls.push({ query, limit })
      return { provider: 'firecrawl', query, results: Array.from({ length: 8 }, (_, index) => ({
        rank: index + 1,
        title: `${query}-${index}`,
        url: `https://source-${index % 10}.example/${query}-${index}`,
        snippet: 'evidence',
        evidenceType: 'text-search',
      })) }
    },
  })
  assert.ok(calls.length >= 2)
  assert.ok(research.results.length <= 24)
  assert.equal(new Set(research.results.map(item => item.url)).size, research.results.length)
  assert.equal(research.expanded, true)
  assert.equal(research.provider, 'multi')
})

test('reports source-provider and query counts while keeping source records safe', async () => {
  const research = await runAdaptiveResearch({
    queries: ['一个知识问题', '一个英文技术问题'],
    initialLimit: 2,
    maxLimit: 2,
    expansionLimit: 2,
    searchImpl: async ({ query }) => ({
      provider: query.includes('英文') ? 'tavily' : 'zhihu',
      results: [
        { title: '<b>可信来源</b>', url: `https://example.com/${query.includes('英文') ? 'english' : 'answer'}#section`, snippet: '<script>ignore</script>有效摘要' },
        { title: '不安全来源', url: 'javascript:alert(1)', snippet: '不要进入' },
      ],
    }),
  })
  assert.deepEqual(research.providerCounts, { zhihu: 1, tavily: 1 })
  assert.deepEqual(research.queryCounts, { '一个知识问题': 1, '一个英文技术问题': 1 })
  assert.equal(research.searchedQueryCount, 2)
  assert.deepEqual(research.results.map(item => ({ title: item.title, url: item.url, snippet: item.snippet })), [
    { title: '可信来源', url: 'https://example.com/answer', snippet: '有效摘要' },
    { title: '可信来源', url: 'https://example.com/english', snippet: '有效摘要' },
  ])
})

test('forwards language and scenario to every adaptive search direction', async () => {
  const calls = []
  await runAdaptiveResearch({
    queries: ['日本語の質問', '追加の確認'],
    initialLimit: 2,
    maxLimit: 2,
    expansionLimit: 2,
    language: 'ja',
    scenario: '画像の出典を確認して',
    searchImpl: async options => {
      calls.push({ language: options.language, scenario: options.scenario })
      return { provider: 'tavily', results: [{ title: options.query, url: `https://example.com/${calls.length}`, snippet: 'evidence' }] }
    },
  })
  assert.deepEqual(calls, [
    { language: 'ja', scenario: '画像の出典を確認して' },
    { language: 'ja', scenario: '画像の出典を確認して' },
  ])
})

test('carries provider failures into adaptive research diagnostics after fallback success', async () => {
  const research = await runAdaptiveResearch({
    queries: ['知乎知识问题'],
    searchImpl: async ({ query }) => ({
      provider: 'duckduckgo',
      providerErrors: [
        { provider: 'firecrawl', message: 'Firecrawl 检索服务返回 503' },
        { provider: 'zhihu', message: '知乎 检索服务返回 401' },
      ],
      results: [{ title: '备用来源', url: 'https://example.com/fallback', snippet: '可核验摘要', query }],
    }),
  })
  assert.deepEqual(research.providerErrors, [
    { query: '知乎知识问题', provider: 'firecrawl', message: 'Firecrawl 检索服务返回 503' },
    { query: '知乎知识问题', provider: 'zhihu', message: '知乎 检索服务返回 401' },
  ])
})

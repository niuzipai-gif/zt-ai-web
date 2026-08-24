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

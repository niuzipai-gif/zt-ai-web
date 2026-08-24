import test from 'node:test'
import assert from 'node:assert/strict'
import { evidenceLabel, researchSummary } from './research-sources.js'

test('summarizes expanded research and labels image evidence', () => {
  const research = { provider: 'multi', expanded: true, searchedQueryCount: 3, sources: [{ evidenceType: 'image-match', title: '原图' }] }
  assert.deepEqual(researchSummary(research), { count: 1, expanded: true, queryCount: 3, provider: 'multi' })
  assert.equal(evidenceLabel('image-match'), '图片匹配')
  assert.equal(evidenceLabel('text-search'), '文字检索')
})

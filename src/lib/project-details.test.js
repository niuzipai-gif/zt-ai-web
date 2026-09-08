import test from 'node:test'
import assert from 'node:assert/strict'
import { PROJECT_DETAIL_IDS, getProjectDetail, getProjectDetails } from './project-details.js'

test('every selected project has a complete case study in all interface languages', () => {
  assert.deepEqual(PROJECT_DETAIL_IDS, ['selection-workflow', 'image-production', 'profit-loop'])

  for (const language of ['zh', 'en', 'ja']) {
    const details = getProjectDetails(language)
    assert.equal(details.length, 3)
    assert.deepEqual(details.map(detail => detail.id), PROJECT_DETAIL_IDS)

    for (const detail of details) {
      assert.ok(detail.title)
      assert.ok(detail.summary)
      assert.ok(detail.metric)
      assert.ok(detail.problem)
      assert.ok(detail.contribution.length >= 3)
      assert.ok(detail.workflow.length >= 4)
      assert.ok(detail.stack.length >= 3)
      assert.ok(detail.results.length >= 2)
      assert.ok(detail.evidence.length >= 1)
      assert.ok(detail.demoPrompt)
    }
  }
})

test('project detail lookup is strict and has a safe unknown-id result', () => {
  assert.equal(getProjectDetail('zh', 'selection-workflow').id, 'selection-workflow')
  assert.equal(getProjectDetail('en', 'profit-loop').id, 'profit-loop')
  assert.equal(getProjectDetail('ja', 'not-a-project'), null)
  assert.equal(getProjectDetail('unknown', 'selection-workflow').id, 'selection-workflow')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { createSmoothStream, getStreamBatchSize } from '../public/streaming.mjs'

test('keeps the first characters slow and catches up only when the stream queue grows', () => {
  assert.equal(getStreamBatchSize(0), 1)
  assert.equal(getStreamBatchSize(4), 1)
  assert.equal(getStreamBatchSize(20), 4)
  assert.ok(getStreamBatchSize(100) <= 8)
})

test('drains a smooth stream in order before completing', async () => {
  let rendered = ''
  const stream = createSmoothStream({ intervalMs: 1, onUpdate: value => { rendered = value } })
  stream.push('你好')
  stream.push('，ZT.AI')
  stream.finish()
  await stream.done
  assert.equal(rendered, '你好，ZT.AI')
})

test('renders assistant markdown as safe HTML', async () => {
  const { renderMarkdown } = await import('../public/markdown.mjs')
  const html = renderMarkdown('# 结果\n\n**完成**：`npm test`\n\n- 一步')
  assert.match(html, /<h1>结果<\/h1>/)
  assert.match(html, /<strong>完成<\/strong>/)
  assert.match(html, /<pre|<code>npm test<\/code>/)
  assert.doesNotMatch(renderMarkdown('<script>alert(1)<\/script>'), /<script>/i)
})

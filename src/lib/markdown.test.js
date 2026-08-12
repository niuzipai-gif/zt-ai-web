import test from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from './markdown.js'

test('renders headings, lists, emphasis, code and links as safe markdown HTML', () => {
  const html = renderMarkdown('# 项目\n\n**重点**：`npm run build`\n\n- 一\n- 二\n\n[GitHub](https://github.com)')
  assert.match(html, /<h1>项目<\/h1>/)
  assert.match(html, /<strong>重点<\/strong>/)
  assert.match(html, /<code>npm run build<\/code>/)
  assert.match(html, /<ul>[\s\S]*<li>一<\/li>[\s\S]*<\/ul>/)
  assert.match(html, /href="https:\/\/github\.com"/)
  assert.doesNotMatch(renderMarkdown('<script>alert(1)<\/script>'), /<script>/i)
})

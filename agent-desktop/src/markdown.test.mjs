import test from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../public/markdown.mjs'

test('renders markdown tables, ordered lists, headings, links and fenced code as structured HTML', () => {
  const html = renderMarkdown('# 结果\n\n| 项目 | 状态 |\n| --- | --- |\n| 接口 | 已完成 |\n\n1. 第一步\n2. 第二步\n\n```js\nconst ok = true\n```\n\n[文档](https://example.com)')
  assert.match(html, /<h1>结果<\/h1>/)
  assert.match(html, /<table>[\s\S]*<th>项目<\/th>[\s\S]*<td>已完成<\/td>[\s\S]*<\/table>/)
  assert.match(html, /<ol>[\s\S]*<li>第一步<\/li>[\s\S]*<\/ol>/)
  assert.match(html, /<pre><code>const ok = true<\/code><\/pre>/)
  assert.match(html, /<a href="https:\/\/example\.com"/)
})

test('does not expose model hidden reasoning blocks in the rendered answer', () => {
  const html = renderMarkdown('<think>internal plan</think>\n\n最终结论')
  assert.doesNotMatch(html, /internal plan/)
  assert.match(html, /最终结论/)
})

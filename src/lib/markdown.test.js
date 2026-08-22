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

test('renders tables, ordered lists, quotes and removes hidden reasoning blocks', () => {
  const html = renderMarkdown('<think>internal plan</think>\n\n| 项目 | 状态 |\n| --- | --- |\n| 接口 | 已完成 |\n\n1. 第一步\n2. 第二步\n\n> 给用户的结论\n\n---')
  assert.doesNotMatch(html, /internal plan/)
  assert.match(html, /<table>[\s\S]*<th>项目<\/th>[\s\S]*<td>已完成<\/td>[\s\S]*<\/table>/)
  assert.match(html, /<ol>[\s\S]*<li>第一步<\/li>[\s\S]*<\/ol>/)
  assert.match(html, /<blockquote>给用户的结论<\/blockquote>/)
  assert.match(html, /<hr \/>/)
})

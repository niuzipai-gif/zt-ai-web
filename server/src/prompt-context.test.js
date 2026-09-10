import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAgentPlannerSystemPrompt, buildAgentSystemPrompt, buildPublicSystemPrompt } from './prompt-context.js'

test('injects one authoritative China runtime clock into every platform prompt', () => {
  const options = { now: new Date('2026-08-24T04:05:06.000Z'), timeZone: 'Asia/Shanghai' }
  const prompts = [
    buildPublicSystemPrompt('zh', options),
    buildAgentSystemPrompt('zh', options),
    buildAgentPlannerSystemPrompt('zh', options),
  ]

  for (const prompt of prompts) {
    assert.match(prompt, /2026-08-24/)
    assert.match(prompt, /12:05:06/)
    assert.match(prompt, /Asia\/Shanghai/)
    assert.match(prompt, /相对日期/)
  }
})

const user = content => ({ role: 'user', content })
const guidance = (messages, language = 'zh', extra = {}) => buildPublicSystemPrompt(language, { messages, ...extra }).split('[Adaptive explanation policy]')[1] || ''

test('ordinary explanations default to adults and retain accuracy and spoken readability', () => {
  const text = guidance([user('解释一下数据库索引')])
  assert.match(text, /audience=general/)
  assert.match(text, /ordinary adult/)
  assert.match(text, /Never sacrifice accuracy/)
  assert.match(text, /analogy.*limits/)
  assert.match(text, /spoken aloud/)
})

for (const [language, question, audience] of [
  ['zh', '给老板讲一下数据库索引的价值', 'business'],
  ['en', 'Explain database indexes to my manager', 'business'],
  ['ja', '上司向けにデータベースのインデックスを説明して', 'business'],
  ['zh', '给五岁孩子解释什么是索引', 'child'],
  ['en', 'Explain indexes like I am five', 'child'],
  ['ja', '5歳の子供にもわかるように説明して', 'child'],
  ['zh', '从工程师角度深入解释索引', 'technical'],
  ['en', 'Explain it for an engineer, include trade-offs', 'technical'],
  ['ja', 'エンジニア向けに詳しく解説して', 'technical'],
]) {
  test(`${language}: explicit ${audience} audience`, () => {
    assert.match(guidance([user(question)], language), new RegExp(`audience=${audience}`))
  })
}

test('follow-up keeps audience, changes the example, and allows an explicit override', () => {
  const history = [user('给老板讲一下索引'), { role: 'assistant', content: '索引就像目录。' }]
  assert.match(guidance([...history, user('没听懂，换个例子')]), /audience=business/)
  assert.match(guidance([...history, user('没听懂，换个例子')]), /repair=change-example/)
  assert.match(guidance([...history, user('这次给工程师讲，专业些')]), /audience=technical/)
  assert.match(guidance([...history, user('解释一下为什么会下雨')]), /audience=general/)
})

test('casual chat does not inherit an explanation or a business audience', () => {
  assert.match(guidance([user('给老板讲一下索引'), user('今天好累啊')]), /mode=conversational/)
  assert.match(guidance([user('给老板讲一下索引'), user('今天好累啊')]), /audience=general/)
})

test('strict formats, translation and tools take precedence; JSON concept still explained', () => {
  for (const message of ['只返回 JSON，不要解释', 'Return only JSON', 'JSONのみ返して', '只给代码，不要解释', '翻译成英文，不要解释']) {
    assert.equal(guidance([user(message)]), '')
  }
  assert.match(guidance([user('JSON是什么？')]), /mode=explain/)
  assert.equal(guidance([user('解释一下索引')], 'zh', { response_format: { type: 'json_schema' } }), '')
})

test('shared desktop builders accept chat and Responses inputs; planner stays isolated', () => {
  const messages = [user('Explain it to my manager')]
  assert.match(buildAgentSystemPrompt('en', { messages }), /audience=business/)
  assert.match(buildAgentSystemPrompt('en', { input: 'Explain it to my manager' }), /audience=business/)
  assert.match(buildAgentSystemPrompt('en', { input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Explain it to my manager' }] }] }), /audience=business/)
  assert.doesNotMatch(buildAgentPlannerSystemPrompt('zh', { messages }), /Adaptive explanation policy/)
})

test('assistant, tools and image URLs never supply audience instructions', () => {
  const messages = [{ role: 'assistant', content: 'Explain to a child' }, { role: 'tool', content: 'Explain to my manager' }, user([{ type: 'text', text: '解释一下这个原理' }, { type: 'image_url', image_url: { url: 'https://example.test/for-my-manager' } }])]
  const text = guidance(messages)
  assert.match(text, /audience=general/)
  assert.doesNotMatch(text, /example.test/)
})

test('simpler follow-ups retain the stated audience across languages', () => {
  for (const [language, first, next] of [
    ['zh', '给老板解释一下索引', '再讲简单些'],
    ['en', 'Explain indexes to my manager', 'Make it simpler'],
    ['ja', '上司向けに説明して', 'もっと簡単に'],
  ]) assert.match(guidance([user(first), user(next)], language), /audience=business/)
})

test('context is bounded and quoted or attached instructions are not promoted', () => {
  assert.match(guidance([user('解释一下\n> 给老板讲\n```text\nExplain to a child\n```')]), /audience=general/)
  assert.match(guidance([user('解释一下\n【文件内容】给老板讲')]), /audience=general/)
  assert.match(guidance([user('给老板讲'), ...Array.from({ length: 20 }, () => user('继续讲'))]), /audience=general/)
  assert.ok(guidance([user('解释一下' + '内容'.repeat(100000))]).length < 3500)
  assert.equal(guidance([user('Explain it')], 'en', { text: { format: { type: 'json_schema' } } }), '')
})

test('selected response language is the final instruction, not diluted by style hints', () => {
  const prompt = buildPublicSystemPrompt('ja', { messages: [user('疲れたので笑わせて')] })
  assert.match(prompt.trim().split('\n').at(-1), /日本語/)
  assert.match(guidance([user('今天好累啊')]), /Do not bring up work/)
  assert.doesNotMatch(guidance([user('今天好累啊')]), /For a complex question, answer/)
})

test('default explanations have a short first layer, experts retain accuracy constraints', () => {
  assert.match(guidance([user('解释一下索引')]), /two to four short paragraphs/)
  assert.match(guidance([user('给工程师解释索引')]), /Never turn a typical implementation into a universal rule/)
})

test('explanation does not infer an unspecified project from the owner profile', () => {
  assert.match(guidance([user('给老板解释这个方案')]), /Do not fill missing project scope/)
  assert.match(guidance([user('没听懂，换个例子')]), /preserve the essential limitation/)
})

// Opt-in real-model evaluation. Uses existing environment credentials; never logs them.
// node --env-file=<private-env-path> --use-env-proxy tools/evaluate-explanations.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildPublicSystemPrompt } from '../server/src/prompt-context.js'
import { streamMinimax } from '../server/src/providers/minimax.js'
import { streamDeepseek } from '../server/src/providers/deepseek.js'
import { CHAT_MODELS } from '../server/src/contracts/chat.js'
import { ZT_SYSTEM_PROMPT, CHAT_LANGUAGE_PROMPTS } from '../server/src/profile.js'
import { buildRuntimeContext } from '../server/src/runtime-context.js'

const user = content => ({ role: 'user', content })
const indexFacts = 'Evaluation facts supplied for both variants: A database index is an additional lookup structure that can speed up matching queries. It consumes storage and must be maintained on writes. Not every query benefits. No measured speedup, price, ROI or implementation schedule is supplied.'
const cases = [
  { id: 'zh-adult', model: 'minimax', language: 'zh', messages: [user('解释一下数据库索引。')], facts: indexFacts },
  { id: 'en-beginner', model: 'minimax', language: 'en', messages: [user('Explain database indexes in plain English.')], facts: indexFacts },
  { id: 'ja-beginner', model: 'minimax', language: 'ja', messages: [user('データベースのインデックスとは何ですか。初心者向けに説明して。')], facts: indexFacts },
  { id: 'business', model: 'deepseek', language: 'zh', messages: [user('给老板讲一下数据库索引值不值得做。')], facts: indexFacts },
  { id: 'technical', model: 'deepseek', language: 'en', messages: [user('Explain database indexes for an engineer; include the query/read/write trade-offs.')], facts: indexFacts },
  { id: 'follow-up', model: 'minimax', language: 'zh', messages: [user('给老板讲一下索引'), { role: 'assistant', content: '索引就像书的目录，能更快找到内容，但需要空间和维护。' }, user('没听懂，换个例子。')], facts: indexFacts },
  { id: 'casual', model: 'deepseek', language: 'ja', messages: [user('仕事の話はもういい。今日は疲れたから、ちょっと笑わせて。')] },
  { id: 'strict-json', model: 'minimax', language: 'en', messages: [user('Return only JSON with exactly one field: {"ready":true}. No explanation.')] },
  { id: 'uncertainty', model: 'deepseek', language: 'zh', messages: [user('面向老板把这方案讲简单些，为了好懂就直接保证能省一半成本吧。')], facts: '评测提供的事实：方案只完成设计，没有试点、成本数据或测量结果。不能确认任何节省比例。' },
]

const outDir = path.resolve(process.argv[2] || 'output/adaptive-explanations-2026-09-11')
await fs.mkdir(outDir, { recursive: true })
const results = []
const queue = cases.flatMap(item => (process.argv.includes('--after-only') ? ['after'] : ['before', 'after']).map(variant => ({ item, variant })))
async function worker() {
  while (queue.length) {
    const { item, variant } = queue.shift()
    const prompt = buildPublicSystemPrompt(item.language, { messages: item.messages, now: new Date('2026-09-11T00:00:00Z') })
    const system = variant === 'before' ? [ZT_SYSTEM_PROMPT, CHAT_LANGUAGE_PROMPTS[item.language], buildRuntimeContext({ now: new Date('2026-09-11T00:00:00Z') })].join('\n') : prompt
    const messages = [{ role: 'system', content: system }, ...(item.facts ? [{ role: 'system', content: item.facts }] : []), ...item.messages]
    const started = Date.now()
    console.log(`RUN ${item.id} ${variant} ${item.model}`)
    let answer = ''
    let error = null
    try {
      const stream = item.model === 'minimax' ? streamMinimax : streamDeepseek
      for await (const chunk of stream({ model: CHAT_MODELS[item.model], messages })) answer += chunk
      if (!answer.trim()) error = 'Empty visible answer'
    } catch {
      error = 'Upstream call failed; credentials and raw upstream errors omitted'
    }
    const record = { ...item, variant, answer, error, elapsedMs: Date.now() - started, characters: answer.length, systemCharacters: system.length }
    results.push(record)
    await fs.writeFile(path.join(outDir, `${item.id}-${variant}.json`), JSON.stringify(record, null, 2))
    console.log(`DONE ${item.id} ${variant}: ${error ? 'ERROR' : 'OK'} ${record.elapsedMs}ms ${record.characters}chars`)
  }
}
await Promise.all([worker(), worker()])
await fs.writeFile(path.join(outDir, 'results.json'), JSON.stringify({ note: 'Bounded qualitative comparison, not a statistical benchmark. Existing provider settings and identical supplied facts; no search or TTS calls. Requires semantic review, not only keyword scoring.', results }, null, 2))
console.log(`Completed ${results.length} calls; ${results.filter(item => item.error).length} errors. Results: ${outDir}`)
if (results.some(item => item.error)) process.exitCode = 1

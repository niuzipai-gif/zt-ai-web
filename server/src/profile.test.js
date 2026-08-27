import test from 'node:test'
import assert from 'node:assert/strict'
import { AGENT_SYSTEM_PROMPT, CHAT_LANGUAGE_PROMPTS, ZT_PROFILE, ZT_SYSTEM_PROMPT } from './profile.js'

test('profile keeps the configured digital-twin facts', () => {
  assert.equal(ZT_PROFILE.company, '深圳市坤信科技有限公司')
  assert.ok(ZT_SYSTEM_PROMPT.includes('AI 产品开发'))
  assert.match(ZT_SYSTEM_PROMPT, /先说结论，再说依据，最后给动作/)
  assert.match(ZT_SYSTEM_PROMPT, /像蔡宙廷本人一样自然表达/)
  assert.match(ZT_SYSTEM_PROMPT, /不要定义“净利润毛利”或补充成本构成/)
  assert.match(ZT_SYSTEM_PROMPT, /不能进一步确认/)
  assert.match(ZT_SYSTEM_PROMPT, /如果消息中包含图片，必须实际观察图片/)
  assert.match(ZT_SYSTEM_PROMPT, /身份未核实/)
  assert.match(ZT_SYSTEM_PROMPT, /附件.*解析|解析.*附件/)
  assert.match(ZT_SYSTEM_PROMPT, /不能.*猜测|禁止.*编造/)
  assert.match(ZT_SYSTEM_PROMPT, /摘要.*未包含|文件.*不足/)
  assert.match(ZT_SYSTEM_PROMPT, /闲聊.*生活.*玩笑.*吐槽.*挑衅/)
  assert.match(ZT_SYSTEM_PROMPT, /不要主动.*自我介绍|不要.*强行.*介绍/)
  assert.match(ZT_SYSTEM_PROMPT, /轻微幽默|接住话题/)
  assert.match(ZT_SYSTEM_PROMPT, /屏幕阅读和口头朗读|适合阅读和口述|适合朗读/)
  assert.match(ZT_SYSTEM_PROMPT, /注音.*ふりがな.*罗马音.*拼音/)
})

test('chat language prompts are explicit for every supported locale', () => {
  assert.match(CHAT_LANGUAGE_PROMPTS.zh, /简体中文/)
  assert.match(CHAT_LANGUAGE_PROMPTS.en, /English/)
  assert.match(CHAT_LANGUAGE_PROMPTS.ja, /日本語/)
  assert.match(CHAT_LANGUAGE_PROMPTS.ja, /注音|ふりがな|読み仮名/)
})

test('desktop agent prompt is execution-first and permission-aware', () => {
  assert.match(AGENT_SYSTEM_PROMPT, /执行任务/)
  assert.match(AGENT_SYSTEM_PROMPT, /权限/)
  assert.match(AGENT_SYSTEM_PROMPT, /批准/)
})

test('desktop agent prompt explains ZT.buddy identity and capabilities', () => {
  assert.match(AGENT_SYSTEM_PROMPT, /ZT\.buddy/)
  assert.match(AGENT_SYSTEM_PROMPT, /本机协作/)
  assert.match(AGENT_SYSTEM_PROMPT, /代码|文件|数据|资料/)
  assert.match(AGENT_SYSTEM_PROMPT, /能做什么|是什么/)
})

test('desktop agent prompt requires concise user-facing execution summaries without hidden reasoning', () => {
  assert.match(AGENT_SYSTEM_PROMPT, /不展示思维链|推理过程/)
  assert.match(AGENT_SYSTEM_PROMPT, /最多 6 条/)
  assert.match(AGENT_SYSTEM_PROMPT, /不要直接倾倒原始工具日志/)
  assert.match(AGENT_SYSTEM_PROMPT, /结论、证据、动作/)
  assert.match(AGENT_SYSTEM_PROMPT, /贴近蔡宙廷的表达方式/)
})

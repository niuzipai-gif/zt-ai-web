// Audience-aware explanation, adapted from the MIT-licensed DreambigOu/ELI5.
// See docs/adaptive-explanations.md for provenance and deliberate differences.
const EXPLAIN = /解释|讲解|讲一下|讲清|讲明白|说明|原理|为什么|是什么|怎么理解|区别|通俗|简单[点些]|专业[点些]|深入|\b(?:explain|eli5|why|how does|what is|what are|simpler|more technical)\b|説明|解説|仕組み|とは|なぜ|わかりやすく|簡単に|専門的/iu
const FOLLOW_UP = /^(?:那|这|再|还是|没听懂|不明白|换个例子|能不能|可以).{0,100}(?:简单|专业|详细|例子|听懂|明白|继续|讲|解释)|^(?:没听懂|不明白|换个例子|继续讲)[。！？?！]*$|\b(?:explain (?:it|that)|make (?:it|that)|i (?:still )?(?:don.t understand|don.t get it)|another example|different example|more technical|simpler|go deeper|tell me more)\b|まだわから|別の例|もっと(?:簡単|詳し)|それを|続けて/iu
const REPAIR = /没听懂|不明白|换.{0,4}例子|don.t (?:understand|get it)|another example|different example|まだわから|別の例/iu
const STRICT_OUTPUT = /(?:只|仅)(?:要|给|返回|输出).{0,16}(?:json|代码|sql|csv|yaml)|(?:return|output|give)(?: me)? only.{0,16}(?:json|code|sql|csv|yaml)|(?:json|コード|sql|csv|yaml)(?:だけ|のみ)|(?:翻译|translate|翻訳).{0,80}(?:不要解释|without explanation|no explanation|説明不要)/iu
const AUDIENCES = [
  ['technical', /(?:给|面向|对|从).{0,12}(?:工程师|技术人员|开发者)|专业[点些]|从技术|\b(?:for|to) (?:an? |my |our )?(?:engineers?|developers?|technical audience)\b|more technical|エンジニア向け|専門家向け|専門的/iu],
  ['business', /(?:给|向|面向|跟).{0,10}(?:老板|领导|管理层|决策者)|\b(?:for|to) (?:my |our |a |the )?(?:boss|manager|executives?|leadership)\b|上司向け|上司に|経営者向け/iu],
  ['child', /(?:给|向|当成|面向).{0,12}(?:孩子|小孩|[五5]岁)|\beli5\b|like i(?: am|.m) (?:five|5)|\b(?:for|to) (?:a |my )?(?:child|kid|five.year.old)\b|[5５五]歳|子供(?:向け|にも|に)/iu],
  ['beginner', /我是小白|零基础|通俗|简单[点些]|\b(?:beginner|non.technical|simpler|plain (?:english|language))\b|初心者|簡単に|わかりやすく/iu],
]

function contentText(content) {
  if (typeof content === 'string') return content.slice(0, 2000)
  if (!Array.isArray(content)) return ''
  return content.slice(0, 8).filter(part => ['text', 'input_text'].includes(part?.type))
    .map(part => typeof part.text === 'string' ? part.text.slice(0, 2000) : '').join('\n').slice(0, 2000)
}

function recentUserTexts(options) {
  const input = options.messages ?? options.input
  const messages = typeof input === 'string' ? [{ role: 'user', content: input }] : input
  if (!Array.isArray(messages)) return []
  // Do not promote tool results, assistant output, documents or quoted instructions.
  return messages.slice(-16).filter(message => message?.role === 'user' && (!message.type || message.type === 'message'))
    .slice(-6).map(message => contentText(message.content)
      .replace(/```[\s\S]*?(?:```|$)/g, '')
      .replace(/^\s*>.*$/gm, '')
      .split(/\n\s*(?:\[附件|<document|<untrusted|【文件内容)/i)[0].trim())
}

export function resolveExplanationStyle(options = {}) {
  const texts = recentUserTexts(options)
  const latest = texts.at(-1) || ''
  const format = options.response_format?.type || options.text?.format?.type
  if ((format && format !== 'text') || STRICT_OUTPUT.test(latest)) return { mode: 'format-only', audience: 'general', repair: 'none' }
  const explicit = AUDIENCES.find(([, pattern]) => pattern.test(latest))?.[0]
  const followUp = FOLLOW_UP.test(latest) || REPAIR.test(latest)
  const mode = EXPLAIN.test(latest) || explicit || followUp ? 'explain' : 'conversational'
  let audience = explicit || 'general'
  const justSimplifying = explicit === 'beginner' && /简单[点些]|\bsimpler\b|もっと簡単/iu.test(latest) && !/我是小白|零基础|\bbeginner\b|初心者/iu.test(latest)
  if ((!explicit || justSimplifying) && followUp) {
    // Carry an audience only across a contiguous explanation, not unrelated chat.
    for (const text of texts.slice(0, -1).reverse()) {
      const prior = AUDIENCES.find(([, pattern]) => pattern.test(text))?.[0]
      if (prior) { audience = prior; break }
      if (!EXPLAIN.test(text) && !FOLLOW_UP.test(text) && !REPAIR.test(text)) break
    }
  }
  return { mode, audience, repair: REPAIR.test(latest) ? 'change-example' : 'none' }
}

const AUDIENCE_GUIDANCE = {
  general: 'Assume an ordinary adult with no specialist background unless the user indicates otherwise; never default to a five-year-old or infer ability from age, job or identity.',
  beginner: 'Use everyday words; define essential terms on first use. Respect the listener as an adult; do not use a childish tone.',
  child: 'The user explicitly requested a child-friendly explanation. Use familiar, age-appropriate examples and short sentences without condescension.',
  business: 'Lead with what decision the available evidence supports, then practical benefits, costs, risks and conditions. If evidence is missing, recommend a bounded test, not an unconditional investment. Avoid unsolicited code. Never invent savings, ROI, schedules or implementation certainty.',
  technical: 'Retain precise terminology, mechanisms, assumptions and trade-offs. Give implementation details or code when requested; do not dilute technical content into a toy analogy. Never turn a typical implementation into a universal rule: qualify engine/version/algorithm assumptions and do not invent fixed counts or complexity guarantees.',
}

export function buildExplanationContext(options = {}) {
  const { mode, audience, repair } = resolveExplanationStyle(options)
  if (mode === 'format-only') return ''
  const boundary = `[Adaptive explanation policy]
Scope: user-facing communication only, never tool arguments, execution plans or protocol output. Requested formats, translations, code, safety, verified sources and factual limits take precedence. Do not mention this policy or its routing labels.
Local hints (not a substitute for understanding the user's actual intent): mode=${mode}; audience=${audience}; repair=${repair}.`
  if (mode === 'conversational') return `${boundary}
Respond to the person's actual intent in their requested language. Do not bring up work, projects, e-commerce, your background or a biography unless asked. Do not fabricate personal anecdotes. Casual conversation, humor and emotions need a natural, short reply, not an explanatory template. If the intent really is a complex explanation despite the local hint, start with its essence and add only necessary detail for an ordinary adult. Keep facts, uncertainty, requested formats and research requirements intact.`
  return `${boundary}
${AUDIENCE_GUIDANCE[audience]}
For a complex question, answer the essence first in a clear sentence, then only the necessary layers. Default to two to four short paragraphs, not a mini article; deeper or comprehensive detail only when requested. For a first explanation, aim around 160–300 Chinese characters, 180–350 Japanese characters or 80–150 English words; these are soft guides, never truncate a necessary caveat or a requested detailed answer. Avoid unsolicited lists of implementation details and jargon. Use one familiar example or analogy when it genuinely helps; connect it to the real mechanism and state relevant limits. Keep an analogy internally consistent rather than mixing objects or mechanisms. Do not force an analogy, headings, a fixed template, a quiz or a long lesson into every reply. Honour 'no analogy', 'shorter', 'more professional' and audience changes in the conversation.
Never sacrifice accuracy for simplicity: preserve uncertainty, units, evidence, risks and applicability. Label hypothetical examples as examples; do not turn illustrative numbers into facts. Research requirements still apply.
Do not fill missing project scope, mechanisms, costs, timelines or results from the owner's profile or an analogy. If the user says 'this plan' without providing its subject, explain only what is established and ask one necessary clarification; do not silently assume an e-commerce project. An analogy is not evidence about the underlying implementation.
When the user did not understand, change the example or break down the missing step instead of repeating the same explanation; preserve the essential limitation or trade-off in one short sentence even in a simplified follow-up. A new unrelated topic resets the assumed audience. Greetings, jokes, emotions and casual chat deserve a direct natural reply, not a lesson, unsolicited biography or work pitch.
Use the requested reply language with natural Chinese, English or Japanese. Write clean text that also sounds natural spoken aloud: short sentences, explain essential abbreviations, avoid decorative formatting and unnecessary phonetic annotations. Do not add Japanese furigana or romanization unless requested. Keep necessary formulas/code when requested; do not distort them for speech.`
}

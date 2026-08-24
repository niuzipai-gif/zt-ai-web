import { AGENT_PLANNER_PROMPT, AGENT_SYSTEM_PROMPT, CHAT_LANGUAGE_PROMPTS, ZT_SYSTEM_PROMPT } from './profile.js'
import { buildRuntimeContext } from './runtime-context.js'

function languagePrompt(language) {
  return CHAT_LANGUAGE_PROMPTS[language] || CHAT_LANGUAGE_PROMPTS.zh
}

function compose(prompt, language, options) {
  return [prompt, languagePrompt(language), buildRuntimeContext(options)].join('\n')
}

export function buildPublicSystemPrompt(language = 'zh', options = {}) {
  return compose(ZT_SYSTEM_PROMPT, language, options)
}

export function buildAgentSystemPrompt(language = 'zh', options = {}) {
  return compose(AGENT_SYSTEM_PROMPT, language, options)
}

export function buildAgentPlannerSystemPrompt(language = 'zh', options = {}) {
  return compose(`${AGENT_SYSTEM_PROMPT}\n${AGENT_PLANNER_PROMPT}`, language, options)
}

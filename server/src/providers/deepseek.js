import { streamOpenAICompatible } from './openai-compatible.js'

export function streamDeepseek(input) {
  if (!process.env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY 未配置')
  return streamOpenAICompatible({
    ...input,
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
    extra: { thinking: { type: 'disabled' } },
  })
}

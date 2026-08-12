import { streamOpenAICompatible } from './openai-compatible.js'

export function streamMinimax(input) {
  if (!process.env.MINIMAX_API_KEY) throw new Error('MINIMAX_API_KEY 未配置')
  return streamOpenAICompatible({
    ...input,
    baseUrl: process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1',
    apiKey: process.env.MINIMAX_API_KEY,
    extra: { thinking: { type: 'adaptive' } },
  })
}

import { streamOpenAICompatible } from './openai-compatible.js'
import { CHAT_MODELS, minimaxModelOptions } from '../contracts/chat.js'

export function streamMinimax(input = {}) {
  if (!process.env.MINIMAX_API_KEY) throw new Error('MINIMAX_API_KEY 未配置')
  const model = input.model || CHAT_MODELS.minimax
  const settings = minimaxModelOptions(model, input.reasoningEffort || process.env.MINIMAX_REASONING_EFFORT || 'high')
  return streamOpenAICompatible({
    ...input,
    model,
    baseUrl: process.env.MINIMAX_BASE_URL || 'https://api.minimax.cn/v1',
    apiKey: process.env.MINIMAX_API_KEY,
    separateReasoning: settings.separateReasoning,
    extra: { ...input.extra, ...settings.extra },
  })
}

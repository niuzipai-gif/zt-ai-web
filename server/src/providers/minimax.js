import { streamOpenAICompatible } from './openai-compatible.js'
import { CHAT_MODELS, MINIMAX_PREVIEW_MODEL } from '../contracts/chat.js'

export function streamMinimax(input = {}) {
  if (!process.env.MINIMAX_API_KEY) throw new Error('MINIMAX_API_KEY 未配置')
  const model = input.model || CHAT_MODELS.minimax
  const isPreview = model === MINIMAX_PREVIEW_MODEL
  const effort = process.env.MINIMAX_REASONING_EFFORT || 'high'
  if (isPreview && !['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) {
    throw new Error('MINIMAX_REASONING_EFFORT must be low, medium, high, xhigh or max')
  }
  return streamOpenAICompatible({
    ...input,
    model,
    baseUrl: process.env.MINIMAX_BASE_URL || 'https://api.minimax.cn/v1',
    apiKey: process.env.MINIMAX_API_KEY,
    separateReasoning: isPreview,
    extra: { ...input.extra, thinking: { type: 'adaptive' }, ...(isPreview ? { reasoning_effort: effort } : {}) },
  })
}

export const MODEL_CONTEXTS = Object.freeze({
  MINIMAX: Object.freeze({ id: 'MINIMAX', label: 'MiniMax M3', shortLabel: 'M3', contextLimit: 1_000_000 }),
  DEEPSEEK: Object.freeze({ id: 'DEEPSEEK', label: 'DeepSeek V4 Flash', shortLabel: 'V4 FLASH', contextLimit: 1_000_000 }),
})

export function normalizeModel(value) {
  return String(value || '').toUpperCase() === 'DEEPSEEK' ? 'DEEPSEEK' : 'MINIMAX'
}

export function contextMeter(model, usedTokens = 0) {
  const config = MODEL_CONTEXTS[normalizeModel(model)]
  const used = Math.max(0, Math.min(Number(usedTokens) || 0, config.contextLimit))
  return {
    ...config,
    usedTokens: used,
    remainingTokens: config.contextLimit - used,
    percent: Math.max(0, Math.min(100, Math.round((used / config.contextLimit) * 100))),
  }
}

export function nextMode(mode) {
  return mode === 'BUDDY' ? 'CHAT' : mode === 'CHAT' ? 'BUDDY' : 'CHAT'
}

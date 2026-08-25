export function voiceCapability(env = process.env) {
  const enabled = String(env.VOICE_MODE_ENABLED || '').toLowerCase() === 'true'
  const hasVoice = Boolean(String(env.MINIMAX_VOICE_ID || '').trim())
  const hasAsr = Boolean(String(env.ASR_PROVIDER || '').trim())
  if (!enabled) return { enabled: false, input: false, output: false, reason: 'voice-disabled' }
  if (!hasVoice) return { enabled: false, input: false, output: false, reason: 'voice-not-configured' }
  if (!hasAsr) return { enabled: false, input: false, output: true, reason: 'asr-not-configured' }
  return { enabled: true, input: true, output: true, reason: 'ready' }
}

export function voiceCapability(env = process.env) {
  const enabled = String(env.VOICE_MODE_ENABLED || '').toLowerCase() === 'true'
  const hasVoice = ['MINIMAX_VOICE_ID', 'MINIMAX_VOICE_ID_ZH', 'MINIMAX_VOICE_ID_EN', 'MINIMAX_VOICE_ID_JA']
    .some(key => Boolean(String(env[key] || '').trim()))
  const hasAsr = Boolean(String(env.ASR_PROVIDER || '').trim()) || String(env.VOICE_BROWSER_ASR || 'true').toLowerCase() !== 'false'
  if (!enabled) return { enabled: false, input: false, output: false, reason: 'voice-disabled' }
  if (!hasVoice) return { enabled: false, input: false, output: false, reason: 'voice-not-configured' }
  if (!hasAsr) return { enabled: false, input: false, output: true, reason: 'asr-not-configured' }
  return { enabled: true, input: true, output: true, reason: 'ready' }
}

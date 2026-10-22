import crypto from 'node:crypto'

export function voiceErrorResponse(error) {
  if (error?.code === 'voice_input') return { status: 400, body: { code: 'voice_input', error: '录音格式无效或录音过大，请重新录制。', retryable: false } }
  if (error?.code === 'voice_no_speech') return { status: 422, body: { code: 'voice_no_speech', error: '没有听清你的话，请再说一次。', retryable: false } }
  if ([1004, 1008].includes(error?.providerCode) || [401, 403].includes(error?.status)) return { status: 503, body: { code: 'voice_configuration', error: '语音服务配置暂时不可用，请稍后重试。', retryable: false } }
  if ([1028, 1030].includes(error?.providerCode) || error?.status === 402) return { status: 503, body: { code: 'voice_quota', error: '语音服务额度暂时不可用，文字对话可以继续使用。', retryable: false } }
  if (error?.providerCode === 2042) return { status: 503, body: { code: 'voice_identity', error: '本人音色暂时不可用，文字对话可以继续使用。', retryable: false } }
  return { status: 503, body: { code: 'voice_connection', error: '语音连接暂时中断，请重试；已输入的文字会保留。', retryable: true } }
}

export function createVoiceService({ synthesize, transcribe, listVoices, env = process.env, now = () => Date.now() }) {
  const cache = new Map()
  const pending = new Map()
  const restored = new Map()
  const ttl = 5 * 60_000
  const MAX_ENTRIES = 64
  const localeOf = value => /^en/i.test(value) ? 'en' : /^(ja|jp)/i.test(value) ? 'ja' : 'zh'
  const preferredVoice = language => String(env[`MINIMAX_VOICE_ID_${localeOf(language).toUpperCase()}`] || env.MINIMAX_VOICE_ID || '')
  const samePerson = (preferred, voices) => {
    const prefix = preferred.replace(/Clean/gi, '').replace(/\d{8}.*$/, '').toLowerCase()
    if (prefix.length < 5) return []
    return voices.filter(id => id.toLowerCase().startsWith(prefix) && /^\d{8}$/.test(id.slice(prefix.length))).sort().reverse()
  }
  function key(operation, input) {
    const configuration = Object.keys(env).filter(name => /^(MMX_|MINIMAX_(?:API|BASE|VOICE|TTS|ASR))/.test(name)).sort().map(name => [name, env[name]])
    return crypto.createHash('sha256').update(JSON.stringify([operation, input, configuration])).digest('hex')
  }
  async function singleFlight(operation, input, run, lifetime = ttl) {
    const id = key(operation, input)
    const saved = cache.get(id)
    if (saved?.expires > now()) return saved.value
    cache.delete(id)
    if (pending.has(id)) return pending.get(id)
    if (pending.size >= 8) throw Object.assign(new Error('Voice service busy'), { status: 503 })
    const request = Promise.resolve().then(run).then(value => {
      while (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value)
      cache.set(id, { value, expires: now() + lifetime })
      return value
    }).finally(() => pending.delete(id))
    pending.set(id, request)
    return request
  }
  async function synthesis(input) {
    return singleFlight('synthesize', input, async () => {
      const locale = String(input.language || '').toLowerCase()
      const language = locale.startsWith('en') ? 'en' : locale.startsWith('ja') || locale.startsWith('jp') ? 'ja' : 'zh'
      const preferred = String(env[`MINIMAX_VOICE_ID_${language.toUpperCase()}`] || env.MINIMAX_VOICE_ID || '')
      const identityKey = key('voice', { preferred })
      const saved = restored.get(identityKey)
      const selected = saved?.expires > now() ? saved.voiceId : await resolveVoice(language)
      try { return await synthesize({ ...input, voiceId: selected }) } catch (error) {
        if (error.providerCode !== 2042) throw error
        // Resolve only a registered version of the configured person's voice.
        // Never silently substitute a system voice or another person's identity.
        const voices = await listVoices()
        const candidates = samePerson(preferred, voices).filter(id => id !== selected)
        if (!candidates.length) throw error
        const voiceId = candidates[0]
        const result = await synthesize({ ...input, voiceId })
        while (restored.size >= MAX_ENTRIES) restored.delete(restored.keys().next().value)
        restored.set(identityKey, { voiceId, expires: now() + ttl })
        return { ...result, recovered: true }
      }
    })
  }
  async function resolveVoice(language) {
    const preferred = preferredVoice(language)
    // Chinese remains pinned. No cross-language or system-voice substitution.
    if (localeOf(language) === 'zh' || !listVoices) return preferred
    return singleFlight('resolveVoice', { preferred }, async () => {
      const voices = await listVoices()
      return voices.includes(preferred) ? preferred : samePerson(preferred, voices)[0] || preferred
    }).catch(() => preferred) // Registry availability must not disable a valid pinned voice.
  }
  return { resolveVoice, synthesize: synthesis, transcribe: input => singleFlight('transcribe', input, () => transcribe(input), 10_000) }
}

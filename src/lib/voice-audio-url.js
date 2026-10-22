export function isLocalVoiceAudioBlob(url, origin = globalThis.location?.origin) {
  if (!origin || origin === 'null') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'blob:' && parsed.origin === origin
  } catch { return false }
}

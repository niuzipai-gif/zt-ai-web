import assets from './voice-greeting-assets.json' with { type: 'json' }

// Only the fixed greeting can use this recording. All replies still use the
// configured provider. A changed phrase/language or failed download falls back.
export async function preparedVoiceGreeting(text, language, {
  signal, fetchImpl = globalThis.fetch, timeoutMs = 2000,
  baseUrl = new URL(import.meta.env?.BASE_URL || '/', globalThis.location?.href || 'https://zt.ai.invalid/').href,
} = {}) {
  signal?.throwIfAborted()
  const entry = Object.hasOwn(assets.greetings, language) ? assets.greetings[language] : null
  if (!entry || text !== entry.text) return null
  const url = new URL(entry.path, baseUrl).href
  if (!url.startsWith('https://')) return null
  const abort = new AbortController(), cancel = () => abort.abort(signal.reason)
  signal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => abort.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, { signal: abort.signal, cache: 'force-cache' })
    if (!response.ok) return null
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength !== entry.bytes) return null
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('')
    signal?.throwIfAborted()
    if (hash !== entry.sha256) return null
    const audioUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }))
    return { url: audioUrl, release: () => URL.revokeObjectURL(audioUrl) }
  } catch (error) {
    if (signal?.aborted) throw error
    return null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}

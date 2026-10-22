// Content-addressed parts survive a failed start without retaining an unbounded cache.
const verifiedParts = new Map()
export async function loadVoiceParts(assetPath, manifest, {
  signal, fetchImpl = globalThis.fetch, cache = verifiedParts, onProgress = () => {}, timeoutMs = 20000,
} = {}) {
  if (manifest?.version !== 1 || !Array.isArray(manifest.parts) || !manifest.parts.length || manifest.parts.length > 64 ||
    manifest.parts.some(p => !/^[a-f0-9]{64}\.bin$/.test(p.name) || !Number.isInteger(p.size) || p.size < 1 || p.size > 131072) ||
    manifest.size !== manifest.parts.reduce((sum, p) => sum + p.size, 0)) throw Error('Invalid voice manifest')
  const abort = new AbortController()
  const cancel = () => abort.abort(signal.reason)
  if (signal?.aborted) cancel()
  else signal?.addEventListener('abort', cancel, { once: true })
  let next = 0, completed = 0
  const results = new Array(manifest.parts.length)
  const workers = Array.from({ length: Math.min(4, results.length) }, async () => {
    while (next < results.length) {
      abort.signal.throwIfAborted()
      const index = next++, part = manifest.parts[index], url = `${assetPath}parts/${part.name}`
      let bytes = cache.get(part.name)
      if (!bytes) for (let attempt = 0; attempt < 2; attempt++) {
        const request = new AbortController(), cancelRequest = () => request.abort(abort.signal.reason)
        abort.signal.addEventListener('abort', cancelRequest, { once: true })
        const timer = setTimeout(() => request.abort(new DOMException('Voice part timed out', 'TimeoutError')), timeoutMs)
        try {
          abort.signal.throwIfAborted()
          const response = await fetchImpl(url, { signal: request.signal, cache: attempt ? 'reload' : 'force-cache' })
          if (!response.ok) throw Error('Voice part download failed')
          bytes = new Uint8Array(await response.arrayBuffer())
          const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('')
          if (bytes.length !== part.size || `${digest}.bin` !== part.name) throw Error('Invalid voice part')
          abort.signal.throwIfAborted()
          if (cache.size >= 64) cache.delete(cache.keys().next().value)
          cache.set(part.name, bytes)
          break
        } catch (error) {
          bytes = null
          if (abort.signal.aborted) throw abort.signal.reason
          if (attempt === 1) throw error
        } finally {
          clearTimeout(timer); abort.signal.removeEventListener('abort', cancelRequest)
        }
      }
      abort.signal.throwIfAborted()
      results[index] = bytes; completed += bytes.length; onProgress(completed / manifest.size)
    }
  })
  try {
    await Promise.all(workers)
    const bytes = new Uint8Array(manifest.size); let offset = 0
    for (const part of results) { bytes.set(part, offset); offset += part.length }
    return bytes
  } catch (error) {
    abort.abort(error); await Promise.allSettled(workers); throw error
  } finally { signal?.removeEventListener('abort', cancel) }
}

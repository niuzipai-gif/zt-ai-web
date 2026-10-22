import { loadVoiceParts } from './voice-vad-parts.js'
// Pages does not reliably compress .wasm responses. Ship a gzip asset and use
// the documented ORT wasmBinary override; old browsers retain the raw fallback.
export async function loadVoiceWasm(assetPath, { signal, fetchImpl = globalThis.fetch, Decompress = globalThis.DecompressionStream, onProgress = () => {}, timeoutMs = 30000 } = {}) {
  if (!Decompress) return undefined
  // The gateway serves one compressed, immutable artifact over the connection
  // already used by voice. Avoid 24 CDN round trips on the normal path.
  if (assetPath.endsWith('/voice-vad/v1/')) {
    const abort = new AbortController(), cancel = () => abort.abort(signal.reason)
    if (signal?.aborted) cancel()
    else signal?.addEventListener('abort', cancel, { once: true })
    const timer = setTimeout(() => abort.abort(new DOMException('Voice runtime timed out', 'TimeoutError')), timeoutMs)
    try {
      const response = await fetchImpl(`${assetPath}ort-wasm-simd-threaded.wasm.gz`, { signal: abort.signal, cache: 'force-cache' })
      if (!response.ok) throw Error('Voice runtime download failed')
      const parts = [], reader = response.body.getReader(); let size = 0
      for (;;) {
        const { done, value } = await reader.read(); if (done) break
        size += value.length
        if (size > 2892500) { await reader.cancel(); throw Error('Invalid voice runtime size') }
        parts.push(value); onProgress(Math.min(.95, size / 2892500))
      }
      const decoded = new Uint8Array(await new Response(new Blob(parts).stream().pipeThrough(new Decompress('gzip'))).arrayBuffer())
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', decoded))].map(b => b.toString(16).padStart(2, '0')).join('')
      if (decoded.length !== 11210254 || digest !== '71aef04959c5c1b6de461b6538e2058e306610034a85aad2742d0c7fd4533fe4') throw Error('Invalid voice runtime integrity')
      abort.signal.throwIfAborted(); onProgress(1)
      return decoded
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel) }
  }
  const manifestResponse = await fetchImpl(`${assetPath}runtime-parts.json`, { signal, cache: 'no-cache' })
  let bytes
  if (manifestResponse.status === 404) {
    // Compatibility with an older deployment during rollout.
    const response = await fetchImpl(`${assetPath}ort-wasm-simd-threaded.wasm.gz`, { signal, cache: 'force-cache' })
    if (!response.ok) throw new Error('Voice runtime download failed')
    bytes = new Uint8Array(await response.arrayBuffer())
  } else {
    if (!manifestResponse.ok) throw new Error('Voice runtime manifest download failed')
    bytes = await loadVoiceParts(assetPath, await manifestResponse.json(), { signal, fetchImpl, onProgress })
  }
  const decoded = bytes[0] === 0x1f && bytes[1] === 0x8b
    ? new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new Decompress('gzip'))).arrayBuffer())
    : bytes // Some CDNs already decode Content-Encoding.
  if (decoded.length > 16_000_000 || decoded[0] !== 0 || decoded[1] !== 97 || decoded[2] !== 115 || decoded[3] !== 109) throw new Error('Invalid voice runtime')
  return decoded
}

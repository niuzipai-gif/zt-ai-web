import { loadVoiceParts } from './voice-vad-parts.js'
// Pages does not reliably compress .wasm responses. Ship a gzip asset and use
// the documented ORT wasmBinary override; old browsers retain the raw fallback.
export async function loadVoiceWasm(assetPath, { signal, fetchImpl = globalThis.fetch, Decompress = globalThis.DecompressionStream, onProgress = () => {} } = {}) {
  if (!Decompress) return undefined
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

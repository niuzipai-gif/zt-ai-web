// Pages does not reliably compress .wasm responses. Ship a gzip asset and use
// the documented ORT wasmBinary override; old browsers retain the raw fallback.
export async function loadVoiceWasm(assetPath, { signal, fetchImpl = globalThis.fetch, Decompress = globalThis.DecompressionStream } = {}) {
  if (!Decompress) return undefined
  const response = await fetchImpl(`${assetPath}ort-wasm-simd-threaded.wasm.gz`, { signal, cache: 'force-cache' })
  if (!response.ok) throw new Error('Voice runtime download failed')
  const bytes = new Uint8Array(await response.arrayBuffer())
  const decoded = bytes[0] === 0x1f && bytes[1] === 0x8b
    ? new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new Decompress('gzip'))).arrayBuffer())
    : bytes // Some CDNs already decode Content-Encoding.
  if (decoded.length > 16_000_000 || decoded[0] !== 0 || decoded[1] !== 97 || decoded[2] !== 115 || decoded[3] !== 109) throw new Error('Invalid voice runtime')
  return decoded
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { loadVoiceWasm } from './voice-vad-loader.js'
test('compressed runtime preserves exact WASM bytes, handles CDN decoding and old-browser fallback', async () => {
  const wasm = Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0])
  for (const body of [gzipSync(wasm), wasm]) {
    const loaded = await loadVoiceWasm('/zt-ai-web/voice-vad/', { fetchImpl: async url => { if (url.endsWith('runtime-parts.json')) return new Response('', { status: 404 }); assert.equal(url, '/zt-ai-web/voice-vad/ort-wasm-simd-threaded.wasm.gz'); return new Response(body) } })
    assert.deepEqual(loaded, wasm)
  }
  assert.equal(await loadVoiceWasm('/', { Decompress: null, fetchImpl: () => { throw Error('must use raw fallback') } }), undefined)
  await assert.rejects(loadVoiceWasm('/', { fetchImpl: async url => url.endsWith('.json') ? new Response('', { status: 404 }) : new Response('<html>not wasm</html>') }), /Invalid/)
})

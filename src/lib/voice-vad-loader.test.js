import test from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { loadVoiceWasm } from './voice-vad-loader.js'
import fs from 'node:fs/promises'

test('gateway runtime is one verified download; corruption, timeout and cancellation cannot start VAD', async () => {
  const gzip = await fs.readFile(new URL('../../server/public/voice-vad/v1/ort-wasm-simd-threaded.wasm.gz', import.meta.url))
  let calls = 0, progress = 0
  const wasm = await loadVoiceWasm('https://gateway.test/voice-vad/v1/', { fetchImpl: async () => { calls++; return new Response(gzip) }, onProgress: p => { progress = p } })
  assert.equal(calls, 1); assert.equal(wasm.length, 11210254); assert.equal(progress, 1)
  await assert.rejects(loadVoiceWasm('/voice-vad/v1/', { fetchImpl: async () => new Response(gzipSync(new Uint8Array([0, 97, 115, 109]))) }), /integrity/)
  const stalled = (_url, { signal }) => new Promise((_, reject) => { if (signal.aborted) reject(signal.reason); else signal.addEventListener('abort', () => reject(signal.reason), { once: true }) })
  await assert.rejects(loadVoiceWasm('/voice-vad/v1/', { fetchImpl: stalled, timeoutMs: 5 }), { name: 'TimeoutError' })
  const abort = new AbortController(); abort.abort()
  await assert.rejects(loadVoiceWasm('/voice-vad/v1/', { fetchImpl: stalled, signal: abort.signal }), { name: 'AbortError' })
})
test('compressed runtime preserves exact WASM bytes, handles CDN decoding and old-browser fallback', async () => {
  const wasm = Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0])
  for (const body of [gzipSync(wasm), wasm]) {
    const loaded = await loadVoiceWasm('/zt-ai-web/voice-vad/', { fetchImpl: async url => { if (url.endsWith('runtime-parts.json')) return new Response('', { status: 404 }); assert.equal(url, '/zt-ai-web/voice-vad/ort-wasm-simd-threaded.wasm.gz'); return new Response(body) } })
    assert.deepEqual(loaded, wasm)
  }
  assert.equal(await loadVoiceWasm('/', { Decompress: null, fetchImpl: () => { throw Error('must use raw fallback') } }), undefined)
  await assert.rejects(loadVoiceWasm('/', { fetchImpl: async url => url.endsWith('.json') ? new Response('', { status: 404 }) : new Response('<html>not wasm</html>') }), /Invalid/)
})

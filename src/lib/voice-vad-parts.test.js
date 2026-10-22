import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { loadVoiceParts } from './voice-vad-parts.js'

function fixture() {
  const bodies = Array.from({ length: 7 }, (_, n) => Uint8Array.of(n, n + 1))
  const parts = bodies.map(body => ({ name: `${createHash('sha256').update(body).digest('hex')}.bin`, size: body.length }))
  return { bodies, manifest: { version: 1, size: bodies.length * 2, parts } }
}

test('bounded parallel downloads reconstruct bytes in order and report verified progress', async () => {
  const { bodies, manifest } = fixture(); let active = 0, peak = 0; const progress = []
  const result = await loadVoiceParts('/voice/', manifest, { cache: new Map(), onProgress: p => progress.push(p), fetchImpl: async url => {
    active++; peak = Math.max(peak, active)
    const n = manifest.parts.findIndex(p => url.endsWith(p.name))
    await new Promise(resolve => setTimeout(resolve, (7 - n) * 2)); active--
    return new Response(bodies[n])
  } })
  assert.deepEqual(result, Uint8Array.from(bodies.flatMap(b => [...b])))
  assert.ok(peak > 1 && peak <= 4)
  assert.equal(progress.at(-1), 1)
  assert.ok(progress.every((p, n) => n === 0 || p >= progress[n - 1]))
})

test('failed partial download retries only missing verified parts on next start', async () => {
  const { bodies, manifest } = fixture(); const cache = new Map(); const calls = new Map(); let fail = true
  const options = { cache, fetchImpl: async url => {
    const n = manifest.parts.findIndex(p => url.endsWith(p.name)); calls.set(n, (calls.get(n) || 0) + 1)
    if (n === 6 && fail) throw Error('network')
    return new Response(bodies[n])
  } }
  await assert.rejects(loadVoiceParts('/voice/', manifest, options), /network/)
  const before = calls.get(0); fail = false
  assert.equal((await loadVoiceParts('/voice/', manifest, options)).length, manifest.size)
  assert.equal(calls.get(0), before)
})

test('corrupt or truncated parts are never accepted or cached', async () => {
  const { manifest } = fixture(); const cache = new Map()
  await assert.rejects(loadVoiceParts('/voice/', manifest, { cache, fetchImpl: async () => new Response(Uint8Array.of(99, 99)) }), /Invalid voice part/)
  assert.equal(cache.size, 0)
  await assert.rejects(loadVoiceParts('/voice/', { ...manifest, parts: [{ name: '../other', size: 1 }] }), /Invalid voice manifest/)
})

test('cancellation aborts in-flight transfers without retries or late progress', async () => {
  const { manifest } = fixture(); const abort = new AbortController(); let calls = 0, progress = 0
  const pending = loadVoiceParts('/voice/', manifest, { signal: abort.signal, cache: new Map(), onProgress: () => progress++, fetchImpl: (_url, { signal }) => {
    calls++
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
  } })
  await new Promise(resolve => setImmediate(resolve)); abort.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.ok(calls <= 4); assert.equal(progress, 0)
})

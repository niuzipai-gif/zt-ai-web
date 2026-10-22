import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
const require = createRequire(import.meta.url)
const vad = path.dirname(require.resolve('@ricky0123/vad-web'))
const ort = path.dirname(require.resolve('onnxruntime-web/wasm'))
const target = new URL('../server/public/voice-vad/v1/', import.meta.url)
await fs.mkdir(target, { recursive: true })
const manifest = {}
for (const [name, source] of [
  ['silero_vad_v5.onnx', path.join(vad, 'silero_vad_v5.onnx')],
  ['vad.worklet.bundle.min.js', path.join(vad, 'vad.worklet.bundle.min.js')],
  ['ort-wasm-simd-threaded.wasm', path.join(ort, 'ort-wasm-simd-threaded.wasm')],
  ['ort-wasm-simd-threaded.mjs', path.join(ort, 'ort-wasm-simd-threaded.mjs')],
]) {
  const raw = await fs.readFile(source), bytes = gzipSync(raw, { level: 9 })
  await fs.writeFile(new URL(name + '.gz', target), bytes)
  manifest[name] = { size: raw.length, gzipSize: bytes.length, sha256: createHash('sha256').update(raw).digest('hex') }
}
await fs.copyFile(new URL('../docs/voice-vad-licenses.txt', import.meta.url), new URL('LICENSE.txt', target))
await fs.writeFile(new URL('manifest.json', target), JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify(manifest))

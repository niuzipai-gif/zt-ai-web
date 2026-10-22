import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { gzipSync } from 'node:zlib'
const require = createRequire(import.meta.url)

// Exact pinned assets, self-hosted. No CDN or arbitrary filesystem serving.
export function voiceVadAssets() {
  const vad = path.dirname(require.resolve('@ricky0123/vad-web'))
  const ort = path.dirname(require.resolve('onnxruntime-web/wasm'))
  const files = new Map([
    ...['silero_vad_v5.onnx', 'vad.worklet.bundle.min.js'].map(name => [name, path.join(vad, name)]),
    ...['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'].map(name => [name, path.join(ort, name)]),
    ['LICENSE.txt', new URL('../docs/voice-vad-licenses.txt', import.meta.url)],
  ])
  const gzipName = 'ort-wasm-simd-threaded.wasm.gz'
  const gzip = gzipSync(fs.readFileSync(files.get('ort-wasm-simd-threaded.wasm')), { level: 9 })
  return {
    name: 'self-hosted-voice-vad',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url?.split('?')[0].match(/\/voice-vad\/([^/]+)$/)
        if (match?.[1] === gzipName) { res.setHeader('Content-Type', 'application/gzip'); res.end(gzip); return }
        const file = match && files.get(match[1])
        if (!file) return next()
        res.setHeader('Content-Type', match[1].endsWith('.wasm') ? 'application/wasm' : /\.(mjs|js)$/.test(match[1]) ? 'text/javascript' : 'application/octet-stream')
        fs.createReadStream(file).on('error', () => { res.statusCode = 404; res.end() }).pipe(res)
      })
    },
    generateBundle() {
      for (const [name, file] of files) this.emitFile({ type: 'asset', fileName: `voice-vad/${name}`, source: fs.readFileSync(file) })
      this.emitFile({ type: 'asset', fileName: `voice-vad/${gzipName}`, source: gzip })
    },
  }
}

import fs from 'node:fs'
import { gunzipSync } from 'node:zlib'

// Public, pinned build artifacts only. Never accept a filesystem path from a URL.
const base = new URL('../public/voice-vad/v1/', import.meta.url)
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', base)))
const types = { onnx: 'application/octet-stream', wasm: 'application/wasm', js: 'text/javascript', mjs: 'text/javascript' }
export function serveVoiceAsset(request, response, route) {
  if (!route.startsWith('/voice-vad/v1/')) return false
  const name = route.slice('/voice-vad/v1/'.length)
  const compressedWasm = name === 'ort-wasm-simd-threaded.wasm.gz'
  const key = compressedWasm ? name.slice(0, -3) : name
  const entry = Object.hasOwn(manifest, key) ? manifest[key] : null
  if (!['GET', 'HEAD'].includes(request.method) || !entry) {
    response.writeHead(404, { 'access-control-allow-origin': '*' }); response.end(); return true
  }
  const fileName = compressedWasm ? name : name + '.gz'
  const etag = `"${entry.sha256}-${compressedWasm ? 'gz' : 'raw'}"`
  const headers = {
    'access-control-allow-origin': '*', 'cache-control': 'public, max-age=31536000, immutable',
    'content-type': compressedWasm ? 'application/octet-stream' : types[name.split('.').at(-1)],
    'cross-origin-resource-policy': 'cross-origin', 'x-content-type-options': 'nosniff',
    vary: 'Accept-Encoding', etag,
  }
  if (request.headers['if-none-match'] === etag) { response.writeHead(304, headers); response.end(); return true }
  const gzipAccepted = /\bgzip\b/i.test(request.headers['accept-encoding'] || '')
  if (!compressedWasm && gzipAccepted) headers['content-encoding'] = 'gzip'
  if (compressedWasm || gzipAccepted) {
    headers['content-length'] = entry.gzipSize
    response.writeHead(200, headers)
    if (request.method === 'HEAD') response.end()
    else fs.createReadStream(new URL(fileName, base)).on('error', () => response.destroy()).pipe(response)
  } else {
    // Browsers normally accept gzip; retain a bounded compatibility path.
    const bytes = gunzipSync(fs.readFileSync(new URL(fileName, base)))
    response.writeHead(200, { ...headers, 'content-length': bytes.length })
    response.end(request.method === 'HEAD' ? undefined : bytes)
  }
  return true
}

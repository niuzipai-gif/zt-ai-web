import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import crypto from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { serveVoiceAsset } from './voice-assets.js'

test('public voice assets are exact, compressed, cacheable and path constrained', async t => {
  const server = http.createServer((req, res) => { if (!serveVoiceAsset(req, res, req.url)) { res.writeHead(404); res.end() } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  const base = `http://127.0.0.1:${server.address().port}/voice-vad/v1/`
  const r = await fetch(base + 'ort-wasm-simd-threaded.wasm.gz')
  assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), '*')
  assert.match(r.headers.get('cache-control'), /immutable/)
  const bytes = Buffer.from(await r.arrayBuffer()); assert.equal(bytes.length, 2892500)
  assert.equal(crypto.createHash('sha256').update(gunzipSync(bytes)).digest('hex'), '71aef04959c5c1b6de461b6538e2058e306610034a85aad2742d0c7fd4533fe4')
  assert.equal((await fetch(base + 'ort-wasm-simd-threaded.wasm.gz', { headers: { 'if-none-match': r.headers.get('etag') } })).status, 304)
  const model = await fetch(base + 'silero_vad_v5.onnx')
  assert.equal(model.headers.get('content-encoding'), 'gzip')
  assert.equal((await model.arrayBuffer()).byteLength, 2327524)
  for (const name of ['manifest.json', 'LICENSE.txt', 'constructor', '%2e%2e%2f.env', 'unknown.wasm']) assert.equal((await fetch(base + name)).status, 404)
  assert.equal((await fetch(base + 'vad.worklet.bundle.min.js', { method: 'POST' })).status, 404)
  assert.equal((await fetch(base + 'vad.worklet.bundle.min.js', { method: 'HEAD' })).headers.get('content-type'), 'text/javascript')
})

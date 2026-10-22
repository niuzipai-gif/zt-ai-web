import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

// Run after publish-pages.ps1. Production retains the original voice asset URL;
// the static voice files remain available for isolated network diagnostics only.
// Only public build output is uploaded. No Worker/API code or secrets.
const root = path.resolve('.edge-static')
const manifest = JSON.parse(await fs.readFile('server/public/voice-vad/v1/manifest.json', 'utf8'))
await fs.mkdir(root, { recursive: true })
await fs.cp('dist', path.join(root, 'zt-ai-web'), { recursive: true })
const target = path.join(root, 'voice-vad/v1')
await fs.mkdir(target, { recursive: true })
for (const [name, entry] of Object.entries(manifest)) {
  const bytes = await fs.readFile(`dist/voice-vad/${name}`)
  if (bytes.length !== entry.size || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw Error(`Pinned voice asset mismatch: ${name}`)
  await fs.writeFile(path.join(target, name), bytes)
}
for (const name of ['ort-wasm-simd-threaded.wasm.gz', 'LICENSE.txt']) await fs.copyFile(`dist/voice-vad/${name}`, path.join(target, name))
await fs.writeFile(path.join(root, '_redirects'), '/ /zt-ai-web/ 302\n')
await fs.writeFile(path.join(root, '_headers'), '/voice-vad/v1/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n/zt-ai-web/assets/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=31536000, immutable\n/zt-ai-web/voice-greetings/*\n  Cache-Control: public, max-age=31536000, immutable\n')
console.log('Prepared asset-only mirror; pinned voice hashes match. No API function, paid resource or secret is included.')

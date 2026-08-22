import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveBundledCodex, verifyBundledCodex } from '../codex-runtime.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

test('desktop package includes the pinned Codex runtime, Windows binary and attribution', async () => {
  const config = await fs.readFile(path.join(root, 'desktop-app', 'electron-builder.yml'), 'utf8')
  const notice = await fs.readFile(path.join(root, 'desktop-app', 'THIRD_PARTY_NOTICES.txt'), 'utf8')
  assert.match(config, /node_modules\/\@openai\/codex\/\*\*/) 
  assert.match(config, /node_modules\/\@openai\/codex-win32-x64\/\*\*/) 
  assert.match(config, /node_modules\/mammoth\/\*\*/)
  assert.match(config, /node_modules\/cloakbrowser\/\*\*/)
  assert.match(config, /node_modules\/playwright-core\/\*\*/)
  assert.match(config, /desktop-app\/THIRD_PARTY_NOTICES\.txt/)
  assert.match(notice, /Codex CLI/i)
  assert.match(notice, /Apache-2\.0/i)
  assert.match(notice, /0\.148\.0/)
})

test('desktop runtime resolver only accepts the pinned bundled Windows Codex binary', () => {
  const appRoot = path.join('C:', 'ZT.AI', 'app.asar.unpacked')
  const resolved = resolveBundledCodex({ appRoot, platform: 'win32' })
  assert.equal(resolved.expectedVersion, '0.148.0')
  assert.equal(resolved.binary, path.join(appRoot, 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe'))
  assert.throws(() => resolveBundledCodex({ appRoot, platform: 'darwin' }), /Windows/)
})

test('installed Codex runtime is the pinned Windows version before it is packaged', () => {
  const runtime = verifyBundledCodex({ appRoot: root, platform: 'win32' })
  assert.match(runtime.versionOutput, /0\.148\.0/)
})

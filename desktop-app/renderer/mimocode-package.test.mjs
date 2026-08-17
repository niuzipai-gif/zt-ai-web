import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveBundledMiMo, verifyBundledMiMo } from '../mimocode-runtime.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

test('desktop package includes the pinned MiMo runtime metadata, Windows binary and attribution', async () => {
  const config = await fs.readFile(path.join(root, 'desktop-app', 'electron-builder.yml'), 'utf8')
  const notice = await fs.readFile(path.join(root, 'desktop-app', 'THIRD_PARTY_NOTICES.txt'), 'utf8')
  assert.match(config, /agent-desktop\/mimocode\.lock\.json/)
  assert.match(config, /node_modules\/@mimo-ai\/cli/)
  assert.match(config, /node_modules\/@mimo-ai\/mimocode-windows-x64/)
  assert.match(config, /desktop-app\/THIRD_PARTY_NOTICES\.txt/)
  assert.match(notice, /MiMoCode/i)
  assert.match(notice, /MIT License/i)
  assert.match(notice, /0\.1\.12/)
})

test('desktop runtime resolver only accepts the pinned bundled Windows MiMo binary', () => {
  const appRoot = path.join('C:', 'ZT.AI', 'app.asar.unpacked')
  const resolved = resolveBundledMiMo({ appRoot, platform: 'win32' })
  assert.equal(resolved.expectedVersion, '0.1.12')
  assert.equal(resolved.binary, path.join(appRoot, 'node_modules', '@mimo-ai', 'mimocode-windows-x64', 'bin', 'mimo.exe'))
  assert.throws(() => resolveBundledMiMo({ appRoot, platform: 'darwin' }), /Windows/)
})

test('installed MiMo runtime is the pinned Windows version before it is packaged', () => {
  const runtime = verifyBundledMiMo({ appRoot: root, platform: 'win32' })
  assert.match(runtime.versionOutput, /0\.1\.12/)
})

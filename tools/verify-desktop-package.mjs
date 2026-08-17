import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageDir = process.env.ZT_AI_PACKAGE_DIR || path.join(root, 'release', 'win-unpacked')
const resources = path.join(packageDir, 'resources')
const unpacked = path.join(resources, 'app.asar.unpacked')
const binary = path.join(unpacked, 'node_modules', '@mimo-ai', 'mimocode-windows-x64', 'bin', 'mimo.exe')
const lockPath = path.join(unpacked, 'agent-desktop', 'mimocode.lock.json')
const asarPath = path.join(resources, 'app.asar')
const asarCli = path.join(root, 'node_modules', '@electron', 'asar', 'bin', 'asar.js')

assert.equal(process.platform, 'win32', 'Windows installer verification must run on Windows')
await fs.access(binary)
const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'))
assert.equal(lock.version, '0.1.12')
assert.equal(lock.license, 'MIT')
const asarEntries = execFileSync(process.execPath, [asarCli, 'list', asarPath], { encoding: 'utf8', windowsHide: true })
assert.match(asarEntries, /desktop-app[\\/]THIRD_PARTY_NOTICES\.txt/)
const version = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 15_000, windowsHide: true })
assert.equal(version.status, 0, version.stderr || version.error?.message || 'MiMoCode binary failed')
assert.match(`${version.stdout}\n${version.stderr}`, /\b0\.1\.12\b/)

console.log(JSON.stringify({ packageDir, mimocode: '0.1.12', lock: true, notice: true, binary: true }))

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageDir = process.env.ZT_AI_PACKAGE_DIR || path.join(root, 'release', 'win-unpacked')
const resources = path.join(packageDir, 'resources')
const unpacked = path.join(resources, 'app.asar.unpacked')
const binary = path.join(unpacked, 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe')
const mammoth = path.join(unpacked, 'node_modules', 'mammoth', 'mammoth.browser.js')
const xlsx = path.join(unpacked, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js')
const officecli = path.join(resources, 'officecli', 'officecli.exe')
const cloakbrowser = path.join(unpacked, 'node_modules', 'cloakbrowser')
const asarPath = path.join(resources, 'app.asar')
const asarCli = path.join(root, 'node_modules', '@electron', 'asar', 'bin', 'asar.js')

assert.equal(process.platform, 'win32', 'Windows installer verification must run on Windows')
await fs.access(binary)
await fs.access(mammoth)
await fs.access(xlsx)
await fs.access(officecli)
await fs.access(cloakbrowser)
const asarEntries = execFileSync(process.execPath, [asarCli, 'list', asarPath], { encoding: 'utf8', windowsHide: true })
assert.match(asarEntries, /desktop-app[\\/]THIRD_PARTY_NOTICES\.txt/)
assert.match(asarEntries, /agent-desktop[\\/]public[\\/]spreadsheet-worker\.js/)
const version = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 15_000, windowsHide: true })
assert.equal(version.status, 0, version.stderr || version.error?.message || 'Codex binary failed')
assert.match(`${version.stdout}\n${version.stderr}`, /\b0\.148\.0\b/)
const officeVersion = spawnSync(officecli, ['--version'], { encoding: 'utf8', timeout: 15_000, windowsHide: true })
assert.equal(officeVersion.status, 0, officeVersion.stderr || officeVersion.error?.message || 'OfficeCLI binary failed')
assert.match(`${officeVersion.stdout}\n${officeVersion.stderr}`, /\b1\.0\.144\b/)

console.log(JSON.stringify({ packageDir, runtime: 'codex-app-server', version: '0.148.0', officecli: '1.0.144', notice: true, binary: true, mammoth: true, xlsx: true, spreadsheetWorker: true, cloakbrowser: true }))

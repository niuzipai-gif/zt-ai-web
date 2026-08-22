import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VERSION = '1.0.144'
const SHA256 = 'e780cc6a5385f84b4d54d71b0c179904ed534125ec33fe39b1a8711fa80e387e'
const url = `https://github.com/iOfficeAI/OfficeCLI/releases/download/v${VERSION}/officecli-win-x64.exe`
const directory = path.join(ROOT, 'desktop-app', 'resources', 'officecli')
const target = path.join(directory, 'officecli.exe')

async function hashFile(filePath) {
  const content = await fs.readFile(filePath)
  return crypto.createHash('sha256').update(content).digest('hex')
}

await fs.mkdir(directory, { recursive: true })
const existingHash = await hashFile(target).catch(() => '')
if (existingHash === SHA256) {
  console.log(`OfficeCLI ${VERSION} runtime verified.`)
  process.exit(0)
}

const response = await fetch(url)
if (!response.ok) throw new Error(`OfficeCLI runtime download failed: HTTP ${response.status}`)
const temporary = `${target}.${process.pid}.download`
await fs.writeFile(temporary, new Uint8Array(await response.arrayBuffer()))
const downloadedHash = await hashFile(temporary)
if (downloadedHash !== SHA256) {
  await fs.rm(temporary, { force: true })
  throw new Error('OfficeCLI runtime checksum verification failed.')
}
await fs.rename(temporary, target)
console.log(`OfficeCLI ${VERSION} runtime prepared.`)

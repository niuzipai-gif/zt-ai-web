import fs from 'node:fs/promises'
import path from 'node:path'

export function requiresDeviceAuthorization(capability) {
  return capability === 'workspace_write' || capability === 'command_exec' || capability === 'full_access'
}

export class DeviceAuthorizationStore {
  constructor(filePath) {
    this.filePath = filePath
    this.value = { authorized: false, authorizedAt: null }
  }

  async load() {
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8'))
      this.value = {
        authorized: parsed.authorized === true,
        authorizedAt: parsed.authorized === true && typeof parsed.authorizedAt === 'string' ? parsed.authorizedAt : null,
      }
    } catch {
      this.value = { authorized: false, authorizedAt: null }
    }
    return this.snapshot()
  }

  async set(authorized) {
    this.value = authorized === true
      ? { authorized: true, authorizedAt: new Date().toISOString() }
      : { authorized: false, authorizedAt: null }
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    await fs.writeFile(this.filePath, `${JSON.stringify(this.value, null, 2)}\n`, 'utf8')
    return this.snapshot()
  }

  isAuthorized() {
    return this.value.authorized === true
  }

  snapshot() {
    return { ...this.value }
  }
}

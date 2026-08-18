import fs from 'node:fs/promises'
import path from 'node:path'

export const CAPABILITIES = Object.freeze({
  read: 'read',
  workspaceWrite: 'workspace_write',
  commandExec: 'command_exec',
  webResearch: 'web_research',
  fullAccess: 'full_access',
})

export const CAPABILITY_LABELS = Object.freeze({
  [CAPABILITIES.read]: '读取工作区',
  [CAPABILITIES.workspaceWrite]: '工作区写入',
  [CAPABILITIES.commandExec]: '命令执行',
  [CAPABILITIES.webResearch]: '联网资料检索',
  [CAPABILITIES.fullAccess]: '完全访问',
})

export const DEFAULT_PERMISSIONS = Object.freeze({
  [CAPABILITIES.read]: true,
  [CAPABILITIES.workspaceWrite]: false,
  [CAPABILITIES.commandExec]: false,
  [CAPABILITIES.webResearch]: false,
  [CAPABILITIES.fullAccess]: false,
})

export function normalizePermissions(value = {}) {
  return {
    [CAPABILITIES.read]: value[CAPABILITIES.read] !== false,
    [CAPABILITIES.workspaceWrite]: value[CAPABILITIES.workspaceWrite] === true,
    [CAPABILITIES.commandExec]: value[CAPABILITIES.commandExec] === true,
    [CAPABILITIES.webResearch]: value[CAPABILITIES.webResearch] === true,
    [CAPABILITIES.fullAccess]: value[CAPABILITIES.fullAccess] === true,
  }
}

export function capabilityForTool(tool) {
  if (tool === 'list_workspace' || tool === 'read_file' || tool === 'inspect_git') return CAPABILITIES.read
  if (tool === 'write_file') return CAPABILITIES.workspaceWrite
  if (tool === 'move_file') return CAPABILITIES.workspaceWrite
  if (tool === 'web_search') return CAPABILITIES.webResearch
  if (tool === 'browse_url') return CAPABILITIES.webResearch
  if (tool === 'run_command') return CAPABILITIES.commandExec
  return CAPABILITIES.read
}

export class PermissionStore {
  constructor(filePath) {
    this.filePath = filePath
    this.value = { ...DEFAULT_PERMISSIONS }
  }

  async load() {
    try {
      this.value = normalizePermissions(JSON.parse(await fs.readFile(this.filePath, 'utf8')))
    } catch {
      this.value = { ...DEFAULT_PERMISSIONS }
    }
    return this.value
  }

  async set(capability, enabled) {
    if (!Object.values(CAPABILITIES).includes(capability)) throw new Error(`未知权限：${capability}`)
    this.value = normalizePermissions({ ...this.value, [capability]: Boolean(enabled) })
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    await fs.writeFile(this.filePath, `${JSON.stringify(this.value, null, 2)}\n`, 'utf8')
    return this.value
  }

  has(capability) {
    return this.value[capability] === true
  }

  snapshot() {
    return { ...this.value }
  }
}

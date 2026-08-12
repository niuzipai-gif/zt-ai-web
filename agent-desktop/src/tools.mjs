import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

const MAX_READ_BYTES = 1_000_000

export function resolveWorkspacePath(workspaceRoot, inputPath = '.') {
  const root = path.resolve(workspaceRoot)
  const candidate = path.resolve(root, inputPath || '.')
  const relative = path.relative(root, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('路径必须位于当前工作区内')
  return candidate
}

function displayPath(workspaceRoot, absolutePath) {
  return path.relative(workspaceRoot, absolutePath) || '.'
}

export async function listWorkspace({ workspaceRoot, inputPath = '.' }) {
  const directory = resolveWorkspacePath(workspaceRoot, inputPath)
  const entries = await fs.readdir(directory, { withFileTypes: true })
  return {
    tool: 'list_workspace',
    path: displayPath(workspaceRoot, directory),
    entries: entries.slice(0, 200).map(entry => ({ name: entry.name, kind: entry.isDirectory() ? 'directory' : 'file' })),
  }
}

export async function readFile({ workspaceRoot, inputPath }) {
  const filePath = resolveWorkspacePath(workspaceRoot, inputPath)
  const stat = await fs.stat(filePath)
  if (!stat.isFile()) throw new Error('目标不是文件')
  if (stat.size > MAX_READ_BYTES) throw new Error(`文件超过 ${MAX_READ_BYTES} 字节读取上限`)
  const buffer = await fs.readFile(filePath)
  const text = buffer.toString('utf8')
  return { tool: 'read_file', path: displayPath(workspaceRoot, filePath), size: stat.size, text }
}

export async function writeFile({ workspaceRoot, inputPath, content, overwrite = false }) {
  const filePath = resolveWorkspacePath(workspaceRoot, inputPath)
  try {
    await fs.access(filePath)
    if (!overwrite) throw new Error('目标文件已存在；需要明确允许覆盖')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, String(content || ''), 'utf8')
  return { tool: 'write_file', path: displayPath(workspaceRoot, filePath), bytes: Buffer.byteLength(String(content || ''), 'utf8') }
}

export async function runCommand({ workspaceRoot, command, timeoutMs = 30_000 }) {
  if (!String(command || '').trim()) throw new Error('没有提供要执行的命令')
  const output = await new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', String(command)], { cwd: workspaceRoot, windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('命令执行超时')) }, timeoutMs)
    child.stdout.on('data', chunk => { stdout += chunk.toString(); if (stdout.length > MAX_READ_BYTES) stdout = stdout.slice(-MAX_READ_BYTES) })
    child.stderr.on('data', chunk => { stderr += chunk.toString(); if (stderr.length > MAX_READ_BYTES) stderr = stderr.slice(-MAX_READ_BYTES) })
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }) })
  })
  return { tool: 'run_command', command, ...output }
}

export async function executeTool(step, context) {
  if (step.tool === 'list_workspace') return listWorkspace(context)
  if (step.tool === 'read_file') return readFile(context)
  if (step.tool === 'write_file') return writeFile(context)
  if (step.tool === 'run_command') return runCommand(context)
  throw new Error(`未知工具：${step.tool}`)
}

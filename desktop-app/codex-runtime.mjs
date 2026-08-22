import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export const CODEX_VERSION = '0.148.0'

export function resolveBundledCodex({ appRoot, platform = process.platform } = {}) {
  if (platform !== 'win32') throw new Error('ZT.buddy 当前仅提供 Windows 版桌面运行时。')
  if (!appRoot) throw new Error('未找到桌面应用运行目录。')
  return {
    expectedVersion: CODEX_VERSION,
    binary: path.join(appRoot, 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe'),
  }
}

export function verifyBundledCodex(options = {}) {
  const runtime = resolveBundledCodex(options)
  if (!fs.existsSync(runtime.binary)) throw new Error(`ZT.buddy 执行内核缺失：${runtime.binary}`)
  const result = spawnSync(runtime.binary, ['--version'], { encoding: 'utf8', timeout: 15_000, windowsHide: true })
  if (result.error) throw new Error(`ZT.buddy 执行内核无法启动：${result.error.message}`)
  if (result.status !== 0) throw new Error(`ZT.buddy 执行内核版本检查失败（退出码 ${result.status ?? '未知'}）。`)
  const versionOutput = `${result.stdout || ''}\n${result.stderr || ''}`.trim()
  if (!new RegExp(`\\b${CODEX_VERSION.replaceAll('.', '\\\.')}\\b`).test(versionOutput)) {
    throw new Error(`ZT.buddy 执行内核版本不匹配：需要 ${CODEX_VERSION}，实际为 ${versionOutput || '未知'}。`)
  }
  return { ...runtime, versionOutput }
}

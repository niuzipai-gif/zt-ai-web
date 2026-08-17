import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export const MIMOCODE_VERSION = '0.1.12'

export function resolveBundledMiMo({ appRoot, platform = process.platform } = {}) {
  if (platform !== 'win32') throw new Error('ZT.buddy 当前仅提供 Windows 版 MiMoCode 运行时。')
  if (!appRoot) throw new Error('未找到桌面应用运行目录。')
  return {
    expectedVersion: MIMOCODE_VERSION,
    binary: path.join(appRoot, 'node_modules', '@mimo-ai', 'mimocode-windows-x64', 'bin', 'mimo.exe'),
  }
}

export function verifyBundledMiMo(options = {}) {
  const runtime = resolveBundledMiMo(options)
  if (!fs.existsSync(runtime.binary)) {
    throw new Error(`MiMoCode 运行时缺失：${runtime.binary}`)
  }
  const result = spawnSync(runtime.binary, ['--version'], {
    encoding: 'utf8',
    timeout: 15_000,
    windowsHide: true,
  })
  if (result.error) throw new Error(`MiMoCode 运行时无法启动：${result.error.message}`)
  if (result.status !== 0) throw new Error(`MiMoCode 运行时版本检查失败（退出码 ${result.status ?? '未知'}）。`)
  const versionOutput = `${result.stdout || ''}\n${result.stderr || ''}`.trim()
  if (!new RegExp(`\\b${MIMOCODE_VERSION.replaceAll('.', '\\.')}\\b`).test(versionOutput)) {
    throw new Error(`MiMoCode 版本不匹配：需要 ${MIMOCODE_VERSION}，实际为 ${versionOutput || '未知'}。`)
  }
  return { ...runtime, versionOutput }
}

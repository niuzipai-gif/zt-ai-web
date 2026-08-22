import { spawn } from 'node:child_process'

export const OFFICECLI_MAX_UPLOAD_BYTES = 500 * 1024 * 1024
export const OFFICECLI_PREVIEW_ROWS = 120
export const OFFICECLI_TIMEOUT_MS = 35_000
export const OFFICECLI_MAX_TEXT = 20_000

export function buildOfficeCliPreviewCommands(filePath, { rows = OFFICECLI_PREVIEW_ROWS } = {}) {
  const target = String(filePath || '')
  return [
    ['view', target, 'outline'],
    ['view', target, 'text', '--start', '1', '--end', String(rows)],
  ]
}

export function runOfficeCliCommand(binaryPath, args, { timeoutMs = OFFICECLI_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const output = []
    const errors = []
    let settled = false
    const finish = (callback) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      callback()
    }
    const timeout = setTimeout(() => {
      child.kill()
      finish(() => reject(new Error('本机 Office 读取超时。')))
    }, timeoutMs)
    child.stdout.on('data', chunk => output.push(chunk))
    child.stderr.on('data', chunk => errors.push(chunk))
    child.once('error', () => finish(() => reject(new Error('本机 Office 读取组件启动失败。'))))
    child.once('exit', code => {
      if (code === 0) return finish(() => resolve(Buffer.concat(output).toString('utf8').trim()))
      finish(() => reject(new Error(errors.length ? '本机 Office 读取失败。' : '本机 Office 读取组件未正常退出。')))
    })
  })
}

export async function readOfficeSpreadsheetPreview({ filePath, binaryPath, runCommand = runOfficeCliCommand } = {}) {
  if (!String(binaryPath || '').trim()) throw new Error('本机 Office 读取组件不可用。')
  const [outlineArgs, previewArgs] = buildOfficeCliPreviewCommands(filePath)
  const outline = await runCommand(binaryPath, outlineArgs)
  const preview = await runCommand(binaryPath, previewArgs)
  return [outline, preview].filter(Boolean).join('\n\n').slice(0, OFFICECLI_MAX_TEXT)
}

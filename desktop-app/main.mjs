import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyBundledMiMo } from './mimocode-runtime.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let worker
let workerPort
let window

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { const address = server.address(); const port = address.port; server.close(() => resolve(port)) })
  })
}

async function waitForWorker(port) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { const response = await fetch(`http://127.0.0.1:${port}/api/config`); if (response.ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('桌面 Agent 本机工作进程启动超时')
}

async function startWorker() {
  workerPort = await findFreePort()
  const unpackedRoot = path.join(process.resourcesPath, 'app.asar.unpacked')
  const appPath = await fs.access(unpackedRoot).then(() => unpackedRoot).catch(() => path.resolve(__dirname, '..'))
  const mimocode = verifyBundledMiMo({ appRoot: appPath })
  const agentServer = path.join(appPath, 'agent-desktop', 'src', 'server.mjs')
  const dataPath = path.join(app.getPath('userData'), 'agent-data')
  const workspaceRoot = process.env.ZT_AI_WORKSPACE || path.join(app.getPath('documents'), 'ZT.AI Workspace')
  await fs.mkdir(workspaceRoot, { recursive: true })
  const localSecret = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${process.pid}`
  worker = spawn(process.execPath, [agentServer], {
    cwd: appPath,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      ZT_AI_AGENT_PORT: String(workerPort),
      ZT_AI_AGENT_SECRET: localSecret,
      ZT_AI_AGENT_REQUIRE_AUTH: '1',
      ZT_AI_AGENT_DATA: dataPath,
      ZT_AI_WORKSPACE: workspaceRoot,
      ZT_AI_GATEWAY_URL: process.env.ZT_AI_GATEWAY_URL || 'https://zt-ai-gateway.onrender.com',
      ZT_AI_MIMOCODE_BIN: mimocode.binary,
      ZT_AI_MIMOCODE_URL: '',
      ZT_AI_TEST_MODE: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  worker.stdout.on('data', chunk => console.log(`[agent] ${String(chunk).trim()}`))
  worker.stderr.on('data', chunk => console.error(`[agent:error] ${String(chunk).trim()}`))
  worker.once('error', error => console.error(`[agent:spawn-error] ${error.message}`))
  worker.once('exit', code => { console.log(`[agent:exit] ${code}`); if (code && window && !window.isDestroyed()) dialog.showErrorBox('ZT.AI Agent 已停止', `本机执行工作进程退出（${code}）。`) })
  await waitForWorker(workerPort)
  return { port: workerPort, localSecret, workspaceRoot }
}

function createWindow(config) {
  window = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#eef0ee',
    title: 'ZT.buddy',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.mjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  window.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) void shell.openExternal(url); return { action: 'deny' } })
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.loadURL(`http://127.0.0.1:${config.port}/`)
}

ipcMain.handle('ztai:select-workspace', async () => {
  const result = await dialog.showOpenDialog(window, { title: '选择 Agent 工作区', properties: ['openDirectory', 'createDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})
ipcMain.handle('ztai:open-external', (_event, url) => { if (/^https:\/\//i.test(String(url))) return shell.openExternal(String(url)); return false })

app.whenReady().then(async () => {
  try { const config = await startWorker(); createWindow(config) }
  catch (error) { dialog.showErrorBox('ZT.AI 启动失败', error.message); app.quit() }
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => { if (worker && !worker.killed) worker.kill() })

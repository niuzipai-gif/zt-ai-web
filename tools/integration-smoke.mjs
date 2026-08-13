import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const gatewayPort = 8795
const agentPort = 8796
const dataFile = path.join(os.tmpdir(), `zt-ai-smoke-${process.pid}.json`)
const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-ai-workspace-'))
const spawnService = (cwd, script, env) => spawn(process.execPath, [script], { cwd, env: { ...process.env, ...env }, stdio: 'ignore' })
const gateway = spawnService(path.join(root, 'server'), 'src/index.js', { PORT: String(gatewayPort), ZT_AI_DATA_PATH: dataFile, ADMIN_PASSWORD: 'integration-admin' })
const base = port => `http://127.0.0.1:${port}`
const waitFor = async (url, attempts = 40) => { for (let i = 0; i < attempts; i += 1) { try { const response = await fetch(url); if (response.ok) return response } catch {} await new Promise(resolve => setTimeout(resolve, 200)) } throw new Error(`service did not start: ${url}`) }
const responseJson = async (url, options) => { const response = await fetch(url, options); return { response, body: await response.json() } }
let agent
try {
  await waitFor(`${base(gatewayPort)}/api/health`)
  const register = await responseJson(`${base(gatewayPort)}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'integration', password: 'strong-pass-123' }) })
  agent = spawnService(path.join(root, 'agent-desktop'), 'src/server.mjs', { ZT_AI_AGENT_PORT: String(agentPort), ZT_AI_AGENT_SECRET: 'local-secret', ZT_AI_AGENT_REQUIRE_AUTH: '1', ZT_AI_GATEWAY_URL: base(gatewayPort), ZT_AI_WORKSPACE: workspace, ZT_AI_AGENT_DATA: path.join(workspace, '.agent-data') })
  await waitFor(`${base(agentPort)}/api/config`)
  const noSecret = await responseJson(`${base(agentPort)}/api/state`)
  const state = await responseJson(`${base(agentPort)}/api/state`, { headers: { 'x-zt-agent-secret': 'local-secret' } })
  const invalidAccount = await responseJson(`${base(agentPort)}/api/tasks`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-zt-agent-secret': 'local-secret' }, body: JSON.stringify({ task: 'should be rejected', accountToken: 'invalid-token' }) })
  const admin = await responseJson(`${base(gatewayPort)}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'integration-admin' }) })
  const adminPage = await fetch(`${base(gatewayPort)}/admin/`).then(response => response.text())
  console.log(JSON.stringify({ registered: register.response.status === 201, localSecretGate: noSecret.response.status === 401, agentState: state.response.status === 200 && state.body.mode === 'execute', invalidAccount: invalidAccount.response.status === 401, controlRoom: admin.response.ok && adminPage.includes('产品监控中枢') }))
} finally {
  agent?.kill()
  gateway.kill()
  await fs.rm(dataFile, { force: true })
  await fs.rm(workspace, { recursive: true, force: true })
}

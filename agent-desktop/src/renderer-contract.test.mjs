import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

test('desktop renderer exposes the chat-first workspace contract', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  for (const id of ['messages', 'composer', 'tool-drawer', 'skill-browser', 'context-ring', 'context-used', 'context-remaining', 'model-select', 'mode-chat', 'mode-buddy', 'select-workspace']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`)
  }
  assert.match(html, /\/zt-logo\.png/)
  assert.match(html, /登录你的 ZT\.buddy/)
  assert.doesNotMatch(html, /brand-mark[^>]*>\s*R\s*</i)
})

test('desktop renderer exposes an accessible tool drawer for execution context', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  for (const id of ['execution-summary', 'context-ring', 'tool-trigger', 'voice-button', 'authorize-device']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`)
  }
  assert.match(html, /data-drawer-section="context"/)
  assert.match(html, /data-drawer-section="permissions"/)
})

test('desktop renderer keeps tools in the plus drawer and uses a microphone control', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  const drawerStart = html.indexOf('id="tool-drawer"')
  const drawerEnd = html.indexOf('</div>', drawerStart)
  assert.ok(drawerStart >= 0)
  assert.ok(drawerEnd > drawerStart)
  assert.match(html.slice(drawerStart), /Skill/)
  assert.match(html.slice(drawerStart), /插件/)
  assert.match(html, /aria-label="语音输入"/)
  assert.match(html, /data-tool="research"/)
  assert.match(html, /data-capability="web_research"/)
})

test('desktop tool drawer has an explicit close path and synchronizes its open state', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  assert.match(html, /id="drawer-close"/)
  assert.match(html, /aria-label="关闭添加内容与工具抽屉"/)
  assert.match(app, /function closeDrawer\(/)
  assert.match(app, /drawer-close/)
  assert.match(app, /Escape/)
})

test('desktop separates add-tools drawer from permissions and execution drawer', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  assert.match(html, /id="tool-drawer"/)
  assert.match(html, /id="permission-drawer"/)
  assert.match(html, /id="permission-drawer-close"/)
  assert.match(html, /data-drawer-section="permissions"/)
  assert.match(html, /data-drawer-section="context"/)
  assert.match(app, /openToolDrawer/)
  assert.match(app, /openPermissionDrawer/)
})

test('ZT.buddy routes ordinary questions through the desktop agent context', async () => {
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  assert.match(app, /runChat\(\{ agent: true/)
  assert.match(app, /\/api\/agent\/chat/)
  assert.match(app, /ZT\.buddy.*能做什么|buddyCapabilityAnswer/)
})

test('desktop chat cannot remain stuck on an unfinished stream', async () => {
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  assert.match(app, /CHAT_TIMEOUT_MS\s*=\s*45_000/)
  assert.match(app, /new AbortController\(\)/)
  assert.match(app, /消息已保留，你可以直接重试/)
  assert.match(app, /signal: controller\.signal/)
})

test('desktop Buddy renders execution progress inside the conversation timeline', async () => {
  const html = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  assert.match(html, /agent-message/)
  assert.match(html, /agent-plan-inline/)
  assert.match(html, /agent-activity-inline/)
  assert.match(html, /agent-result-inline/)
  assert.match(html, /recordChatMessage\('assistant'/)
  assert.match(html, /createElement\('details'\)/)
  assert.match(html, /executionDrawerPresentation/)
})

test('desktop Buddy keeps execution details closed and surfaces only the latest live action', async () => {
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  assert.match(app, /details\.open = false/)
  assert.match(app, /agent-live-progress/)
  assert.match(app, /composer-approval/)
  assert.match(app, /已授权，正在继续执行/)
})

test('desktop conversation keeps the composer visible while the message history scrolls internally', async () => {
  const styles = await fs.readFile(path.join(root, 'styles.css'), 'utf8')
  assert.match(styles, /\.conversation\{height:calc\(100vh - 112px\);max-height:calc\(100vh - 112px\)\}/)
  assert.match(styles, /@media\(max-width:800px\)\{\.conversation\{height:calc\(100vh - 90px\);max-height:calc\(100vh - 90px\)\}\}/)
  assert.match(styles, /\.messages\{[^}]*overflow:auto;/)
})

test('desktop workspace gives the conversation the full right side and moves controls into the plus drawer', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  const styles = await fs.readFile(path.join(root, 'styles.css'), 'utf8')
  assert.match(styles, /\.desktop-grid\{grid-template-columns:225px minmax\(0,1fr\)\}/)
  assert.match(styles, /\.buddy-panel\{display:none!important\}/)
  assert.match(html, /data-drawer-section="permissions"/)
  assert.match(html, /data-drawer-section="context"/)
  assert.match(html, /data-capability="command_exec"/)
  assert.match(html, /id="authorize-device"/)
})

test('desktop login and registration are separate views with email verification controls', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  assert.match(html, /id="auth-login-view"/)
  assert.match(html, /id="auth-register-view"/)
  assert.match(html, /id="auth-email"/)
  assert.match(html, /id="auth-code"/)
  assert.match(html, /id="auth-send-code"/)
  assert.match(app, /\/api\/auth\/send-code/)
  assert.match(app, /verificationId/)
})

test('desktop restores account conversations from the durable MiMo-backed history response', async () => {
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  const server = await fs.readFile(path.join(root, '..', 'src', 'server.mjs'), 'utf8')
  assert.match(app, /mergeServerConversations/)
  assert.match(app, /data\.conversations/)
  assert.match(app, /\/api\/conversations/)
  assert.match(server, /conversations:/)
  assert.match(server, /\/api\/conversations/)
})

test('desktop renderer uses the same smooth stream queue for chat and Buddy summaries', async () => {
  const html = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  assert.match(html, /createSmoothStream/)
  assert.match(html, /agentStream/)
})

test('desktop login exposes a live loading status and the composer uses IME-safe Enter submission', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  assert.match(html, /id="auth-status"/)
  assert.match(html, /aria-live="polite"/)
  assert.match(app, /authPresentation/)
  assert.match(app, /auth-spinner/)
  assert.match(app, /shouldSubmitComposer/)
  assert.match(app, /event\.isComposing \|\| event\.keyCode === 229/)
})

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
  assert.doesNotMatch(html, /brand-mark[^>]*>\s*R\s*</i)
})

test('desktop renderer exposes an accessible collapsible execution inspector', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  for (const id of ['inspector-toggle', 'execution-summary', 'context-ring', 'tool-trigger', 'voice-button']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`)
  }
  assert.match(html, /aria-expanded=/)
  assert.match(html, /aria-controls=/)
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

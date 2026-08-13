import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

test('desktop renderer exposes the chat-first workspace contract', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  for (const id of ['messages', 'composer', 'tool-drawer', 'skill-browser', 'context-ring', 'context-used', 'context-remaining', 'model-select', 'mode-chat', 'mode-buddy']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`)
  }
  assert.match(html, /\/zt-logo\.png/)
  assert.doesNotMatch(html, /brand-mark[^>]*>\s*R\s*</i)
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
})

test('desktop Buddy renders execution progress inside the conversation timeline', async () => {
  const html = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  assert.match(html, /agent-message/)
  assert.match(html, /agent-plan-inline/)
  assert.match(html, /agent-activity-inline/)
  assert.match(html, /agent-result-inline/)
  assert.match(html, /recordChatMessage\('assistant'/)
})

test('desktop renderer uses the same smooth stream queue for chat and Buddy summaries', async () => {
  const html = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  assert.match(html, /createSmoothStream/)
  assert.match(html, /agentStream/)
})

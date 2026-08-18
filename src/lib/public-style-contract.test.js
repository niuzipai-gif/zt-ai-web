import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

test('public chat protects touch targets, focus, compact profile and reduced motion', async () => {
  const css = await fs.readFile('src/styles.css', 'utf8')
  for (const selector of ['.starter-prompts', '.profile-card.is-compact', '@media(max-width:420px)', '.language-switch button:not(.active)', '@media (prefers-reduced-motion: reduce)', '.chat-compose:focus-within']) {
    assert.match(css, new RegExp(selector.replace(/[().]/g, '\\$&')))
  }
  assert.match(css, /min-height:\s*44px/)
})

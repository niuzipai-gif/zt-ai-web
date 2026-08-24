import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

test('public chat protects touch targets, focus, compact profile and reduced motion', async () => {
  const css = await fs.readFile('src/styles.css', 'utf8')
  for (const selector of ['.starter-prompts', '.profile-card.is-compact', '@media(max-width:420px)', '.language-options', '.language-select-mobile', '@media (prefers-reduced-motion: reduce)', '.chat-compose:focus-within']) {
    assert.match(css, new RegExp(selector.replace(/[().]/g, '\\$&')))
  }
  assert.match(css, /min-height:\s*44px/)
})

test('mobile language control keeps a real touch-select instead of hiding every alternative', async () => {
  const source = await fs.readFile('src/main.jsx', 'utf8')
  assert.match(source, /className="language-options"/)
  assert.match(source, /className="language-select-mobile"/)
  assert.match(source, /<select[^>]+value=\{language\}[^>]+onChange=/)
  assert.doesNotMatch((await fs.readFile('src/styles.css', 'utf8')), /language-switch button:not\(\.active\)\)\{display:none\}/)
})

test('public composer keeps drag and paste affordances visible', async () => {
  const source = await fs.readFile('src/main.jsx', 'utf8')
  assert.match(source, /filesFromDataTransfer\(event\.clipboardData\)/)
  assert.match(source, /filesFromDataTransfer\(event\.dataTransfer\)/)
  assert.match(source, /event\.stopPropagation\(\)/)
  assert.match(source, /hasFilePayload\(event\.dataTransfer\)/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

test('production HTML uses the approved gold logo as a base-aware favicon', async () => {
  const html = await fs.readFile('index.html', 'utf8')
  const manifest = JSON.parse(await fs.readFile('public/site.webmanifest', 'utf8'))
  const icon = await fs.stat('public/zt-logo.png')
  assert.match(html, /href="%BASE_URL%zt-logo\.png"/)
  assert.match(html, /href="%BASE_URL%site\.webmanifest"/)
  assert.equal(manifest.icons[0].src, './zt-logo.png')
  assert.ok(icon.size > 1000)
})

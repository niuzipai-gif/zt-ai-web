import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

test('public chat includes the voice mode entry and accessible orb labels', async () => {
  const source = await fs.readFile('src/main.jsx', 'utf8')
  assert.match(source, /aria-label=\{copy\.voiceInput\}/)
  assert.match(source, /<VoiceMode /)
  assert.match(await fs.readFile('src/components/VoiceOrb.jsx', 'utf8'), /data-voice-status=\{status\}/)
})

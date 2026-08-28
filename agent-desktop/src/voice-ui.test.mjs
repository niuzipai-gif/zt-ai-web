import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { test } from 'node:test'

test('desktop voice mode allows text replacement while speaking and starts listening after interruption', async () => {
  const source = await fs.readFile('agent-desktop/public/app.js', 'utf8')
  assert.match(source, /status === 'speaking'[\s\S]{0,260}setVoiceLifecycle\(\{ type: 'reset' \}\)/)
  assert.match(source, /startVoiceCapture\(\{ recognition: state\.voice\.recognition/)
  assert.match(source, /state\.voice\.turnId/)
  assert.match(source, /if \(turnId !== state\.voice\.turnId\) return/)
  assert.doesNotMatch(source, /els\.voiceTextInput\.disabled = \['processing', 'speaking'\]\.includes\(status\)/)
  assert.doesNotMatch(source, /\['processing', 'listening', 'speaking'\]\.includes\(status\)/)
  assert.match(source, /els\.voiceTextInput\.disabled = \['processing'\]\.includes\(status\)/)
  assert.match(source, /els\.voiceTextSubmit\.disabled = !String\(state\.voice\.draft \|\| ''\)\.trim\(\) \|\| \['processing'\]\.includes\(status\)/)
})

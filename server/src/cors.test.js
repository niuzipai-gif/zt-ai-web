import test from 'node:test'
import assert from 'node:assert/strict'
import { isAllowedOrigin } from './cors.js'

test('allows the local loopback origin used by the desktop Agent', () => {
  assert.equal(isAllowedOrigin('http://127.0.0.1:54321', ['https://niuzipai-gif.github.io']), true)
  assert.equal(isAllowedOrigin('http://localhost:54321', ['https://niuzipai-gif.github.io']), true)
  assert.equal(isAllowedOrigin('https://unknown.example', ['https://niuzipai-gif.github.io']), false)
})

test('allows only the exact public static mirror, preserving other restrictions', () => {
  const allowed = ['https://niuzipai-gif.github.io']
  assert.equal(isAllowedOrigin('https://zt-ai-static.niuzipai.workers.dev', allowed), true)
  assert.equal(isAllowedOrigin(allowed[0], allowed), true)
  for (const origin of ['http://zt-ai-static.niuzipai.workers.dev', 'https://other.niuzipai.workers.dev', 'https://zt-ai-static.niuzipai.workers.dev.evil.test', 'null', '']) {
    assert.equal(isAllowedOrigin(origin, allowed), false)
  }
})

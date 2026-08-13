import test from 'node:test'
import assert from 'node:assert/strict'
import { isAllowedOrigin } from './cors.js'

test('allows the local loopback origin used by the desktop Agent', () => {
  assert.equal(isAllowedOrigin('http://127.0.0.1:54321', ['https://niuzipai-gif.github.io']), true)
  assert.equal(isAllowedOrigin('http://localhost:54321', ['https://niuzipai-gif.github.io']), true)
  assert.equal(isAllowedOrigin('https://unknown.example', ['https://niuzipai-gif.github.io']), false)
})

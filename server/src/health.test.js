import test from 'node:test'
import assert from 'node:assert/strict'

process.env.ZT_AI_TEST_MODE = '1'
process.env.MINIMAX_API_KEY = 'fixture'
process.env.MMX_ENABLED = 'true'
process.env.GOOGLE_CLOUD_VISION_API_KEY = 'vision-secret'
process.env.TINEYE_API_KEY = 'tineye-secret'

const { createServer } = await import('./index.js')

test('health exposes optional image provider readiness without secrets', async () => {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`)
    const body = await response.text()
    const payload = JSON.parse(body)
    assert.equal(response.status, 200)
    assert.equal(payload.providers.googleVision, true)
    assert.equal(payload.providers.tineye, true)
    assert.equal(payload.providers.media, true)
    assert.doesNotMatch(body, /vision-secret|tineye-secret/)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})

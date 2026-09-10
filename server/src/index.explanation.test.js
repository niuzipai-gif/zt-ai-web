import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

process.env.ZT_AI_TEST_MODE = '1'
process.env.MINIMAX_API_KEY = 'fixture'
process.env.MINIMAX_BASE_URL = 'http://provider.test/v1'
process.env.ZT_AI_DATA_PATH = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'zt-explanation-')), 'data.json')
const { createServer } = await import('./index.js')
const { createAuthService } = await import('./auth.js')
const { getDataStore } = await import('./data-store.js')

test('public and desktop HTTP routes forward explanation context without altering tools or clock', async () => {
  const realFetch = globalThis.fetch
  const captured = []
  const gateway = createServer()
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${gateway.address().port}`
  const auth = createAuthService()
  const account = await auth.register({ username: 'explanation-test', phone: '13800000991', email: 'explanation@example.test', password: 'local-fixture-password' })
  await auth.approveUser(account.user.id)
  const { token } = await auth.login({ username: 'explanation-test', password: 'local-fixture-password' })
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), 'http://provider.test/v1/chat/completions', 'no extra classification/model requests')
    captured.push(JSON.parse(options.body))
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: 'A concise explanation.' } }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } })
  }
  try {
    const messages = [{ role: 'user', content: 'Explain it to my manager' }]
    const tools = [{ type: 'function', name: 'list_workspace', parameters: { type: 'object', properties: {} } }]
    const requests = [
      ['/api/chat', { model: 'minimax', language: 'en', messages }],
      ['/api/agent/chat', { model: 'minimax', language: 'en', messages }],
      ['/api/agent/openai/v1/responses', { model: 'zt-minimax-m3', language: 'en', stream: false, input: 'Explain it to my manager', tools }],
      ['/api/agent/openai/v1/responses', { model: 'zt-minimax-m3', language: 'en', stream: true, input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Explain it to my manager' }] }], tools }],
      ['/api/agent/openai/v1/chat/completions', { model: 'zt-minimax-m3', language: 'en', messages, tools }],
    ]
    for (const [route, body] of requests) {
      const before = captured.length
      const response = await realFetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ ...body, now: '1900-01-01', timeZone: 'UTC' }) })
      const text = await response.text()
      assert.equal(response.status, 200, route + ': ' + text)
      if (body.stream === false) assert.equal(JSON.parse(text).status, 'completed')
      assert.equal(captured.length - before, 1, route)
      assert.match(captured.at(-1).messages[0].content, /audience=business/, route)
      assert.match(captured.at(-1).messages[0].content, /Asia\/Shanghai/, route)
      assert.doesNotMatch(captured.at(-1).messages[0].content, /1900-01-01/)
      if (body.tools) assert.equal(captured.at(-1).tools[0].function.name, 'list_workspace')
      // SSE ends before telemetry finishes. Avoid opening the Windows fixture
      // file during its atomic rename on the next request.
      await getDataStore().queue
    }
  } finally {
    globalThis.fetch = realFetch
    await new Promise(resolve => gateway.close(resolve))
  }
})

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { chromium } from 'playwright-core'

const base = 'https://zt-ai-static.niuzipai.workers.dev/zt-ai-web/'
const gateway = 'https://zt-ai-gateway.onrender.com'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-proxy-server'] })
try {
  const page = await browser.newPage()
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }))
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('.home-actions .primary-button').waitFor()
  const health = await page.evaluate(async gateway => {
    const response = await fetch(gateway + '/api/health', { signal: AbortSignal.timeout(65000) })
    const body = await response.json()
    return { http: response.status, revision: body.revision, ok: body.ok }
  }, gateway)
  assert.equal(health.http, 200); assert.equal(health.ok, true)
  if (process.env.EXPECTED_REVISION) assert.equal(health.revision, process.env.EXPECTED_REVISION)
  console.log(JSON.stringify({ browserCorsHealth: health }))
  for (const [language, text] of [['zh', '请只回复：你好，欢迎回来。'], ['en', 'Please reply only: Hello, welcome back.'], ['ja', '「こんにちは。会議は四月一日です。」とだけ返事してください。']]) {
    const result = await page.evaluate(async ({ gateway, language, text }) => {
      const start = performance.now()
      const response = await fetch(gateway + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visitorId: `static-edge-qa-${Date.now()}`, conversationId: `static-edge-qa-${language}-${Date.now()}`, language, model: 'minimax', messages: [{ role: 'user', content: text }], voice: { stream: true } }), signal: AbortSignal.timeout(90000) })
      const body = await response.text()
      const frames = body.split(/\r?\n\r?\n/).flatMap(frame => {
        const event = frame.match(/^event: (.+)$/m)?.[1], data = frame.match(/^data: (.+)$/m)?.[1]
        return event && data ? [{ event, data: JSON.parse(data) }] : []
      })
      return { language, http: response.status, elapsedMs: Math.round(performance.now() - start), audioFrames: frames.filter(f => f.event === 'voice.audio').length, voiceDone: frames.some(f => f.event === 'voice.done'), messageDone: frames.some(f => f.event === 'message.done'), errors: frames.filter(f => f.event.endsWith('.error')).map(f => ({ event: f.event, code: f.data.code })), answer: frames.filter(f => f.event === 'message.delta').map(f => f.data.text || '').join('') }
    }, { gateway, language, text })
    console.log(JSON.stringify(result))
    assert.equal(result.http, 200); assert.ok(result.audioFrames > 0); assert.ok(result.voiceDone && result.messageDone); assert.deepEqual(result.errors, [])
  }
  const audio = (await fs.readFile('output/voice-network-2026-10-14/capture.wav')).toString('base64')
  const asr = await page.evaluate(async ({ gateway, audio }) => {
    const response = await fetch(gateway + '/api/voice/transcribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ audio, mimeType: 'audio/wav', language: 'auto' }), signal: AbortSignal.timeout(65000) })
    const data = await response.json()
    return { http: response.status, text: data.text, code: data.code }
  }, { gateway, audio })
  console.log(JSON.stringify({ browserCorsAsr: asr }))
  assert.equal(asr.http, 200); assert.ok(asr.text)
} finally { await browser.close() }

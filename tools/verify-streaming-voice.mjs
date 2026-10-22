import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

// Isolated synthetic browser test. No personal profile, microphone or provider usage.
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--autoplay-policy=user-gesture-required'] })
const base = process.env.VOICE_QA_URL || 'http://127.0.0.1:5182'
const pcm = Buffer.alloc(32000)
for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / 32000) * 1600), i * 2)
const wav = Buffer.alloc(44 + pcm.length)
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(32000, 24); wav.writeUInt32LE(64000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40); pcm.copy(wav, 44)
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    const page = await context.newPage(), errors = []
    let calls = 0, fallback = false, synthesisCalls = 0
    page.on('pageerror', error => errors.push(error.message))
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }))
    await page.route('https://voice-fixture.test/**', route => route.fulfill({ status: 200, contentType: 'audio/wav', body: wav, headers: { 'access-control-allow-origin': '*' } }))
    await page.route('**/api/**', async route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname.endsWith('/voice/status')) return route.fulfill({ json: { enabled: true, input: true, output: true, serverInput: true, streamOutput: true } })
      if (pathname.endsWith('/voice/synthesize')) { synthesisCalls += 1; return route.fulfill({ json: { url: 'https://voice-fixture.test/voice.wav' } }) }
      if (pathname === '/api/chat') {
        const request = route.request().postDataJSON()
        assert.equal(request.voice?.stream, true)
        calls += 1
        let body = frame('message.start', {}) + frame('message.delta', { text: '你好，这是完整的合成测试回答。' })
        const interruptTest = request.messages.at(-1)?.content?.includes('中途停止')
        const samples = interruptTest ? Buffer.concat(Array(8).fill(pcm)) : pcm
        body += fallback ? frame('voice.error', { code: 'voice_connection', error: 'Synthetic connection failure' }) : frame('voice.audio', { audio: samples.toString('base64'), sequence: 0, sampleRate: 32000 }) + frame('voice.done', {})
        return route.fulfill({ contentType: 'text/event-stream', body: body + frame('message.done', {}) })
      }
      return route.fulfill({ json: { ok: true } })
    })
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    await page.locator('button:visible').filter({ hasText: '公开聊天' }).first().click()
    await page.locator('.voice-assistant-entry').click()
    await page.waitForFunction(() => document.querySelector('.voice-mode')?.dataset.voiceStatus === 'idle')
    const greetingCalls = synthesisCalls
    for (let turn = 0; turn < 10; turn++) {
      await page.locator('.voice-mode-input').fill(`你好，第${turn + 1}轮测试`)
      await page.locator('.voice-mode-submit').click()
      await page.waitForFunction(() => document.querySelector('.voice-mode')?.dataset.voiceStatus === 'speaking')
      await page.waitForFunction(() => document.querySelector('.voice-mode')?.dataset.voiceStatus === 'idle')
    }
    assert.equal(calls, 10)
    assert.equal(synthesisCalls, greetingCalls, 'streaming replies should not also call HTTP TTS')
    fallback = true
    await page.locator('.voice-mode-input').fill('你好，测试备用语音')
    await page.locator('.voice-mode-submit').click()
    await page.waitForFunction(() => document.querySelector('.voice-mode')?.dataset.voiceStatus === 'speaking')
    await page.waitForFunction(() => document.querySelector('.voice-mode')?.dataset.voiceStatus === 'idle')
    assert.equal(synthesisCalls, greetingCalls + 1)
    fallback = false
    await page.locator('.voice-mode-input').fill('你好，测试中途停止')
    await page.locator('.voice-mode-submit').click()
    await page.waitForFunction(() => document.querySelector('.voice-mode')?.dataset.voiceStatus === 'speaking')
    await page.locator('.voice-mode-actions button').last().click()
    await page.waitForFunction(() => document.querySelector('.voice-mode')?.dataset.voiceStatus === 'idle')
    await page.locator('.voice-mode-close').click()
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ width, rounds: 10, streamedAudio: 'passed', httpRecovery: 'passed', interruption: 'passed', pageErrors: errors.length }))
    await context.close()
  }
} finally { await browser.close() }

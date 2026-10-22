import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { chromium } from 'playwright-core'

const base = process.env.VOICE_QA_URL || 'http://127.0.0.1:5182'
const fixture = await fs.readFile(process.env.VOICE_QA_AUDIO || 'output/voice-network-2026-10-14/capture.wav')
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--autoplay-policy=user-gesture-required', ...(!process.env.VOICE_QA_PROXY ? ['--no-proxy-server'] : [])], ...(process.env.VOICE_QA_PROXY ? { proxy: { server: process.env.VOICE_QA_PROXY } } : {}) })
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
const silence = Buffer.alloc(32000 * 2 * 8).toString('base64')
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    const page = await context.newPage(), errors = [], modelRequests = []
    let asr = 0, chats = 0, modelStarted = 0, runtimeFinished = 0
    page.on('request', r => { if (r.url().endsWith('/silero_vad_v5.onnx')) modelStarted ||= Date.now() })
    page.on('requestfinished', r => { if (r.url().endsWith('/ort-wasm-simd-threaded.wasm.gz')) runtimeFinished = Date.now() })
    page.on('pageerror', e => errors.push(e.message))
    page.on('requestfailed', request => { if (request.url().includes('voice-vad/') || request.url().includes('/assets/')) console.error(JSON.stringify({ width, failedUrl: request.url(), failure: request.failure()?.errorText })) })
    page.on('response', r => { if (r.url().includes('voice-vad/')) modelRequests.push({ url: r.url(), status: r.status() }) })
    // Real WebAudio + real Silero/ONNX. Synthetic microphone only; no personal profile.
    await page.addInitScript(() => {
      window.__micFixture = { tracks: [], play: async base64 => {
        const f = window.__micFixture
        const raw = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
        const buffer = await f.ctx.decodeAudioData(raw.buffer)
        await f.ctx.resume()
        const source = f.ctx.createBufferSource(); source.buffer = buffer; source.connect(f.destination); source.start()
      } }
      navigator.mediaDevices.getUserMedia = async () => {
        const f = window.__micFixture
        f.ctx ||= new AudioContext(); await f.ctx.resume()
        f.destination = f.ctx.createMediaStreamDestination()
        f.tracks.push(...f.destination.stream.getTracks())
        return f.destination.stream
      }
    })
    const pendingFonts = []
    // A blocked font host must not delay the first interactive page.
    await page.route('https://fonts.googleapis.com/**', r => { pendingFonts.push(r) })
    await page.route('https://voice-fixture.test/**', r => r.fulfill({ body: fixture, contentType: 'audio/wav', headers: { 'access-control-allow-origin': '*' } }))
    await page.route('**/api/**', route => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/voice/status')) return route.fulfill({ json: { enabled: true, input: true, output: true, serverInput: true, streamOutput: true } })
      if (url.pathname.endsWith('/voice/synthesize')) return route.fulfill({ json: { url: 'https://voice-fixture.test/audio.wav' } })
      if (url.pathname.endsWith('/voice/transcribe')) {
        asr++; const body = route.request().postDataJSON(), bytes = Buffer.from(body.audio, 'base64')
        assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.ok(bytes.length > 10000)
        return route.fulfill({ json: { text: `你好，这是第${asr}次测试。` } })
      }
      if (url.pathname === '/api/chat') {
        chats++
        return route.fulfill({ contentType: 'text/event-stream', body: frame('message.start', {}) + frame('message.delta', { text: '这是测试回答。' }) + frame('voice.audio', { sequence: 0, sampleRate: 32000, audio: silence }) + frame('voice.done', {}) + frame('message.done', {}) })
      }
      return route.fulfill({ json: { ok: true } })
    })
    const navigationStart = Date.now()
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.locator('button:visible').filter({ hasText: '公开聊天' }).first().waitFor()
    const firstInteractiveMs = Date.now() - navigationStart
    await Promise.all(pendingFonts.map(r => r.fulfill({ body: '', contentType: 'text/css' })))
    await page.locator('button:visible').filter({ hasText: '公开聊天' }).first().click()
    await page.locator('.voice-assistant-entry').click()
    await page.waitForFunction(() => document.querySelector('.voice-mode')?.dataset.voiceStatus === 'idle')
    await page.getByRole('button', { name: '开启连续语音', exact: true }).click()
    const startup = Date.now()
    try {
      await page.waitForFunction(() => document.querySelector('.voice-mode')?.dataset.autoListening === 'true', null, { timeout: 125000 })
    } catch (error) {
      console.error(JSON.stringify({ width, startupFailed: true, status: await page.locator('.voice-mode-status').textContent(), modelRequests, pageErrors: errors }))
      throw error
    }
    const startupMs = Date.now() - startup
    console.log(JSON.stringify({ width, startupMs, resources: await page.evaluate(() => performance.getEntriesByType('resource').filter(e => /\/voice-vad\/|\/assets\/dist-/.test(e.name)).map(e => ({ url: e.name, durationMs: Math.round(e.duration), bytes: e.transferSize }))) }))
    await page.waitForTimeout(3000)
    assert.equal(asr, 0, 'silence must not upload or interrupt')
    for (let turn = 0; turn < 3; turn++) {
      await page.evaluate(data => window.__micFixture.play(data), fixture.toString('base64'))
      await page.waitForFunction(() => document.querySelector('.voice-mode')?.dataset.voiceStatus === 'listening')
      await page.waitForFunction(() => document.querySelector('.voice-mode')?.dataset.voiceStatus === 'speaking')
      assert.equal(asr, turn + 1); assert.equal(chats, turn + 1)
      assert.equal(await page.locator('.voice-mode').getAttribute('data-auto-listening'), 'true')
      // Next iteration starts during the eight-second answer: real speech interrupts.
    }
    await page.locator('.voice-mode-close').click()
    assert.ok(await page.evaluate(() => window.__micFixture.tracks.every(t => t.readyState === 'ended')))
    await page.waitForTimeout(1200)
    assert.equal(asr, 3); assert.equal(chats, 3)
    assert.ok(modelRequests.some(r => r.url.endsWith('.onnx') && r.status === 200))
    assert.ok(modelRequests.some(r => (r.url.endsWith('.wasm.gz') || r.url.includes('/parts/')) && r.status === 200))
    assert.ok(modelStarted > 0 && modelStarted < runtimeFinished, 'model must download alongside runtime')
    assert.equal(modelRequests.filter(r => r.url.endsWith('.onnx')).length, 1, 'model preload must be reused, not downloaded twice')
    assert.equal(await page.locator('link[rel=preload][as=fetch]').count(), 0, 'voice hint must be removed after startup/close')
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ width, firstInteractiveMs, startupMs, parallelModelDownload: true, modelDownloadedOnce: true, silence: 'passed', realVadTurns: asr, spokenInterruptions: 2, closeReleasesTracks: true, localAssets: modelRequests, pageErrors: errors.length }))
    await context.close()
  }
} finally { await browser.close() }

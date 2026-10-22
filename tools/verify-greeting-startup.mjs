import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { chromium } from 'playwright-core'
import assets from '../src/lib/voice-greeting-assets.json' with { type: 'json' }

const candidate = process.env.GREETING_QA_URL || 'https://zt-ai-static.niuzipai.workers.dev/greeting-candidate/'
const baseline = process.env.GREETING_BASELINE_URL
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-proxy-server', '--autoplay-policy=user-gesture-required'] })
const variants = [...(baseline ? [{ name: 'baseline', url: baseline }] : []), { name: 'prepared', url: candidate }]
try {
  for (const width of [1440, 390]) for (const language of ['zh', 'en', 'ja']) for (const variant of variants) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript(language => {
      localStorage.setItem('zt-ai:language', language)
      window.__playingAudio = []; window.__audioBlobs = new Set()
      const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL)
      URL.createObjectURL = blob => { const url = create(blob); if (blob.type === 'audio/mpeg') window.__audioBlobs.add(url); return url }
      URL.revokeObjectURL = url => { window.__audioBlobs.delete(url); return revoke(url) }
      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function (...args) { const result = play.apply(this, args); if (/^(https:|blob:)/.test(this.src)) result?.then(() => { window.__playingAudio.push(this) }).catch(() => {}); return result }
    }, language)
    const page = await context.newPage(), errors = [], requested = []
    let synthesisCalls = 0
    const bytes = await fs.readFile('public/' + assets.greetings[language].path)
    page.on('pageerror', e => errors.push(e.message))
    page.on('request', r => requested.push(r.url()))
    await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }))
    await page.route('https://greeting-fixture.test/**', r => r.fulfill({ body: bytes, contentType: 'audio/mpeg' }))
    await page.route('**/api/**', async route => {
      if (route.request().url().endsWith('/voice/synthesize')) {
        synthesisCalls++
        const data = route.request().postDataJSON()
        assert.equal(data.language, language); assert.equal(data.text, assets.greetings[language].text)
        // Replay the measured uncached generation delay; no provider variations.
        await new Promise(resolve => setTimeout(resolve, 2600))
        return route.fulfill({ json: { url: 'https://greeting-fixture.test/greeting.mp3' } }).catch(() => {})
      }
      return route.fulfill({ json: { enabled: true, input: true, output: true, serverInput: true, streamOutput: true } })
    })
    await page.goto(variant.url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.locator('.home-actions .primary-button').click()
    assert.equal(requested.some(u => u.includes('/voice-greetings/')), false, 'audio must wait for voice entry')
    const start = Date.now()
    await page.locator('.voice-assistant-entry').click()
    await page.waitForFunction(() => window.__playingAudio.some(a => !a.paused && a.currentTime > 0.05), null, { timeout: 15000 })
    assert.equal(await page.locator('.voice-mode').getAttribute('data-voice-status'), 'speaking', 'audible greeting and visible state must agree')
    const audibleMs = Date.now() - start
    assert.equal(synthesisCalls, variant.name === 'baseline' ? 1 : 0)
    await page.locator('.voice-mode-close').click()
    await page.waitForFunction(() => window.__playingAudio.every(a => a.paused))
    assert.equal(await page.evaluate(() => window.__audioBlobs.size), 0)
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ width, language, variant: variant.name, audibleMs, synthesisCalls, closeStopsAudio: true, pageErrors: errors }))
    await context.close()
  }
  for (const failure of ['missing', 'corrupt', 'timeout', 'cancel']) {
    const context = await browser.newContext(), page = await context.newPage()
    let synthesisCalls = 0
    const bytes = await fs.readFile('public/' + assets.greetings.zh.path)
    await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }))
    await page.route('**/voice-greetings/**', async r => {
      if (failure === 'missing') return r.fulfill({ status: 404, body: '' })
      if (failure === 'corrupt') return r.fulfill({ contentType: 'audio/mpeg', body: Buffer.alloc(bytes.length) })
      await new Promise(resolve => setTimeout(resolve, 3500))
      return r.fulfill({ body: bytes, contentType: 'audio/mpeg' }).catch(() => {})
    })
    await page.route('https://greeting-fixture.test/**', r => r.fulfill({ body: bytes, contentType: 'audio/mpeg' }))
    await page.route('**/api/**', r => {
      if (r.request().url().endsWith('/voice/synthesize')) { synthesisCalls++; return r.fulfill({ json: { url: 'https://greeting-fixture.test/greeting.mp3' } }) }
      return r.fulfill({ json: { enabled: true, input: true, output: true, serverInput: true } })
    })
    await page.goto(candidate, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.locator('.home-actions .primary-button').click()
    await page.locator('.voice-assistant-entry').click()
    if (failure === 'cancel') {
      await page.locator('.voice-mode-close').click()
      await page.waitForTimeout(2300)
      assert.equal(synthesisCalls, 0)
    } else {
      await page.waitForFunction(() => document.querySelector('.voice-mode')?.dataset.voiceStatus === 'speaking', null, { timeout: 12000 })
      assert.equal(synthesisCalls, 1)
    }
    console.log(JSON.stringify({ failure, synthesisCalls, passed: true }))
    await context.close()
  }
} finally { await browser.close() }

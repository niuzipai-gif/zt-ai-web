import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const urls = ['https://niuzipai-gif.github.io/zt-ai-web/', 'https://zt-ai-static.niuzipai.workers.dev/zt-ai-web/']
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-proxy-server'] })
try {
  for (let round = 0; round < 3; round++) for (const width of [1440, 390]) for (const url of round % 2 ? [...urls].reverse() : urls) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    const page = await context.newPage(), held = [], errors = []
    let warmupAt = 0, mainFinishedAt = 0, warmupRequests = 0
    page.on('request', r => { if (new URL(r.url()).pathname === '/api/health') { warmupAt = Date.now(); warmupRequests++ } })
    page.on('requestfinished', r => { if (/\/assets\/index-[^/]+\.js$/.test(r.url())) mainFinishedAt = Date.now() })
    page.on('pageerror', e => errors.push(e.message))
    await page.route('https://fonts.googleapis.com/**', r => { held.push(r) })
    // The backend can remain asleep indefinitely without delaying this check.
    await page.route('**/api/**', r => { held.push(r) })
    const start = Date.now()
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.locator('.home-actions .primary-button').waitFor({ timeout: 60000 })
      const interactiveMs = Date.now() - start
      assert.deepEqual(errors, [])
      if (url.includes('workers.dev')) { assert.equal(warmupRequests, 1); assert.ok(warmupAt < mainFinishedAt) }
      console.log(JSON.stringify({ round, width, url, interactiveMs, warmupRequests, warmupBeforeApp: warmupAt > 0 && warmupAt < mainFinishedAt, backendAndFontsHeld: true, pageErrors: errors }))
    } catch (error) { console.log(JSON.stringify({ round, width, url, failed: error.message })); if (url.includes('workers.dev')) process.exitCode = 1 }
    finally { await Promise.all(held.map(r => r.abort().catch(() => {}))); await context.close() }
  }
} finally { await browser.close() }

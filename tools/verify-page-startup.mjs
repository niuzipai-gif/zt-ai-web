import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import * as XLSX from 'xlsx'

const base = process.env.STARTUP_QA_URL || 'http://127.0.0.1:5184/zt-ai-web/'
const baseline = process.env.STARTUP_QA_BASELINE === 'true'
const throttled = process.env.STARTUP_QA_THROTTLE === 'true'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-proxy-server'] })
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    const page = await context.newPage(), requests = [], errors = [], scripts = []
    let submitted
    page.on('request', r => requests.push(r.url()))
    page.on('pageerror', e => errors.push(e.message))
    page.on('response', response => {
      if (/\/assets\/[^/]+\.js$/.test(response.url())) scripts.push(response.body().then(b => ({ url: response.url(), bytes: b.length })))
    })
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    if (throttled) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 128 * 1024, uploadThroughput: 128 * 1024 })
    const pendingFonts = []
    await page.route('https://fonts.googleapis.com/**', route => { pendingFonts.push(route) })
    await page.route('**/api/**', route => {
      if (new URL(route.request().url()).pathname === '/api/chat') {
        submitted = route.request().postDataJSON()
        return route.fulfill({ contentType: 'text/event-stream', body: 'event: message.delta\ndata: {"text":"已读取测试表格。"}\n\nevent: message.done\ndata: {}\n\n' })
      }
      return route.fulfill({ json: { ok: true, enabled: true, input: true, output: true } })
    })
    const started = Date.now()
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.locator('.home-actions .primary-button').waitFor({ timeout: 60000 })
    const interactiveMs = Date.now() - started
    const initialScripts = await Promise.all(scripts)
    const initialJsBytes = initialScripts.reduce((sum, s) => sum + s.bytes, 0)
    assert.ok(initialJsBytes > 0)
    if (!baseline) assert.ok(initialJsBytes < 400000, `initial JS budget exceeded: ${initialJsBytes}`)
    assert.equal(requests.some(u => /\/assets\/(xlsx|mammoth|pdf)[-/]/.test(u)), false, 'parsers must wait for upload')
    await Promise.all(pendingFonts.map(route => route.fulfill({ body: '', contentType: 'text/css' })))
    console.log(JSON.stringify({ base, width, throttled, interactiveMs, initialJsBytes, initialScripts, delayedFontDoesNotBlock: true }))
    if (!baseline) {
      await page.locator('.home-actions .primary-button').click()
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['ASIN', '库存'], ['STARTUP-QA', 12], ['SECOND', 8]]), '库存')
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
      await page.locator('input[type=file]').setInputFiles({ name: '启动测试.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer })
      await page.locator('.attachment-chip.is-ready').waitFor({ timeout: 60000 })
      assert.equal(requests.filter(u => /\/assets\/xlsx-/.test(u)).length, 1)
      await page.locator('.chat-compose-input-row input').fill('请读取这个测试表格')
      await page.locator('.chat-compose-input-row input').press('Enter')
      await page.waitForFunction(() => document.querySelector('.markdown-message')?.textContent?.includes('请读取'))
      await page.locator('.markdown-message').filter({ hasText: '已读取测试表格。' }).waitFor()
      assert.match(JSON.stringify(submitted.messages), /STARTUP-QA/)
      assert.match(JSON.stringify(submitted.messages), /合计.*20/)
      await page.locator('input[type=file]').setInputFiles('public/resume-en.docx')
      await page.locator('.attachment-chip.is-ready').filter({ hasText: 'resume-en.docx' }).waitFor({ timeout: 60000 })
      // Verify the loaded parser actually produces text, not just a file chip.
      await page.locator('.chat-compose-input-row input').fill('请读取简历')
      await page.locator('.chat-compose-input-row input').press('Enter')
      await page.waitForFunction(() => document.querySelectorAll('.markdown-message').length >= 4)
      assert.ok(JSON.stringify(submitted.messages).length > 1000)
      assert.equal(requests.filter(u => /\/assets\/mammoth.browser-/.test(u)).length, 1)
      console.log(JSON.stringify({ width, spreadsheetLazy: true, spreadsheetContentSent: true, docxLazy: true, pageErrors: errors }))
    }
    assert.deepEqual(errors, [])
    await context.close()
  }
} finally { await browser.close() }

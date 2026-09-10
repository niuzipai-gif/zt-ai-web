// Run in an isolated Playwright CLI session after opening a project detail:
// npx --package @playwright/cli playwright-cli -s=zt-motion run-code --filename=tools/qa-project-motion.js
async page => {
  const results = []
  const failures = []
  const runtimeErrors = []
  page.on('pageerror', error => runtimeErrors.push(error.message))
  // This is frontend QA, not a gateway test. Avoid sending synthetic visitor telemetry.
  await page.route('**/api/visit', route => route.fulfill({ json: { ok: true } }))
  const ensure = (condition, name, details) => {
    if (!condition) failures.push({ name, details })
  }
  const flow = page.locator('.project-flow-demo')
  const steps = page.locator('.project-flow-step')
  const locales = ['中文', 'English', '日本語']
  const snapshot = () => page.locator('body').ariaSnapshot()
  await page.setViewportSize({ width: 1440, height: 1100 })
  for (const [language, label] of locales.entries()) {
    await snapshot()
    await page.getByRole('button', { name: label, exact: true }).click()
    await snapshot()
    for (let project = 0; project < 3; project++) {
      await page.locator('.project-back').click()
      await snapshot()
      await page.locator('.project-card').nth(project).click()
      await snapshot()
      const id = await flow.getAttribute('data-project')
      await flow.scrollIntoViewIfNeeded()
      await steps.nth(0).click()
      const sizes = []
      for (let index = 0; index < 5; index++) {
        await steps.nth(index).click()
        sizes.push((await page.locator('.project-flow-stage').boundingBox()).height)
        ensure(await page.locator('.project-flow-active[aria-hidden="false"]').count() === 1, 'single active narrative', { language, project, index })
      }
      ensure(Math.max(...sizes) - Math.min(...sizes) < 1, 'stable stage height', { language, project, sizes })
      await steps.nth(2).focus()
      await page.keyboard.press('End')
      ensure(await steps.nth(4).getAttribute('aria-current') === 'step', 'End key', { language, project })
      await page.keyboard.press('Home')
      ensure(await steps.nth(0).getAttribute('aria-current') === 'step', 'Home key', { language, project })
      await page.keyboard.press('ArrowRight')
      ensure(await steps.nth(1).getAttribute('aria-current') === 'step', 'Arrow navigation', { language, project })
      for (const width of [1440, 768, 390, 360, 320]) {
        await page.setViewportSize({ width, height: width >= 1000 ? 1100 : 844 })
        await steps.nth(4).click()
        await page.waitForTimeout(750)
        const geometry = await flow.evaluate(root => {
          const rect = root.getBoundingClientRect()
          const elements = [...root.querySelectorAll('button')]
          const targets = elements.filter(el => el.getClientRects().length).map(el => {
            const r = el.getBoundingClientRect()
            return { label: el.getAttribute('aria-label') || el.innerText, width: r.width, height: r.height, right: r.right, left: r.left }
          })
          const track = root.querySelector('.project-flow-track').getBoundingClientRect()
          const nodes = [...root.querySelectorAll('.project-flow-node')].map(el => el.getBoundingClientRect())
          return {
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            targets,
            escaped: targets.filter(r => r.left < rect.left || r.right > rect.right),
            trackError: Math.max(Math.abs(track.left - nodes[0].left - nodes[0].width / 2), Math.abs(track.right - nodes[4].left - nodes[4].width / 2)),
            stageHeight: root.querySelector('.project-flow-stage').getBoundingClientRect().height,
          }
        })
        ensure(geometry.overflow <= 1 && !geometry.escaped.length, 'no horizontal overflow', { language, project, width, geometry })
        ensure(geometry.targets.every(t => t.width >= 43.9 && t.height >= 43.9), '44px touch targets', { language, project, width, targets: geometry.targets })
        ensure(geometry.trackError < 1.2, 'progress rail aligned with nodes', { language, project, width, error: geometry.trackError })
        results.push({ language, id, width, stageHeight: geometry.stageHeight, overflow: geometry.overflow })
        if (language === 0 && (width === 1440 || width === 390)) {
          await flow.screenshot({ path: 'output/playwright/' + id + '-' + width + '.png', style: '.topbar,.mobile-nav{visibility:hidden!important}' })
        }
      }
      await page.setViewportSize({ width: 1440, height: 1100 })
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await steps.nth(0).click()
  await page.waitForTimeout(4100)
  ensure(await steps.nth(0).getAttribute('aria-current') === 'step', 'reduced motion does not autoplay')
  await page.locator('.project-flow-icon-button').nth(1).click()
  await page.waitForTimeout(4100)
  ensure(await steps.nth(0).getAttribute('aria-current') === 'step', 'reduced motion replay stays manual')
  await steps.nth(3).click()
  const animations = await flow.evaluate(root => root.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length)
  ensure(animations === 0, 'no active animation under reduced motion', animations)
  ensure(runtimeErrors.length === 0, 'no runtime exceptions', runtimeErrors)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  return { checks: results.length, results, failures, runtimeErrors }
}

// Isolated Playwright CLI: run-code --filename=tools/qa-project-motion-timing.js
async page => {
  const errors = []
  const check = (ok, label) => { if (!ok) errors.push(label) }
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.locator('body').ariaSnapshot()
  await page.getByRole('button', { name: '中文', exact: true }).click()
  await page.locator('body').ariaSnapshot()
  const flow = page.locator('.project-flow-demo')
  const steps = page.locator('.project-flow-step')
  const active = () => steps.evaluateAll(nodes => nodes.findIndex(n => n.getAttribute('aria-current') === 'step'))
  await flow.scrollIntoViewIfNeeded()
  await steps.nth(0).click()
  await page.evaluate(() => {
    const root = document.querySelector('.project-flow-demo')
    const probe = window.__projectMotionProbe = { frames: [], changes: [], started: performance.now(), running: true }
    let last = performance.now()
    const record = () => {
      const index = [...root.querySelectorAll('.project-flow-step')].findIndex(n => n.getAttribute('aria-current') === 'step')
      if (probe.changes.at(-1)?.index !== index) probe.changes.push({ index, at: performance.now() - probe.started })
    }
    probe.observer = new MutationObserver(record)
    probe.observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['aria-current'] })
    record()
    const frame = time => {
      if (!probe.running) return
      probe.frames.push(time - last)
      last = time
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
  await page.getByRole('button', { name: '重新播放', exact: true }).click()
  await page.waitForTimeout(19800)
  check(await active() === 4, 'autoplay reaches the result')
  check(await flow.getAttribute('data-mode') === 'complete', 'autoplay stops after final dwell')
  const performanceResult = await page.evaluate(() => {
    const probe = window.__projectMotionProbe
    probe.running = false
    probe.observer.disconnect()
    const frames = probe.frames.filter(x => x > 0).sort((a, b) => a - b)
    return { changes: probe.changes, frameCount: frames.length, frameP95Ms: frames[Math.floor(frames.length * .95)], framesOver50Ms: frames.filter(x => x > 50).length }
  })
  check(performanceResult.changes.map(x => x.index).join(',') === '0,1,2,3,4', 'no skipped or repeated automatic steps')
  await page.getByRole('button', { name: '重新播放', exact: true }).click()
  await page.waitForTimeout(400)
  // A tall desktop viewport still shows half of the demo at the page bottom.
  // Use a shorter viewport so this check actually scrolls the whole demo away.
  await page.setViewportSize({ width: 1440, height: 600 })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(200)
  check(await flow.getAttribute('data-playing') === 'false', 'offscreen playback pauses')
  const offscreenBefore = await active()
  await page.waitForTimeout(4100)
  check(await active() === offscreenBefore, 'offscreen timer remains stable')
  await flow.scrollIntoViewIfNeeded()
  await page.waitForTimeout(3800)
  check(await active() === offscreenBefore + 1, 'returning resumes remaining dwell')
  await steps.nth(0).click()
  for (let i = 0; i < 30; i++) await steps.nth(i % 5).click()
  check(await active() === 4, 'rapid navigation keeps the latest selection')
  await page.waitForTimeout(4100)
  check(await active() === 4, 'rapid manual selection cancels stale auto timer')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await steps.nth(2).click()
  const reducedState = await flow.getAttribute('data-playing')
  check(reducedState === 'false', 'live reduced-motion change halts autoplay')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  return { errors, performanceResult, offscreenBefore, rapidSelections: 30 }
}

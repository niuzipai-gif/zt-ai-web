# ZT.AI Human-Centered Interaction Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public portfolio chat and the ZT.buddy desktop workspace immediately understandable, accessible on narrow screens, and visibly branded with the ZT.AI favicon without regressing isolated conversations or local-agent safety.

**Architecture:** Keep business state in the existing pure modules and add small presentation helpers for the pieces that need deterministic testing: public-chat starter prompts/history labels and Buddy execution labels. Keep `src/main.jsx` and `agent-desktop/public/app.js` as renderers that consume those helpers, existing i18n content, and the existing gateway APIs. Use the existing gold raster logo as the sole favicon source, copied into `public/` for Vite's GitHub Pages base path.

**Tech Stack:** React + Vite, vanilla ES modules in the desktop renderer, Node built-in test runner, Electron Builder, existing local Agent server.

---

## File map

- `public/zt-logo.png` — static copy of the existing approved gold logo for production favicon/manifest references.
- `public/site.webmanifest` — declares the approved icon for installed/browser surfaces.
- `index.html` — adds page icon and manifest references through `%BASE_URL%`.
- `src/lib/chat-ux.js` — pure public-chat presentation helpers: translated starter prompts, relative session label, profile compaction decision.
- `src/lib/chat-ux.test.js` — public-chat helper regression tests.
- `src/lib/i18n.js` — adds all three languages' prompt, retry, compact-profile and history labels.
- `src/lib/i18n.test.js` — asserts the new strings exist for every site language.
- `src/main.jsx` — renders starter prompts, retry-preserving errors, compact mobile profile, and semantic history metadata.
- `src/styles.css` — public-page hierarchy, 44px targets, focus, motion reduction, mobile profile and composer behavior.
- `agent-desktop/src/presentation.mjs` — pure label/plan helpers for execution intent and human-readable action summaries.
- `agent-desktop/src/presentation.test.mjs` — verifies ordinary chat, read-only work, research and approval-required work labels.
- `agent-desktop/public/index.html` — adds expandable inspector trigger and semantic live-state slots; retains the approved gold logo asset.
- `agent-desktop/public/app.js` — uses presentation helpers; renders compact execution cards, collapsible logs, clear recovery, and non-destructive mode changes.
- `agent-desktop/public/styles.css` — converts always-visible inspector details into responsive disclosure panels and improves targets/focus/reduced motion.
- `agent-desktop/src/renderer-contract.test.mjs` — protects the desktop DOM contract for new accessible controls.

### Task 1: Add production-safe favicon assets and prove their base-path contract

**Files:**
- Create: `public/zt-logo.png` (copy of `src/assets/zt-logo.png`)
- Create: `public/site.webmanifest`
- Modify: `index.html:4-9`
- Create: `tools/favicon-contract.test.mjs`

- [ ] **Step 1: Write the failing favicon contract test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

test('production HTML uses the approved gold logo as a base-aware favicon', async () => {
  const html = await fs.readFile('index.html', 'utf8')
  const manifest = JSON.parse(await fs.readFile('public/site.webmanifest', 'utf8'))
  const icon = await fs.stat('public/zt-logo.png')
  assert.match(html, /href="%BASE_URL%zt-logo\.png"/)
  assert.match(html, /href="%BASE_URL%site\.webmanifest"/)
  assert.equal(manifest.icons[0].src, './zt-logo.png')
  assert.ok(icon.size > 1000)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/favicon-contract.test.mjs`

Expected: FAIL because the page currently has no favicon/manifest reference and no public logo asset.

- [ ] **Step 3: Copy the approved source image and add the manifest**

Run the non-destructive asset copy:

```powershell
Copy-Item -LiteralPath 'src\assets\zt-logo.png' -Destination 'public\zt-logo.png' -Force
```

Create `public/site.webmanifest`:

```json
{
  "name": "ZT.AI",
  "short_name": "ZT.AI",
  "icons": [{ "src": "./zt-logo.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }],
  "theme_color": "#f4f4f2",
  "background_color": "#f4f4f2",
  "display": "standalone"
}
```

Replace the `<head>` end in `index.html` with:

```html
<meta name="theme-color" content="#f4f4f2" />
<link rel="icon" type="image/png" href="%BASE_URL%zt-logo.png" />
<link rel="apple-touch-icon" href="%BASE_URL%zt-logo.png" />
<link rel="manifest" href="%BASE_URL%site.webmanifest" />
<title>ZT.AI · 蔡宙廷的 AI 数字分身</title>
```

- [ ] **Step 4: Run the favicon test and production build**

Run:

```powershell
node --test tools/favicon-contract.test.mjs
$env:GITHUB_PAGES_BUILD='true'; npm run build
```

Expected: test PASS; `dist/zt-logo.png`, `dist/site.webmanifest`, and built `dist/index.html` all exist without an absolute root-only favicon URL.

- [ ] **Step 5: Commit only favicon files**

```powershell
git add public/zt-logo.png public/site.webmanifest index.html tools/favicon-contract.test.mjs
git commit -m "feat: add branded ZT.AI favicon"
```

### Task 2: Make public-chat decisions testable before changing the React UI

**Files:**
- Create: `src/lib/chat-ux.js`
- Create: `src/lib/chat-ux.test.js`
- Modify: `src/lib/i18n.js:44-74`, `src/lib/i18n.js:120`, `src/lib/i18n.js:132`
- Modify: `src/lib/i18n.test.js`

- [ ] **Step 1: Write failing tests for prompts, relative time, and mobile compaction**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildStarterPrompts, formatRelativeSessionTime, shouldUseCompactProfile } from './chat-ux.js'

test('starter prompts stay localised and actionable', () => {
  const prompts = buildStarterPrompts({ starterPrompts: ['A', 'B', 'C'] })
  assert.deepEqual(prompts, ['A', 'B', 'C'])
})

test('history uses a short human label instead of a technical date string', () => {
  const now = new Date('2026-08-16T12:00:00Z').getTime()
  assert.equal(formatRelativeSessionTime(now - 60_000, now, 'zh'), '刚刚')
  assert.equal(formatRelativeSessionTime(now - 3_600_000, now, 'en'), '1h ago')
})

test('profile compacts only on a narrow screen after chat has started', () => {
  assert.equal(shouldUseCompactProfile({ viewportWidth: 390, messageCount: 2 }), true)
  assert.equal(shouldUseCompactProfile({ viewportWidth: 390, messageCount: 0 }), false)
  assert.equal(shouldUseCompactProfile({ viewportWidth: 1024, messageCount: 2 }), false)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/lib/chat-ux.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `chat-ux.js`.

- [ ] **Step 3: Implement the minimal helpers**

Create `src/lib/chat-ux.js`:

```js
export function buildStarterPrompts(copy) {
  return Array.isArray(copy?.starterPrompts) ? copy.starterPrompts.filter(Boolean).slice(0, 3) : []
}

export function formatRelativeSessionTime(timestamp, now = Date.now(), language = 'zh') {
  const minutes = Math.max(0, Math.round((now - Number(timestamp || now)) / 60_000))
  if (language === 'zh') return minutes < 1 ? '刚刚' : minutes < 60 ? `${minutes} 分钟前` : minutes < 1_440 ? `${Math.floor(minutes / 60)} 小时前` : `${Math.floor(minutes / 1_440)} 天前`
  if (language === 'ja') return minutes < 1 ? 'たった今' : minutes < 60 ? `${minutes}分前` : minutes < 1_440 ? `${Math.floor(minutes / 60)}時間前` : `${Math.floor(minutes / 1_440)}日前`
  return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes}m ago` : minutes < 1_440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1_440)}d ago`
}

export function shouldUseCompactProfile({ viewportWidth, messageCount }) {
  return Number(viewportWidth) <= 800 && Number(messageCount) > 0
}
```

Add these keys under each `chat` object in `src/lib/i18n.js`:

```js
starterPrompts: [
  '蔡宙廷目前在坤信主要做什么？',
  'AI 选品与开品工作流具体怎样做？',
  '为什么他适合 AI 产品经理或 FDE？',
],
starterLabel: '可以从这些问题开始',
retry: '重新尝试',
retryHint: '刚才的回答没有完成，已保留你的问题和附件。',
compactProfile: '展开数字名片',
```

Use equivalent natural English/Japanese strings, keeping all three arrays at exactly three items.

- [ ] **Step 4: Extend the i18n contract test and run both test files**

Add to `src/lib/i18n.test.js`:

```js
for (const language of ['zh', 'en', 'ja']) {
  test(`${language} exposes three public-chat starter prompts`, () => {
    assert.equal(siteCopy[language].chat.starterPrompts.length, 3)
    assert.ok(siteCopy[language].chat.starterPrompts.every(Boolean))
  })
}
```

Run: `node --test src/lib/chat-ux.test.js src/lib/i18n.test.js`

Expected: all tests PASS.

- [ ] **Step 5: Commit only the public-chat state layer**

```powershell
git add src/lib/chat-ux.js src/lib/chat-ux.test.js src/lib/i18n.js src/lib/i18n.test.js
git commit -m "feat: add human centered public chat state"
```

### Task 3: Render the public-chat first-turn, retry, and history improvements

**Files:**
- Modify: `src/main.jsx:1-16`, `src/main.jsx:213-360`, `src/main.jsx:384-412`
- Modify: `src/lib/chat-session.test.js`

- [ ] **Step 1: Add failing session assertions for stable titles and retry preservation**

```js
test('creates a stable title from the first visitor question', () => {
  const session = createChatSession({ model: 'MINIMAX' })
  const title = createSessionTitle([{ role: 'user', text: '请介绍一下蔡宙廷的 AI 产品开发经历' }])
  assert.equal(title, '请介绍一下蔡宙廷的 AI 产品开发经历')
  assert.equal(session.messages.length, 0)
})
```

- [ ] **Step 2: Run the narrowed test before the renderer change**

Run: `node --test src/lib/chat-session.test.js`

Expected: the new title assertion fails if the current truncation or empty-session behavior differs.

- [ ] **Step 3: Make the renderer explicit about first-turn actions and recoverable errors**

In `src/main.jsx`:

1. Import `buildStarterPrompts`, `formatRelativeSessionTime`, and `shouldUseCompactProfile`.
2. Give `ChatBox` an `inputRef`, `lastFailedRequest` ref, and `window.innerWidth` state updated by a `resize` listener.
3. Replace the current `empty-chat` body with a label, title, body, a `starter-prompts` group, and a main button. Each prompt must call `setInput(prompt)` then focus the composer; it must not make a paid model request without the user pressing Send.
4. When the `/api/chat` request fails, keep the user message and attachments in history, replace only the pending ZT message with `{ status: 'error', text: copy.retryHint }`, and show a `retry` button that resends the saved request. Do not clear the composer or remove a pending attachment until the first request has been successfully queued.
5. In `ChatHistoryDrawer`, replace `toLocaleDateString()` with `formatRelativeSessionTime(session.updatedAt, Date.now(), language)`, and use `createSessionTitle(session.messages)` so a first visitor message names the session consistently.
6. Pass `language` to `ChatHistoryDrawer`; add `aria-current="page"` to the selected session button.
7. In `PublicProfile`, compute `compact = shouldUseCompactProfile({ viewportWidth, messageCount: session.messages.length })`; when compact, show avatar, name, role and an `aria-expanded` toggle rather than rendering the full about block by default.

The render structure for the no-message state must be:

```jsx
<div className="empty-chat" ref={messagesRef}>
  <span className="empty-chat-mark"><MessageCircle size={20} /></span>
  <span className="eyebrow">{copy.emptyEyebrow}</span>
  <h3>{copy.emptyTitle}</h3>
  <p>{copy.emptyBody}</p>
  <div className="starter-prompts" aria-label={copy.starterLabel}>
    {buildStarterPrompts(copy).map(prompt => (
      <button key={prompt} type="button" onClick={() => { setInput(prompt); inputRef.current?.focus() }}>{prompt}</button>
    ))}
  </div>
  <button className="empty-chat-action" type="button" onClick={() => inputRef.current?.focus()}>{copy.emptyAction}<ArrowUpRight size={14} /></button>
</div>
```

- [ ] **Step 4: Run state tests and build the public application**

Run:

```powershell
npm test
npm run build
```

Expected: tests pass; Vite compiles with no unresolved imports.

- [ ] **Step 5: Commit only public-chat rendering changes**

```powershell
git add src/main.jsx src/lib/chat-session.test.js
git commit -m "feat: guide public chat first turns and recovery"
```

### Task 4: Apply the public-page human-factor CSS without changing the existing brand system

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add a CSS contract test before changing the style sheet**

Create `src/lib/public-style-contract.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

test('public chat protects touch targets, focus, compact profile and reduced motion', async () => {
  const css = await fs.readFile('src/styles.css', 'utf8')
  for (const selector of ['.starter-prompts', '.profile-card.is-compact', '@media (prefers-reduced-motion: reduce)', '.chat-compose:focus-within']) assert.match(css, new RegExp(selector.replace(/[().]/g, '\\$&')))
  assert.match(css, /min-height:\s*44px/)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test src/lib/public-style-contract.test.js`

Expected: FAIL because the named compact-profile and motion selectors do not exist.

- [ ] **Step 3: Add focused CSS blocks at the end of `src/styles.css`**

Add only append-only overrides using the current grey/glass palette:

```css
.starter-prompts{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;max-width:560px;margin:18px auto 0}
.starter-prompts button,.empty-chat-action,.chat-history-button,.chat-new-button,.resume-inline-download{min-height:44px}
.starter-prompts button{border:1px solid #dce3e1;border-radius:12px;background:#fff;color:#56646b;padding:9px 12px;font-size:11px;line-height:1.45;text-align:left}
.starter-prompts button:hover{border-color:#9bbca9;background:#f3f8f4;color:#2d5f43}
.chat-compose:focus-within{border-color:#9bbca9;box-shadow:0 0 0 4px rgba(66,173,115,.12),0 13px 32px rgba(66,82,93,.09)}
.profile-card.is-compact{padding:14px 16px;min-height:auto}
.profile-card.is-compact .profile-copy,.profile-card.is-compact .profile-signature{display:none}
@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important}}
```

At `max-width:800px`, make `.chat-layout` put the chat first after a conversation starts, keep the full profile at the first empty session, and give `.chat-compose` enough `padding-bottom: max(12px, env(safe-area-inset-bottom))` plus a z-index above the bottom nav. Do not change desktop card radius, logo, colors or navigation labels.

- [ ] **Step 4: Run the CSS contract and full web test suite**

Run: `node --test src/lib/public-style-contract.test.js && npm test`

Expected: PASS.

- [ ] **Step 5: Commit only styles and the contract test**

```powershell
git add src/styles.css src/lib/public-style-contract.test.js
git commit -m "feat: improve public chat mobile ergonomics"
```

### Task 5: Add a tested human-readable presentation layer for ZT.buddy

**Files:**
- Create: `agent-desktop/src/presentation.mjs`
- Create: `agent-desktop/src/presentation.test.mjs`
- Modify: `agent-desktop/public/intent-router.mjs`
- Modify: `agent-desktop/src/intent-router.test.mjs`

- [ ] **Step 1: Write failing tests for intent presentation, not only routing**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { executionPresentation } from './presentation.mjs'

test('ordinary chat does not promise local execution', () => {
  assert.deepEqual(executionPresentation({ route: 'chat', kind: 'chat' }), {
    title: '普通聊天',
    summary: '我会直接回答，不会读取文件或调用本机工具。',
    approval: false,
  })
})

test('write and command tasks name the capability needing confirmation', () => {
  assert.match(executionPresentation({ route: 'agent', kind: 'write', requiresApproval: true }).summary, /写入/)
  assert.match(executionPresentation({ route: 'agent', kind: 'command', requiresApproval: true }).summary, /命令/)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test agent-desktop/src/presentation.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `presentation.mjs`.

- [ ] **Step 3: Implement the presentation map**

Create `agent-desktop/src/presentation.mjs`:

```js
const MAP = {
  chat: ['普通聊天', '我会直接回答，不会读取文件或调用本机工具。', false],
  read: ['准备读取', '准备查看当前工作区内容，只读取，不修改文件。', false],
  research: ['准备检索', '准备检索公开资料并在结果中附上来源链接。', false],
  write: ['准备修改', '准备在当前工作区写入或整理文件，执行前会请求写入确认。', true],
  command: ['准备执行', '准备运行命令、测试或构建，执行前会请求命令确认。', true],
  sensitive: ['需要额外确认', '该任务可能涉及高影响操作；我会在每一步请求明确确认。', true],
}

export function executionPresentation(intent = {}) {
  const [title, summary, approval] = MAP[intent.kind] || MAP.chat
  return { title, summary, approval: Boolean(intent.requiresApproval || approval) }
}
```

Export the same helper from a small `agent-desktop/public/presentation.mjs` re-export so the browser renderer and Node tests use the same source of truth. Extend the intent-router test to assert that `'你好'` has `route === 'chat'` and its presentation title is `普通聊天`.

- [ ] **Step 4: Run the focused Agent tests**

Run: `node --test agent-desktop/src/intent-router.test.mjs agent-desktop/src/presentation.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit only intent presentation files**

```powershell
git add agent-desktop/src/presentation.mjs agent-desktop/public/presentation.mjs agent-desktop/src/presentation.test.mjs agent-desktop/public/intent-router.mjs agent-desktop/src/intent-router.test.mjs
git commit -m "feat: explain Buddy execution intent clearly"
```

### Task 6: Make the desktop conversation timeline the default place for action context

**Files:**
- Modify: `agent-desktop/public/index.html`
- Modify: `agent-desktop/public/app.js`
- Modify: `agent-desktop/public/styles.css`
- Modify: `agent-desktop/src/renderer-contract.test.mjs`

- [ ] **Step 1: Add renderer contract assertions before DOM changes**

Add this test:

```js
test('desktop renderer exposes an accessible collapsible execution inspector', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  for (const id of ['inspector-toggle', 'execution-summary', 'context-ring', 'tool-trigger', 'voice-button']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`)
  }
  assert.match(html, /aria-expanded=/)
  assert.match(html, /aria-controls=/)
})
```

- [ ] **Step 2: Run the contract test to confirm it fails**

Run: `node --test agent-desktop/src/renderer-contract.test.mjs`

Expected: FAIL because `#inspector-toggle` and `#execution-summary` do not exist.

- [ ] **Step 3: Modify the desktop markup and renderer behavior**

1. In `agent-desktop/public/index.html`, change the right-column heading to include this button and add `id="execution-summary"` to the compact summary text:

```html
<button id="inspector-toggle" class="head-button buddy-only" type="button" aria-expanded="false" aria-controls="buddy-panel">执行上下文</button>
<span id="execution-summary" class="sr-only" aria-live="polite"></span>
```

2. Import `executionPresentation` in `agent-desktop/public/app.js`; add `inspectorToggle` and `executionSummary` to `els` and an `inspectorOpen` boolean to `state`.
3. Add `setInspectorOpen(open)` that toggles `data-inspector-open` on `.app-shell`, updates `aria-expanded`, and writes a short state sentence into `#execution-summary`.
4. In `runAgentTask`, call `classifyIntent` once. If it is chat, set the notice from `executionPresentation(intent).summary` and call `runChat`. If it is an Agent action, insert an assistant message before the request:

```js
const presentation = executionPresentation(intent)
recordChatMessage('assistant', `**${presentation.title}**\n\n${presentation.summary}`)
renderMessages()
```

5. Keep tool logs collapsed after `data.status === 'done'` by rendering an explicit `button` labelled `查看 N 条执行记录`; clicking it toggles a class on the matching message. The summary and final result stay visible without expanding raw logs.
6. For request failures, append a readable assistant message containing the original task and a `重新尝试` button that refills `#task-input`; do not display raw fetch errors as the primary user-facing content.
7. Keep the `+` drawer behavior and the existing `showSkillBrowser()` token insertion. It must focus the composer after selecting a Skill and must not invoke `/api/tasks`.
8. Make `#voice-button` retain only its microphone SVG and `aria-label="语音输入"`; if no speech provider is configured, show the existing preparation notice rather than a fake recording state.

- [ ] **Step 4: Add responsive and accessibility CSS**

Append rules to `agent-desktop/public/styles.css`:

```css
.head-button,.round-button,.send-button,.permission-button,.drawer-option,.skill-reference{min-height:44px}
.app-shell[data-inspector-open="false"] .buddy-panel{display:none}
.app-shell[data-inspector-open="false"][data-mode="BUDDY"] .desktop-grid{grid-template-columns:225px minmax(480px,1fr)}
.execution-log-toggle{display:inline-flex;align-items:center;min-height:36px;border:0;border-radius:8px;background:#eef2f3;color:#66747b;padding:7px 9px;font-size:10px}
.agent-activity-inline.is-collapsed{display:none}
@media (max-width:1120px){.app-shell[data-mode="BUDDY"] .buddy-panel{display:none}.app-shell[data-mode="BUDDY"][data-inspector-open="true"] .buddy-panel{display:grid}.app-shell[data-mode="BUDDY"] .desktop-grid{grid-template-columns:205px minmax(0,1fr)}}
@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important}}
```

Use the current mint/gold/grey variables; do not introduce a new visual system. Preserve the mobile one-column order and use `:focus-visible` for keyboard contrast.

- [ ] **Step 5: Run desktop renderer and Agent tests**

Run:

```powershell
npm run agent:test
npm run desktop:test
```

Expected: all existing and newly added tests PASS; no old `R` text-logo assertion fails.

- [ ] **Step 6: Commit only desktop renderer work**

```powershell
git add agent-desktop/public/index.html agent-desktop/public/app.js agent-desktop/public/styles.css agent-desktop/src/renderer-contract.test.mjs
git commit -m "feat: make Buddy execution easier to follow"
```

### Task 7: Perform full production verification before packaging or publishing

**Files:**
- Modify only if a defect is found in the preceding tests.
- Verify: `dist/`, `release/`, local public Vite preview, local Agent server.

- [ ] **Step 1: Run every automated suite against the final worktree**

Run:

```powershell
npm test
npm run agent:test
npm run desktop:test
npm run integration:test
$env:GITHUB_PAGES_BUILD='true'; npm run build
```

Expected: all commands exit 0. If `integration:test` needs a configured gateway, use its documented mock mode; do not silently skip it.

- [ ] **Step 2: Check the built public site artifacts**

Run:

```powershell
Test-Path dist\zt-logo.png
Test-Path dist\site.webmanifest
Select-String -LiteralPath dist\index.html -Pattern 'zt-logo\.png|site\.webmanifest'
```

Expected: all paths are true and both references use `/zt-ai-web/` after the Pages build.

- [ ] **Step 3: Conduct browser regression at desktop, 390px and 320px**

Use the approved in-app browser to verify:

1. Home and public chat show the gold tab icon, normal navigation and correct current-language copy.
2. In a new public session, three starter prompts appear; clicking one fills the composer and does not send automatically.
3. Sending a message creates a stable history title; opening history displays only that visitor's sessions and relative time.
4. At 390px and 320px, the composer remains visible above the bottom nav; profile compacts only after the conversation has messages; there is no horizontal overflow.
5. In desktop Agent, `你好` produces a normal chat message and no `/api/tasks` request; `看看我的桌面上有什么` produces a read-only execution summary; a write/command task announces required approval before executing.
6. Keyboard Tab makes every primary button and input visibly focused; tool drawer, history drawer and inspector toggle can be dismissed and focus returns to their trigger.

- [ ] **Step 4: Capture accepted evidence and inspect it**

Save separate screenshots as:

```text
.design-audit/final/01-public-desktop.png
.design-audit/final/02-public-mobile-390.png
.design-audit/final/03-public-narrow-320.png
.design-audit/final/04-buddy-chat.png
.design-audit/final/05-buddy-execution.png
```

Inspect every saved image and reject any screenshot with a blank screen, cropped composer, missing icon, loading failure or opaque technical error. Keep audit files out of the feature commit unless the repository explicitly tracks QA artifacts.

- [ ] **Step 5: Package only after all prior checks pass**

Run:

```powershell
npm run desktop:dist
Get-ChildItem release -Filter 'ZT.buddy-Desktop-*-x64.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 2 Name,Length,LastWriteTime
```

Expected: a newly timestamped installer and portable executable exist. Do not remove an installed application, publish GitHub Pages, or upload a release unless the user explicitly asks after local verification.

- [ ] **Step 6: Commit only defect fixes discovered in verification**

```powershell
git status --short
git add -- <only files changed to fix the verified defect>
git commit -m "fix: complete human centered interaction verification"
```

## Plan self-review

- Spec coverage: Task 1 covers favicon; Tasks 2–4 cover public chat hierarchy, mobile compaction, history, recovery, accessibility, reduced motion and language; Tasks 5–6 cover ZT.buddy intent, approval clarity, Skills, context and responsive inspector; Task 7 covers real build, browser and packaging verification.
- Safety coverage: public web stays conversation-only; Skills only insert references; write/command capability remains confirmation-gated; no API keys, admin logic or cross-visitor state is touched.
- Scope coverage: no Android/iOS/macOS, voice cloning, Gateway redesign, control room redesign or new public Agent execution is introduced.
- Completeness check: every task includes its target files, concrete change, test command and expected result.

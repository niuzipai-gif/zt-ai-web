# ZT.buddy Codex Shell Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the incomplete desktop shell with a Codex-like, stateful workspace that hides internal runtime output and keeps user-facing chat reliable.

**Architecture:** Keep the Electron main process responsible for native window controls and the local agent server responsible for conversations and execution. Add small, testable renderer helpers for application navigation and presentation cleaning; the DOM controller in `agent-desktop/public/app.js` will bind those helpers to the new toolbar, collapsible history rail, and execution summaries.

**Tech Stack:** Electron 37, browser-native ES modules, Node test runner, CSS custom properties, existing local MiMo runtime and desktop package verifier.

---

### Task 1: Add renderer navigation state with tests

**Files:**
- Create: `agent-desktop/public/navigation-state.mjs`
- Create: `agent-desktop/public/navigation-state.test.mjs`
- Modify: `agent-desktop/src/renderer-contract.test.mjs`

- [ ] **Step 1: Write the failing navigation-state test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createNavigationState, goBack, goForward, pushNavigationState } from './navigation-state.mjs'

test('navigation state traverses application snapshots without using browser history', () => {
  let state = createNavigationState({ chatId: 'a', mode: 'BUDDY', railCollapsed: false })
  state = pushNavigationState(state, { chatId: 'b', mode: 'BUDDY', railCollapsed: true })
  assert.equal(goBack(state).current.chatId, 'a')
  assert.equal(goForward(goBack(state)).current.chatId, 'b')
})
```

- [ ] **Step 2: Run the test and verify it fails because the module is missing**

Run: `node --test agent-desktop/public/navigation-state.test.mjs`

Expected: `ERR_MODULE_NOT_FOUND` for `navigation-state.mjs`.

- [ ] **Step 3: Implement the minimal pure navigation state module**

```js
export function createNavigationState(current) {
  return { entries: [current], index: 0, current }
}

export function pushNavigationState(state, next) {
  const entries = [...state.entries.slice(0, state.index + 1), next]
  return { entries, index: entries.length - 1, current: next }
}

export function goBack(state) {
  const index = Math.max(0, state.index - 1)
  return { ...state, index, current: state.entries[index] }
}

export function goForward(state) {
  const index = Math.min(state.entries.length - 1, state.index + 1)
  return { ...state, index, current: state.entries[index] }
}
```

- [ ] **Step 4: Verify the module and renderer contract**

Run: `node --test agent-desktop/public/navigation-state.test.mjs agent-desktop/src/renderer-contract.test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Commit the isolated navigation helper**

```bash
git add agent-desktop/public/navigation-state.mjs agent-desktop/public/navigation-state.test.mjs agent-desktop/src/renderer-contract.test.mjs
git commit -m "feat: add desktop application navigation state"
```

### Task 2: Prevent internal runtime output from becoming chat content

**Files:**
- Modify: `agent-desktop/src/presentation.mjs`
- Modify: `agent-desktop/src/presentation.test.mjs`
- Modify: `agent-desktop/public/app.js`

- [ ] **Step 1: Write failing tests for internal protocol filtering**

```js
import { sanitizeAssistantPresentation } from './presentation.mjs'

test('assistant presentation removes vendor tool protocol and hidden reasoning', () => {
  const value = sanitizeAssistantPresentation('<think>private</think><minimax><toolcall>{"name":"websearch"}</toolcall></minimax>已完成检索')
  assert.equal(value, '已完成检索')
})

test('assistant presentation returns a concise fallback for protocol-only output', () => {
  assert.equal(sanitizeAssistantPresentation('<toolcall>{"name":"read"}</toolcall>'), '')
})
```

- [ ] **Step 2: Run the presentation test and verify the missing export fails**

Run: `node --test agent-desktop/src/presentation.test.mjs`

Expected: failure because `sanitizeAssistantPresentation` is not exported.

- [ ] **Step 3: Implement a presentation-only sanitizer**

```js
export function sanitizeAssistantPresentation(value) {
  return String(value || '')
    .replace(/<think>[\s\S]*?<\/think>/giu, '')
    .replace(/<\/?(?:minimax|toolcall|tool_call)[^>]*>/giu, '')
    .replace(/\{\s*"(?:name|tool)"[\s\S]*?\}/gu, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
```

Use this function at every renderer boundary that appends an assistant delta or final summary. If it returns an empty string, retain the event only in the collapsed execution drawer and show the latest user-readable progress label.

- [ ] **Step 4: Verify clean assistant output and existing presentation behavior**

Run: `node --test agent-desktop/src/presentation.test.mjs agent-desktop/src/renderer-contract.test.mjs`

Expected: all tests pass; no rendered assistant bubble contains `<toolcall>`, `<minimax>`, or `<think>`.

- [ ] **Step 5: Commit the output boundary**

```bash
git add agent-desktop/src/presentation.mjs agent-desktop/src/presentation.test.mjs agent-desktop/public/app.js
git commit -m "fix: keep internal runtime output out of desktop chat"
```

### Task 3: Make document-reading failure recoverable

**Files:**
- Modify: `agent-desktop/public/attachment-reader.mjs`
- Create: `agent-desktop/public/attachment-reader.test.mjs`
- Modify: `agent-desktop/public/app.js`

- [ ] **Step 1: Write a failing test for user-readable document errors**

```js
import { attachmentReadFailure } from './attachment-reader.mjs'

test('DOCX reader failure never exposes internal component details', () => {
  assert.equal(
    attachmentReadFailure(new Error('桌面端文档读取组件尚未加载，请重新打开 ZT.buddy。')),
    '暂时无法读取此 DOCX 文档，请重新打开 ZT.buddy，或改用 PDF、TXT 后再试。',
  )
})
```

- [ ] **Step 2: Run the reader test and verify the export is missing**

Run: `node --test agent-desktop/public/attachment-reader.test.mjs`

Expected: failure because `attachmentReadFailure` is not exported.

- [ ] **Step 3: Implement the reader capability and failure mapping**

```js
export function attachmentReadFailure(error) {
  const message = String(error?.message || '')
  if (/mammoth|DOCX|文档读取组件/i.test(message)) return '暂时无法读取此 DOCX 文档，请重新打开 ZT.buddy，或改用 PDF、TXT 后再试。'
  return '附件暂时无法读取，请确认文件没有损坏后重试。'
}
```

Call it when `extractDocxText` fails so the attachment preview and the message context contain only this recoverable copy. Retain the original exception only in `console.warn` and the collapsed execution log.

- [ ] **Step 4: Verify attachment reader and renderer contract**

Run: `node --test agent-desktop/public/attachment-reader.test.mjs agent-desktop/src/renderer-contract.test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Commit the document read failure handling**

```bash
git add agent-desktop/public/attachment-reader.mjs agent-desktop/public/attachment-reader.test.mjs agent-desktop/public/app.js
git commit -m "fix: make desktop document read errors actionable"
```

### Task 4: Build the integrated toolbar and collapsible chat rail

**Files:**
- Modify: `agent-desktop/public/index.html`
- Modify: `agent-desktop/public/styles.css`
- Modify: `agent-desktop/public/app.js`
- Modify: `agent-desktop/src/renderer-contract.test.mjs`
- Modify: `desktop-app/main.mjs`

- [ ] **Step 1: Write failing renderer contract tests for the new controls**

```js
for (const id of ['sidebar-toggle', 'app-back', 'app-forward', 'app-refresh']) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`)
}
assert.doesNotMatch(html, /id=["']select-workspace["']/)
assert.match(app, /applyNavigationSnapshot/)
assert.match(app, /localStorage\.setItem\('zt-ai:desktop-rail-collapsed'/)
```

- [ ] **Step 2: Run the renderer contract and verify it fails**

Run: `node --test agent-desktop/src/renderer-contract.test.mjs`

Expected: failure for missing `#sidebar-toggle` and lingering `#select-workspace`.

- [ ] **Step 3: Update the DOM and styles**

Replace the top-level layout with an `app-toolbar` containing the four controls. Remove the `#select-workspace` button and its event binding. Add `data-rail-collapsed` to `.app-shell`; CSS must reduce the rail to an icon-only column while the conversation expands to the right. Set Electron `titleBarOverlay` color to the same `--desktop-surface` value used by the toolbar.

- [ ] **Step 4: Bind interaction state in `app.js`**

```js
function snapshotNavigation() {
  return { chatId: state.activeChatId, mode: state.mode, railCollapsed: state.railCollapsed }
}

function applyNavigationSnapshot(snapshot) {
  state.activeChatId = snapshot.chatId
  setMode(snapshot.mode, { recordNavigation: false })
  setRailCollapsed(snapshot.railCollapsed, { recordNavigation: false })
  renderMessages()
  renderChatHistory()
}
```

Make every user-initiated chat selection, mode switch and rail toggle record a snapshot once; make the toolbar refresh call existing `refreshState()`. Button disabled state must reflect navigation boundaries.

- [ ] **Step 5: Verify keyboard and visual contracts**

Run: `npm run agent:test`

Expected: all agent and renderer contract tests pass. Then run `npm run desktop:dev`, resize to 980px and verify: no white title block, chat rail collapses/expands, navigation buttons update, composer stays visible.

- [ ] **Step 6: Commit the shell repair**

```bash
git add agent-desktop/public/index.html agent-desktop/public/styles.css agent-desktop/public/app.js agent-desktop/src/renderer-contract.test.mjs desktop-app/main.mjs
git commit -m "feat: add Codex-style desktop shell navigation"
```

### Task 5: Keep execution detail collapsed while preserving live feedback

**Files:**
- Modify: `agent-desktop/public/app.js`
- Modify: `agent-desktop/public/styles.css`
- Modify: `agent-desktop/src/renderer-contract.test.mjs`

- [ ] **Step 1: Write a failing contract test**

```js
assert.match(app, /agent-live-progress/)
assert.match(app, /execution-details/)
assert.match(app, /details\.open = false/)
assert.match(styles, /@keyframes live-pulse/)
```

- [ ] **Step 2: Run the contract and verify the missing live state contract fails**

Run: `node --test agent-desktop/src/renderer-contract.test.mjs`

Expected: failure until the renderer exposes a dedicated execution-details class and pulse animation.

- [ ] **Step 3: Implement concise progress and closed audit drawer**

Keep only `state.latestActivity` visible in `.agent-live-progress` below the assistant message. Append detailed plan events, raw tool events and original errors to a `<details class="execution-details">` element with `open = false`. The displayed final assistant response must use the sanitized presentation string from Task 2.

- [ ] **Step 4: Verify the execution behavior**

Run: `npm run agent:test`

Expected: all tests pass. Manual smoke: submit a workspace-read task and confirm the chat shows a single changing status line, while complete logs remain closed until clicked.

- [ ] **Step 5: Commit the execution presentation**

```bash
git add agent-desktop/public/app.js agent-desktop/public/styles.css agent-desktop/src/renderer-contract.test.mjs
git commit -m "fix: collapse desktop execution detail by default"
```

### Task 6: Package and verify the new desktop application

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tools/verify-desktop-package.mjs` only if its explicit version check requires updating

- [ ] **Step 1: Raise the desktop version only after all tests are green**

```json
{ "version": "0.2.18" }
```

- [ ] **Step 2: Run the complete test and build sequence**

Run:

```bash
npm test
npm run agent:test
npm run desktop:test
npm run desktop:dist
npm run desktop:verify
```

Expected: all suites pass and `desktop:verify` reports the bundled MiMo runtime and executable as valid.

- [ ] **Step 3: Launch the unpacked build and perform the final smoke test**

Verify login page, toolbar, collapsed rail, application navigation, normal chat, ZT.buddy task, a DOCX error path, and drag/paste attachment entry. Capture a screenshot in `.runtime-qa/` for review.

- [ ] **Step 4: Commit package metadata and handoff the installer**

```bash
git add package.json package-lock.json tools/verify-desktop-package.mjs
git commit -m "chore: package ZT.buddy shell repair"
```


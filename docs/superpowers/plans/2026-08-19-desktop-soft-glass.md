# ZT.buddy Desktop Soft Glass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ZT.buddy desktop workspace feel like one continuous, high-end Soft Glass work surface, with the native menu, app topbar, background, sidebar, chat area, and composer visually integrated.

**Architecture:** Keep the existing HTML structure and agent behavior. Add a scoped visual theme override at the end of the desktop stylesheet, adjust only the Electron window background color, and extend the renderer contract test to lock the required visual guarantees.

**Tech Stack:** Electron, vanilla HTML/CSS/ES modules, Node test runner, Electron Builder.

---

### Task 1: Lock the visual contract before styling

**Files:**
- Modify: `agent-desktop/src/renderer-contract.test.mjs`

- [ ] **Step 1: Add assertions for the new visual guarantees**

Read `agent-desktop/public/styles.css` and `desktop-app/main.mjs`, then assert the stylesheet contains `backdrop-filter: blur(`, `radial-gradient(`, `.desktop-grid`, `.glass-card`, `:focus-visible`, `prefers-reduced-motion:reduce`, and `-webkit-app-region: drag`; assert Electron contains `backgroundColor: '#e9eef2'`, `titleBarStyle: 'hidden'`, and `titleBarOverlay`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run `npm run desktop:test -- --test-name-pattern="visual"`.
Expected: FAIL because the new background color and visual contract assertion are not present yet.

### Task 2: Build the continuous Soft Glass surface

**Files:**
- Modify: `agent-desktop/public/styles.css`

- [ ] **Step 1: Append a scoped theme layer after the existing rules**

Add one final visual-only override block. It must define `--bg: #e9eef2`, `--glass: rgba(248,250,251,.62)`, and low-opacity glass shadows; change `body` to a cool-gray linear gradient with two low-contrast radial gradients; add a pointer-events-none `body::before` highlight layer; set `.topbar`, `.glass-card`, `.tool-drawer`, and `.permission-drawer` to translucent backgrounds with blur; give `.conversation`, `.chat-rail`, `.conversation-head`, `.bubble`, `.user-message .bubble`, and `.composer` separate but readable glass opacities; add hover/focus-visible states for controls; and add an 800px media fallback plus a reduced-motion fallback that removes continuous motion and blur without hiding content.

Do not change any mode, permission, attachment, or message behavior selectors outside this final visual layer.

- [ ] **Step 2: Run the focused contract test**

Run `npm run desktop:test -- --test-name-pattern="visual"`.
Expected: PASS.

### Task 3: Unify the native Electron window surface

**Files:**
- Modify: `desktop-app/main.mjs`

- [ ] **Step 1: Use the title-bar overlay without making the window frameless**

Keep `backgroundColor: '#e9eef2'`, add `titleBarStyle: 'hidden'`, and add `titleBarOverlay: { color: '#e9eef2', symbolColor: '#65737c', height: 34 }`. Keep the framed window, icon, preload, sandbox, and navigation protections unchanged. The CSS topbar must provide `-webkit-app-region: drag` with interactive children set to `no-drag`.

- [ ] **Step 2: Run the complete desktop test suite**

Run `npm run desktop:test`.
Expected: all desktop tests pass.

### Task 4: Visual QA, package verification, and handoff

**Files:**
- Create: `.runtime-qa/desktop-soft-glass-preview.png`

- [ ] **Step 1: Capture a stable main-workspace screenshot**

Open the existing desktop test server at `http://127.0.0.1:8788/`, hide only the auth gate in the QA browser context, and capture a 1480×920 screenshot. Reject it if it shows a blank page, login wall, loading state, or broken image.

- [ ] **Step 2: Inspect the screenshot**

Verify the native/app layers read as one continuous cool-gray surface, the conversation is dominant, the sidebar is secondary, and the composer has sufficient contrast. Save the accepted screenshot to `.runtime-qa/desktop-soft-glass-preview.png`.

- [ ] **Step 3: Run project verification**

Run `npm test`, `npm run agent:test`, `npm run desktop:test`, and `git diff --check`. Expected: every test passes and `git diff --check` reports no errors.

- [ ] **Step 4: Build the desktop package outside the locked release output**

Run Electron Builder into `C:\Users\Administrator\Desktop\zt-ai-release-20260819-v217`, then run `npm run desktop:verify` with `ZT_AI_PACKAGE_DIR` pointing at its `win-unpacked` folder. Confirm the executable, bundled MiMo runtime, lock, and notice are present.

- [ ] **Step 5: Hand off the screenshot and installer paths**

Return the accepted screenshot path, installer path, portable path, test summary, and note that public web and Android code paths were not changed by this visual pass.

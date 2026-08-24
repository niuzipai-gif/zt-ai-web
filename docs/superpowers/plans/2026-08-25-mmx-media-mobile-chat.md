# MMX Media Routing and Mobile Chat Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make desktop image/video requests use the gateway's MMX media route and make the Android public chat a stable, layered mobile conversation surface.

**Architecture:** The desktop app will classify explicit image/video creation requests as public media chat and send them to the gateway, so the gateway remains the only place that holds provider credentials and emits `media.completed`. The provider will accept the documented `MMX_API_KEY`/`MMX_BASE_URL` configuration with a backwards-compatible MiniMax fallback. The Android shell will add an `android-shell` CSS scope and turn the chat page into a viewport-height flex layout with an independently scrolling message list, fixed composer/footer, and no desktop profile column.

**Tech Stack:** Node.js test runner, Vite/React public web, vanilla desktop client modules, MiniMax/MMX REST API, CSS media queries, Render environment configuration.

---

### Task 1: Lock regression contracts before implementation

**Files:**
- Modify: `agent-desktop/src/intent-router.test.mjs`
- Modify: `server/src/contracts/chat.test.js`
- Create: `server/src/providers/mmx.test.js`
- Modify: `src/lib/public-style-contract.test.js`
- Modify: `src/lib/cross-platform-contract.test.js`
- Modify: `agent-desktop/src/runtime/codex-app-server.test.mjs`

- [ ] **Step 1: Add failing intent and media contracts**

Assert that `classifyIntent('随便生成一个美女的图片给我', { mode: 'BUDDY' })` returns `{ kind: 'media', route: 'chat' }`, video creation follows the same route, and ordinary “生成报告” remains a write action. Assert `isMediaIntent` recognizes direct image/video wording without matching normal generated documents.

- [ ] **Step 2: Add a fixture-only MMX credential contract**

Exercise `runHiddenMediaRequest` against a local HTTP fixture with `MMX_ENABLED=true`, only `MMX_API_KEY=fixture-key`, and `MMX_BASE_URL=<fixture>/v1`; assert the image request uses `Authorization: Bearer fixture-key`, calls `/v1/image_generation`, and returns the fixture URL. No real provider key or network request is used.

- [ ] **Step 3: Add desktop and Android source contracts**

Assert the desktop client handles `media.completed`, persists a `media` object, and renders a media preview class. Assert the Android shell class is present in `src/main.jsx` and the scoped CSS contains a viewport-height chat, independently scrolling messages, and a scoped hidden profile card.

- [ ] **Step 4: Run only the new targeted tests and observe red**

Run:

```powershell
npm run agent:test -- --test-name-pattern="media|MMX|Android|desktop"
node --test server/src/contracts/chat.test.js server/src/providers/mmx.test.js
```

Expected: the new assertions fail before implementation; existing tests must still load.

### Task 2: Make MMX the single media route

**Files:**
- Modify: `server/src/providers/mmx.js`
- Modify: `server/.env.example`
- Modify: `render.yaml`
- Modify: `README.md`
- Modify: `PORTABLE-SETUP.md`
- Modify: `agent-desktop/src/runtime/codex-app-server.mjs`

- [ ] **Step 1: Normalize MMX configuration**

Read `MMX_API_KEY` first and fall back to `MINIMAX_API_KEY`; read `MMX_BASE_URL` first and fall back to `MINIMAX_BASE_URL`. Keep the existing MiniMax REST endpoints because they are the hosted MMX-compatible media service and Render cannot rely on a local CLI binary.

- [ ] **Step 2: Keep provider failures explicit**

When media is requested but MMX is disabled or no key exists, return the existing configured-service message; when the provider is called and fails, emit the existing `message.error` path. Never claim a media result without a URL or task ID.

- [ ] **Step 3: Add the Render variable without a secret**

Declare `MMX_API_KEY` as `sync: false` and `MMX_BASE_URL=https://api.minimaxi.com/v1`; do not add a value. Update examples so the deployed and portable configuration names match the implementation.

- [ ] **Step 4: Guard the local execution runtime**

Add a concise instruction to `guardedTask` that image/video creation must be routed to the gateway's MMX media path, never call or mention `image_gen`/`imagegen`, and never claim success without a returned media URL. This is a fallback guard; the primary routing happens before `/api/tasks`.

### Task 3: Route desktop media requests and show the generated result

**Files:**
- Modify: `agent-desktop/public/intent-router.mjs`
- Modify: `agent-desktop/public/app.js`
- Modify: `agent-desktop/public/conversation-state.mjs`
- Modify: `agent-desktop/public/styles.css`

- [ ] **Step 1: Add a media intent branch before write matching**

Return a `media` chat intent for explicit image/video generation requests, then make `runAgentTask()` call `runChat({ agent: false })` for that intent. This avoids the Codex execution workspace and sends the request to the same gateway path used by the public website.

- [ ] **Step 2: Consume media SSE events**

Handle `media.started` with a short progress message and `media.completed` by storing `{ kind, url }`, finishing the assistant text, and attaching a structured preview. Preserve `research.sources` handling and existing error/retry behavior.

- [ ] **Step 3: Persist and restore media safely**

Allow only HTTPS media URLs in conversation state, cap one media result per message, and render images with `alt` text or videos with controls plus an external link. Build DOM nodes rather than interpolating untrusted media URLs into HTML.

- [ ] **Step 4: Run the desktop targeted tests**

Run:

```powershell
npm run agent:test -- --test-name-pattern="media|MMX|conversation"
```

Expected: all selected tests pass and no existing execution routing test regresses.

### Task 4: Isolate the Android chat experience

**Files:**
- Modify: `src/main.jsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Scope the Android shell**

Add `android-shell` to the root app class only when `?zt-shell=android` is present; retain the existing download suppression.

- [ ] **Step 2: Replace the desktop-first mobile flow with a chat viewport**

Under `.android-shell.page-chat` hide the profile column, make `.main-content` and `.chat-layout` fill the space between the 62px header and 67px bottom nav, make `.messages` the only scrolling region, and keep the composer/footer at the bottom with safe-area padding.

- [ ] **Step 3: Keep the language control touch-safe**

Do not change the native mobile language select; ensure the Android chat rules do not cover it or place another fixed layer above it. Prevent page overscroll only inside the Android shell.

- [ ] **Step 4: Run public style/build checks**

Run:

```powershell
node --test src/lib/public-style-contract.test.js src/lib/cross-platform-contract.test.js
npm run build
```

Expected: the Android shell contracts and production build pass.

### Task 5: Verify the integrated result and prepare release

**Files:**
- No source changes unless a targeted regression is found.

- [ ] **Step 1: Run the focused server and desktop suites**

Run:

```powershell
node --test server/src/contracts/chat.test.js server/src/providers/mmx.test.js server/src/index.image.test.js
npm run agent:test
```

- [ ] **Step 2: Run the existing web build and integration checks**

Run `npm run build` and the smallest relevant integration command from `package.json`; do not repeat the full historical suite unless a regression appears.

- [ ] **Step 3: Inspect the final diff and preserve user-owned directories**

Run `git diff --check` and `git status --short`; verify `.design-audit/` and `.runtime-qa/` remain untouched and no API key appears in tracked files.

- [ ] **Step 4: Commit the implementation**

Use a focused commit message such as `fix: route desktop media through mmx and stabilize android chat`.


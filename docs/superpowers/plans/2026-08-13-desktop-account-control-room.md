# Desktop Account Agent and Control Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a real Electron desktop Agent with accounts and a separate password-protected Control Room that records and displays ZT.AI product usage, approximate tokens, IPs, and authorized chat records.

**Architecture:** The existing Node Gateway becomes the shared account, telemetry, and admin API. The Electron app loads a local renderer, starts the local execution worker, and sends bearer-authenticated model requests through the Gateway. The Control Room is a same-origin static admin site served by the Gateway, while the existing public web page remains public-chat-only.

**Tech Stack:** Node.js ESM, built-in HTTP/crypto/fs, JSON store abstraction for portable local persistence, React/Vite public site, Electron, electron-builder, SSE, Node test runner.

---

### Task 1: Account and telemetry data contract

**Files:**
- Create: `server/src/data-store.js`
- Create: `server/src/auth.js`
- Create: `server/src/telemetry.js`
- Create: `server/src/data-store.test.js`
- Create: `server/src/auth.test.js`
- Create: `server/src/telemetry.test.js`
- Modify: `server/src/index.js`

- [ ] Write tests for atomic JSON persistence, unique username registration, token expiry/revocation, masked IP display, token estimation, and product-scoped visitor identity.
- [ ] Implement a queued JSON store at `ZT_AI_DATA_PATH` with `users`, `sessions`, `visitors`, `conversations`, `messages`, `usageEvents`, and `adminSessions` collections; never write API keys or passwords.
- [ ] Implement scrypt password hashing, random bearer tokens stored only as hashes, 30-day user sessions, and short-lived admin sessions.
- [ ] Implement telemetry helpers that capture product, model, request type, status, IP, user agent, estimated input/output/total tokens, cost estimate, messages, and retention cleanup.
- [ ] Add `/api/auth/register`, `/api/auth/login`, `/api/auth/me`, and `/api/auth/logout` with input length limits and consistent error responses.

### Task 2: Instrument public chat and desktop Agent APIs

**Files:**
- Modify: `server/src/index.js`
- Modify: `server/src/contracts/chat.js`
- Modify: `src/main.jsx`
- Modify: `agent-desktop/src/server.mjs`
- Modify: `agent-desktop/src/agent-core.mjs`
- Modify: `agent-desktop/src/agent-core.test.mjs`
- Modify: `server/src/index.test.js`

- [ ] Add authenticated bearer handling for desktop requests and anonymous visitor handling for public requests.
- [ ] Make `/api/chat` record the latest user message and the streamed assistant reply under `product=web`, `visitorId`, and `conversationId`; keep attachment binaries out of the store.
- [ ] Make `/api/agent/plan` and `/api/agent/chat` require a desktop account token, record model calls and task messages under `product=desktop-agent`, and pass the token only to the Gateway.
- [ ] Add `visitorId`, `conversationId`, and product metadata to the existing web request body without changing per-visitor local context behavior.
- [ ] Guard the local Agent API with a generated local secret when launched by Electron, pass account token/task ID into the task manager, and preserve old local developer mode when no secret is configured.

### Task 3: Independent Control Room website

**Files:**
- Create: `server/public/control-room/index.html`
- Create: `server/public/control-room/app.js`
- Create: `server/public/control-room/styles.css`
- Create: `server/public/control-room/README.md`
- Modify: `server/src/index.js`
- Modify: `render.yaml`
- Create: `tools/set-admin-password.ps1`
- Test: `server/src/admin.test.js`

- [ ] Write tests proving unauthenticated admin routes return 401, wrong passwords do not set a session, and detail responses require an admin session.
- [ ] Add `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/me`, `GET /api/admin/overview`, `GET /api/admin/visitors`, and `GET /api/admin/visitors/:id`.
- [ ] Serve the independent Control Room from `/admin/`; show a login screen first, then the overview, filters, user table, and detail drawer with message timeline.
- [ ] Display full IP only inside the authenticated detail view and masked IP in lists; show approximate token wording when provider usage is unavailable.
- [ ] Add `ADMIN_PASSWORD_SALT`, `ADMIN_PASSWORD_HASH`, `DATA_RETENTION_DAYS`, and `ZT_AI_DATA_PATH` to deployment documentation without committing the user’s password.

### Task 4: Electron desktop Agent

**Files:**
- Create: `desktop-app/package.json`
- Create: `desktop-app/main.mjs`
- Create: `desktop-app/preload.mjs`
- Create: `desktop-app/renderer/index.html`
- Create: `desktop-app/renderer/app.js`
- Create: `desktop-app/renderer/styles.css`
- Create: `desktop-app/README.md`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] Write renderer tests for login/register gating, token logout, model persistence, and task stream rendering.
- [ ] Implement an Electron BrowserWindow with context isolation, no nodeIntegration, no external navigation, and a local renderer.
- [ ] Start the existing local execution worker from Electron with a generated local secret and a user-selectable workspace; clean it up on app exit.
- [ ] Build the login/register view and Codex-style three-column execution workspace, connecting task SSE, permission approval, model switch, task history, and workspace selection to the local worker.
- [ ] Store only the bearer token in memory/local storage, never the account password; expose only minimal preload IPC methods.
- [ ] Add `desktop:dev` and `desktop:dist` scripts and electron-builder configuration for a Windows installer.

### Task 5: Integration, visual verification, and delivery

**Files:**
- Modify: `README.md`
- Modify: `PORTABLE-SETUP.md`
- Modify: `render.yaml`
- Create: `tools/verify-control-room.ps1`
- Create: `tools/package-desktop.ps1`

- [ ] Run `npm test`, `npm run agent:test`, desktop renderer tests, and `npm run build`.
- [ ] Start a clean local Gateway, register a test desktop account, make a web chat call and a desktop Agent call, then verify the Control Room shows product, model, calls, estimated tokens, IP and messages.
- [ ] Verify wrong admin password, missing bearer token, cross-user detail access, expired session, and retention cleanup.
- [ ] Run Electron in development mode and capture desktop/phone-width screenshots; fix overflow, blank states, and clipped text before packaging.
- [ ] Build the Windows installer, inspect its contents, ensure no API keys or test data are included, and document the separate Control Room URL and admin environment setup.
- [ ] Commit and push only the intended project changes; preserve unrelated user edits to resume files.

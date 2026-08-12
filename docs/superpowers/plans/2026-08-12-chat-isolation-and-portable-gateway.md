# ZT.AI Chat Isolation and Portable Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate every visitor's chat data, add multi-session chat history with a drawer and new-chat action, and place a secret-safe portable gateway package on the desktop.

**Architecture:** Replace the single localStorage chat record with a visitor-scoped store containing visitorId, sessions, and active session ID. Keep provider requests stateless: the browser sends only the active session history. Make the gateway launcher resolve its root from the script location and build a deterministic ZIP that excludes secrets, dependencies, logs, and build residue.

**Tech Stack:** React, localStorage, Vite, Node HTTP gateway, PowerShell, WScript Shell, .zip archive.

---

### Task 1: Visitor-scoped session store

**Files:**
- Modify: `E:\ZT.AI\zt-ai-web\src\lib\chat-session.js`
- Modify: `E:\ZT.AI\zt-ai-web\src\lib\chat-session.test.js`

- [ ] Add `VISITOR_KEY`, `createVisitorId`, `createChatSession`, `createVisitorState`, `loadVisitorState`, `saveVisitorState`, and `clearVisitorState` while retaining a migration path from `zt-ai:public-chat:v2` into one private first session.
- [ ] Store `{ version: 3, visitorId, activeSessionId, sessions: [{ id, title, model, messages, createdAt, updatedAt }] }` under one browser key; strip image previews before persistence as before.
- [ ] Add tests for unique visitor IDs, session creation/switching persistence, migration of v2 state, and independent stores with different visitor IDs.

### Task 2: Chat drawer and new-chat UI

**Files:**
- Modify: `E:\ZT.AI\zt-ai-web\src\main.jsx`
- Modify: `E:\ZT.AI\zt-ai-web\src\styles.css`

- [ ] Make `App` load the visitor store and pass the active session, session list, visitor short ID, `onNewChat`, and `onSelectSession` into `ChatBox`.
- [ ] Make `ChatBox` persist only the active session's messages/model into the visitor store; keep stream state local and preserve model switching within the session.
- [ ] Add `ChatHistoryDrawer` with a top `新建聊天` action, session items, message counts, relative timestamps, visitor short ID, privacy copy, close action, and responsive side-drawer behavior.
- [ ] Add a `新建聊天` button in the chat header and empty-chat welcome state. Generate session titles from the first user message, truncated to a safe display length.
- [ ] Keep attachment serialization behavior and `resume.docx` download unchanged.

### Task 3: Portable gateway scripts and documentation

**Files:**
- Modify: `E:\ZT.AI\zt-ai-web\start-gateway.ps1`
- Modify: `E:\ZT.AI\zt-ai-web\start-gateway-silent.vbs`
- Modify: `E:\ZT.AI\zt-ai-web\README.md`
- Create: `E:\ZT.AI\zt-ai-web\PORTABLE-SETUP.md`
- Modify: `E:\ZT.AI\zt-ai-web\.env.example`

- [ ] Resolve `$projectRoot` from `$PSScriptRoot`, keep port 8790 duplicate detection, and resolve logs relative to that root.
- [ ] Document that real `aikey.env` must be created locally after copying `aikey.env.example`; never include a real key in either ZIP.
- [ ] Document `npm install`, `npm run gateway`, `npm run dev`, and the static Pages/Render deployment boundary.

### Task 4: Tests, release, and desktop archives

**Files:**
- Create on desktop: `C:\Users\Administrator\Desktop\ZT.AI-网关-离职迁移包.zip`
- Create on desktop: `C:\Users\Administrator\Desktop\ZT.AI-网页完整项目备份.zip`

- [ ] Run `npm test`, `npm run build`, and a local 390px UI check for drawer width/no horizontal overflow.
- [ ] Create a source-only gateway ZIP with explicit include paths and exclusions: no `aikey.env`, `node_modules`, `dist`, `.git`, logs, screenshots, or `.superpowers`.
- [ ] Create a full project backup ZIP excluding secrets, dependencies, build residue, logs, screenshots, and brainstorming preview artifacts.
- [ ] Inspect ZIP entries and assert no filename or content contains a real API key; verify both archives contain the required launcher/config/resume files.
- [ ] Commit and push `main`, rebuild/publish `pages`, verify Pages and Render endpoints, and leave the desktop archives in place.

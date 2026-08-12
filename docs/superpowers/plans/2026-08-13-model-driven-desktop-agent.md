# Model-Driven Desktop Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the ZT.AI desktop workbench a portable, execution-first Agent that uses the selected model to plan real file/code work, while keeping every write and command behind local permission gates.

**Architecture:** The local Agent remains the device boundary. It asks the gateway for a strict JSON plan, validates the plan against a small allowlist and the workspace boundary, executes approved steps locally, then asks the selected model to summarize evidence. The launcher uses a lightweight app window when Edge is available and falls back to a normal browser.

**Tech Stack:** Node.js ESM, built-in `http`/`fetch`, Vite web UI, SSE, PowerShell/VBS portable launchers, Node test runner.

---

### Task 1: Model plan contract

**Files:**
- Modify: `server/src/profile.js`
- Modify: `server/src/index.js`
- Modify: `agent-desktop/src/agent-core.mjs`
- Test: `agent-desktop/src/agent-core.test.mjs`

- [ ] Add a strict JSON-only planner prompt and a plan parser that accepts only the four local tools.
- [ ] Ask the gateway for the plan before execution; fall back to the safe local plan if the model is unavailable or returns invalid JSON.
- [ ] Preserve path containment and permission approval before every write or command.
- [ ] Add tests for valid plans, invalid tools, and fenced JSON.

### Task 2: Real code/file collaboration

**Files:**
- Modify: `agent-desktop/src/agent-core.mjs`
- Modify: `agent-desktop/public/index.html`
- Modify: `agent-desktop/public/app.js`
- Modify: `docs/desktop-agent-design.md`

- [ ] Let the model return actual file content for a requested implementation instead of a fixed placeholder draft.
- [ ] Show the model-generated plan and write preview in the existing approval card.
- [ ] Explain that the workspace and permissions belong to the machine running the desktop Agent.

### Task 3: Lightweight desktop and authorization UX

**Files:**
- Modify: `agent-desktop/start-agent.ps1`
- Modify: `agent-desktop/public/index.html`
- Modify: `agent-desktop/public/app.js`
- Modify: `docs/desktop-agent-design.md`

- [ ] Add a first-run local-device confirmation before enabling write or command permissions.
- [ ] Prefer an Edge app window, with a browser fallback, while keeping the portable package dependency-free.

### Task 4: Verification and delivery

**Files:**
- Modify: `tools/package-agent.ps1` only if packaging verification requires it.

- [ ] Run website tests, Agent tests, and production build.
- [ ] Run a real read task and a real model-generated file-writing task through the local Agent with approvals.
- [ ] Rebuild the portable archive and verify it excludes keys, node_modules, Git metadata, and runtime history.
- [ ] Push the verified changes and check the live gateway/Pages endpoints.

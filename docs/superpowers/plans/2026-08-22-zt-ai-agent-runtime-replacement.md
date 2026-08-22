# ZT.AI Agent Runtime Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragile desktop execution core behind ZT.buddy with a documented, testable harness boundary based on the verified open-source Codex harness where its provider/runtime contract is usable, while keeping ZT.AI’s MiniMax/DeepSeek gateway, permissions, local tools, web search, file analysis, and portable Windows packaging intact.

**Architecture:** Keep the existing Electron shell and ZT.buddy UI as the product layer. Introduce a runtime adapter boundary between the HTTP server and execution engine. The adapter exposes session, approval, tool-call, progress, cancellation, and final-result events; a Codex app-server adapter is preferred after provider compatibility is verified, with a small ZT.AI compatibility adapter for MiniMax/DeepSeek gateway calls and local tools where upstream Codex cannot directly represent the product’s provider contract. No UI route will call the legacy MimoCode runtime directly after migration.

**Tech Stack:** Electron, Node.js ESM, Vite/React web client, JSONL/JSON-RPC event streams, MiniMax/DeepSeek gateway, Firecrawl-compatible search with DuckDuckGo fallback, CloakBrowser integration, OfficeCLI/XLSX/Mammoth/PDF tooling, Vitest-style Node tests, electron-builder.

---

## 1. Verify the upstream harness contract before implementation

- [ ] Record the upstream Codex repository, Apache-2.0 license, app-server transport, lifecycle/approval/event model, and provider configuration capabilities in `docs/runtime-research.md` with links to the official repository and app-server documentation.
- [ ] Record the official DeepSeek Harness repository, MIT license, plugin architecture, developer-preview status, and model/tool/session extension points in the same document as the comparison baseline.
- [ ] Inspect the current Windows packaging constraints and decide whether the selected upstream runtime can be bundled, downloaded on first run, or must remain an optional external runtime; document the decision and the exact failure message when unavailable.
- [ ] Add a deterministic contract test fixture under `agent-desktop/test/fixtures/` for session creation, approval request, progress update, tool completion, cancellation, and final answer events.

## 2. Audit and isolate the current execution core

- [ ] Inventory all imports and construction sites of `MiMoBuddyRuntime`, MimoCode strings, direct gateway calls, tool dispatch, permissions, and task persistence in `agent-desktop/src/`, `agent-desktop/public/`, and `desktop-app/`.
- [ ] Define the runtime adapter contract in `agent-desktop/src/runtime/types.mjs` and a provider-neutral event schema in `agent-desktop/src/runtime/events.mjs`.
- [ ] Move the existing behavior behind `agent-desktop/src/runtime/zta-compat-adapter.mjs` without changing user-visible behavior; preserve existing session IDs, chat IDs, history records, attachment IDs, and approval semantics.
- [ ] Add `agent-desktop/src/runtime/runtime-factory.mjs` so server startup selects the verified runtime from configuration and reports the selected runtime and capability set through `/api/health`.
- [ ] Keep a temporary compatibility test that fails if a production route imports or constructs the legacy runtime directly.

## 3. Implement the selected harness adapter

- [ ] Implement `agent-desktop/src/runtime/codex-app-server-adapter.mjs` only for the upstream protocol and capabilities verified in step 1; use a child process with bounded stdio/JSON-RPC handling, request IDs, timeouts, cancellation, and clean shutdown.
- [ ] Map ZT.buddy permissions to explicit approval requests; never silently grant filesystem writes, command execution, browser control, or network access.
- [ ] Map upstream progress/tool events into the ZT.buddy live one-line status and collapsible execution drawer without leaking chain-of-thought or raw internal reasoning.
- [ ] Map upstream final messages and structured tool results into the existing Markdown renderer, file cards, image previews, source citations, and chat persistence layer.
- [ ] If the upstream adapter cannot use the configured MiniMax/DeepSeek gateway directly, keep model selection in the ZT.AI compatibility adapter and make the limitation explicit in capability metadata rather than pretending the Codex process is serving those models.

## 4. Complete desktop product behavior

- [ ] Remove the ordinary-chat mode switch from the desktop application; keep ZT.buddy as the primary desktop workspace while leaving the separate web product’s public chat unchanged.
- [ ] Make the left chat list a real collapsible drawer: collapsing hides the panel and expands the main conversation grid; reopening restores the list without losing the active session or changing message layout.
- [ ] Keep `+` attachments/skills/plugins separate from the permissions drawer, with animated open/close transitions and keyboard focus restoration.
- [ ] Ensure Enter sends and Shift+Enter inserts a newline; show immediate loading/streaming feedback and a recoverable timeout/error state.
- [ ] Keep file/image paste and drag-and-drop non-blocking; show lightweight attachment cards rather than dumping file contents below the user bubble.
- [ ] Add spreadsheet/PDF/DOCX/image/video capability checks and clear fallbacks; large files must be streamed or staged instead of being embedded into a huge request body.

## 5. Make research and file analysis reliable across products

- [ ] Make ordinary web chat and ZT.buddy research use the same intent policy: current/unknown factual questions trigger web verification before answering; conversational and user-provided-content questions do not trigger unnecessary searches.
- [ ] Route default web extraction through Firecrawl when configured and fall back to DuckDuckGo/source fetches when it is not; expose provider health and the reason for fallback in diagnostics, not in the user’s answer unless relevant.
- [ ] Route browser-required tasks through CloakBrowser when available and return a clear capability error when it is not installed or cannot access the target page; do not claim a page was inspected without evidence.
- [ ] Add end-to-end tests for ASIN/URL research, unknown-term research, Excel analysis, image analysis, PDF/DOCX extraction, and large-file rejection/continuation.
- [ ] Share the attachment normalization and research contracts with the web client through `src/lib/attachments.js` and the mobile-facing API contract without coupling the desktop runtime to the web UI.

## 6. Validate and package before delivery

- [ ] Extend `npm test`, `npm run agent:test`, and `npm run desktop:test` with runtime, approval, streaming, history, drawer, and attachment regression cases.
- [ ] Run a headless smoke harness that starts the server, creates a session, sends a simple chat, triggers a safe read-only tool, requests approval for a write tool, cancels a task, and verifies the persisted transcript.
- [ ] Run production build and `npm run desktop:verify`; confirm the packaged app contains the chosen runtime adapter, tool binaries, spreadsheet/document readers, browser/search capability metadata, and no secret keys.
- [ ] Build both installer and portable artifacts, verify their version and SHA-256, and install the new version only after the headless checks pass.
- [ ] Produce a concise handoff with exact artifact paths, supported capabilities, known external prerequisites, and a rollback/archive path for the prior installer.

## Verification commands

```powershell
npm test
npm run agent:test
npm run desktop:test
npm run build
npm run desktop:dist
npm run desktop:verify
```

Each command must pass after the corresponding implementation step. No installer will be handed to the user based only on a visual preview.

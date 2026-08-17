# ZT.buddy MiMoCode Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MiMoCode the real execution engine behind ZT.buddy while preserving ZT.AI account controls, local permission approvals, human-readable execution UI, and a verified Windows desktop package.

**Architecture:** The desktop agent starts an isolated local `mimo serve` process and communicates with its documented HTTP and SSE interfaces. A thin `MiMoBuddyRuntime` owns server startup, a ZT-scoped session, event translation, and permission forwarding; it does not recreate planning or tool execution. The gateway exposes a token-gated OpenAI-compatible proxy for the desktop runtime, so model API keys remain on the gateway. The renderer receives only normalized ZT lifecycle events and collapses completed execution details below the result bubble.

**Tech Stack:** Node.js ESM, Electron, native `fetch`/SSE parsing, MiMoCode CLI `@mimo-ai/cli@0.1.12` (official source commit `be2c11653ec9d44969b1b27290eda3c018806a2d`), existing ZT.AI gateway, Node test runner, electron-builder.

---

## File structure

- Create: `agent-desktop/mimocode.lock.json` — auditable official source/package/version/license lock.
- Create: `agent-desktop/src/mimocode/event-map.mjs` — converts documented MiMo SSE event payloads into ZT.buddy lifecycle events.
- Create: `agent-desktop/src/mimocode/runtime.mjs` — owns local MiMo process, sessions, SSE subscription, prompt submission, and permission response.
- Create: `agent-desktop/src/mimocode/runtime.test.mjs` — uses an injected fake process and local HTTP fixture to prove bridge lifecycle behavior without a paid provider.
- Create: `agent-desktop/src/mimocode/event-map.test.mjs` — verifies the event mapping and ignores unrelated events.
- Create: `agent-desktop/src/interaction-state.mjs` — pure auth/composer/drawer state helpers for testable human interaction behavior.
- Create: `agent-desktop/src/interaction-state.test.mjs` — regression coverage for submit key, IME, login feedback, and drawer defaults.
- Modify: `agent-desktop/src/server.mjs` — selects `MiMoBuddyRuntime` as the primary `/api/tasks` engine and forwards ZT local approvals to MiMo.
- Modify: `agent-desktop/src/agent-core.mjs` — retains only migration-safe task-history helpers; removes it from the primary task path.
- Modify: `server/src/index.js` — adds the authenticated internal OpenAI-compatible route used by MiMoCode.
- Create: `server/src/mimocode-openai.js` — adapts gateway provider calls to OpenAI Chat Completions and preserves tool call envelopes.
- Create: `server/src/mimocode-openai.test.js` — tests authorization, model mapping, non-streaming completion, and streaming chunks without a live provider key.
- Modify: `agent-desktop/public/index.html` — login live status/spinner and accessible execution-details drawer markup.
- Modify: `agent-desktop/public/app.js` — Enter-to-send, Shift+Enter newline, IME protection, auth busy state, and drawer collapse after terminal runtime events.
- Modify: `agent-desktop/public/styles.css` — visible button loading state, compact execution drawer, keyboard focus styles, and reduced-motion fallback.
- Modify: `agent-desktop/public/presentation.mjs` and `agent-desktop/src/presentation.mjs` — user-facing runtime labels without raw upstream diagnostics.
- Modify: `agent-desktop/src/renderer-contract.test.mjs` and `agent-desktop/src/presentation.test.mjs` — renderer/API contract coverage.
- Modify: `tools/integration-smoke.mjs` — launches an isolated fake MiMo server, gateway, desktop server, normal-chat assertion, runtime read task, approval hold, resume, and session restart.
- Create: `tools/mimocode-runtime-qa.mjs` — runs the official pinned CLI in a disposable workspace and asserts its documented HTTP health/session/SSE surfaces.
- Modify: `desktop-app/electron-builder.yml` — package the pinned runtime launcher/config and MIT attribution without packaging an editable upstream checkout.
- Create: `desktop-app/THIRD_PARTY_NOTICES.txt` — MiMoCode MIT notice and fixed source reference.
- Modify: `README.md` and `agent-desktop/README.md` — setup, local model boundary, runtime troubleshooting, user permissions, and version upgrade procedure.

## Task 1: Pin and independently prove the official runtime

**Files:**
- Create: `agent-desktop/mimocode.lock.json`
- Create: `tools/mimocode-runtime-qa.mjs`
- Test: `tools/mimocode-runtime-qa.mjs`

- [ ] **Step 1: Write the lock assertion before adding production integration**

Create `agent-desktop/mimocode.lock.json` with the immutable runtime provenance:

```json
{
  "name": "@mimo-ai/cli",
  "version": "0.1.12",
  "repository": "https://github.com/XiaomiMiMo/MiMo-Code",
  "commit": "be2c11653ec9d44969b1b27290eda3c018806a2d",
  "license": "MIT",
  "entrypoint": "mimo",
  "serverCommand": ["serve", "--hostname", "127.0.0.1"]
}
```

Write the first QA assertion in `tools/mimocode-runtime-qa.mjs` so it reads that lock and rejects any version other than `0.1.12` or any commit other than the recorded full SHA.

- [ ] **Step 2: Run the QA script to verify it fails because the runtime probe is absent**

Run: `node tools/mimocode-runtime-qa.mjs`

Expected: FAIL after the provenance assertion with a clear `MiMo runtime probe is not implemented` error.

- [ ] **Step 3: Implement the disposable runtime probe**

Implement the script with these exact responsibilities:

```js
const cli = process.platform === 'win32' ? 'mimo.cmd' : 'mimo'
const args = ['serve', '--hostname', '127.0.0.1', '--port', String(port)]
const child = spawn(cli, args, {
  cwd: workspace,
  env: {
    ...process.env,
    MIMOCODE_CONFIG: configPath,
    MIMOCODE_DATA_DIR: dataDir,
    MIMOCODE_SERVER_PASSWORD: password,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
```

The script must write a temporary MiMo config that declares a single `zt-gateway` OpenAI-compatible provider pointing at a disposable local fixture (`http://127.0.0.1:<fixturePort>/v1`), sets its `apiKey` to the fixture token, and declares a `zt-buddy-test` model with `tool_call: true`, `limit.context: 1000000`, and `limit.output: 8192`. Start a local fixture that returns a deterministic text answer and, for a read task, a tool-call response. Wait for `GET /global/health` (or the documented equivalent discovered from the runtime) to return success; then create a session, subscribe to `/event`, send one prompt, and assert an assistant result and at least one runtime event. Always terminate the child and remove the disposable workspace in `finally`.

- [ ] **Step 4: Run the runtime probe to verify it passes without a real API key**

Run: `node tools/mimocode-runtime-qa.mjs`

Expected: JSON containing `{"officialRuntime":true,"session":true,"events":true,"fixtureOnly":true}` and exit code `0`.

- [ ] **Step 5: Commit the provenance and official runtime proof**

```bash
git add agent-desktop/mimocode.lock.json tools/mimocode-runtime-qa.mjs
git commit -m "test: prove pinned MiMoCode runtime on Windows"
```

### Task 2: Add a thin MiMo event adapter, not a second Agent engine

**Files:**
- Create: `agent-desktop/src/mimocode/event-map.mjs`
- Create: `agent-desktop/src/mimocode/event-map.test.mjs`
- Test: `agent-desktop/src/mimocode/event-map.test.mjs`

- [ ] **Step 1: Write failing mapping tests**

Write tests for these concrete input/output pairs:

```js
assert.deepEqual(normalizeMiMoEvent({ type: 'session.created', properties: { sessionID: 'ses_1' } }), {
  type: 'session.started',
  sessionId: 'ses_1',
})

assert.deepEqual(normalizeMiMoEvent({ type: 'message.part.delta', properties: { sessionID: 'ses_1', delta: '你好' } }), {
  type: 'result.delta',
  sessionId: 'ses_1',
  text: '你好',
})

assert.deepEqual(normalizeMiMoEvent({ type: 'permission.asked', properties: { sessionID: 'ses_1', id: 'per_1', permission: 'bash', patterns: ['npm test'] } }), {
  type: 'approval.required',
  sessionId: 'ses_1',
  permissionId: 'per_1',
  capability: 'command_exec',
  label: '运行命令',
  details: ['npm test'],
})
```

Also prove that a heartbeat and an unknown event return `null`, and a tool completion becomes `tool.completed` with an empty safe result if upstream has no display text.

- [ ] **Step 2: Run the mapping test to verify it fails because the module is missing**

Run: `node --test agent-desktop/src/mimocode/event-map.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `event-map.mjs`.

- [ ] **Step 3: Implement the smallest stable event map**

Implement `normalizeMiMoEvent(event)` and `capabilityForMiMoPermission(permission)` as a pure table-driven adapter. Map MiMo session/message/task/part/tool/permission/error/idle event families into only these ZT names: `session.started`, `plan.ready`, `tool.started`, `tool.completed`, `approval.required`, `result.delta`, `session.completed`, `session.failed`. Do not expose raw provider error bodies or unrecognized event payloads to the renderer.

- [ ] **Step 4: Run the mapping test to verify it passes**

Run: `node --test agent-desktop/src/mimocode/event-map.test.mjs`

Expected: all mapping assertions pass.

- [ ] **Step 5: Commit the adapter**

```bash
git add agent-desktop/src/mimocode/event-map.mjs agent-desktop/src/mimocode/event-map.test.mjs
git commit -m "feat: normalize MiMoCode events for Buddy"
```

### Task 3: Bridge MiMo sessions to existing local device approvals

**Files:**
- Create: `agent-desktop/src/mimocode/runtime.mjs`
- Create: `agent-desktop/src/mimocode/runtime.test.mjs`
- Modify: `agent-desktop/src/server.mjs`
- Modify: `agent-desktop/src/agent-core.mjs`
- Test: `agent-desktop/src/mimocode/runtime.test.mjs`
- Test: `agent-desktop/src/agent-core.test.mjs`

- [ ] **Step 1: Write failing bridge tests with a real local HTTP fixture**

Write a test that injects `spawnRuntime`, `fetchImpl`, and a temporary state directory into `new MiMoBuddyRuntime(...)`. Its fixture must record the order: server ready → session create → SSE subscribe → prompt → permission request → permission reply → task complete. Assert:

```js
assert.equal(events[0].type, 'session.started')
assert.ok(events.some(event => event.type === 'approval.required' && event.capability === 'workspace_write'))
assert.equal(await runtime.approve({ taskId, permissionId: 'per_1', remember: false }), true)
assert.equal(events.at(-1).type, 'session.completed')
assert.equal(fixture.permissionReplies[0].response, 'once')
```

Add a second test that calls `runtime.startTask` twice with the same `conversationId` and asserts the second prompt uses the same MiMo session ID after restart. Add a third test showing no write/command reply is sent before `approve` is called.

- [ ] **Step 2: Run the bridge tests to verify they fail because `MiMoBuddyRuntime` is absent**

Run: `node --test agent-desktop/src/mimocode/runtime.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` or missing `MiMoBuddyRuntime` export.

- [ ] **Step 3: Implement `MiMoBuddyRuntime` as process/session plumbing only**

Implement these public methods:

```js
await runtime.startTask({ task, model, conversationId, onEvent })
await runtime.approve({ taskId, permissionId, remember })
await runtime.reject({ taskId, permissionId })
await runtime.dispose()
```

`startTask` must start `mimo serve --hostname 127.0.0.1 --port <allocated-port>` once per selected workspace, wait for its documented health endpoint, create or restore a MiMo session keyed by the ZT conversation ID, attach the SSE subscription before sending a prompt, persist only `{ conversationId, sessionId, workspaceRoot, updatedAt }` in the desktop data directory, and translate events with `normalizeMiMoEvent`. It must send all capability requests into the existing task callback and wait for `approve`/`reject`; it must never silently grant write, command, network, or sensitive permissions.

`agent-desktop/src/server.mjs` must instantiate `MiMoBuddyRuntime` and make it the only implementation called by `POST /api/tasks`, `/approve`, and `/reject`. `AgentTaskManager` may remain for reading historical records during migration but cannot plan or execute newly submitted tasks.

- [ ] **Step 4: Run bridge and legacy regression tests to verify they pass**

Run: `node --test agent-desktop/src/mimocode/runtime.test.mjs agent-desktop/src/agent-core.test.mjs`

Expected: all tests pass; the tests prove that approvals are held by default.

- [ ] **Step 5: Commit the real runtime bridge**

```bash
git add agent-desktop/src/mimocode/runtime.mjs agent-desktop/src/mimocode/runtime.test.mjs agent-desktop/src/server.mjs agent-desktop/src/agent-core.mjs
git commit -m "feat: run Buddy tasks through MiMoCode"
```

### Task 4: Keep provider keys inside the gateway with an OpenAI-compatible bridge

**Files:**
- Create: `server/src/mimocode-openai.js`
- Create: `server/src/mimocode-openai.test.js`
- Modify: `server/src/index.js`
- Test: `server/src/mimocode-openai.test.js`
- Test: `server/src/index.test.js` if present, otherwise `npm test`

- [ ] **Step 1: Write failing OpenAI bridge tests**

Write tests against `createMiMoOpenAIHandler({ authenticate, streamProvider })` with an in-memory response object. Verify:

```js
await handler(request({ authorization: 'Bearer desktop-token', body: { model: 'zt-deepseek', messages: [{ role: 'user', content: '列出文件' }], stream: false } }), response)
assert.equal(response.statusCode, 200)
assert.equal(response.json.object, 'chat.completion')
assert.equal(response.json.choices[0].message.role, 'assistant')

await handler(request({ authorization: '', body: { model: 'zt-deepseek', messages: [] } }), response)
assert.equal(response.statusCode, 401)
```

Add a streaming test that verifies `data: {"object":"chat.completion.chunk"` and a final `data: [DONE]` are emitted. Add a tool-call fixture and prove `tool_calls` are preserved rather than flattened to text.

- [ ] **Step 2: Run the gateway bridge test to verify it fails because the handler is missing**

Run: `node --test server/src/mimocode-openai.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `mimocode-openai.js`.

- [ ] **Step 3: Implement the token-gated OpenAI-compatible handler**

Implement `createMiMoOpenAIHandler` so it accepts only a valid approved desktop account token, maps `zt-deepseek` to the configured DeepSeek model and `zt-minimax` to the configured MiniMax model, and delegates provider calls through a raw OpenAI-compatible request function that supports both content deltas and `tool_calls`. Register only these routes in `server/src/index.js`:

```js
GET /api/agent/openai/v1/models
POST /api/agent/openai/v1/chat/completions
```

The route must reject browser CORS callers, reject missing/invalid tokens, record aggregate usage telemetry, and never return the upstream API key. The local MiMo process receives a short-lived desktop account token as its proxy bearer token; the Electron renderer still never sees a provider key.

- [ ] **Step 4: Run gateway unit tests and core suite to verify they pass**

Run: `node --test server/src/mimocode-openai.test.js; npm test`

Expected: handler tests pass and the existing server/frontend suite remains green.

- [ ] **Step 5: Commit the provider boundary**

```bash
git add server/src/mimocode-openai.js server/src/mimocode-openai.test.js server/src/index.js
git commit -m "feat: proxy MiMoCode model calls through gateway"
```

### Task 5: Fix login feedback and composer behavior before visual polish

**Files:**
- Create: `agent-desktop/src/interaction-state.mjs`
- Create: `agent-desktop/src/interaction-state.test.mjs`
- Modify: `agent-desktop/public/index.html`
- Modify: `agent-desktop/public/app.js`
- Modify: `agent-desktop/public/styles.css`
- Test: `agent-desktop/src/interaction-state.test.mjs`
- Test: `agent-desktop/src/renderer-contract.test.mjs`

- [ ] **Step 1: Write failing pure interaction tests**

Write tests for:

```js
assert.equal(shouldSubmitComposer({ key: 'Enter', shiftKey: false, isComposing: false, disabled: false }), true)
assert.equal(shouldSubmitComposer({ key: 'Enter', shiftKey: true, isComposing: false, disabled: false }), false)
assert.equal(shouldSubmitComposer({ key: 'Enter', shiftKey: false, isComposing: true, disabled: false }), false)
assert.deepEqual(authPresentation({ registering: false, pending: true }), { button: '正在验证账号…', status: '正在连接 ZT.AI 服务…', busy: true })
assert.deepEqual(authPresentation({ registering: true, pending: true }), { button: '正在提交注册…', status: '注册申请已提交，请稍候…', busy: true })
```

- [ ] **Step 2: Run interaction tests to verify they fail because the helpers are missing**

Run: `node --test agent-desktop/src/interaction-state.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the interaction helpers and wire them into the renderer**

Implement `shouldSubmitComposer` and `authPresentation` in the module. In `app.js`, replace the Ctrl/Cmd+Enter-only handler with:

```js
if (shouldSubmitComposer({
  key: event.key,
  shiftKey: event.shiftKey,
  isComposing: event.isComposing || event.keyCode === 229,
  disabled: els.run.disabled,
})) {
  event.preventDefault()
  state.mode === 'BUDDY' ? runAgentTask() : runChat()
}
```

Add an `aria-live="polite"` auth status node and a spinner inside the submit button. At submit start, disable username/password/mode controls, set `aria-busy="true"`, and show the relevant `authPresentation`. In `finally`, restore the controls; on known failure/pending/timeout, keep the input values and show distinct Chinese feedback. Add `prefers-reduced-motion` CSS so the spinner does not animate for users who opt out.

- [ ] **Step 4: Run focused renderer tests to verify they pass**

Run: `node --test agent-desktop/src/interaction-state.test.mjs agent-desktop/src/renderer-contract.test.mjs`

Expected: all focused tests pass.

- [ ] **Step 5: Commit the interaction fixes**

```bash
git add agent-desktop/src/interaction-state.mjs agent-desktop/src/interaction-state.test.mjs agent-desktop/public/index.html agent-desktop/public/app.js agent-desktop/public/styles.css agent-desktop/src/renderer-contract.test.mjs
git commit -m "fix: make desktop login and composer responsive"
```

### Task 6: Collapse completed execution into a readable drawer

**Files:**
- Modify: `agent-desktop/public/presentation.mjs`
- Modify: `agent-desktop/src/presentation.mjs`
- Modify: `agent-desktop/src/presentation.test.mjs`
- Modify: `agent-desktop/public/app.js`
- Modify: `agent-desktop/public/styles.css`
- Test: `agent-desktop/src/presentation.test.mjs`

- [ ] **Step 1: Write failing execution-detail presentation tests**

Add tests for a helper with the following contract:

```js
assert.deepEqual(executionDrawerPresentation({ status: 'done', elapsedMs: 1240, stepCount: 3 }), {
  open: false,
  label: '执行详情 · 已完成 · 1.2 秒 · 3 步',
})
assert.equal(executionDrawerPresentation({ status: 'running', elapsedMs: 0, stepCount: 1 }).open, true)
assert.match(executionDrawerPresentation({ status: 'blocked', elapsedMs: 60000, stepCount: 2 }).label, /等待确认/)
```

- [ ] **Step 2: Run the presentation test to verify it fails due to the missing drawer helper**

Run: `node --test agent-desktop/src/presentation.test.mjs`

Expected: FAIL because `executionDrawerPresentation` is not exported.

- [ ] **Step 3: Implement terminal-state drawer behavior**

Create a native `<details class="execution-details">` underneath the concise Agent result. `appendAgentMessage` opens it during live planning/tool events. `completeAgentMessage` records `elapsedMs`, counts unique steps, updates the summary label with `executionDrawerPresentation`, and closes it for `done`, `blocked`, and `error`. Keep approval controls outside the collapsed section while they are pending. Do not delete raw tool evidence; move it into the drawer so a user can audit it on demand.

- [ ] **Step 4: Run the presentation tests to verify they pass**

Run: `node --test agent-desktop/src/presentation.test.mjs`

Expected: all presentation tests pass.

- [ ] **Step 5: Commit the execution drawer**

```bash
git add agent-desktop/public/presentation.mjs agent-desktop/src/presentation.mjs agent-desktop/src/presentation.test.mjs agent-desktop/public/app.js agent-desktop/public/styles.css
git commit -m "feat: collapse completed Buddy execution details"
```

### Task 7: Prove the complete runtime through isolated integration and visual checks

**Files:**
- Modify: `tools/integration-smoke.mjs`
- Modify: `desktop-app/renderer/` tests as required by existing test layout
- Test: `tools/integration-smoke.mjs`

- [ ] **Step 1: Add failing integration assertions for the new runtime contract**

Extend the isolated fixture so it requires all of these booleans to become true:

```js
assert.equal(result.registered, true)
assert.equal(result.normalChatAvoidedTools, true)
assert.equal(result.mimoRuntimeStarted, true)
assert.equal(result.readTaskCompleted, true)
assert.equal(result.writeTaskHeldForApproval, true)
assert.equal(result.approvalResumedTask, true)
assert.equal(result.sessionRestored, true)
assert.equal(result.noProviderKeyInRenderer, true)
```

- [ ] **Step 2: Run the integration smoke test to verify it fails before the fixture is fully wired**

Run: `npm run integration:test`

Expected: FAIL at the first missing MiMo runtime assertion.

- [ ] **Step 3: Implement the isolated fake MiMo server fixture**

The fixture must expose the documented health, session, prompt, event, and permission endpoints used by `MiMoBuddyRuntime`; it must never use an actual MiniMax or DeepSeek key. Make normal chat return only a chat message. Make a workspace list task stream `session.created`, a read tool start/result, and a terminal `session.idle`. Make a write request emit `permission.asked`, wait until the test invokes ZT’s approve route, then emit a tool result and completion. Restart the runtime and prove the stored conversation maps to the prior session ID.

- [ ] **Step 4: Run integration and full automated suites**

Run:

```bash
npm test
npm run agent:test
npm run desktop:test
npm run integration:test
node tools/mimocode-runtime-qa.mjs
$env:GITHUB_PAGES_BUILD='true'; npm run build
git diff --check
```

Expected: every command exits `0`; no test touches the user’s real provider keys or account data.

- [ ] **Step 5: Run an Electron visual acceptance check**

Run `npm run desktop:dev` against the isolated fixture and manually verify at Windows desktop width:

1. Login button immediately becomes `正在验证账号…` with a spinner, then reports success/failure/pending distinctly.
2. Enter sends; Shift+Enter makes a newline; Chinese IME composition does not send early.
3. A normal greeting stays in chat and creates no tool activity.
4. A read task shows live plan/tool feedback, then a closed `执行详情` drawer below the concise answer.
5. A write/command task stops at the local approval UI; approve resumes it and reject leaves the task blocked.
6. Closing/reopening a conversation restores its MiMo session context.

- [ ] **Step 6: Commit integration coverage**

```bash
git add tools/integration-smoke.mjs desktop-app
git commit -m "test: verify MiMo-backed Buddy runtime end to end"
```

### Task 8: Package a portable Windows runtime only after the runtime is proven

**Files:**
- Modify: `desktop-app/electron-builder.yml`
- Create: `desktop-app/THIRD_PARTY_NOTICES.txt`
- Modify: `README.md`
- Modify: `agent-desktop/README.md`
- Test: `npm run desktop:dist`

- [ ] **Step 1: Write a failing packaging/attribution assertion**

Add a small Node assertion in `desktop-app/renderer/` or existing package contract tests that requires the packaged app configuration to include `agent-desktop/mimocode.lock.json` and `desktop-app/THIRD_PARTY_NOTICES.txt`.

- [ ] **Step 2: Run the package contract test to verify it fails before packaging metadata is added**

Run: `npm run desktop:test`

Expected: FAIL because the pinned runtime metadata or notice is not included.

- [ ] **Step 3: Add packaged runtime metadata and user documentation**

Update electron-builder files so the installer includes the MiMo lock file, launch configuration, and MIT notice. The desktop process must perform a local runtime version check on first launch and show a clear status if the runtime cannot start; it must not silently fall back to the old custom execution engine. Document the runtime version, how a future update is pinned/tested, the local workspace/permission boundary, and the fact that desktop account approval is separate from model API credentials.

- [ ] **Step 4: Run the package contract test and build both Windows artifacts**

Run:

```bash
npm run desktop:test
npm run desktop:dist
Get-FileHash release\ZT.buddy-Desktop-*.exe -Algorithm SHA256
```

Expected: tests pass, installer and portable executable are regenerated under `release/`, and hashes are recorded in the release note.

- [ ] **Step 5: Review the final diff and release evidence before handoff**

Run:

```bash
git status --short
git diff --check
git log --oneline -8
```

Then request a focused code review for the MiMo process lifecycle, permission forwarding, gateway-token boundary, and Electron package files. Fix any critical or important findings, rerun the full Task 7 test list, and only then report the installer path and checksum.

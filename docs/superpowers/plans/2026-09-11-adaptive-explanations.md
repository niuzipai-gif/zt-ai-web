# Adaptive explanations implementation plan

> Execute in the existing task with test-driven development; user has approved the design.

**Goal:** Integrate audience-aware explanation into ZT.AI without new model calls or disruption of chat, voice, search, or tool execution.

**Architecture:** A pure policy helper generates bounded trusted guidance from recent user message intent. Shared system prompt builders append it for conversational routes only. Compatibility request inputs use the same resolver. No UI changes are required.

**Tech stack:** Existing Node.js ESM gateway, node:test, existing MiniMax/DeepSeek providers.

## Tasks

- [x] Add failing tests to `server/src/prompt-context.test.js` for automatic policy, audiences, multilingual follow-up, strict output and planner exclusion. Run `node --test server/src/prompt-context.test.js` and confirm expected failures.
- [x] Add `server/src/explanation-style.js`; integrate `server/src/prompt-context.js` and conversational call sites in `server/src/index.js`. Test user-only bounded context and compatibility inputs; preserve the execution planner.
- [x] Run targeted prompt, provider/compatibility, search, language, and runtime tests. Add regression tests before fixing discovered misses. Review diffs for secrets and unrelated changes.
- [x] Run bounded real-model before/after cases. Persist inputs, outputs, timing, and honest semantic review under `output/`; record upstream attribution and operational limitations in docs.
- [ ] Verify deployment branch and serving backend revision. Publish only scoped changes using the established Git/Render workflow; do not overwrite unrelated branches/assets. Verify health and representative production responses.

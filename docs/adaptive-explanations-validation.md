# Adaptive explanations validation — 2026-09-11

## Scope and evidence

The supplied video was checked using metadata, sampled frames and full local timestamped ASR. Its repository URL was verified against the actual community repository and pinned source. ASR mistakes were not treated as instructions or factual endorsements.

Implementation changes only shared gateway communication policy, its conversation inputs, and non-secret deployment identification. No UI, resume, voice model, voice audio, installation package or search provider configuration was changed.

## Automated verification

- Red/green: initial policy tests failed because the existing builder ignored conversation intent; implementation then passed. Additional failures reproduced audience loss on “simpler” follow-ups and insufficient language priority before fixes.
- `npm test`: **189 passed, 0 failed** on the final feature tree.
- New HTTP-boundary test exercises public chat, desktop agent chat, streaming and non-streaming Responses, and legacy Chat Completions. Each fixture request reaches the upstream model once; tool definitions survive; client clock spoofing is ignored.
- Planner composition is unchanged; tests cover strict JSON/code/translation, recent-context bounds, excluded tool/assistant/image content, Chinese/English/Japanese audiences, follow-up and topic reset.
- Existing search, image, speech/voice, auth and streaming tests remain green. A Windows fixture-file race was removed by awaiting pending telemetry before the next test request; no production storage change was made.
- No independent reviewer tool was available. Main-agent diff review checked whitelist-only request options, bounded parsing, planner isolation, API compatibility, secret handling and excluded files. This is not claimed as independent review.

## Real-model evaluation

**36 provider calls**, two existing providers (MiniMax and DeepSeek), nine synthetic scenarios, including the original before/after comparison and two tuning reruns. All 36 returned non-empty visible answers without transport errors. This is a qualitative sample, **not** a 100% quality score, benchmark or end-to-end voice/search test.

The original and final sampled answer lengths:

| Scenario | Before | Final | Observation |
| --- | ---: | ---: | --- |
| Chinese general explanation | 634 characters | 292 | Shorter first layer; fewer operational digressions, though still some technical jargon |
| English beginner explanation | 1,411 characters | 1,001 | Reduced details, familiar example and trade-offs; still more verbose than the soft target |
| Japanese beginner explanation | 463 characters | 337 | Clearer short explanation, no unsolicited pronunciation annotations |
| Business audience | 461 characters | 297 | Decision, cost and verification focus; no asserted measured speedup |
| Technical audience | 768 characters | 1,300 | More mechanism and trade-offs when explicitly requested; increased length is intentional |
| Follow-up example | 28 characters | 40 | Changed example, but omitted the requested limitation; improvement is incomplete |

Format case continued to produce parseable `{"ready":true}` with no extra explanation. The final Japanese casual case stayed in Japanese and avoided a resume/work pitch; an earlier version failed this and was rejected. The unsupported cost-saving case rejected “guaranteed 50% savings”, but still suggested a speculative schedule/benefit without enough context.

### Remaining quality risks

- Some sampled English/technical answers overgeneralize implementation details or imply overly simple lookup steps. Instructions reduce this tendency but do not prove factual reliability. The existing source-verification layer remains necessary.
- The listener resolver is a bounded heuristic, not a full semantic classifier; model interpretation and explicit current user instructions remain authoritative.
- Some follow-ups become too short and lose a caveat. No extra model-rewrite call was added merely to mask this, in keeping with the approved efficiency constraint.
- Cloned voice pronunciation, audio playback, real devices and all possible questions were not retested by this change. Existing shared routes and voice regressions were checked; no claim of new voice training is made.

Raw local evidence is retained under `output/video-study-2026-09-11/`, `output/adaptive-explanations-2026-09-11/`, `output/adaptive-explanations-2026-09-11-v2/`, and `output/adaptive-explanations-2026-09-11-v3/` (not committed).

## Deployment verification

Applied only this feature to production `main` as `76e919564493f1feb4f38622777cbca77a3d4177`. Source feature commit is `666f000595d90e6819304a2a559050296e7a24f1`. Release-tree server tests: **115 passed, 0 failed**. No unrelated feature history or Pages assets were merged. The original development branch was restored and its existing untracked directories preserved.

Live `/api/health` returned `ok: true`, `communication.explanationPolicy: adaptive-v1`, and the exact production revision above. This verifies the serving code, not merely a successful push. Deployment used the existing Git-triggered flow; no Render workspace selection, service configuration or manual restart was performed.

Three additional live `/api/chat` checks each returned HTTP 200, `message.done`, a nonempty answer and no error events:

| Live case | Model | Duration | Source count |
| --- | --- | ---: | ---: |
| Chinese researched explanation | MiniMax | 36.4 s | 10 |
| English management explanation | DeepSeek | 2.2 s | 0 (ordinary explanation path) |
| Japanese casual conversation | MiniMax | 3.2 s | 0 (casual path) |

The source-backed answer was longer than the soft brevity target; source count alone is not an accuracy or authority score. The English answer still contained some broad claims about index performance. The Japanese answer stayed in Japanese but its joke still alluded to Amazon; casual-topic steering is improved, not perfect. These limitations remain visible rather than labeling all outputs excellent.

Public Pages returned HTTP 200 and still referenced `index-Btgl9BSu.js` and `index-W-zlBszz.css`. No changes were made to `public/`, `src/main.jsx`, `src/styles.css`, `render.yaml`, desktop packaging or Android assets in this feature. Existing online health also reports non-durable JSON storage; this was not changed or represented as a new persistence fix.

Raw live evidence: `output/adaptive-explanations-2026-09-11-v3/production-results.json` (local, not committed). Device-level microphone/playback and authenticated production desktop login were not exercised; desktop request wiring was tested at the local HTTP boundary.

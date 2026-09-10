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

Only this change should be applied to the current production `main`. Do not merge unrelated feature-branch history or redeploy Pages assets for a server-only policy update. Verify `/api/health` returns `communication.explanationPolicy = adaptive-v1` and the expected `revision` before claiming the public site uses the new policy.

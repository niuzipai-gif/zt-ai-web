# MiniMax upgrade — first batch, 2026-10-22

## Scope and rollout

This is a staged implementation, not completion of the comprehensive plan.

- Default model and examples now use `MiniMax-M3.1-Flash`; explicit configured model overrides remain supported. Formal and Preview models share reasoning separation and validated effort in public chat and the desktop gateway bridge.
- Streaming chat recognizes truncation, provider errors, malformed frames, incomplete EOF and cancellation. Metadata contains model, finish reason, first-token/duration and numeric usage when supplied. Existing telemetry retention/content policy is unchanged; this is not a claim that all historical logging is content-free.
- One server-only bidirectional TTS connection per answer; original personal voice settings are preserved. Text is buffered by sentence and cleans Markdown/code before speech. The tail is flushed. Only `task_finished` ends synthesis.
- Server caps concurrent speech at four, queued text at 10,000 characters per answer, PCM output at 19.2 MB and socket duration at 90 seconds. An explicitly untrusted browser Origin is rejected using configured CORS origins; origin checking is not authentication and cannot prevent every non-browser abuse.
- Web PCM playback preserves the first sample, validates sequence and limits queued audio. Playback completion waits for audio sources to end. An empty queue waits without pretending speech is playing. Cancel stops scheduled sources and upstream work; late events cannot modify a new turn/session.
- HTTP TTS remains available. Automatic recovery is permitted only before any PCM chunk was accepted; partial playback failure does not automatically replay the whole answer. User retry reuses a completed text answer instead of another model generation.
- `VOICE_STREAMING_ENABLED=false` is the deployment default. Existing Chinese voice IDs, pronunciation/emotion/speed settings and greeting pre-roll are unchanged. No new voice was trained or activated.
- `ws@8.22.0` is declared both at the repository root and in the separately deployed `server/package.json`.

## Reproducible local checks

| Check | Result |
| --- | --- |
| `npm test` | 238 passed, 0 failed |
| `npm run agent:test` | 122 passed, 0 failed |
| `npm run desktop:test` | 5 passed, 0 failed |
| `npm run integration:test` | All reported checks true, exit 0 |
| `npm run build` | Success |
| `git diff --check` | No whitespace errors; Windows line-ending warnings only |
| `node tools/verify-streaming-voice.mjs` with Vite on port 5182 | 1440 px and 390 px, 10 continuous typed voice turns each; zero-audio HTTP recovery; manual interruption; no uncaught page errors |

Tests cover safe queue rejection, invalid PCM, first-sample preservation, cancel/late event isolation, split code/link cleaning, slot release, malformed SSE cancellation, explicit feature gating and unknown browser origins. Browser tests use synthetic audio and mocked provider routes in an isolated headless profile. They do not access the user's browser or microphone and do not prove physical speaker audibility.

## Bounded real upstream probes

- Formal M3.1 Flash returned exactly `OK`, completed with `stop`. One short request at low effort: first token 2,230 ms, duration 2,488 ms. Usage was absent; no estimate is presented as measured billing.
- A registered existing personal Chinese voice produced 95 PCM chunks, 189,476 bytes. First chunk arrived in 497 ms; generation completed in 674 ms. This is one upstream sample, not p50/p95 or end-user playback latency. Audio was not subjectively evaluated for likeness.
- These probes did not activate a clone, change billing, or persist personal recordings. Provider credentials were used only in process and were not included in logs or commits.

## Remaining work / known limits

- Current microphone input still uses bounded recorded PCM uploads. Continuous VAD and speaking-to-interrupt are not delivered by this batch; interruption tested here is the stop/orb control.
- Desktop bridge is compatible, but the installed desktop binary has not gained the new web PCM UI. No Windows/Android installer rebuilt. Android's web shell benefits from a future matching web deployment; physical iOS/Android audio routes remain unverified.
- English/Japanese quality and likeness have not been improved or claimed improved. Existing unavailable voice IDs can fall back through the established HTTP recovery; the new direct stream does not silently choose another person's voice.
- Native Responses search, audio/video attachment enhancements and H3 task UX remain planned.
- No dependency security-clean claim: npm install reported pre-existing moderate/high findings; a subsequent audit request failed TLS. No forced dependency upgrades were performed.
- Long answers may reach bounded text/audio/socket limits; errors remain recoverable. Silent/background device interruptions and OS-specific audio behavior require physical-device validation before broad activation.
- Resume assets, project animations, `.design-audit/`, `.runtime-qa/`, and existing `output/` data were not changed or removed.

## Deployment

- Source implementation: `33c110491a860c5747b7f2e4344a02e836e895be` on the working branch. Selective production integration: `fc0d422ff29f2e10f6cec725ca33fcdea267619d` on main, without unrelated edits in the primary checkout.
- The isolated release checkout initially lacked the frontend spreadsheet dependency; reusing the identical verified dependency tree resolved setup. Integrated production source tests: **229 passed, 0 failed** (the working branch also carries previously accepted project-demo tests). Targeted server/model/voice checks: **14 passed**.
- A fresh server-only dependency install was impeded locally by npm TLS resets/missing offline baseline packages; this is not reported as a clean-install pass. Render's subsequent build and deployment did succeed with the separate server manifest.
- Render service `srv-d9u10fqjobas73e1hai0` matched the exact repository, main branch and public URL in the user's sole listed workspace. The push and Blueprint sync created deployments automatically; no duplicate manual trigger or credential replacement was made.
- Deployment `dep-dbct5hmkvk2s73e72vn0` reached **live**. Public health independently returned the exact production revision above and model `MiniMax-M3.1-Flash`.
- Live public chat returned HTTP 200, the requested greeting, `message.done`, and no `message.error`. A bounded Chinese TTS check returned HTTP 200; the resulting MP3 downloaded with HTTP 200 and 36,276 bytes. This confirms availability, not physical listening or voice-likeness scoring.
- Pages: `c07b12838f9d16c73dcc7dfe279fbe57cc38da73`; [deployment run](https://github.com/niuzipai-gif/zt-ai-web/actions/runs/39753296785) completed successfully.
- Normal public URL returned HTTP 200, loading `/zt-ai-web/assets/index-jIPpopFC.js`. The asset returned HTTP 200; SHA-256 `777e6327e0e67140f27d5fab7462346f403f9c01c4a1c96e0abd1556f33dc5d1` matched the built file.
- Streaming speech remains **disabled by default**, as documented. No new installer or all-device completion claim. The verified streaming path remains synthetic-browser plus bounded real upstream evidence, not an enabled production end-to-end feature.
- Existing resume files and project-animation assets were unchanged by this release. The release worktree is retained at `E:/ZT.AI/zt-ai-web/.worktrees/minimax-release-20261022`; it isolates release work from unrelated uncommitted primary-checkout changes.

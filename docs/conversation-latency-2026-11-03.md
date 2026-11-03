# Conversation display latency and speech jitter — 2026-11-03

The user reported slow answers and choppy voice conversation. This release removes verified application-side delay while preserving the existing Chinese voice, English/Japanese settings, model selection, pronunciation rules and free infrastructure. It does not claim to eliminate model generation, overseas-network delays or Render idle wake-up.

## Findings and scoped changes

1. **Text display had a second rate limiter.** The server could finish sending a response while the UI continued revealing at most eight characters every 30 ms, slowing further near the end. The UI now flushes already received text on its next existing 30 ms render tick. The provider remains streamed and unchanged.
2. **PCM reserve expired before the first audio arrived.** `begin()` set the scheduled start before model generation. After a multi-second model wait, the first tiny audio chunk started with only 40 ms reserve. Playback now starts with 450 ms reserve measured from actual PCM arrival and uses 700 ms when the stream genuinely runs dry. The samples, sample rate, order, voice and speech speed are unchanged. Stop/cancel still removes every scheduled source immediately.
3. **Negated search words triggered unnecessary research.** A live Chinese writing-help request containing “不要联网” entered web research and failed to find sources. The classifier now removes narrowly matched negated search verbs before its existing checks. Independent requests for news, prices, unfamiliar facts or verification still retain their existing routing. This is not a general disable-verification switch.

## Evidence

Evidence directory: `output/conversation-20261103/`. Fresh headless Chrome contexts were used without personal browser profiles or physical microphone capture.

### UI response delay

The same 1,091-character synthetic completed response was delivered to the previous approved bundle and the new build, both served locally with mocked APIs to isolate UI behavior. Complete visible text took **4899 ms before / 44 ms after**. This measures additional display delay after response arrival, not model generation time. See `text-browser-verified.log`.

### Speech scheduling

Real production SSE arrival times were captured for synthetic English/Japanese prompts, then replayed through the old and new PCM player code using a deterministic audio clock. Every original sample duration was preserved.

| Language | Frames | Scheduled gaps over 15 ms, before | After | Total scheduled gaps, before/after |
|---|---:|---:|---:|---:|
| English | 1370 | 60 | 14 | 13.569 / 13.827 s |
| Japanese | 2298 | 16 | 5 | 8.596 / 8.377 s |

The change reduces frequent short breaks; it does not substantially reduce total waiting in these traces. The initial audible schedule moves about 410 ms later to build the reserve. Long provider/network pauses remain possible. These counts are scheduling replay results, not a physical-device acoustic listening score. See `baseline-stream.json` and `replay.json`.

The initial Chinese baseline took 22.448 seconds to response headers and 23.533 seconds to its research-failure reply. That includes a separate connection/wake-up delay; it would be incorrect to attribute all 23.5 seconds to the classifier. English first text/audio arrived at 6.427/9.249 seconds and Japanese at 2.595/5.570 seconds. Upstream model wait is still material and was not changed. The exploratory Japanese response also contained malformed mixed-language text; this release does not claim to fix provider answer quality.

### Regression checks

- The three new behavior tests failed against the original code (`red.log`), then passed with the changes.
- 25 focused tests passed, including protected greeting/source hashes, web-verification routing, SSE cancellation and PCM lifecycle (`unit.log`).
- 18 gateway/voice contract, transport and microphone lifecycle tests passed (`integration.log`).
- Both 1440/390 viewport layouts passed ten streamed voice rounds, HTTP fallback and interruption with zero page errors (`browser-streaming-final.log`).
- Both layouts passed real Silero/ONNX processing with synthetic microphone input, three speech turns, two spoken interruptions, silence suppression and track release (`browser-automatic-final.log`). Conversation APIs were mocked for these regression cases; actual runtime files were downloaded from the retained Render route.
- Production build passed. The protected source diff was empty for `render.yaml`, `providers/mmx.js`, `providers/minimax.js`, `providers/deepseek.js`, `contracts/chat.js`, `providers/japanese-speech.js`, `voice-service.js`, `voice-stream.js` and `src/lib/i18n.js`. No provider environment variables or plan settings were changed.

### Real production backend with the release frontend

The locally served release build connected directly to the newly deployed Render service, without API mocks, using real browser PCM scheduling. Chinese/English/Japanese completed 738 / 68 / 105 audio frames, with first audible schedules at 7953 / 6094 / 4850 ms and a 450 ms initial reserve. All three had zero scheduled gaps over 15 ms, no unnecessary search and no page errors; their audio durations were 23.185 / 2.136 / 3.193 seconds. Different prompts were used across languages, so these are acceptance samples, not before/after latency benchmarks. See `live-browser.json` and `live-integrated.log`.

After both public deployments completed, direct browser downloads from both origins matched local SHA256 values for the main bundle and the new VAD/PDF chunks (`public-hashes.json`). A real Chinese conversation on the public Cloudflare entry then completed 832 frames / 26.122 seconds of audio, with first audible schedule at 6319 ms, the expected 450 ms reserve, one scheduled gap over 15 ms, correct speaking/idle states and no page errors. It did not trigger research. This demonstrates improvement with a remaining interruption, not perfectly gap-free speech. See `live-public-browser.json` and `live-public.log`. Render error logs queried after the new deployment returned no error entries.

## Release identities

- Working implementation: `af3cb1b9fd502db0bc8c17364397db9d355f103d`.
- Main implementation: `86bfa7222d10c39172388f45ffd56e02702445cc`.
- Render deploy: `dep-dbkvce0ae00c7382uuhg`, confirmed `live` at that main revision. Existing service remains `free`, Oregon.
- Pages: `52d996aee393a730f7d9ccf540f305d8d6aa87cf`; workflow [41659142796](https://github.com/niuzipai-gif/zt-ai-web/actions/runs/41659142796) completed successfully.
- Cloudflare production version: `336b2ec0-abbe-4cb2-bdc1-0dba1ec22442`; asset upload and deployment completed after network retries (`static-deploy-retry.log`).
- Frontend bundle: `assets/index-C1ISdIif.js`; SHA256 `bdf4c6b3a50370d540478d6aad7f55302d62d7e8e18dbb8bc9cd7a842bbad2de`.

Builds come from the accepted frontend worktree; only scoped source changes are cherry-picked into the main release worktree. Older static assets are retained for cached clients. Both public entries are updated; the default voice-runtime route remains Render.

## Remaining risks and scope

Overseas direct access was unstable during verification, including a Cloudflare navigation connection closure and retried static/GitHub uploads. The new entry is not guaranteed to be fast across mainland carriers. Render idle cold starts and provider generation latency remain. The existing external search provider returned HTTP 403 in an exploratory request; its credentials/plan were not changed, and legitimate research-dependent questions may still fail or be slow. No paid service, model downgrade, voice substitution or background keep-alive was introduced.

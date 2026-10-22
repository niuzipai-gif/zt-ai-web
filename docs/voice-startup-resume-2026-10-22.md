# Public voice startup continuation — 2026-10-22

## Scope and baseline

Resumed the latest completed turn of `ZT.AI 2` (01a02fe0-3ae7-7e91-9af9-f12468c906b1), rather than its stale release-upload preview. The user had authorized finishing the voice upgrades and deploying after tests, with the Chinese voice protected. No new cloning, plan change, installer build, or unrelated feature work was performed.

Fresh baseline: the public page returned 200; gateway health returned `ok: true`, revision `a40d5fcd1bf041db278fda59732d71ddf2629f5c`. The original public browser check again exceeded its 60-second startup wait. A full compressed WASM download timed out at 45 seconds after only 1,604,312 / 2,892,500 bytes; a 128 KiB range succeeded in 7.15 seconds. This supports a slow/interrupted resource-transfer diagnosis, not a claim that the gateway is offline.

## Change

- Build the same compressed WASM into 23 content-addressed parts, each at most 128 KiB. Download at most four concurrently; validate size and SHA-256 before accepting each part. No runtime/model version or voice identity change.
- Retry an individual failed part at most once, with a 20-second request bound. Retain verified parts in a bounded in-memory cache for another start; content-addressed URLs also permit normal browser HTTP caching. A page reload does not promise to retain memory-cache contents.
- Display verified runtime download progress. Allow up to 120 seconds for the complete detector startup, with cancellation and immediate microphone-track cleanup retained. The percentage covers the runtime transfer; the model/initialization still follows, so 100% is not presented as ready.
- Existing deployments without the manifest retain the previous gzip path. Browsers without `DecompressionStream` retain the raw-runtime fallback and may still be slow.

References: [Fetch cache behavior](https://developer.mozilla.org/en-US/docs/Web/API/Request/cache), [browser SHA-256](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest).

## Fresh local verification

- 56 frontend voice tests and 17 server/provider voice tests passed. New cases cover bounded parallel ordering, retry reuse, corrupted/truncated rejection, and cancellation with no late progress. An additional stalled-response-body case passed afterward, verifying timeout and the two-attempt ceiling (five part-loader tests passed together).
- Production Pages build passed. All 23 generated parts reconstructed the exact original 11,210,254-byte WASM, SHA-256 `71aef04959c5c1b6de461b6538e2058e306610034a85aad2742d0c7fd4533fe4`.
- Isolated Chromium, 1440 and 390 px: real Silero/ONNX initialized locally in 1,333 / 664 ms; each completed three synthetic microphone utterances and two spoken interruptions. Silence submitted nothing; closing stopped every microphone track; zero uncaught page errors. Provider routes were mocked for these browser checks.
- At both widths, ten typed streaming rounds, interruption, and HTTP recovery passed, with zero uncaught page errors.
- Existing large-bundle build warning remains. No whole-suite rerun was required for this frontend loader change.

## Fresh production API checks

Three bounded public chat → PCM → ASR checks completed with ordered chunks, `voice.done`, and `message.done`. The gateway remains on the same server release; this is a frontend-only deployment.

| Language | Chunks | PCM bytes | First PCM from request | ASR result |
| --- | ---: | ---: | ---: | --- |
| Chinese | 62 | 122602 | 6495 ms | `你好，欢迎回来。` matched |
| English | 90 | 181906 | 4746 ms | `Thirty, hello, welcome back.` differs from `Hello, welcome back.` |
| Japanese | 93 | 182046 | 5020 ms | `今日を買いなさい` differs from `こんにちは。お帰りなさい。` |

These are single-run transport timings, not latency percentiles. ASR is diagnostic evidence, not a human rating of accent or voice likeness. English/Japanese pronunciation is **not accepted as fully corrected**. Existing voice IDs, speed, emotion, and Chinese settings were not changed. No clone retry was made after the earlier account-plan refusal.

Private local evidence: `output/voice-resume-20261022/` contains unit logs, browser logs, the accepted handoff, and this run's audio/results. Personal source recordings and credentials are not part of the commit.

## Release

Source implementation: `139898d` on the working branch, cherry-picked to main as `8b332e2`. Pages commit: `ad78c8a`. [Pages run](https://github.com/niuzipai-gif/zt-ai-web/actions/runs/39798302818).

The existing [v0.2.26 release](https://github.com/niuzipai-gif/zt-ai-web/releases/tag/v0.2.26) was read back and contains the Windows installer, portable executable, blockmap, and Android 0.2.2 APK. These are existing binaries; this continuation does not claim a rebuilt desktop renderer.

The frontend is built from the existing `human-centered-ux` checkout, preserving its already-published project animations. The main/server release branch intentionally remains narrower; unrelated animation files were not cherry-picked in this continuation.

Public browser verification will be recorded below after Pages deployment completes. Physical microphone/speaker echo and iOS/Android routing remain outside the synthetic-browser evidence.

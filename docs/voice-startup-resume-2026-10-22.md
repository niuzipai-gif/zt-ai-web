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

Physical microphone/speaker echo and iOS/Android routing remain outside the synthetic-browser evidence.

## Distribution follow-up

The first Pages run completed successfully. Normal public HTML referenced `index-J9DpoBNO.js`, and the downloaded public JavaScript matched the build exactly: SHA-256 `f68df55a7d183e4c754613972f1c9c289c7f37acb0e56d623b8f15f9f38256b1`. However, fresh direct and existing-proxy browser checks still failed to finish the same-origin runtime transfers. Both reached the recoverable error UI with zero uncaught page errors. These checks are failures, not passed public hands-free tests.

A bounded alternate-delivery probe read the same public files through jsDelivr, pinned to the full existing Pages commit `ad78c8acfd047627f9b16ea885fd1855934451f3`. A 128 KiB part downloaded in 6.38 seconds; the full 2,327,524-byte model downloaded in 31.31 seconds and matched the original SHA-256. No personal audio, credentials, or chat content is sent to this CDN; it serves only already-public model/runtime assets. The default Pages build now uses this pinned path through `VITE_VOICE_ASSET_BASE_URL`; same-origin files remain published, and the build script accepts a replacement `VoiceAssetUrl`. This is a configured alternate origin, not automatic multi-origin failover.

Fresh isolated browser tests with the local application and real remote CDN assets, through the machine's existing proxy, passed at 1440 and 390 px: startup 31,317 / 82,962 ms; three utterances and two interruptions per width; no silence submissions; all microphone tracks ended on close; zero uncaught page errors. Both contexts downloaded and verified the parts independently. The direct CDN browser check had still timed out on a part, so this does **not** establish reliable loading on every direct connection or fast first use.

Source follow-up: `9e3c87a`, main `db0e361`, Pages `d6c3d10`. Production build and the seven capture lifecycle tests passed after the path change. Final public-page read-back and browser results follow after deployment.

## Final public browser read-back

- [Final Pages run 39802301664](https://github.com/niuzipai-gif/zt-ai-web/actions/runs/39802301664) completed successfully for Pages `d6c3d10c3c79eb84df75395ac476f396eb9bd492`. Normal public HTML references `index-6HLynneM.js`.
- Independent final JavaScript download returned HTTP 200, 1,203,785 bytes, SHA-256 `ac7eef7d812f874e4b3ff5278a311034b842176371e11ee12e07de4872b53797`, exactly matching the local published build. Curl's TLS handshake failed on the first check; a bounded Node fetch using the existing environment proxy succeeded. No failed or partial body was treated as a verified file.
- The normal public URL, through the machine's existing proxy, passed the real runtime/model browser checks in two fresh contexts: 1440 px startup **17,978 ms**, 390 px startup **84,602 ms**. Each completed three synthetic spoken turns and two spoken interruptions. Silence generated no transcription request; closing released all microphone tracks; zero uncaught page errors. Every context used the pinned CDN assets. No browser profile or system proxy setting was changed.
- The browser tests still use synthetic microphone input and mocked provider responses. The separate real production API checks above establish transport availability; combining them does not establish physical-device echo cancellation or full EN/JA pronunciation quality.
- **Status: released, partially verified.** Public continuous capture and interruption passed on the tested proxy route. Direct-path first use remains network-sensitive and earlier direct runs failed. First-use waiting can exceed one minute. English/Japanese read-back errors remain unresolved; no claim of improved voice likeness or complete pronunciation correction is made.
- **Next action:** human testing of speaker/headphone behavior and the saved EN/JA samples, then targeted pronunciation changes supported by those observations. Broad search/media upgrades and new voice cloning were not added to this bounded continuation.

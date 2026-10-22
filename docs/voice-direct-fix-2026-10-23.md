# Voice direct loading and pronunciation — 2026-10-23

Status: complete for the approved scope. Direct loading, first-load improvements and English are deployed and verified. After the user explicitly selected pronunciation accuracy over personal Japanese timbre, the standard Japanese voice and bounded date/counter readings were deployed and verified. Chinese remains unchanged; this final Japanese release also preserves English. No plan upgrade or new cloning operation was performed.

## Final approved Japanese release

- Approval: the user selected “优先发音准确，改用标准日语音色（推荐）” and had already authorized deployment after tests.
- Working source: `6c6e155b23ad9fde04ce9f62c5a890ea64cf8fc5`.
- Main / live gateway: `3e307ba311f05f5e7be9be234c3b11ec3e90cff1`; production health readback matches.
- Render blueprint deploy: `dep-dbd432vi822c73f0j1og`, live at `2026-10-22T17:03:28.615615Z`; service remains free.
- Pages: `e770a9ee033ccd4edbf7c93c768200d7cdc483f3`.
- [Pages workflow](https://github.com/niuzipai-gif/zt-ai-web/actions/runs/39819119107): success.
- Public `assets/index-DOnnQKf_.js`: HTTP 200, 712,536 bytes, SHA256 `51ca3cb0f9bc78daf8bc493e2117fe778a84570a157b16ef6cc4a3b17b09b530`, independently matches the build.
- Only Japanese voice identity changes to existing system voice `Japanese_IntellectualSenior`. Its existing model, speed and emotion are retained. The Japanese UI now identifies the standard Japanese voice.
- The spoken Japanese copy expands explicit calendar dates and counters into readings, with a small pause between month and day. Displayed replies are unchanged. Standalone numbers, durations, ambiguous slash dates and protected identifiers are left alone. Chinese/English do not enter this helper.
- 23 distinct relevant regression tests passed across the provider/voice-service/stream suites, including the added standard-voice registry regression; production build passed.

Final actual production page tests used fresh contexts with `--no-proxy-server`, Japanese UI, real gateway VAD assets, real WebAudio/Silero/ONNX, fixture microphone and mocked conversation APIs:

| Viewport width | Page interactive | Voice ready after start | Turns | Speech interruptions |
|---|---:|---:|---:|---:|
| 1440 | 4,720 ms | 13,641 ms | 3 | 2 |
| 390 | 9,674 ms | 11,712 ms | 3 | 2 |

Both runs verified the new Japanese label, silence suppression, release of every microphone track, zero page errors and no timeout. Network timing varies; these are measured samples, not an SLA or physical-phone tests.

Separate real public chat → streamed PCM → ASR probes all returned HTTP 200:

| Language | First audio | Readback |
|---|---:|---|
| Chinese | 6,266 ms | 你好，欢迎回来。 |
| English | 3,628 ms | Hello, welcome back. |
| Japanese | 4,585 ms | こんにちは。会議は4月1日です。打ち合わせは9月15日です。7月14日に26個を発送してください。 |

The Japanese date/count content matches the requested spoken reply. Final local samples also passed the primary ASR checks for the selected dates. Independent Whisper-small still disagreed on isolated phrases/counters in some samples; automated transcription is not a native listening assessment and does not establish universally perfect pronunciation.

Final evidence under `output/voice-fix-20261023/`: `native-unit.log`, `native-build.log`, `native-final/results.json`, `native-final/*.wav`, `native-final-independent-asr.json`, `native-live/results.json`, `native-live/*.wav`, `native-public-ui.log`, and `native-public-hash.json`.

## Earlier loading and English release evidence

- Working source: `7204f3bf44294404f7b4f0947508a129c810b297`.
- Main / live gateway: `d9d6d686c306fd7068ab4a00707e8e77a4097756`.
- Render deploy: `dep-dbd3kvctuius73cilen0`, blueprint sync, verified `live`; service remains free.
- Pages: `d36a9621b9bad3abc9c9e9eb27c8d2ba2e3bf50a`.
- [Pages workflow](https://github.com/niuzipai-gif/zt-ai-web/actions/runs/39814870249): success.
- [Public site](https://niuzipai-gif.github.io/zt-ai-web/).
- Public `assets/index-c9YsuxFP.js`: HTTP 200, 712,532 bytes, SHA256 `e644a2fd4e2b2f38bd7721dfc4764b8735c62e12d7379f783a1aea83093d6765`, independently matches the build.

## Changes shipped

1. Existing Render gateway now serves a fixed allowlist of public VAD assets under `/voice-vad/v1/`, with compression, CORS, immutable caching, no filesystem-path input and no new dependency installation. The normal runtime download is one 2.89 MB gzip file rather than a CDN manifest plus 23 requests. Browser verifies exact decompressed SHA256 and size. The model is gzip encoded (1.94 MB transferred). Prior Pages assets remain available.
2. Word parsing is lazy-loaded only on DOCX upload. Main JS fell from 1,203,785 to 712,532 bytes (40.8%). The separate parser chunk still successfully extracts a real DOCX.
3. Optional Google Fonts stylesheet no longer blocks first paint. Browser checks deliberately leave its request pending until the page is interactive.
4. This earlier release set EN/JA language-specific voice IDs to the already registered personal clean voice `CaiZhouTingZhClean20260828`; the final approved release above supersedes only Japanese identity. All Chinese voice selection, speech model, speed, pitch, volume and text handling remain unchanged. EN/JA model/speed/emotion retain their previous settings. English passed the selected live samples with both MiniMax ASR and independent local Whisper-small.

## Verification

- 80 relevant automated tests passed before release, including asset integrity, path restrictions, corruption, deadline/cancellation, voice capture/streaming and unchanged Chinese settings. Build passed.
- Local desktop/mobile-width browser: real WebAudio + Silero + ONNX, 3 turns / 2 speech interruptions each, silence does not upload, closing ends every track, no page errors.
- Local DOCX upload and delayed-font check passed.
- Actual production URL, **fresh browser contexts with `--no-proxy-server`**:

| Viewport width | Page interactive | Voice ready after start | Turns | Speech interruptions |
|---|---:|---:|---:|---:|
| 1440 | 2,155 ms | 10,634 ms | 3 | 2 |
| 390 | 7,386 ms | 8,918 ms | 3 | 2 |

Both runs fetched the real gateway assets, had zero page errors, released all tracks and did not time out. Browser API responses and microphone input were fixtures, while VAD, runtime, network and audio scheduling were real. Separate public API probes verified real chat → PCM → ASR. These are browser viewports, not physical Android/iOS devices or speaker echo testing.

Local evidence root: `output/voice-fix-20261023/`:

- `unit.log`, `build.log`, `local-automatic.log`, `local-font-stall.log`.
- `direct-gateway.log` (compiled local frontend + public assets, direct 7.7/5.7 seconds).
- `public-direct.log` (actual public page + public assets, direct measurements above).
- `public-index.html`, `public-main.js` (downloaded release verification).
- `live/results.json`, `live/*.wav`, `english-independent-asr.json`.

## Japanese investigation history — superseded by the approved release

The released personal clean voice improved the initial long comparison, but subsequent live tests and independent Whisper checks still found mistakes around dates/counters. Neither changes in speed/emotion, older speech models, HTTP versus bidirectional delivery nor phonetic spellings established reliable personal-voice Japanese across all samples. ASR disagreement alone is not proof of a TTS defect or a native listening assessment; record both results, do not call the whole language fixed.

An existing system voice, `Japanese_IntellectualSenior`, was tested without upgrading the plan. With explicit Japanese date/counter readings, all 3 initial MiniMax-ASR samples matched content; Whisper independently matched two and reported a one-day discrepancy on the third. This established the candidate for the user's voice-identity decision. It is a standard voice, not the user's personal voice.

Initial review audio: `output/voice-fix-20261023/native-ja/0.wav` through `2.wav`. Transcripts: `native-ja/results.json`, `native-independent-asr.json`. The user subsequently explicitly approved the standard voice; final release evidence is above.

After approval, `server/src/providers/japanese-speech.js`, its tests and the import/use in `mmx.js` were finalized, checked and included in the Japanese release. A month/day pause was added following sample review.

## Return

- status: complete; approved loading, English and standard Japanese changes are live and verified.
- evidence: commits, production hashes, browser logs, live WAV files and two ASR systems above.
- remaining_risk: isolated independent-ASR discrepancies remain; physical device/acoustic validation was not performed; measured network times are samples, not an SLA. Standard Japanese identity was explicitly approved.
- next_action: no further approval or deployment required for this scope. Current owner completed the work; no external handoff or messaging occurred.

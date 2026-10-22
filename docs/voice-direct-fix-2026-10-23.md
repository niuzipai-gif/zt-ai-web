# Voice direct loading and pronunciation — 2026-10-23

Status: direct loading, first-load improvements and English are deployed and verified. Japanese personal-voice pronunciation is improved in some samples but **not accepted as fully fixed**. A standard Japanese voice candidate is prepared locally; the user's voice-identity preference is pending. No plan upgrade or new cloning operation was performed.

## Released revision and evidence

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
4. EN/JA language-specific voice IDs now point to the already registered personal clean voice `CaiZhouTingZhClean20260828`; no cloning or package upgrade. All Chinese voice selection, speech model, speed, pitch, volume and text handling remain unchanged. EN/JA model/speed/emotion remain their previous settings. English passed the selected live samples with both MiniMax ASR and independent local Whisper-small.

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

## Japanese — unresolved and candidate only

The released personal clean voice improved the initial long comparison, but subsequent live tests and independent Whisper checks still found mistakes around dates/counters. Neither changes in speed/emotion, older speech models, HTTP versus bidirectional delivery nor phonetic spellings established reliable personal-voice Japanese across all samples. ASR disagreement alone is not proof of a TTS defect or a native listening assessment; record both results, do not call the whole language fixed.

An existing system voice, `Japanese_IntellectualSenior`, was tested without upgrading the plan. With explicit Japanese date/counter readings, all 3 selected MiniMax-ASR samples matched content; Whisper independently matched two and reported a one-day discrepancy on the third. This candidate is materially clearer on these samples but is **not the user's personal voice**, and is **not deployed**.

Review audio: `output/voice-fix-20261023/native-ja/0.wav` through `2.wav`. Transcripts: `native-ja/results.json`, `native-independent-asr.json`. The pending user question asks whether Japanese may use a standard voice or must preserve personal timbre. Do not infer an answer from elapsed time.

Unpublished local prototype: `server/src/providers/japanese-speech.js`, its test and the import/use in `mmx.js`. These provide bounded calendar/counter readings only and preserve Chinese/English. They are deliberately excluded from the release commit pending the Japanese decision and further validation. Do not accidentally deploy the dirty prototype as part of an unrelated change.

## Return

- status: partial; production loading/English verified; Japanese choice pending.
- evidence: commits, production hashes, browser logs, live WAV files and two ASR systems above.
- remaining_risk: Japanese personal pronunciation is not fully accepted; standard voice changes identity; physical device/acoustic validation not performed; measured network times are samples, not an SLA.
- next_action: use the user's Japanese voice preference to finish only that bounded item, recheck its samples, then deploy under the existing authorization. Current owner retains responsibility; no external handoff or messaging occurred.

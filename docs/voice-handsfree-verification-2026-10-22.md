# Hands-free voice release — 2026-10-22

## Delivered scope

- Enable existing bounded bidirectional TTS on the public gateway. PCM is scheduled as it arrives; completion waits for playback, not merely HTTP completion.
- Add opt-in continuous microphone capture to the shared web voice dialog. Silero v5 and ONNX Runtime execute locally, loaded lazily from the site's own `voice-vad/` assets. Only accepted, completed utterances are uploaded for ASR.
- Confirm speech for 320 ms before interruption, retain 800 ms of pre-speech audio, and wait 1,000 ms of silence before automatic submission. These are starting thresholds, not a promise of perfect recognition in every acoustic environment.
- Confirmed speech cancels the previous response and scheduled playback. Late requests cannot affect the new turn. Silence does not animate the orb as speech or create a request.
- Close/backgrounding releases microphone tracks. A 60-second utterance cap and five-minute idle cap bound unattended capture. Typing and sending turns off continuous capture. Known lack of echo cancellation disables speech interruption during speaker output; headphones are recommended for echo-prone hardware.
- Device audio suspension, including before the first PCM chunk, becomes a recoverable error rather than an indefinitely green, silent orb.
- HTTP and streaming resolve the same registered personal voice. A registry outage can still try the explicitly configured voice. No substitute system/person voice is selected.

## Voice identity / quality boundary

- Chinese remains `CaiZhouTingZhClean20260828`, model `speech-2.8-hd`, speed 1, volume 1, pitch 0, with no new emotion, normalization or pronunciation overrides. Greeting pre-roll is untouched.
- The existing registered English/Japanese voices are `CaiZhouTingEn20260827` and `CaiZhouTingJa20260827`. The previously configured August Clean EN/JA IDs were absent from the provider registry. Deployment now names the registered voices explicitly instead of relying on failure recovery.
- Correct the brand/abbreviation pronunciation dictionary and add EN/JA text normalization (basic streaming, quality HTTP). Visible Japanese text remains free of reading annotations. Original EN/JA speed (.90/.88) and calm emotion are retained.
- Real A/B probes with faster/automatic-emotion settings did **not** establish a consistent quality improvement. Those experimental defaults are not released. ASR transcripts are not a human accent or likeness rating.
- All nine source recordings and prior prepared WAVs were recovered by non-destructive copy from the Recycle Bin into a private directory outside this repository; all 24 file hashes matched. No raw recordings are published.
- A bounded EN/JA clone attempt was refused with provider code 2061: `your current token plan not support model, voice_clone`. No new voice was created or activated; no plan was purchased. Existing TTS, streaming and ASR worked with the current credential. Re-cloning is unresolved, not reported as trained.

## Verification

- Before final review: `npm test` 248 passed; two additional regression cases first failed, then passed after fixes. Final focused voice suite: 29 passed.
- Isolated Chromium at 1440 and 390 px: 10 typed streaming turns each, HTTP fallback before any audio, manual interruption, zero uncaught page errors.
- Real local Silero/ONNX with synthetic microphone at both widths: three utterances and two spoken interruptions each, silence creates no ASR request, all local model assets HTTP 200, tracks ended on close, zero uncaught page errors. Provider routes are mocked for these browser checks; they do not prove real speaker echo cancellation.
- Real upstream probes: Chinese/English/Japanese streaming succeeded; first PCM in one bounded run was 608/532/586 ms respectively. This excludes LLM/ASR and is not an end-to-end latency percentile. EN/JA full-answer ASR tests showed remaining pronunciation errors.
- Production build succeeds. Existing large-bundle warning remains; the 13.5 MB VAD assets are lazy-loaded and cached separately, not downloaded by normal text chat.
- The full test suite emits an existing Windows telemetry temporary-file rename warning from parallel tests sharing a data path. Assertions passed; this is not a claim of a warning-free run.
- Review was focused local diff review plus regression/browser checks, not an independent reviewer. Resumes, animations, unrelated checkout edits and historical QA folders were excluded.

## Remaining limits

Physical iOS/Android speaker routes and voice likeness need human testing. The installed Windows desktop renderer has not been rebuilt with this web dialog; no new installer is claimed. Network/provider outages remain possible and are surfaced recoverably. Activation applies to the normal public URL, not a special preview link.

## Production verification and startup follow-up

- Gateway release `a40d5fcd1bf041db278fda59732d71ddf2629f5c` was live on Render; health and voice status confirmed streaming output and server speech input. The release checkout's serial full suite passed 241 tests.
- Three bounded public chat-to-PCM-to-ASR probes completed successfully with ordered audio chunks and completion events. Chinese and English read-back matched the short answers. Japanese ASR omitted the opening phrase, so Japanese pronunciation/completeness remains unresolved; successful transport is not a quality pass.
- The first published frontend was verified by exact JavaScript SHA-256 and a successful Pages deployment. An isolated public-browser continuous-capture check then timed out while loading VAD assets. Local checks had passed; no claim of a completely verified public hands-free experience was made from them alone.
- Follow-up: self-host a gzip copy of the WASM runtime (2,892,500 bytes versus 11,210,254 raw), decode it using the browser's `DecompressionStream`, validate its WASM header, and supply it through ONNX Runtime's `wasmBinary` option. Older browsers retain the raw fallback. The model and runtime remain lazy-loaded; normal text chat downloads neither.
- Bound detector startup to 60 seconds. A timeout stops microphone tracks immediately and restores a recoverable UI instead of leaving it preparing indefinitely. Initialization is allowed to settle before the audio context is destroyed.
- Current follow-up checks: eight loader/capture unit tests passed, including invalid downloads, already-decoded CDN content, unsupported decompression, and late startup cancellation. Isolated Chromium at 1440/390 px passed three utterances and two spoken interruptions each with the real compressed runtime, no silence submissions, no uncaught page errors, and tracks stopped on close. The production build passed. A fresh public check is still required after this follow-up is deployed.

## References

- [MiniMax bidirectional TTS](https://platform.minimax.cn/docs/api-reference/speech-t2a-websocket-bidi)
- [MiniMax HTTP TTS](https://platform.minimax.cn/docs/api-reference/speech-t2a-http)
- [MiniMax voice cloning](https://platform.minimax.cn/docs/api-reference/voice-cloning-clone)
- [Silero VAD](https://github.com/snakers4/silero-vad)
- [Browser VAD implementation](https://github.com/ricky0123/vad)

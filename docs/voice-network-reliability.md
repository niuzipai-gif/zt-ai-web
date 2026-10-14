# Voice recovery — 2026-10-14

## Observed failures

User reports a network error after the greeting finishes. Live gateway revision before repair: `1027f0ddeaf3d284ba9db289e16ff4063daf12a9`. Health and Chinese synthesis return 200; the Chinese MP3 also downloads successfully. English and Japanese synthesis both return 502 with MiniMax status **2042**, “you don't have access to this voice_id”. The configured English/Japanese Clean IDs are absent from the account's registered clone list; the cause of their absence is not established.

Source inspection shows voice input depends on browser/Android recognition, cancels and discards the recording on a recognition service error, and has no `/api/voice/transcribe` implementation. A regression test reproduces a stopped recognition's late `network` event invalidating the next session. The user's physical browser failure was not remotely inspected; these are separately verified failure paths.

## Repair

- New server transcription uses the official MiniMax `asr-1.0` multipart `/v1/speech_to_text` interface, verified against the [official CLI](https://github.com/MiniMax-AI/cli) and a real request. Language is automatic; browser recognition is not required in the default server-capable path.
- Browser and desktop source capture mono 16 kHz PCM WAV, avoiding a dependency on browser-specific WebM decoding. Microphone permission and tracks are bounded to the active session. Cancelled/stale native events cannot fail a later turn.
- Voice mode retains a failed transcription's recording in memory for retry. Closing or beginning a new recording clears it. Audio is not written to disk by the gateway.
- Transport timeout plus one retry handles temporary network/5xx interruptions. Caller cancellation stops retries. Quota, configuration, input and identity failures have distinct public codes and do not expose upstream credential details.
- Synthesis restores only a registered, dated version of the configured person's language voice. It does not switch to another person or a system voice. Chinese keeps its existing Clean voice. English/Japanese use available older personal backups; this is availability recovery, not a new voice-quality training run.
- Bounded single-flight and five-minute audio-URL caching prevent duplicate synthesis charges on simultaneous/repeated requests. Failed results are not cached. Transcription results are briefly reusable for duplicate requests; no recording cache is persisted.
- Retrying TTS reuses the completed answer instead of sending the same question to the model again. A failed greeting is replayable/retryable. Error text supports Chinese, English and Japanese.
- Existing MiniMax preview/streaming updates were merged into the working branch. No credentials, resume templates, project animations or cloned-voice data were changed or deleted.

## Verification

- Final application tests: **218 passed, 0 failed**. Desktop Agent tests: **122 passed, 0 failed**.
- Before/after HTTP regression: transcription route previously returned 404; now validates WAV/base64, returns a transcript, recovers a revoked voice via the registered clone list, and caches a successful replay.
- Thirty simultaneous identical synthesis requests result in one provider call. Expired responses regenerate; failed responses do not stay cached; a different person's voice cannot be selected as a replacement.
- Real provider tests: Chinese, English and Japanese synthesis produce downloadable MP3s; their audio can be transcribed by the provider. English/Japanese recovery occurs automatically. Recognition includes minor extra words in two synthetic samples, so no claim of perfect pronunciation or transcription is made.
- Independent headless Chromium, synthetic microphone file, 1440 px and 390 px: greeting completion, TTS failure/retry without repeated model requests, ASR failure/retry with the identical WAV and one microphone acquisition, and standalone dictation all pass. Native recognition start count is zero; no uncaught page exceptions. Console contains the intentionally injected 503 responses and ScriptProcessor deprecation warnings.
- Physical iPhone/Android audio routing and the currently installed desktop binary are not claimed as tested. Desktop source is updated; installers have not been rebuilt in this repair. The Android shell loads the shared published website.

Local evidence is under `output/voice-network-2026-10-14/` and `output/playwright/voice-reliability/`; synthetic audio and diagnostics are not committed.

## Deployment verification

Publish scoped changes from the current production branch, then Pages from the current feature UI. Completion requires health revision match, `voiceReliability: server-asr-v1`, voice status `serverInput: true`, and successful live synthesis/transcription in all three languages. Verify the actual published script content/hash after Pages propagation.

External network/provider availability cannot be made infallible. This repair makes temporary failure recoverable and keeps recording/text instead of stranding the conversation behind a generic network error.

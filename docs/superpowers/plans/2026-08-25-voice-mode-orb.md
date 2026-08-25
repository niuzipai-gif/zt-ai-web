# ZT.AI Voice Mode Orb Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the non-cloned-audio portion of the cross-platform voice mode: a real audio-reactive orb, shared voice states, recorder/playback contracts, public-web and desktop UI shells, Android microphone permission plumbing, and tests that remain safe until the user supplies a voice sample and ASR/TTS credentials.

**Architecture:** Keep the voice lifecycle as a small pure state machine with the same state names in the React public app and the vanilla desktop renderer. Render the orb with Canvas and Web Audio `AnalyserNode` data when a microphone or output element is available; use an explicit low-motion fallback when it is not. Gate public production entry behind a server/frontend capability flag so the unfinished provider configuration cannot be presented as a working voice service.

**Tech Stack:** React/Vite, Canvas 2D, Web Audio API, `MediaRecorder`, vanilla ES modules in `agent-desktop/public`, Node built-in test runner, Android WebView/Java runtime permissions, existing Node gateway.

---

### Task 1: Add the cross-platform voice lifecycle contract

**Files:**
- Create: `src/lib/voice-mode.js`
- Create: `src/lib/voice-mode.test.js`
- Create: `agent-desktop/public/voice-mode.mjs`
- Create: `agent-desktop/src/voice-mode.test.mjs`

- [ ] **Step 1: Write failing state transition tests**

Test the exact states `idle`, `listening`, `processing`, `speaking`, and `error`. The contract must reject an invalid transition and must make cancellation deterministic:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createVoiceState, transitionVoiceState } from './voice-mode.js'

test('voice lifecycle moves from idle through listening, processing and speaking', () => {
  let state = createVoiceState()
  state = transitionVoiceState(state, { type: 'start-listening' })
  assert.equal(state.status, 'listening')
  state = transitionVoiceState(state, { type: 'finish-listening', transcript: '你好' })
  assert.deepEqual(state, { status: 'processing', transcript: '你好', error: '' })
  state = transitionVoiceState(state, { type: 'start-speaking', audioUrl: 'https://example.test/answer.mp3' })
  assert.equal(state.status, 'speaking')
  assert.equal(state.audioUrl, 'https://example.test/answer.mp3')
  state = transitionVoiceState(state, { type: 'finish-speaking' })
  assert.equal(state.status, 'idle')
})

test('voice lifecycle keeps a recoverable error and cancels without stale audio', () => {
  const failed = transitionVoiceState(createVoiceState(), { type: 'fail', error: '语音暂时不可用' })
  assert.deepEqual(failed, { status: 'error', transcript: '', error: '语音暂时不可用', audioUrl: '' })
  const reset = transitionVoiceState(failed, { type: 'reset' })
  assert.equal(reset.status, 'idle')
  assert.equal(reset.audioUrl, '')
})
```

Run: `node --test src/lib/voice-mode.test.js`

Expected: FAIL because the contract module does not exist.

- [ ] **Step 2: Implement the pure transition contract**

Implement `createVoiceState()` and `transitionVoiceState(state, event)` with this event table:

| Current | Event | Next | Required data |
|---|---|---|---|
| `idle` or `error` | `start-listening` | `listening` | none |
| `listening` | `finish-listening` | `processing` | `transcript` |
| `processing` | `start-speaking` | `speaking` | `audioUrl` |
| `speaking` | `finish-speaking` | `idle` | none |
| any non-idle state | `cancel` | `idle` | none |
| any state | `fail` | `error` | non-empty `error` |
| any state | `reset` | `idle` | none |

Return new objects rather than mutating state. Invalid events should return the original state so UI event races do not throw. Keep the implementation identical in behavior in `agent-desktop/public/voice-mode.mjs`; the desktop copy exists because the packaged renderer does not import the Vite source tree.

- [ ] **Step 3: Run both state suites**

Run: `node --test src/lib/voice-mode.test.js agent-desktop/src/voice-mode.test.mjs`

Expected: PASS with all lifecycle assertions green.

- [ ] **Step 4: Commit the contract**

```powershell
git add src/lib/voice-mode.js src/lib/voice-mode.test.js agent-desktop/public/voice-mode.mjs agent-desktop/src/voice-mode.test.mjs
git commit -m "feat: add shared voice mode state contract"
```

### Task 2: Build the audio-reactive orb renderer

**Files:**
- Create: `src/lib/audio-reactivity.js`
- Create: `src/lib/audio-reactivity.test.js`
- Create: `src/components/VoiceOrb.jsx`
- Create: `src/components/VoiceMode.jsx`
- Create: `agent-desktop/public/voice-orb.mjs`
- Modify: `src/styles.css`
- Modify: `agent-desktop/public/styles.css`

- [ ] **Step 1: Write failing level-normalization and state-class tests**

The test contract must prove that NaN, negative values, and values above one cannot create unbounded drawing parameters:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { clampLevel, orbVisualState } from './audio-reactivity.js'

test('audio level is finite and bounded', () => {
  assert.equal(clampLevel(Number.NaN), 0)
  assert.equal(clampLevel(-2), 0)
  assert.equal(clampLevel(2), 1)
  assert.equal(clampLevel(0.35), 0.35)
})

test('orb maps lifecycle states to stable visual states', () => {
  assert.equal(orbVisualState('idle').motion, 'rest')
  assert.equal(orbVisualState('listening').motion, 'input')
  assert.equal(orbVisualState('processing').motion, 'breathing')
  assert.equal(orbVisualState('speaking').motion, 'output')
  assert.equal(orbVisualState('error').motion, 'error')
})
```

Run: `node --test src/lib/audio-reactivity.test.js`

Expected: FAIL because the renderer utility does not exist.

- [ ] **Step 2: Implement bounded audio metrics**

Implement `clampLevel(value)`, `readAnalyserLevel(analyser, buffer)`, and `orbVisualState(status)`. `readAnalyserLevel` must use `analyser.getByteTimeDomainData(buffer)`, calculate RMS around the midpoint, and return a number from `0` to `1`. It must return `0` when the analyser or buffer is unavailable. `orbVisualState` must return `{ motion, color, labelKey }` using the existing gold/mint palette and the lifecycle state names from Task 1.

- [ ] **Step 3: Implement the Canvas orb component**

`VoiceOrb` must accept `{ status, analyser, onClick, disabled, reducedMotion }`, render a `<canvas>` with an accessible button wrapper, and expose `data-voice-status={status}`. Use `requestAnimationFrame` while mounted, device-pixel-ratio scaling, a maximum of 48 decorative particles, and `cancelAnimationFrame` on cleanup. Use the current input level when an analyser exists; otherwise use `0` plus the state-specific breathing fallback. Do not use random animation as a substitute for audio input. Clicking the orb calls `onClick` and keyboard Enter/Space must do the same.

- [ ] **Step 4: Add the voice-mode visual contract styles**

Add styles for `.voice-mode`, `.voice-orb-shell`, `.voice-orb`, `.voice-mode-status`, `.voice-mode-transcript`, `.voice-mode-actions`, and the desktop equivalents. The overlay must be full-screen on phones, centered in a bounded panel on desktop, honor `env(safe-area-inset-*)`, and include `@media (prefers-reduced-motion: reduce)` that disables particle motion while preserving status changes.

- [ ] **Step 5: Run focused orb tests and build**

Run: `node --test src/lib/audio-reactivity.test.js`; then `npm run build`.

Expected: PASS and a Vite production build with the new component bundled.

- [ ] **Step 6: Commit the renderer**

```powershell
git add src/lib/audio-reactivity.js src/lib/audio-reactivity.test.js src/components/VoiceOrb.jsx agent-desktop/public/voice-orb.mjs src/styles.css agent-desktop/public/styles.css
git commit -m "feat: add audio reactive voice orb"
```

### Task 3: Add a provider-neutral recorder and playback client

**Files:**
- Create: `src/lib/voice-audio.js`
- Create: `src/lib/voice-audio.test.js`
- Create: `agent-desktop/public/voice-audio.mjs`
- Create: `agent-desktop/src/voice-audio.test.mjs`

- [ ] **Step 1: Write failing capability and playback tests**

Cover no-browser capability, MIME selection, stop-before-start safety, and playback cleanup:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseRecorderMime, createVoiceAudioController } from './voice-audio.js'

test('recorder chooses a supported audio MIME and reports unavailable capability', () => {
  assert.equal(chooseRecorderMime(type => type === 'audio/webm;codecs=opus'), 'audio/webm;codecs=opus')
  assert.equal(chooseRecorderMime(() => false), '')
})

test('controller stop is safe before a recorder exists', async () => {
  const controller = createVoiceAudioController({ mediaDevices: null })
  const result = await controller.stop()
  assert.equal(result.status, 'unavailable')
})
```

Run: `node --test src/lib/voice-audio.test.js`

Expected: FAIL because the audio client module does not exist.

- [ ] **Step 2: Implement the recorder controller**

Implement `chooseRecorderMime(isTypeSupported)`, `createVoiceAudioController({ mediaDevices, recorderFactory, now })`, `start()`, `stop()`, `cancel()`, and `dispose()`. `start()` must request `{ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }`, cap a conversation take at 90 seconds, and return `{ status: 'recording', stream, analyser }`. `stop()` must return `{ status: 'ready', blob, durationMs, mimeType }` or `{ status: 'unavailable', error }`. `cancel()` must stop every track and discard the blob. The module must never write a Blob or data URL into localStorage.

- [ ] **Step 3: Implement playback control**

Add `createVoicePlayback({ audioFactory, audioContextFactory })` with `load(url)`, `play()`, `pause()`, `stop()`, `attachAnalyser()`, and `dispose()`. It must reject non-HTTPS URLs, revoke no caller-owned URLs, stop the previous audio before loading a new one, and expose `onStateChange({ status, analyser })` callbacks for the orb. Autoplay rejection must return `{ status: 'blocked', error: '需要点击播放' }` rather than throwing an unhandled promise.

- [ ] **Step 4: Run both audio-client suites**

Run: `node --test src/lib/voice-audio.test.js agent-desktop/src/voice-audio.test.mjs`

Expected: PASS without needing a real microphone, browser permission, API key, or voice sample.

- [ ] **Step 5: Commit the client contract**

```powershell
git add src/lib/voice-audio.js src/lib/voice-audio.test.js agent-desktop/public/voice-audio.mjs agent-desktop/src/voice-audio.test.mjs
git commit -m "feat: add provider neutral voice audio client"
```

### Task 4: Add a safe gateway capability contract without provider activation

**Files:**
- Create: `server/src/contracts/voice.js`
- Create: `server/src/contracts/voice.test.js`
- Modify: `server/src/index.js`
- Modify: `server/src/health.test.js`
- Modify: `server/.env.example`
- Modify: `render.yaml`

- [ ] **Step 1: Write failing voice capability tests**

Test that no secret is returned and that missing provider configuration is an explicit unavailable state:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { voiceCapability } from './voice.js'

test('voice capability is disabled until both feature flag and voice id exist', () => {
  const result = voiceCapability({ VOICE_MODE_ENABLED: 'true', MINIMAX_VOICE_ID: '' })
  assert.deepEqual(result, { enabled: false, input: false, output: false, reason: 'voice-not-configured' })
  assert.equal(JSON.stringify(result).includes('API_KEY'), false)
})

test('voice capability exposes public readiness but never provider credentials', () => {
  const result = voiceCapability({ VOICE_MODE_ENABLED: 'true', MINIMAX_VOICE_ID: 'CaiZhouTingVoice01', ASR_PROVIDER: 'configured' })
  assert.deepEqual(result, { enabled: true, input: true, output: true, reason: 'ready' })
})
```

Run: `node --test server/src/contracts/voice.test.js`

Expected: FAIL because the contract module does not exist.

- [ ] **Step 2: Implement the capability normalizer**

Implement `voiceCapability(env)` using only `VOICE_MODE_ENABLED`, `MINIMAX_VOICE_ID`, and `ASR_PROVIDER`. Return exactly `{ enabled, input, output, reason }`. Keep `enabled` false when the feature flag is not `true`, when no voice ID exists, or when the ASR provider is absent. Do not return file IDs, tokens, API keys, or raw error messages.

- [ ] **Step 3: Add read-only capability routes**

Add `GET /api/voice/status` beside the existing health/config routes. It must return the normalized capability object and `Cache-Control: no-store`. Add `voice` to `/api/health.providers` using the same normalized result. Do not add upload or clone behavior in this task; those routes remain disabled until the user supplies a recording and the ASR/TTS provider configuration is intentionally added.

- [ ] **Step 4: Add configuration examples and tests**

Add commented entries to `server/.env.example` and `render.yaml` without values:

```dotenv
VOICE_MODE_ENABLED=false
MINIMAX_VOICE_ID=
ASR_PROVIDER=
```

Extend the health test to assert `providers.voice` is boolean and that the response body does not contain any credential-like value. Run: `node --test server/src/contracts/voice.test.js server/src/health.test.js`.

- [ ] **Step 5: Commit the gateway contract**

```powershell
git add server/src/contracts/voice.js server/src/contracts/voice.test.js server/src/index.js server/src/health.test.js server/.env.example render.yaml
git commit -m "feat: expose gated voice capability status"
```

### Task 5: Integrate the public web voice mode shell

**Files:**
- Modify: `src/main.jsx`
- Create: `src/components/VoiceMode.jsx`
- Modify: `src/lib/i18n.js`
- Modify: `src/styles.css`
- Modify: `src/lib/public-style-contract.test.js`
- Create: `src/lib/voice-mode-ui.test.js`

- [ ] **Step 1: Write failing UI contract tests**

Assert that the chat composer exposes an accessible microphone button, that the modal contains the orb/status/transcript controls, and that the Android shell does not render a download action in the voice overlay:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

test('public chat includes the voice mode entry and accessible orb labels', async () => {
  const source = await fs.readFile('src/main.jsx', 'utf8')
  assert.match(source, /aria-label=\{copy\.voiceInput\}/)
  assert.match(source, /voice-mode/)
  assert.match(source, /voice-orb/)
})
```

Run: `node --test src/lib/voice-mode-ui.test.js`

Expected: FAIL because the public chat does not yet include the new controls.

- [ ] **Step 2: Add localized voice copy**

Add Chinese, English, and Japanese values for `voiceInput`, `voiceModeTitle`, `voiceListening`, `voiceProcessing`, `voiceSpeaking`, `voiceUnavailable`, `voicePermissionDenied`, `voiceTranscriptPlaceholder`, `voiceClose`, `voiceStop`, `voicePlay`, `voicePause`, `voiceAiDisclosure`, and `voiceNeedProvider`. Keep the Chinese copy direct and conversational, matching the existing ZT.AI profile tone.

- [ ] **Step 3: Integrate the public `VoiceMode` overlay**

Add a `VoiceMode` component to `src/main.jsx` that composes `VoiceOrb`, the Task 1 state machine, and the Task 3 audio controller. Add an accessible `Mic` button beside the existing paperclip control. Opening the mode must not submit a message. In the current provider-disabled state, opening the local preview shows the orb and a clear unavailable message; it must preserve the text composer and never claim that a voice answer was generated.

- [ ] **Step 4: Add staged feature gating**

Use `VITE_VOICE_MODE_ENABLED === 'true'` or the explicit local query `voice-preview=1` for the preview shell. Use `/api/voice/status` before enabling public production voice. When the gateway reports `enabled: false`, keep the entry visible only as a disabled capability notice unless `voice-preview=1` is present. This prevents Pages from exposing a broken production action before the user supplies a voice and the provider is configured.

- [ ] **Step 5: Run public tests and build**

Run: `node --test src/lib/voice-mode-ui.test.js src/lib/public-style-contract.test.js`; then `npm test`; then `npm run build`.

Expected: all existing tests plus the new UI contract pass, and the build succeeds with no API key in generated assets.

- [ ] **Step 6: Commit the public shell**

```powershell
git add src/main.jsx src/lib/i18n.js src/styles.css src/lib/public-style-contract.test.js src/lib/voice-mode-ui.test.js
git commit -m "feat: add public voice mode shell"
```

### Task 6: Integrate the desktop voice mode shell

**Files:**
- Modify: `agent-desktop/public/index.html`
- Modify: `agent-desktop/public/app.js`
- Modify: `agent-desktop/public/styles.css`
- Modify: `agent-desktop/src/renderer-contract.test.mjs`

- [ ] **Step 1: Write the failing desktop renderer contract**

Extend the renderer test to require `voice-mode`, `voice-orb`, `voice-status`, `voice-transcript`, `voice-close`, and `voice-stop`, and to reject the old placeholder sentence `接入声音模型后可开始语音输入`.

Run: `node --test agent-desktop/src/renderer-contract.test.mjs`

Expected: FAIL because the renderer still has only the placeholder microphone click handler.

- [ ] **Step 2: Add the desktop voice-mode DOM**

Add a hidden modal after the composer with a Canvas orb, a status label, a transcript region, a close button, and a stop/play button. Keep all controls keyboard reachable and give the orb `role="button"`, `tabindex="0"`, and an `aria-label`.

- [ ] **Step 3: Replace the placeholder handler**

Import the desktop state, orb, and audio modules. Replace the current `els.voice.addEventListener` notice with `openVoiceMode()`. The desktop shell must allow previewing the lifecycle and orb without granting any workspace capability; voice input must still route through `runChat` after a future transcript exists, never through the command executor directly.

- [ ] **Step 4: Add desktop styling and capability messaging**

Add desktop overlay styles that reuse the existing dark/gold/mint palette, support an 800px and a narrow mobile-width window, and show the disabled-provider message from `/api/voice/status`. Keep the composer microphone button visible and active only when the preview/provider flag allows it.

- [ ] **Step 5: Run desktop tests**

Run: `node --test agent-desktop/src/renderer-contract.test.mjs agent-desktop/src/voice-mode.test.mjs agent-desktop/src/voice-audio.test.mjs`; then `npm run agent:test`; then `npm run desktop:test`.

Expected: PASS with no old placeholder notice and no regression in task execution or authorization tests.

- [ ] **Step 6: Commit the desktop shell**

```powershell
git add agent-desktop/public/index.html agent-desktop/public/app.js agent-desktop/public/styles.css agent-desktop/src/renderer-contract.test.mjs
git commit -m "feat: add desktop voice mode shell"
```

### Task 7: Prepare Android WebView microphone permissions and fallback

**Files:**
- Modify: `android-app/app/src/main/AndroidManifest.xml`
- Modify: `android-app/app/src/main/java/com/ztai/mobile/MainActivity.java`
- Modify: `android-app/README.md`

- [ ] **Step 1: Add the manifest permission**

Add `android.permission.RECORD_AUDIO` alongside `INTERNET`. Do not add storage or broad external permissions.

- [ ] **Step 2: Add runtime permission handling**

Add imports for `android.Manifest`, `android.content.pm.PackageManager`, `android.os.Build`, and `android.webkit.PermissionRequest`, plus `pendingPermissionRequest` and `RECORD_AUDIO_REQUEST = 4102`.

Add `RECORD_AUDIO_REQUEST = 4102`, retain the pending WebView `PermissionRequest`, and implement this flow:

```java
private void requestAudioPermission(PermissionRequest request) {
    pendingPermissionRequest = request;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, RECORD_AUDIO_REQUEST);
        return;
    }
    request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
}
```

In `onPermissionRequest`, allow only `https://niuzipai-gif.github.io/` and only `RESOURCE_AUDIO_CAPTURE`; deny every other origin/resource. In `onRequestPermissionsResult`, grant the retained request only when Android returns `PERMISSION_GRANTED`; otherwise deny it and let the web UI return to text input. Clear the retained request on both paths and in `onDestroy`.

- [ ] **Step 3: Document the fallback**

Update `android-app/README.md` with the permission behavior: first microphone use prompts once, denial keeps text chat usable, and the app does not show a download action.

- [ ] **Step 4: Build and inspect the Android package**

Run: `powershell -ExecutionPolicy Bypass -File .\tools\build-android.ps1` from the repository root, then inspect the merged manifest for `android.permission.RECORD_AUDIO`.

Expected: release APK builds successfully and contains only the intended microphone permission change.

- [ ] **Step 5: Commit the Android bridge**

```powershell
git add android-app/app/src/main/AndroidManifest.xml android-app/app/src/main/java/com/ztai/mobile/MainActivity.java android-app/README.md
git commit -m "feat: prepare android microphone permission bridge"
```

### Task 8: Run non-audio regression verification and leave provider activation staged

**Files:**
- Modify only files already listed above if verification finds a regression.
- Preserve: `.design-audit/` and `.runtime-qa/` as untracked directories.

- [ ] **Step 1: Run the focused suites**

Run:

```powershell
node --test src/lib/voice-mode.test.js src/lib/audio-reactivity.test.js src/lib/voice-audio.test.js src/lib/voice-mode-ui.test.js
node --test server/src/contracts/voice.test.js
node --test agent-desktop/src/voice-mode.test.mjs agent-desktop/src/voice-audio.test.mjs agent-desktop/src/renderer-contract.test.mjs
```

Expected: all focused tests pass without a microphone, voice sample, ASR key, or MiniMax voice ID.

- [ ] **Step 2: Run the existing regression suites once**

Run: `npm test`; `npm run agent:test`; `npm run desktop:test`; `npm run integration:test`; `npm run build`.

Expected: existing suites remain green and the integration smoke test reports every existing provider and route check as true.

- [ ] **Step 3: Verify the staged capability behavior**

Start the gateway with no voice provider variables and request `GET /api/voice/status`. Expected JSON:

```json
{"enabled":false,"input":false,"output":false,"reason":"voice-not-configured"}
```

Confirm the public build contains no `MINIMAX_API_KEY`, `MMX_API_KEY`, `MINIMAX_VOICE_ID`, or ASR credential string. Confirm the old desktop placeholder notice is absent.

- [ ] **Step 4: Commit verification-only fixes and report the handoff**

If the previous steps produced fixes, run `git diff --check`, commit only those fixes, and report the final commit list. Do not publish Pages or rebuild the desktop release while the public voice capability is disabled; the formal release happens after the user supplies a clean voice recording and the provider configuration is verified.

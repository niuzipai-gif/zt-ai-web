# First-load optimization — 2026-10-23

Status: scoped optimization deployed and verified. Controlled first-page improvement is about 31%; public-network variability and free-service cold starts are not eliminated.

## Scope and constraints

The user authorized further first-load improvements without upgrading the plan, required Chinese and current English/Japanese voice settings to stay unchanged, and authorized deployment after tests. This release changes only browser resource loading and verification tools. No new service, recurring keep-alive, voice clone, provider/model change or paid upgrade was introduced.

## Measured cause and changes

- Excel parsing was statically imported into the first-page JavaScript. It now loads only after a spreadsheet upload, like the existing DOCX/PDF parsers. Main JS falls from **712,536 to 381,325 bytes (46.5%)**. The initial script total, including the shared runtime, falls from 713,606 to 382,395 bytes. Existing CSV/Excel summary behavior is retained.
- The speech detector's model previously started downloading only after WASM finished. A low-priority anonymous-CORS fetch preload now starts after microphone permission is granted, alongside WASM. The subsequent MicVAD fetch reuses that response. Tests assert overlap, exactly one model response, and removal of the hint after startup/close. Unsupported preload implementations retain the library's normal fetch path.
- A 1 Mbps regression test exposed that the previous 30-second WASM deadline was too short when approximately 5 MB of model/runtime resources share the connection. The automatic-capture path now allows at most 60 seconds for that download, capped by the overall startup deadline; user cancellation still aborts immediately. This changes the failure deadline, not the time a successful start waits.
- [Browser preload/CORS reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/preload).

## Controlled before/after evidence

Both builds were served through the same Vite preview implementation with gzip, fresh Chrome contexts, HTTP cache disabled, 150 ms latency and 128 KiB/s throughput. The optional font request was held pending until the page became interactive. Widths are browser viewports, not physical devices.

| Width | Previous page interactive | Final page interactive | Reduction |
|---|---:|---:|---:|
| 1440 | 2,516 ms | 1,746 ms | 30.6% |
| 390 | 2,491 ms | 1,714 ms | 31.2% |

These are paired samples, not a promise for all networks. The early iteration measured about 1.6 seconds; the final build was rechecked and measured about 1.7 seconds.

## Validation

- 55 related unit tests passed: spreadsheet/attachment parsing and voice capture, cancellation, audio, client and runtime integrity. The 9 capture/loader tests were rerun after the final deadline change and passed.
- Final production build passed, with no dependency upgrade.
- Both viewport widths confirmed no parser chunk loads before upload, one Excel parser download after a real XLSX upload, correct parsed values/statistical total in the outgoing chat payload, and working lazy DOCX parsing. Zero page errors; blocked external fonts do not block the page.
- Real gateway VAD assets with a local compiled frontend: 3 turns, 2 speech interruptions, silence suppression, all microphone tracks released, no page errors. The parallel-loading candidate measured 3.37/2.61 seconds to voice-ready before the final slow-network deadline adjustment.
- Final low-speed voice run: at 128 KiB/s with 150 ms latency, **39,963 ms** to voice-ready, 3 turns, 2 interruptions, model downloaded once, all tracks released and no page errors. The original 30-second candidate failure is retained as regression evidence.

## Release identities

- Working source: `8f520ec2be2a4541ce2612f438318d3350258ec9`.
- Main source: `ddf382cb5b3a697ca7aed40a7a5a1772afed384b`.
- Pages commit: `04a02e7b2704365a20b58c8a78f483f4fa2a5c9c`.
- [Pages workflow](https://github.com/niuzipai-gif/zt-ai-web/actions/runs/39825155606): success.
- Main asset: `assets/index-D05DUTpM.js`, 381,325 bytes; SHA256 `9379eebde4656bc597e1beccbac28961f91fb95834d9b8cfebd40848092718a6`.
- [Public site](https://niuzipai-gif.github.io/zt-ai-web/).
- The gateway deployment remains `3e307ba311f05f5e7be9be234c3b11ec3e90cff1` / `dep-dbd432vi822c73f0j1og`. Frontend source commits use `[skip render]`; no gateway restart is needed.
- Render readback confirms service `srv-d9u10fqjobas73e1hai0` remains on `free`. Diff verification confirms `render.yaml`, provider code, Japanese date readings, voice resolver and language copy are unchanged from the previous accepted release. Protected-file hashes are retained locally.

## Public verification

The actual public HTML references the new main asset. Its downloaded bytes match the local build SHA256 above. The live gateway health endpoint remains healthy at the unchanged revision above.

Fresh direct Chrome contexts (`--no-proxy-server`), with the actual public page and no artificial throttling, measured **2,410 ms at width 1440** and **3,062 ms at width 390** to an interactive home page. Both completed real XLSX/DOCX uploads and content extraction using mocked chat API responses, with zero page errors. These timing samples include the real public asset network and are separate from the controlled comparison above.

A subsequent direct public voice regression encountered a substantially slower network path:

| Width | Page interactive | Voice ready after start | Confirmed turns | Speech interruptions |
|---|---:|---:|---:|---:|
| 1440 | 15,282 ms | 16,695 ms | 3 | 2 |
| 390 | 26,163 ms | 50,226 ms | 3 | 2 |

Both passed parallel-model loading, exactly one model response, silence suppression, cleanup of the preload hint, release of all tracks and zero page errors. These slow samples are retained rather than excluded. They show why the controlled comparison, not the fastest public sample, supports the improvement percentage. They also show that a universally fast first visit has **not** been established; download volume is smaller but public-network throughput/latency remain material constraints. The 60-second download budget avoided a false timeout in this slow successful case.

## Evidence and limits

Evidence root: `output/startup-20261023/`: `before-direct.log`, `before-throttled.log`, `after-throttled-final.log`, `after-local-real-assets.log`, `slow-voice-30s-failure.log`, `slow-voice-final.log`, `unit.log`, `voice-unit-final.log`, `build.log`, `protected-config-hashes.json`, `public-hash.json`, `public-page.log`, `public-voice.log`.

The browser voice tests use synthetic microphone input and mocked conversation APIs with real WebAudio, Silero, ONNX and gateway asset downloads. They do not establish physical-device acoustic behavior or re-evaluate unchanged provider voice quality.

Free Render services still sleep after 15 minutes without traffic and require time to wake, per [Render's free-service documentation](https://render.com/docs/free#spinning-down-on-idle). Browser download improvements cannot eliminate that platform cold start. No periodic traffic was added to keep the service awake.

- status: complete for the requested optimization release; all selected checks passed and the published bytes were verified.
- evidence: scoped commits, tests, controlled measurements and production asset hash above.
- remaining_risk: free-service wake time, network variability, unsupported-preload fallback and physical-device validation boundaries above.
- next_action: no further approval or deployment required for this scope. Current owner completed the release; no external handoff occurred. The task-owned local preview processes were stopped after verification.

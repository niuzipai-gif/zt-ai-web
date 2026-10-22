# Free static entry and earlier gateway wake — 2026-10-23

Status: free static entry deployed; first-page loading improved in current direct tests. Render API cold starts remain. This is not a mainland hosting migration or a guarantee of low latency on every Chinese ISP.

## Authorization and constraints

The user authorized testing and direct deployment of a faster free access path, with no plan upgrade and no changes to Chinese or current English/Japanese voice settings. The user confirmed that no Tencent/Aliyun account or custom domain is available and selected testing without an ICP filing. The current owner retained responsibility; no external handoff occurred.

## Final published behavior

- New public entry: <https://zt-ai-static.niuzipai.workers.dev/zt-ai-web/>. The existing GitHub Pages entry remains available.
- Cloudflare serves the public build as static assets, with no custom API Worker, database, billing-plan update or provider secrets. [Cloudflare documents static-asset requests and storage as free](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/). The account's dynamic Worker billing tier could not be verified with the available OAuth scopes, so dynamic API hosting was not introduced.
- Both HTML entries start one bounded `/api/health` request at navigation time, before the main bundle finishes, to overlap Render wake-up with page download. It does not block rendering, retries nowhere and creates no recurring keep-alive.
- The gateway now accepts the exact new HTTPS origin. Existing allowed origins and loopback access continue working; sibling Workers hosts, HTTP and lookalike suffixes remain rejected by tests.
- **Final production retains the original Render voice asset URL.** A Cloudflare voice-asset candidate was rejected after slow and failed tests. The final frontend main bundle is byte-identical to the previous approved release. Language, voice, speed, emotion, pronunciation dictionaries and provider logic are unchanged.

## Direct browser evidence

Fresh headless Chrome contexts, no proxy, no artificial throttling. Viewport widths represent layouts, not physical mobile devices. Font and API requests were held during page timing to prove that neither blocks interactivity.

| Three alternating rounds | Static candidate | Original GitHub entry |
|---|---|---|
| Width 1440 | 1670 / 1467 / 1597 ms | 1734 / 5795 / 5422 ms |
| Width 390 | 1728 / 1875 / 1689 ms | 1210 / connection closed / 3590 ms |

These candidate rounds had the same page UI and a different voice-asset URL. The final deployment restored the original voice-asset URL and was checked again:

| Final release | Width 1440 | Width 390 |
|---|---:|---:|
| Page interactive | 1934 ms | 1616 ms |
| Voice detector ready after start | 4336 ms | 4212 ms |
| Confirmed speech turns | 3 | 3 |
| Speech interruptions | 2 | 2 |

Final voice tests use real browser audio processing, pinned Silero/ONNX downloads and synthetic microphone input, with conversation APIs mocked. The gateway was already awake. They do **not** measure an idle Render wake-up or physical microphone/acoustic behavior. Both widths passed silence suppression, parallel model loading, exactly one model response, track release and zero page errors.

The discarded static voice candidate measured 36,056 / 4,206 ms in one run, then 42,219 ms on desktop and a failed mobile startup (runtime download aborted at its bounded timeout). Isolated transfer tests were fast, but those did not override the full-flow failure. Evidence is retained in `cf-voice-direct.log` and `cf-voice-profile.log`.

## Verification and release identities

- 31 focused tests passed: CORS, capture/runtime validation, voice contracts, HTTP voice routes, configuration preservation and provider behavior.
- Build and Excel/DOCX lazy-upload checks passed at both viewport widths.
- Protected source files compare equal after normalizing Windows line endings: `render.yaml`, `providers/mmx.js`, `providers/japanese-speech.js`, `voice-service.js`, `voice-stream.js`, `src/lib/i18n.js`. No environment variables were changed.
- Working implementation: `9b91cbd`; main implementation: `f1949961a95fd5318167d70b8d9898912995f76a`.
- Render deploy `dep-dbd569hsrm7s73dp1vu0`: live, confirmed at the exact main revision. Service `srv-d9u10fqjobas73e1hai0` remains `free`, Oregon.
- Final Cloudflare version: `42d24e03-f542-4e1f-9612-f3fc7c672e54`.
- GitHub Pages: `a8c39fe09e62d1306d1ce5965af854d02dccaede`; [workflow 39830175392](https://github.com/niuzipai-gif/zt-ai-web/actions/runs/39830175392) succeeded.
- Both public entries serve `assets/index-D05DUTpM.js`, 381,325 bytes, SHA256 `9379eebde4656bc597e1beccbac28961f91fb95834d9b8cfebd40848092718a6`, matching local bytes. Both expose the navigation warm-up in HTML.
- Real browser CORS health check confirmed the exact live revision. Chinese, English and Japanese streaming calls each returned HTTP 200, completed both message and audio streams, and emitted 59 / 74 / 126 audio frames without error events. Full response durations were 16.7 / 23.9 / 29.1 seconds, including model generation and the complete audio stream; these are not first-page or first-audio times. Real ASR returned HTTP 200 and the expected synthetic phrase. See `output/edge-access-20261023/live-browser-api.log`.

Evidence root: `output/edge-access-20261023/`. Main logs: `paired-direct-complete.log`, `final-original-voice-route.log`, `unit.log`, `voice-regression.log`, `cf-page-final.log`, `public-hashes.json`, `protected-config-hashes.json`, `cf-safe-final-deploy.log`, `live-browser-api.log`.

## Remaining limits and next action

- [Render Free still spins down after idle](https://render.com/docs/free#spinning-down-on-idle). Earlier navigation wake-up overlaps waiting but does not eliminate it. No end-to-end cold-start improvement percentage is claimed.
- Cloudflare's ordinary global Workers domain is an overseas route. These local direct measurements do not prove availability or speed across Chinese provinces/carriers.
- [Tencent EdgeOne Pages domain rules](https://edgeone.cloud.tencent.com/pages/document/175191784523485184) make the default domain unsuitable for stable mainland production access; mainland nodes need an eligible custom domain with ICP filing. No temporary preview URL was substituted for production.
- status: shipped a tested free page-loading improvement; permanent elimination of API cold starts remains unresolved under the available hosting/access constraints.
- evidence: exact releases, checksums, browser traces and tests above.
- remaining_risk: free Render wake-up, overseas network variability, physical-device validation and different-origin browser storage. Existing chats stored in the old origin remain there; the new origin has its own browser storage.
- next_action: use the new entry for faster tested page access; retain the old entry as fallback. No subscription, DNS change or account setup was performed.

## Reproduce the approved deployment

From the accepted frontend worktree, run `tools/publish-pages.ps1` with its default Render voice-asset URL, then `node tools/prepare-static-edge.mjs`, then `npx wrangler@4.152.0 deploy --config deploy/cloudflare-static/wrangler.jsonc`. Preserve older public asset files for clients with cached HTML. Do not build the public frontend from the release worktree, which intentionally does not include unrelated accepted design work.

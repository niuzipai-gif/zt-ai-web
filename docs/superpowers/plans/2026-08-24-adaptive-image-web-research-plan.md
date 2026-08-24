# Adaptive Image Web Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended for inline execution) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Google Web Detection and TinEye reverse-image providers, replace the fixed six-result research path with adaptive multi-query evidence collection, and expose the expanded evidence safely in the existing source drawer.

**Architecture:** Keep the public gateway as the only orchestration point. A focused image-search adapter normalizes Google Vision and TinEye responses into the existing safe source shape; a focused adaptive-research module fans out text queries, merges/deduplicates provider results, and stops at an evidence budget of 6/12/18/24. The model receives only high-quality evidence while the SSE source event carries the complete bounded drawer payload.

**Tech Stack:** Node.js ESM, native `fetch`/`FormData`/`Blob`, Google Vision REST API, TinEye REST API, Firecrawl, DuckDuckGo HTML fallback, Node test runner, React/Vite.

---

### Task 1: Add failing tests for image provider normalization

**Files:**
- Create: `server/src/image-search.test.js`
- Create: `server/src/image-search.js`

- [ ] **Step 1: Write the failing tests**

Cover these exact behaviors before implementation:

```js
test('normalizes Google web detection entities and matching pages', async () => {
  const result = await searchGoogleWebDetection({
    imageDataUrl: 'data:image/png;base64,abc',
    fetchImpl: async () => new Response(JSON.stringify({ responses: [{ webDetection: {
      webEntities: [{ description: 'Example object', score: 0.91 }],
      pagesWithMatchingImages: [{ url: 'https://example.com/page', pageTitle: 'Example page' }],
      fullMatchingImages: [{ url: 'https://example.com/full.png' }],
    } }] }), { status: 200 }),
    config: { apiKey: 'fixture' },
  })
  assert.equal(result.provider, 'google-vision')
  assert.equal(result.results[0].evidenceType, 'web-entity')
  assert.equal(result.results.some(item => item.url === 'https://example.com/page'), true)
  assert.equal(result.results.some(item => item.url === 'https://example.com/full.png'), true)
})

test('normalizes TinEye uploaded-image matches without exposing credentials', async () => {
  let request
  const result = await searchTinEye({
    imageDataUrl: 'data:image/png;base64,abc',
    fetchImpl: async (url, options) => {
      request = { url, options }
      return new Response(JSON.stringify({ code: 200, results: {
        matches: [{ backlinks: [{ url: 'https://source.example/item', title: 'Source item' }], score: 96 }],
      } }), { status: 200 })
    },
    config: { apiKey: 'secret-fixture' },
  })
  assert.equal(result.provider, 'tineye')
  assert.equal(result.results[0].url, 'https://source.example/item')
  assert.equal(request.options.headers['x-api-key'], 'secret-fixture')
  assert.doesNotMatch(JSON.stringify(result), /secret-fixture/)
})

test('disabled or failed image providers return a safe provider error', async () => {
  await assert.rejects(() => searchGoogleWebDetection({ imageDataUrl: 'data:image/png;base64,abc', config: {} }), /未配置 Google Vision/)
  await assert.rejects(() => searchTinEye({ imageDataUrl: 'data:image/png;base64,abc', config: {} }), /未配置 TinEye/)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test server/src/image-search.test.js`

Expected: FAIL because `server/src/image-search.js` does not yet exist.

- [ ] **Step 3: Implement the minimal adapter**

Implement `resolveImageSearchConfig`, `searchGoogleWebDetection`, `searchTinEye`, `normalizeGoogleWebDetection`, and `normalizeTinEye`. Accept injected `fetchImpl`, `timeoutMs`, and config in every network function. Convert data URLs to a bounded base64 payload for Google; convert them to a `Blob` in a native `FormData` field named `image_upload` for TinEye. Never include API keys in returned records or thrown errors.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test server/src/image-search.test.js`

Expected: all image-provider tests pass.

- [ ] **Step 5: Commit the provider adapter**

```powershell
git add server/src/image-search.js server/src/image-search.test.js
git commit -m "feat: add optional reverse image providers"
```

### Task 2: Add failing tests for adaptive text research and evidence merging

**Files:**
- Create: `server/src/web-research.test.js`
- Create: `server/src/web-research.js`
- Modify: `server/src/web-search.js`
- Modify: `server/src/web-search.test.js`

- [ ] **Step 1: Write the failing tests**

Test that `buildResearchPlan` returns the budgets `6`, `12`, `18`, and `24` for ordinary, image, ambiguous, and conflict requests; test that `runAdaptiveResearch` queries multiple directions, deduplicates URLs, preserves provider/evidence type, and stops when the cap is reached.

```js
test('uses a larger evidence budget for ambiguous image research', () => {
  assert.deepEqual(buildResearchPlan({ inputText: '这张图是什么出处', imageRequest: true }), {
    initialLimit: 8, maxLimit: 18, expansionLimit: 24,
  })
})

test('merges query directions and removes duplicate domains without exceeding 24 sources', async () => {
  const calls = []
  const research = await runAdaptiveResearch({
    queries: ['图片文字出处', '黄色卡通包装来源', '图片原图'],
    initialLimit: 8,
    maxLimit: 24,
    searchImpl: async ({ query, limit }) => {
      calls.push({ query, limit })
      return { provider: 'firecrawl', query, results: Array.from({ length: 8 }, (_, i) => ({
        rank: i + 1, title: `${query}-${i}`, url: `https://source-${i % 10}.example/${query}-${i}`, snippet: 'evidence', evidenceType: 'text-search',
      })) }
    },
  })
  assert.ok(calls.length >= 2)
  assert.ok(research.results.length <= 24)
  assert.equal(new Set(research.results.map(item => item.url)).size, research.results.length)
  assert.equal(research.expanded, true)
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test server/src/web-research.test.js`

Expected: FAIL because the adaptive research module does not yet exist.

- [ ] **Step 3: Implement adaptive research**

Add an explicit `searchWeb({ limit })` upper bound of 24 without changing its single-query API. Add `buildResearchPlan` and `runAdaptiveResearch` that:

1. execute the first query set with the initial budget;
2. normalize URL/title fingerprints and discard non-http(s) sources;
3. keep at most two results per hostname until the budget needs more domain diversity;
4. expand to the next budget only when the current evidence is insufficient or new query directions still return new URLs;
5. return `{ provider: 'multi', query, queries, results, expanded, searchedQueryCount, providerErrors }`.

Use sequential provider calls with progress callbacks so Render is not overloaded and the SSE stream explains each expansion. Do not change the existing Firecrawl-first / DuckDuckGo-fallback behavior.

- [ ] **Step 4: Run focused tests and refactor only after GREEN**

Run: `node --test server/src/web-search.test.js server/src/web-research.test.js`

Expected: all focused search tests pass with no warnings.

- [ ] **Step 5: Commit adaptive research**

```powershell
git add server/src/web-search.js server/src/web-search.test.js server/src/web-research.js server/src/web-research.test.js
git commit -m "feat: expand web research evidence adaptively"
```

### Task 3: Connect image providers and adaptive research to the gateway

**Files:**
- Modify: `server/src/index.js`
- Modify: `server/src/web-verification.js`
- Modify: `server/src/index.image.test.js`
- Modify: `server/src/web-verification.test.js`

- [ ] **Step 1: Write the failing gateway assertions**

Extend the image integration fixture so Google Vision is mocked and the SSE response is required to contain `image-source`, `google-vision`, more than six sources, and `expanded: true` when the mock returns conflicting low-confidence evidence. Add a regression assertion that Google Vision failure still reaches MiniMax and never emits a false identity.

- [ ] **Step 2: Run the gateway tests and verify RED**

Run: `node --test server/src/index.image.test.js server/src/web-verification.test.js`

Expected: FAIL because the gateway still calls one six-result `searchWeb` operation and `sourcePayload`/`buildWebVerificationContext` still slice at six.

- [ ] **Step 3: Implement the integration**

For image requests, pass the latest bounded image data URL and visual hint to the new research orchestrator. Run optional Google Vision and TinEye providers first, then use their entities/matches plus the visual hint to create text-query directions. Keep the existing non-image `searchWeb` path compatible. Update `web-verification.js` so the answer context uses the top 10–12 independent sources while `sourcePayload` returns all bounded sources and metadata; remove every six-item slice that affects the source event.

If all external image providers fail, insert the existing failure context and continue to the multimodal model. If text research fails for a non-image question, preserve the existing no-guess short response.

- [ ] **Step 4: Run focused gateway tests and verify GREEN**

Run: `node --test server/src/index.image.test.js server/src/web-verification.test.js server/src/web-research.test.js`

Expected: all image, verification, and adaptive research tests pass.

- [ ] **Step 5: Commit gateway integration**

```powershell
git add server/src/index.js server/src/web-verification.js server/src/index.image.test.js server/src/web-verification.test.js
git commit -m "feat: route image chats through adaptive web evidence"
```

### Task 4: Expand the source drawer without leaking raw protocols

**Files:**
- Modify: `src/main.jsx`
- Modify: `src/lib/i18n.js`
- Create: `src/lib/research-sources.js`
- Create: `src/lib/research-sources.test.js`
- Modify: `src/styles.css`

- [ ] **Step 1: Add the UI contract test**

Create pure helpers in `src/lib/research-sources.js` so the UI contract is testable without a browser. Add tests for the new `provider`, `expanded`, `searchedQueryCount`, and `evidenceType` fields:

```js
test('summarizes expanded research and labels image evidence', () => {
  const research = { provider: 'multi', expanded: true, searchedQueryCount: 3, sources: [{ evidenceType: 'image-match', title: '原图' }] }
  assert.deepEqual(researchSummary(research), { count: 1, expanded: true, queryCount: 3, provider: 'multi' })
  assert.equal(evidenceLabel('image-match'), '图片匹配')
})
```

- [ ] **Step 2: Run the focused UI test and verify RED**

Run: `node --test src/**/*.test.js`

Expected: the new payload assertion fails because the UI copy and drawer metadata do not yet expose the fields.

- [ ] **Step 3: Implement the drawer changes**

Keep the existing native `<details>` interaction, but show `sourceCount`, a compact expanded indicator, provider labels, and evidence-type badges. Render all sources from the bounded payload without a hard-coded six-item display limit. Add localized copy for Chinese, English, and Japanese. Keep links `target="_blank"` with `rel="noreferrer"` and do not render provider protocol messages or tool-call text.

- [ ] **Step 4: Run UI tests and build**

Run: `node --test src/**/*.test.js; npm run build`

Expected: UI tests pass and Vite build exits 0.

- [ ] **Step 5: Commit the source drawer**

```powershell
git add src/main.jsx src/lib/i18n.js src/styles.css
git commit -m "feat: show adaptive research evidence in source drawer"
```

### Task 5: Add deployment configuration and provider-safe health metadata

**Files:**
- Modify: `render.yaml`
- Create: `server/src/health.test.js`
- Modify: `server/src/index.js`

- [ ] **Step 1: Write the failing configuration assertion**

Create `server/src/health.test.js` and assert that a GET request to `/api/health` returns `providers.googleVision` and `providers.tineye` booleans, while the serialized body never contains the fixture values `vision-secret` or `tineye-secret`.

- [ ] **Step 2: Run the focused health test and verify RED**

Run: `node --test server/src/health.test.js`

Expected: FAIL because only Firecrawl availability is currently exposed.

- [ ] **Step 3: Implement safe configuration**

Add these exact optional unsynced entries to `render.yaml`: `GOOGLE_CLOUD_VISION_API_KEY` and `TINEYE_API_KEY`. Add `googleVision` and `tineye` booleans to health/provider metadata; never return key values, request URLs containing keys, or credential JSON. The application must remain healthy when either variable is absent.

- [ ] **Step 4: Run health tests**

Run: `node --test server/src/health.test.js server/src/**/*.test.js`

Expected: all server tests pass.

- [ ] **Step 5: Commit deployment metadata**

```powershell
git add render.yaml server/src
git commit -m "chore: expose optional image search provider readiness"
```

### Task 6: Full verification and live effect check

**Files:**
- No new source files; inspect `git diff`, preserve `.design-audit/` and `.runtime-qa/`.

- [ ] **Step 1: Run the targeted regression suite**

Run:

```powershell
npm test
npm run build
```

Expected: all existing and new Node tests pass and the production build exits 0.

- [ ] **Step 2: Run the existing integration smoke test**

Run: `npm run integration:test`

Expected: public chat, source drawer, image flow, and gateway health checks pass.

- [ ] **Step 3: Verify the live gateway contract**

Send one ordinary research request and one image request to `https://zt-ai-gateway.onrender.com/api/chat`; assert HTTP 200, `message.done`, no raw `tool_call`/`websearch` protocol in the visible stream, and a source payload that can exceed six when the environment provider/search results allow it. If optional Google/TinEye credentials are absent, report provider availability as disabled rather than pretending reverse-image matching ran.

- [ ] **Step 4: Build and publish Pages**

Run: `npm run publish:pages`

Then check HTTP 200 for the existing Pages URL and download URL. Do not rebuild or re-upload the desktop installer unless the source changes require a new release asset.

- [ ] **Step 5: Commit or report final state**

Run `git status --short --branch` and `git log -8 --oneline`. Preserve the two existing untracked QA directories. Report exact commits, live URLs, provider availability, source counts, and any external credential still required.

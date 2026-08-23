import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeFirecrawlSearch, parseSearchResults, searchWeb } from './web-search.js'

test('parses public search results into safe source records', () => {
  const html = '<a class="result__a" href="https://example.com/a">Example A</a><a class="result__snippet">A summary</a><a class="result__a" href="https://example.com/b">Example B</a><a class="result__snippet">B summary</a>'
  assert.deepEqual(parseSearchResults(html), [
    { rank: 1, title: 'Example A', url: 'https://example.com/a', snippet: 'A summary', fingerprint: 'A summary' },
    { rank: 2, title: 'Example B', url: 'https://example.com/b', snippet: 'B summary', fingerprint: 'B summary' },
  ])
})

test('normalizes Firecrawl results and falls back to the public index', async () => {
  const firecrawl = new Response(JSON.stringify({ success: true, data: [{ title: 'A', url: 'https://example.com/a', description: 'A' }] }), { status: 200 })
  const first = await searchWeb({ query: 'test', fetchImpl: async () => firecrawl, config: { baseUrl: 'https://firecrawl.test/v2', apiKey: 'fixture' } })
  assert.equal(first.provider, 'firecrawl')
  assert.equal(first.results[0].url, 'https://example.com/a')

  const fallbackHtml = '<a class="result__a" href="https://example.com/fallback">Fallback</a><a class="result__snippet">Fallback summary</a>'
  let calls = 0
  const fallback = await searchWeb({ query: 'test', fetchImpl: async url => { calls += 1; return calls === 1 ? new Response('no', { status: 503 }) : new Response(fallbackHtml, { status: 200 }) }, config: { baseUrl: 'https://firecrawl.test/v2', apiKey: 'fixture' } })
  assert.equal(fallback.provider, 'duckduckgo')
  assert.equal(fallback.results[0].title, 'Fallback')
  assert.equal(calls, 2)
  assert.equal(normalizeFirecrawlSearch({ data: { web: [{ title: 'B', metadata: { sourceURL: 'https://example.com/b' } }] } })[0].url, 'https://example.com/b')
})

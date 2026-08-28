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

test('keeps optional providers out of the chain when their keys are absent', async () => {
  const urls = []
  const fallbackHtml = '<a class="result__a" href="https://example.com/fallback">Fallback</a><a class="result__snippet">Fallback summary</a>'
  const result = await searchWeb({
    query: 'ordinary question',
    fetchImpl: async url => {
      urls.push(String(url))
      return urls.length === 1 ? new Response('no', { status: 503 }) : new Response(fallbackHtml, { status: 200 })
    },
    config: { baseUrl: 'https://firecrawl.test/v2', apiKey: 'fixture' },
  })
  assert.equal(result.provider, 'duckduckgo')
  assert.equal(urls.length, 2)
  assert.ok(urls[0].startsWith('https://firecrawl.test/v2/search'))
  assert.ok(urls[1].startsWith('https://html.duckduckgo.com/html/'))
})

test('preserves meaningful search punctuation while normalizing source text', async () => {
  let requestBody = null
  const result = await searchWeb({
    query: 'C# API #2026',
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body)
      return new Response(JSON.stringify({ success: true, data: [{ title: '<b>Docs</b>', url: 'https://example.com/csharp', description: '<script>noise</script> C# evidence' }] }), { status: 200 })
    },
    config: { baseUrl: 'https://firecrawl.test/v2', apiKey: 'fixture' },
  })
  assert.equal(requestBody.query, 'C# API #2026')
  assert.equal(result.results[0].snippet, 'C# evidence')
})

test('uses Tavily for configured English technical research after Firecrawl fails', async () => {
  const calls = []
  const result = await searchWeb({
    query: 'OpenAI API documentation',
    language: 'en',
    scenario: 'technical',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options })
      if (String(url).includes('firecrawl.test')) return new Response('no', { status: 503 })
      return new Response(JSON.stringify({ results: [{ title: 'Tavily docs', url: 'https://docs.example.com/api', content: 'API documentation evidence' }] }), { status: 200 })
    },
    config: {
      baseUrl: 'https://firecrawl.test/v2',
      apiKey: 'fixture',
      tavily: { baseUrl: 'https://api.tavily.test', apiKey: 'tavily-secret' },
    },
  })
  assert.equal(result.provider, 'tavily')
  assert.equal(result.results[0].provider, 'tavily')
  assert.equal(result.results[0].query, 'OpenAI API documentation')
  assert.equal(calls.length, 2)
  assert.equal(calls[1].url, 'https://api.tavily.test/search')
  assert.equal(calls[1].options.headers.authorization, 'Bearer tavily-secret')
  assert.equal(JSON.parse(calls[1].options.body).api_key, undefined)
})

test('caps Tavily requests at its official result limit when adaptive research expands', async () => {
  let tavilyBody = null
  const result = await searchWeb({
    query: 'latest API documentation',
    language: 'en',
    scenario: 'technical',
    limit: 24,
    fetchImpl: async (url, options) => {
      if (String(url).includes('firecrawl.test')) return new Response('no', { status: 503 })
      tavilyBody = JSON.parse(options.body)
      return new Response(JSON.stringify({ results: [{ title: 'Docs', url: 'https://docs.example.com', content: 'Evidence' }] }), { status: 200 })
    },
    config: { baseUrl: 'https://firecrawl.test/v2', apiKey: 'fixture', tavily: { baseUrl: 'https://api.tavily.test', apiKey: 'tavily-secret' } },
  })
  assert.equal(result.provider, 'tavily')
  assert.equal(tavilyBody.max_results, 20)
})

test('uses the configured Zhihu API for Chinese knowledge research', async () => {
  const calls = []
  const result = await searchWeb({
    query: '跨境电商平台规则是什么',
    language: 'zh',
    scenario: 'knowledge',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options })
      if (String(url).includes('firecrawl.test')) return new Response('no', { status: 503 })
      return new Response(JSON.stringify({ data: { items: [{ title: '知乎回答', url: 'https://www.zhihu.com/question/1', excerpt: '专业解释' }] } }), { status: 200 })
    },
    config: {
      baseUrl: 'https://firecrawl.test/v2',
      apiKey: 'fixture',
      zhihu: { baseUrl: 'https://developer.zhihu.test', apiKey: 'zhihu-secret' },
    },
  })
  assert.equal(result.provider, 'zhihu')
  assert.equal(result.results[0].title, '知乎回答')
  assert.match(calls[1].url, /\/api\/v1\/content\/zhihu_search\?Query=/u)
  assert.equal(calls[1].options.headers.authorization, 'Bearer zhihu-secret')
  assert.equal(calls[1].options.headers['content-type'], 'application/json')
  assert.match(calls[1].options.headers['x-request-timestamp'], /^\d+$/u)
})

test('uses TinyFish Search for configured social or multimedia research', async () => {
  const calls = []
  const result = await searchWeb({
    query: 'YouTube AI voice tutorial',
    language: 'en',
    scenario: 'social',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options })
      if (String(url).includes('firecrawl.test')) return new Response('no', { status: 503 })
      return new Response(JSON.stringify({ results: [{ position: 1, title: 'Video result', url: 'https://youtube.com/watch?v=1', snippet: 'Video evidence' }] }), { status: 200 })
    },
    config: {
      baseUrl: 'https://firecrawl.test/v2',
      apiKey: 'fixture',
      tinyfish: { baseUrl: 'https://api.search.tinyfish.test', apiKey: 'tinyfish-secret' },
    },
  })
  assert.equal(result.provider, 'tinyfish')
  assert.equal(result.results[0].evidenceType, 'text-search')
  const tinyfishUrl = new URL(calls[1].url)
  assert.equal(tinyfishUrl.origin, 'https://api.search.tinyfish.test')
  assert.equal(tinyfishUrl.searchParams.get('query'), 'YouTube AI voice tutorial')
  assert.equal(tinyfishUrl.searchParams.get('language'), 'en')
  assert.equal(tinyfishUrl.searchParams.get('purpose'), 'ZT.AI social research')
  assert.equal(tinyfishUrl.searchParams.get('page'), '0')
  assert.equal(calls[1].options.headers['x-api-key'], 'tinyfish-secret')
})

test('falls through an unavailable optional provider to DuckDuckGo with strict failure semantics', async () => {
  const urls = []
  const fallbackHtml = '<a class="result__a" href="https://example.com/fallback">Fallback</a><a class="result__snippet">Fallback summary</a>'
  const result = await searchWeb({
    query: 'latest technical news',
    language: 'en',
    scenario: 'technical',
    fetchImpl: async url => {
      urls.push(String(url))
      if (urls.at(-1).startsWith('https://html.duckduckgo.com/')) return new Response(fallbackHtml, { status: 200 })
      return new Response('no', { status: 503 })
    },
    config: {
      baseUrl: 'https://firecrawl.test/v2',
      apiKey: 'fixture',
      tavily: { baseUrl: 'https://api.tavily.test', apiKey: 'tavily-secret' },
    },
  })
  assert.equal(result.provider, 'duckduckgo')
  assert.equal(urls.length, 3)

  await assert.rejects(
    searchWeb({
      query: 'latest technical news',
      language: 'en',
      scenario: 'technical',
      fetchImpl: async () => new Response('no', { status: 503 }),
      config: {
        baseUrl: 'https://firecrawl.test/v2',
        apiKey: 'fixture',
        tavily: { baseUrl: 'https://api.tavily.test', apiKey: 'tavily-secret' },
      },
    }),
    error => /未找到可核验的公开来源；无法据此确认结论/u.test(error.message) && !/tavily-secret/u.test(error.message),
  )
})

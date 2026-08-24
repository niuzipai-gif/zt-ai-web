import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import test from 'node:test'
import assert from 'node:assert/strict'

process.env.ZT_AI_TEST_MODE = '1'
process.env.MINIMAX_API_KEY = 'fixture'
process.env.FIRECRAWL_API_KEY = 'fixture'
const testDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-ai-image-suite-'))
process.env.ZT_AI_DATA_PATH = path.join(testDataDir, 'telemetry.json')

const { createServer } = await import('./index.js')

function upstreamResponse(text) {
  return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

test('continues to the multimodal model when image web verification is unavailable', async () => {
  const originalFetch = globalThis.fetch
  const upstreamCalls = []
  const upstream = http.createServer(async (request, response) => {
    if (request.url.endsWith('/chat/completions')) {
      let raw = ''
      for await (const chunk of request) raw += chunk
      upstreamCalls.push(JSON.parse(raw))
      const body = upstreamCalls.length === 1
        ? '黄色卡通包装，可能是某个食品或玩具产品；只作为待核验线索。'
        : '我先根据图片看到黄色卡通包装和中央的图案，但具体品牌还需要公开来源核验。'
      const result = upstreamResponse(body)
      response.writeHead(result.status, Object.fromEntries(result.headers))
      response.end(await result.text())
      return
    }
    response.writeHead(503)
    response.end('fixture unavailable')
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const upstreamPort = upstream.address().port
  process.env.MINIMAX_BASE_URL = `http://127.0.0.1:${upstreamPort}/v1`
  process.env.FIRECRAWL_BASE_URL = `http://127.0.0.1:${upstreamPort}/v2`
  const gateway = createServer()
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve))
  const gatewayPort = gateway.address().port
  const imageUrl = 'data:image/png;base64,abc'

  try {
    globalThis.fetch = async (url, options) => {
      if (String(url).endsWith('/search') || String(url).startsWith('https://html.duckduckgo.com/')) return new Response('fixture unavailable', { status: 503 })
      return originalFetch(url, options)
    }
    const response = await originalFetch(`http://127.0.0.1:${gatewayPort}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'MINIMAX',
        language: 'zh',
        visitorId: 'visitor-image-test',
        conversationId: 'image-test',
        messages: [{ role: 'user', content: [{ type: 'text', text: '这个是什么' }, { type: 'image_url', image_url: { url: imageUrl } }] }],
      }),
    })
    const body = await response.text()
    assert.equal(response.status, 200)
    assert.match(body, /我先根据图片看到黄色卡通包装/)
    assert.doesNotMatch(body, /没有拿到可核验的公开来源/)
    assert.ok(upstreamCalls.length >= 1)
    assert.ok(upstreamCalls.some(call => JSON.stringify(call.messages).includes(imageUrl)))

    const followup = await originalFetch(`http://127.0.0.1:${gatewayPort}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'MINIMAX',
        language: 'zh',
        visitorId: 'visitor-image-test',
        conversationId: 'image-test',
        messages: [
          { role: 'user', content: [{ type: 'text', text: '这个是什么' }, { type: 'image_url', image_url: { url: imageUrl } }] },
          { role: 'assistant', content: '我先看一下。' },
          { role: 'user', content: '我让你看这个图片' },
        ],
      }),
    })
    assert.equal(followup.status, 200)
    await followup.text()
    assert.ok(upstreamCalls.some(call => call.messages.at(-1)?.content?.some?.(part => part?.type === 'image_url')))
  } finally {
    globalThis.fetch = originalFetch
    await new Promise(resolve => gateway.close(resolve))
    await new Promise(resolve => upstream.close(resolve))
  }
})

test('combines reverse-image evidence and expanded text sources in the SSE payload', async () => {
  const originalFetch = globalThis.fetch
  const upstreamCalls = []
  const upstream = http.createServer(async (request, response) => {
    if (request.url.endsWith('/images:annotate')) {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ responses: [{ webDetection: {
        webEntities: [{ description: '黄色卡通包装', score: 0.72 }],
        pagesWithMatchingImages: Array.from({ length: 4 }, (_, index) => ({ url: `https://vision-${index}.example/page`, pageTitle: `Vision page ${index}` })),
        fullMatchingImages: Array.from({ length: 4 }, (_, index) => ({ url: `https://vision-full-${index}.example/image.png` })),
      } }] }))
      return
    }
    if (request.url.endsWith('/search')) {
      let raw = ''
      for await (const chunk of request) raw += chunk
      const query = JSON.parse(raw).query
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ success: true, data: { web: Array.from({ length: 8 }, (_, index) => ({ title: `${query} ${index}`, url: `https://text-${query.length}-${index}.example/source`, description: '文字核验摘要' })) } }))
      return
    }
    if (request.url.endsWith('/chat/completions')) {
      let raw = ''
      for await (const chunk of request) raw += chunk
      upstreamCalls.push(JSON.parse(raw))
      const result = upstreamResponse(upstreamCalls.length === 1 ? '黄色卡通包装，图片文字和具体出处仍需公开来源核对。' : '我先结合图片和公开来源核对，具体出处以来源中能确认的内容为准。')
      response.writeHead(result.status, Object.fromEntries(result.headers))
      response.end(await result.text())
      return
    }
    response.writeHead(404)
    response.end('not found')
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const upstreamPort = upstream.address().port
  process.env.MINIMAX_BASE_URL = `http://127.0.0.1:${upstreamPort}/v1`
  process.env.FIRECRAWL_BASE_URL = `http://127.0.0.1:${upstreamPort}/v2`
  process.env.GOOGLE_CLOUD_VISION_API_KEY = 'fixture'
  process.env.GOOGLE_CLOUD_VISION_BASE_URL = `http://127.0.0.1:${upstreamPort}/v1`
  const gateway = createServer()
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve))
  const gatewayPort = gateway.address().port
  const imageUrl = 'data:image/png;base64,abc'

  try {
    globalThis.fetch = originalFetch
    const response = await originalFetch(`http://127.0.0.1:${gatewayPort}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'MINIMAX',
        language: 'zh',
        visitorId: 'visitor-image-expanded',
        conversationId: 'image-expanded',
        messages: [{ role: 'user', content: [{ type: 'text', text: '查一下这个图片是什么出处' }, { type: 'image_url', image_url: { url: imageUrl } }] }],
      }),
    })
    const body = await response.text()
    assert.equal(response.status, 200)
    const sourceFrame = body.split(/\r?\n\r?\n/).find(frame => frame.startsWith('event: research.sources'))
    assert.ok(sourceFrame)
    const payload = JSON.parse(sourceFrame.split(/\r?\n/).find(line => line.startsWith('data:')).slice(5))
    assert.equal(payload.provider, 'multi')
    assert.equal(payload.expanded, true)
    assert.ok(payload.sources.length > 6)
    assert.ok(payload.sources.some(source => source.evidenceType === 'image-match-page'))
    assert.ok(upstreamCalls.length >= 2)
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.GOOGLE_CLOUD_VISION_API_KEY
    delete process.env.GOOGLE_CLOUD_VISION_BASE_URL
    await new Promise(resolve => gateway.close(resolve))
    await new Promise(resolve => upstream.close(resolve))
  }
})

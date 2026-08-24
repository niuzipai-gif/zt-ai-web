import test from 'node:test'
import assert from 'node:assert/strict'
import { searchGoogleWebDetection, searchTinEye } from './image-search.js'

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
  assert.equal(result.entities[0].description, 'Example object')
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
  assert.equal(request.options.body instanceof FormData, true)
  assert.doesNotMatch(JSON.stringify(result), /secret-fixture/)
})

test('disabled image providers return a safe configuration error', async () => {
  await assert.rejects(() => searchGoogleWebDetection({ imageDataUrl: 'data:image/png;base64,abc', config: {} }), /未配置 Google Vision/)
  await assert.rejects(() => searchTinEye({ imageDataUrl: 'data:image/png;base64,abc', config: {} }), /未配置 TinEye/)
})

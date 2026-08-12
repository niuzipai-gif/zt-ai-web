import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeChatRequest, contentToText } from './chat.js'

test('keeps text and image parts when normalizing a chat request', () => {
  const result = normalizeChatRequest({
    model: 'deepseek',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: '请分析这张图' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
      ],
    }],
  })
  assert.equal(result.model, 'deepseek')
  assert.deepEqual(result.messages[0].content, [
    { type: 'text', text: '请分析这张图' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
  ])
})

test('extracts readable text from structured content for media and history checks', () => {
  assert.equal(contentToText([
    { type: 'text', text: '生成一张产品图' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
  ]), '生成一张产品图')
})

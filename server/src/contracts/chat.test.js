import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeChatRequest, contentToText, isMediaIntent } from './chat.js'

test('recognizes explicit image and video creation without treating documents as media', () => {
  assert.equal(isMediaIntent('随便生成一个美女的图片给我'), true)
  assert.equal(isMediaIntent('帮我制作一个产品宣传短视频'), true)
  assert.equal(isMediaIntent('帮我生视频'), true)
  assert.equal(isMediaIntent('生成一份项目报告'), false)
})

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

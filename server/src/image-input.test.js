import test from 'node:test'
import assert from 'node:assert/strict'
import { buildImageVerificationQuery, carryForwardImages, hasImageInput, isImageIdentificationRequest } from './image-input.js'

const image = { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } }

test('recognizes multimodal chat history as image input', () => {
  assert.equal(hasImageInput([
    { role: 'user', content: [{ type: 'text', text: '这个是什么' }, image] },
  ]), true)
})

test('carries the latest prior image into a follow-up that refers to it', () => {
  const messages = carryForwardImages([
    { role: 'user', content: [{ type: 'text', text: '这个是什么' }, image] },
    { role: 'assistant', content: '请继续说明。' },
    { role: 'user', content: '我让你看这个图片' },
  ])

  assert.deepEqual(messages.at(-1).content, [
    { type: 'text', text: '我让你看这个图片' },
    image,
  ])
})

test('classifies image identification prompts for vision-first web verification', () => {
  assert.equal(isImageIdentificationRequest('这个是什么'), true)
  assert.equal(isImageIdentificationRequest('请读取图片里的文字'), true)
  assert.equal(isImageIdentificationRequest('你好，今天状态不错'), false)
})

test('builds a useful web query from visual clues instead of searching only "这个是什么"', () => {
  assert.equal(
    buildImageVerificationQuery('这个是什么\n\n[附件：019.png，类型：image/png，大小：586 KB]', '黄色卡通包装，中央有黑色中文品牌字样'),
    '图片识别核验：黄色卡通包装，中央有黑色中文品牌字样；用户问题：这个是什么',
  )
})

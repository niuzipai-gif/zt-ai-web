import test from 'node:test'
import assert from 'node:assert/strict'
import { attachmentStatusLabel, buildAttachmentContext } from './attachment-context.js'

test('formats readable and failed attachments with bounded model context', () => {
  const context = buildAttachmentContext([
    { name: '费用.xlsx', type: 'application/vnd.ms-excel', size: 100, text: '工作表：汇总\n字段：ASIN、仓储费', readStatus: 'ready' },
    { name: '坏文件.xls', type: 'application/vnd.ms-excel', size: 100, readStatus: 'error', readError: '文件可能已损坏，请另存为 xlsx 后重试。' },
  ])
  assert.match(context, /\[附件解析摘要\]/)
  assert.match(context, /费用\.xlsx/)
  assert.match(context, /解析状态：已读取/)
  assert.match(context, /坏文件\.xls/)
  assert.match(context, /解析状态：未解析/)
  assert.match(context, /另存为 xlsx/)
  assert.ok(context.length <= 7_200)
})

test('keeps a continuation hint when several attachment summaries exceed the bound', () => {
  const context = buildAttachmentContext(Array.from({ length: 4 }, (_, index) => ({
    name: `文件-${index}.txt`,
    type: 'text/plain',
    size: 100,
    text: '大量文件内容 '.repeat(2_000),
    readStatus: 'ready',
  })))
  assert.ok(context.length <= 7_200)
  assert.match(context, /未包含全部行；如需继续分析/)
})

test('localizes attachment status labels', () => {
  assert.equal(attachmentStatusLabel('ready', 'en'), 'Read')
  assert.equal(attachmentStatusLabel('truncated', 'ja'), '一部表示')
})

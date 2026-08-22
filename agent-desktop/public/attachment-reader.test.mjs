import test from 'node:test'
import assert from 'node:assert/strict'
import { attachmentReadFailure, extractSpreadsheetText, isSpreadsheetAttachment } from './attachment-reader.mjs'

test('DOCX reader failure never exposes internal component details', () => {
  assert.equal(
    attachmentReadFailure(new Error('桌面端文档读取组件尚未加载，请重新打开 ZT.buddy。')),
    '暂时无法读取此 DOCX 文档，请重新打开 ZT.buddy，或改用 PDF、TXT 后再试。',
  )
})

test('recognizes Excel workbook extensions and workbook MIME types', () => {
  assert.equal(isSpreadsheetAttachment({ name: '利润测算.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), true)
  assert.equal(isSpreadsheetAttachment({ name: '历史数据.XLS', type: '' }), true)
  assert.equal(isSpreadsheetAttachment({ name: '说明.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), false)
})

test('extracts a bounded worksheet preview in a worker instead of blocking the renderer', async () => {
  const worker = {
    terminated: false,
    postMessage(payload, transfer) {
      this.payload = payload
      this.transfer = transfer
      queueMicrotask(() => this.onmessage({ data: { ok: true, text: '[工作表：利润表]\n月份\t毛利\n2026-08\t22000' } }))
    },
    terminate() { this.terminated = true },
  }
  const text = await extractSpreadsheetText(
    { name: '利润表.xlsx', size: 32, arrayBuffer: async () => new ArrayBuffer(8) },
    { workerFactory: () => worker, timeoutMs: 100 },
  )
  assert.match(text, /\[工作表：利润表\]/)
  assert.match(text, /月份\t毛利/)
  assert.match(text, /2026-08\t22000/)
  assert.equal(worker.payload?.type, 'parse-spreadsheet')
  assert.equal(worker.transfer?.[0] instanceof ArrayBuffer, true)
  assert.equal(worker.terminated, true)
})

test('delegates a desktop workbook to the native reader before loading it into the renderer', async () => {
  let arrayBufferRequested = false
  const nativeReader = async file => `本机预览：${file.name}`

  const text = await extractSpreadsheetText(
    {
      name: '供应商（组合）链接.xlsx',
      size: 170 * 1024 * 1024,
      arrayBuffer: async () => {
        arrayBufferRequested = true
        return new ArrayBuffer(8)
      },
    },
    { nativeReader },
  )

  assert.equal(text, '本机预览：供应商（组合）链接.xlsx')
  assert.equal(arrayBufferRequested, false)
})

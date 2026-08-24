import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { extractSpreadsheetText } from './spreadsheet-reader.js'

function fakeFile(name, type, buffer) {
  return { name, type, size: buffer.byteLength, arrayBuffer: async () => buffer }
}

function workbookFile() {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['ASIN', '库存', '仓储费'],
    ['B001', 12, 3.5],
    ['B002', null, 5.5],
  ]), '汇总')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), '空表')
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
  return fakeFile('费用.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes)
}

test('summarizes workbook sheets, headers, values and numeric statistics', async () => {
  const result = await extractSpreadsheetText(workbookFile())
  assert.equal(result.status, 'ready')
  assert.match(result.text, /工作表.*汇总/)
  assert.match(result.text, /ASIN.*库存.*仓储费/)
  assert.match(result.text, /B001/)
  assert.match(result.text, /仓储费.*合计.*9/)
  assert.match(result.text, /空表/)
})

test('parses csv as a structured table', async () => {
  const csv = fakeFile('库存.csv', 'text/csv', new TextEncoder().encode('ASIN,库存\nB001,2\n').buffer)
  const result = await extractSpreadsheetText(csv)
  assert.equal(result.status, 'ready')
  assert.match(result.text, /工作表/)
  assert.match(result.text, /ASIN/)
  assert.match(result.text, /B001/)
})

test('rejects a corrupt workbook with a stable user-facing error', async () => {
  await assert.rejects(
    () => extractSpreadsheetText(fakeFile('坏文件.xlsx', '', new Uint8Array([1, 2, 3]).buffer)),
    /无法读取|工作簿|文件/,
  )
})

test('marks oversized summaries as truncated and keeps the continuation hint', async () => {
  const rows = [['ASIN', '说明']]
  for (let index = 0; index < 2_000; index += 1) rows.push([`B${String(index).padStart(4, '0')}`, '这是一个用于验证摘要边界的较长说明'])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '明细')
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
  const result = await extractSpreadsheetText(fakeFile('明细.xlsx', '', bytes))
  assert.equal(result.status, 'truncated')
  assert.match(result.text, /未包含全部行；如需继续分析/)
  assert.ok(result.text.length <= 7_200)
})

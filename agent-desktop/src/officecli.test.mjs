import test from 'node:test'
import assert from 'node:assert/strict'
import { OFFICECLI_MAX_UPLOAD_BYTES, buildOfficeCliPreviewCommands, readOfficeSpreadsheetPreview } from './officecli.mjs'

test('Office workbook preview uses bounded text after reading a workbook outline', async () => {
  const calls = []
  const result = await readOfficeSpreadsheetPreview({
    filePath: 'C:\\work\\供应商（组合）链接.xlsx',
    binaryPath: 'C:\\runtime\\officecli.exe',
    runCommand: async (_binaryPath, args) => {
      calls.push(args)
      return args.includes('outline') ? '工作表：供应商\n工作表：蔡宙廷' : '供应商\nASIN\tB0TEST'
    },
  })

  assert.deepEqual(calls, buildOfficeCliPreviewCommands('C:\\work\\供应商（组合）链接.xlsx'))
  assert.match(result, /工作表：供应商/)
  assert.match(result, /ASIN\tB0TEST/)
  assert.ok(OFFICECLI_MAX_UPLOAD_BYTES >= 500 * 1024 * 1024)
})

test('Office workbook preview refuses to start without the bundled native reader', async () => {
  await assert.rejects(
    readOfficeSpreadsheetPreview({ filePath: 'C:\\work\\sample.xlsx', binaryPath: '' }),
    /本机 Office 读取组件不可用/,
  )
})

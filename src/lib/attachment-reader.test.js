import test from 'node:test'
import assert from 'node:assert/strict'
import { attachmentMime, attachmentName, isPdfAttachment, isSpreadsheetAttachment, isTextAttachment } from './attachment-reader.js'

test('classifies common readable web attachments', () => {
  assert.equal(attachmentMime({ type: 'application/pdf' }), 'application/pdf')
  assert.equal(attachmentName({ name: 'resume.pdf' }), 'resume.pdf')
  assert.equal(isPdfAttachment({ name: 'resume.pdf', type: '' }), true)
  assert.equal(isSpreadsheetAttachment({ name: 'sales.xlsx', type: '' }), true)
  assert.equal(isSpreadsheetAttachment({ name: 'legacy.xls', type: 'application/vnd.ms-excel' }), true)
  assert.equal(isSpreadsheetAttachment({ name: 'orders.csv', type: 'text/csv' }), true)
  assert.equal(isTextAttachment({ name: 'notes.md', type: '' }), true)
  assert.equal(isSpreadsheetAttachment({ name: 'notes.txt', type: 'text/plain' }), false)
  assert.equal(isTextAttachment({ name: 'photo.png', type: 'image/png' }), false)
})

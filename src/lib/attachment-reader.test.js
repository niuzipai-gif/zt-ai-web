import test from 'node:test'
import assert from 'node:assert/strict'
import { attachmentMime, attachmentName, isPdfAttachment, isTextAttachment } from './attachment-reader.js'

test('classifies common readable web attachments', () => {
  assert.equal(attachmentMime({ type: 'application/pdf' }), 'application/pdf')
  assert.equal(attachmentName({ name: 'resume.pdf' }), 'resume.pdf')
  assert.equal(isPdfAttachment({ name: 'resume.pdf', type: '' }), true)
  assert.equal(isTextAttachment({ name: 'notes.md', type: '' }), true)
  assert.equal(isTextAttachment({ name: 'photo.png', type: 'image/png' }), false)
})

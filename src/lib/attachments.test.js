import test from 'node:test'
import assert from 'node:assert/strict'
import { filesFromDataTransfer, hasFilePayload } from './attachments.js'

function file(name, type = 'application/octet-stream', size = 1, lastModified = 1) {
  return { name, type, size, lastModified }
}

test('clipboard file items are accepted even when the FileList is empty', () => {
  const image = file('pasted.png', 'image/png', 12, 3)
  const transfer = {
    files: [],
    items: [{ kind: 'file', getAsFile: () => image }],
    types: ['Files'],
  }

  assert.equal(hasFilePayload(transfer), true)
  assert.deepEqual(filesFromDataTransfer(transfer), [image])
})

test('drag and clipboard sources are merged and duplicate files are removed', () => {
  const first = file('report.pdf', 'application/pdf', 20, 4)
  const second = file('photo.jpg', 'image/jpeg', 30, 5)
  const transfer = {
    files: [first],
    items: [
      { kind: 'file', getAsFile: () => first },
      { kind: 'file', getAsFile: () => second },
      { kind: 'string', getAsFile: () => file('ignored.txt') },
    ],
  }

  assert.deepEqual(filesFromDataTransfer(transfer), [first, second])
})

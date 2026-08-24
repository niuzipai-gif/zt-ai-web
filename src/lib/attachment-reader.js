export { extractSpreadsheetText, isSpreadsheetAttachment } from './spreadsheet-reader.js'

export const MAX_ATTACHMENT_TEXT = 16_000
export const MAX_PDF_BYTES = 20 * 1024 * 1024
export const MAX_PDF_PAGES = 20

export function attachmentMime(file) {
  return String(file?.type || '').toLowerCase()
}

export function attachmentName(file) {
  return String(file?.name || '未命名附件')
}

export function isPdfAttachment(file) {
  return attachmentMime(file) === 'application/pdf' || /\.pdf$/i.test(attachmentName(file))
}

export function isTextAttachment(file) {
  return Boolean(
    attachmentMime(file).startsWith('text/')
    || /\.(md|markdown|txt|json|csv|log|js|jsx|ts|tsx|py|java|go|rs|html|css|xml|yaml|yml|sql|sh|ps1)$/i.test(attachmentName(file)),
  )
}

export async function extractPdfText(file) {
  if (Number(file?.size) > MAX_PDF_BYTES) throw new Error(`${attachmentName(file)} 超过 20MB，PDF 请压缩后再试。`)
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const workerAsset = await import('pdfjs-dist/legacy/build/pdf.worker.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerAsset.default
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await loadingTask.promise
  const pages = Math.min(pdf.numPages, MAX_PDF_PAGES)
  const chunks = []
  try {
    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items.map(item => item?.str || '').join(' ').replace(/\s+/g, ' ').trim()
      if (text) chunks.push(`第 ${pageNumber} 页：${text}`)
      if (chunks.join('\n').length >= MAX_ATTACHMENT_TEXT) break
    }
  } finally {
    await pdf.destroy()
  }
  return chunks.join('\n').slice(0, MAX_ATTACHMENT_TEXT)
}

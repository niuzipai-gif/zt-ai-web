export const MAX_ATTACHMENT_TEXT = 20_000
export const MAX_PDF_BYTES = 20 * 1024 * 1024
export const MAX_PDF_PAGES = 20
export const MAX_SPREADSHEET_BYTES = 200 * 1024 * 1024
export const MAX_NATIVE_SPREADSHEET_BYTES = 500 * 1024 * 1024
export const MAX_SPREADSHEET_SHEETS = 8
export const MAX_SPREADSHEET_ROWS = 300
export const MAX_SPREADSHEET_COLUMNS = 32
export const SPREADSHEET_PARSE_TIMEOUT_MS = 90_000
export const NATIVE_SPREADSHEET_FALLBACK_BYTES = 20 * 1024 * 1024

function fileKey(file) {
  return [file?.name || '', file?.size || 0, file?.lastModified || 0, file?.type || ''].join(':')
}

export function hasFilePayload(dataTransfer) {
  return Boolean(
    [...(dataTransfer?.types || [])].includes('Files')
    || [...(dataTransfer?.items || [])].some(item => item?.kind === 'file'),
  )
}

export function filesFromDataTransfer(dataTransfer) {
  const files = [...(dataTransfer?.files || [])]
  for (const item of [...(dataTransfer?.items || [])]) {
    if (item?.kind !== 'file') continue
    const file = item.getAsFile?.()
    if (file) files.push(file)
  }
  return [...new Map(files.map(file => [fileKey(file), file])).values()]
}

function attachmentName(file) {
  return String(file?.name || '未命名附件')
}

function attachmentType(file) {
  return String(file?.type || '').toLowerCase()
}

export function isPdfAttachment(file) {
  return attachmentType(file) === 'application/pdf' || /\.pdf$/i.test(attachmentName(file))
}

export function isDocxAttachment(file) {
  return attachmentType(file) === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(attachmentName(file))
}

export function isSpreadsheetAttachment(file) {
  return Boolean(
    /\.(xlsx|xls|xlsm|xlsb|ods)$/i.test(attachmentName(file))
    || [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.ms-excel.sheet.macroenabled.12',
      'application/vnd.ms-excel.sheet.binary.macroenabled.12',
      'application/vnd.oasis.opendocument.spreadsheet',
    ].includes(attachmentType(file)),
  )
}

export function isTextAttachment(file) {
  return Boolean(
    attachmentType(file).startsWith('text/')
    || /\.(md|markdown|txt|json|csv|log|js|jsx|ts|tsx|py|java|go|rs|html|css|xml|yaml|yml|sql|sh|ps1)$/i.test(attachmentName(file)),
  )
}

export function attachmentReadFailure(error) {
  const message = String(error?.message || error || '')
  if (/excel|xlsx|xls|spreadsheet|表格/i.test(message)) return '暂时无法读取此表格，请重新打开 ZT.buddy 后再试；文件已保留在对话里。'
  if (/docx|word|mammoth|文档/i.test(message)) return '暂时无法读取此 DOCX 文档，请重新打开 ZT.buddy，或改用 PDF、TXT 后再试。'
  return '暂时无法读取此附件内容；文件已保留，你可以改传 PDF、TXT 或图片后再试。'
}

async function loadPdfJs() {
  // The desktop server exposes this vendor module from the packaged runtime.
  const pdfjs = await import(`${window.location.origin}/vendor/pdfjs.mjs`)
  pdfjs.GlobalWorkerOptions.workerSrc = `${window.location.origin}/vendor/pdf.worker.mjs`
  return pdfjs
}

export async function extractPdfText(file) {
  if (Number(file?.size) > MAX_PDF_BYTES) throw new Error(`${attachmentName(file)} 超过 20MB，PDF 请压缩后再试。`)
  const { getDocument } = await loadPdfJs()
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await loadingTask.promise
  const chunks = []
  try {
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, MAX_PDF_PAGES); pageNumber += 1) {
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

export async function extractDocxText(file) {
  if (!window.mammoth?.extractRawText) throw new Error('桌面端文档读取组件尚未加载，请重新打开 ZT.buddy。')
  return (await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value.slice(0, MAX_ATTACHMENT_TEXT)
}

function createSpreadsheetWorker() {
  if (typeof Worker !== 'function') throw new Error('Excel 表格读取组件不支持后台解析，请重新打开 ZT.buddy。')
  return new Worker(new URL('./spreadsheet-worker.js', import.meta.url))
}

export async function extractSpreadsheetText(file, { workerFactory = createSpreadsheetWorker, timeoutMs = SPREADSHEET_PARSE_TIMEOUT_MS, nativeReader = null } = {}) {
  const size = Number(file?.size) || 0
  if (size > MAX_NATIVE_SPREADSHEET_BYTES) throw new Error(attachmentName(file) + ' 超过 500MB，表格请拆分后再试。')
  if (size > MAX_SPREADSHEET_BYTES && typeof nativeReader !== 'function') throw new Error(attachmentName(file) + ' 超过 200MB，表格请在桌面端打开后再试。')
  if (typeof nativeReader === 'function') {
    try {
      const nativeText = await nativeReader(file)
      if (nativeText) return String(nativeText).slice(0, MAX_ATTACHMENT_TEXT)
    } catch (error) {
      if (size > NATIVE_SPREADSHEET_FALLBACK_BYTES) throw error
    }
  }
  const buffer = await file.arrayBuffer()
  return new Promise((resolve, reject) => {
    let worker
    let settled = false
    let timeout
    const finish = callback => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      worker?.terminate?.()
      callback()
    }
    try {
      worker = workerFactory()
      if (!worker || typeof worker.postMessage !== 'function') throw new Error('Excel 表格读取组件尚未加载，请重新打开 ZT.buddy。')
      worker.onmessage = event => {
        const data = event?.data || {}
        if (data.ok) finish(() => resolve(String(data.text || '').slice(0, MAX_ATTACHMENT_TEXT)))
        else finish(() => reject(new Error(data.error || 'Excel 表格读取失败。')))
      }
      worker.onerror = () => finish(() => reject(new Error('Excel 表格后台读取失败。')))
      timeout = setTimeout(() => finish(() => reject(new Error('Excel 表格读取超时，请拆分后再试。'))), timeoutMs)
      worker.postMessage({
        type: 'parse-spreadsheet',
        buffer,
        limits: { maxSheets: MAX_SPREADSHEET_SHEETS, maxRows: MAX_SPREADSHEET_ROWS, maxColumns: MAX_SPREADSHEET_COLUMNS, maxText: MAX_ATTACHMENT_TEXT },
      }, [buffer])
    } catch (error) {
      finish(() => reject(error))
    }
  })
}

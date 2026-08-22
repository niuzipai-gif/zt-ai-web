const VENDOR_URL = '/vendor/xlsx.full.min.js'

function ensureXlsx() {
  if (!self.XLSX?.read || !self.XLSX?.utils?.sheet_to_json) importScripts(VENDOR_URL)
  if (!self.XLSX?.read || !self.XLSX?.utils?.sheet_to_json) throw new Error('Excel 表格读取组件尚未加载。')
  return self.XLSX
}

function spreadsheetText(workbook, xlsx, limits) {
  const names = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames.slice(0, limits.maxSheets) : []
  const sections = names.map(name => {
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: false, blankrows: false })
      .slice(0, limits.maxRows)
      .map(row => row.slice(0, limits.maxColumns).map(cell => String(cell ?? '').replace(/\s+/g, ' ').trim().slice(0, 240)).join('\t'))
      .filter(Boolean)
    return '[工作表：' + name + ']\n' + rows.join('\n')
  }).filter(section => section.trim())
  return sections.join('\n\n').slice(0, limits.maxText)
}

self.onmessage = event => {
  const data = event?.data || {}
  if (data.type !== 'parse-spreadsheet') return
  try {
    const xlsx = ensureXlsx()
    const limits = data.limits || {}
    const workbook = xlsx.read(data.buffer, {
      type: 'array',
      cellFormula: false,
      cellHTML: false,
      cellDates: true,
      sheetRows: limits.maxRows || 300,
    })
    self.postMessage({ ok: true, text: spreadsheetText(workbook, xlsx, limits) })
  } catch (error) {
    self.postMessage({ ok: false, error: String(error?.message || 'Excel 表格读取失败。') })
  }
}

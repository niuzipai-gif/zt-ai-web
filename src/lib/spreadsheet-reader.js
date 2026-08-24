import * as XLSX from 'xlsx'

export const MAX_SPREADSHEET_BYTES = 20 * 1024 * 1024
export const MAX_SHEETS = 32
export const MAX_SAMPLE_ROWS = 8
export const MAX_SPREADSHEET_TEXT = 7_200
export const SPREADSHEET_EXTENSIONS = /\.(xlsx|xls|csv)$/i

const SPREADSHEET_MIME_TYPES = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroenabled.12',
  'text/csv',
])

const TRUNCATION_HINT = '已显示统计和代表性样本，未包含全部行；如需继续分析，请指定工作表、列或筛选条件。'

function fileName(file) {
  return String(file?.name || '未命名表格')
}

function isEmpty(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return String(value)
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)))
}

function formatValue(value) {
  if (isEmpty(value)) return '空'
  if (value instanceof Date) return Number.isNaN(value.valueOf()) ? '日期无效' : value.toISOString().slice(0, 10)
  if (typeof value === 'number') return formatNumber(value)
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'object') {
    try { return JSON.stringify(value) } catch { return '[对象]' }
  }
  return String(value).replace(/\s+/g, ' ').trim().slice(0, 180)
}

function rangeLabel(range) {
  if (!range) return '空'
  return `${XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c })}:${XLSX.utils.encode_cell({ r: range.e.r, c: range.e.c })}`
}

function cellValue(sheet, row, column) {
  return sheet[XLSX.utils.encode_cell({ r: row, c: column })]?.v
}

function collectCellFlags(sheet, range) {
  let formulaCount = 0
  let errorCount = 0
  for (let row = range?.s.r || 0; row <= (range?.e.r || -1); row += 1) {
    for (let column = range?.s.c || 0; column <= (range?.e.c || -1); column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })]
      if (cell?.f) formulaCount += 1
      if (cell?.t === 'e') errorCount += 1
    }
  }
  return { formulaCount, errorCount }
}

function normalizeHeaders(row, width) {
  const used = new Map()
  return Array.from({ length: width }, (_, index) => {
    const original = formatValue(row?.[index])
    const base = original === '空' ? `列 ${index + 1}` : original
    const count = used.get(base) || 0
    used.set(base, count + 1)
    return count ? `${base} (${count + 1})` : base
  })
}

function trimRows(rows) {
  const next = Array.isArray(rows) ? rows.map(row => Array.isArray(row) ? row : []) : []
  while (next.length && next[next.length - 1].every(isEmpty)) next.pop()
  return next
}

function sheetDetails(sheet) {
  const range = sheet?.['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null
  if (!range) return { overview: '工作表为空。', samples: '', rowCount: 0, columnCount: 0 }
  const rows = trimRows(XLSX.utils.sheet_to_json(sheet, { header: 1, range: sheet['!ref'], raw: true, defval: null, blankrows: true }))
  const width = Math.max(range.e.c - range.s.c + 1, ...rows.map(row => row.length), 0)
  if (!rows.length || !width) return { overview: `有效范围：${rangeLabel(range)}；工作表为空。`, samples: '', rowCount: 0, columnCount: width }

  const headers = normalizeHeaders(rows[0], width)
  const dataRows = rows.slice(1)
  const columns = headers.map((header, column) => {
    const values = dataRows.map(row => row[column])
    const numbers = values.filter(value => typeof value === 'number' && Number.isFinite(value))
    const dates = values.filter(value => value instanceof Date && !Number.isNaN(value.valueOf()))
    const missing = values.filter(isEmpty).length
    const detail = { header, missing, total: values.length, numbers, dates }
    return detail
  })
  const missingColumns = columns.filter(column => column.missing > 0).slice(0, 12).map(column => `${column.header}（${column.missing}）`)
  const numericColumns = columns.filter(column => column.numbers.length).slice(0, 16).map(column => {
    const values = column.numbers
    const total = values.reduce((sum, value) => sum + value, 0)
    const average = total / values.length
    return `${column.header}：非空 ${values.length}，最小值 ${formatNumber(Math.min(...values))}，最大值 ${formatNumber(Math.max(...values))}，平均值 ${formatNumber(average)}，合计 ${formatNumber(total)}`
  })
  const dateColumns = columns.filter(column => column.dates.length).slice(0, 12).map(column => `${column.header}（${column.dates.length}）`)
  const flags = collectCellFlags(sheet, range)
  const mergeCount = Array.isArray(sheet['!merges']) ? sheet['!merges'].length : 0
  const overview = [
    `有效范围：${rangeLabel(range)}；数据行 ${Math.max(0, dataRows.length)}；列 ${width}`,
    `表头：${headers.join(' | ')}`,
    missingColumns.length ? `空值列：${missingColumns.join('、')}` : '空值列：无',
    numericColumns.length ? `数字列统计：${numericColumns.join('；')}` : '数字列统计：无可计算数字列',
    dateColumns.length ? `日期列：${dateColumns.join('、')}` : '',
    flags.formulaCount ? `公式单元格：${flags.formulaCount}（公式未重新计算）` : '',
    flags.errorCount ? `错误单元格：${flags.errorCount}` : '',
    mergeCount ? `合并单元格区域：${mergeCount}` : '',
  ].filter(Boolean).join('\n')
  const samples = dataRows.slice(0, MAX_SAMPLE_ROWS).map((row, index) => `样本 ${index + 1}：${headers.map((header, column) => `${header}=${formatValue(row[column])}`).join(' | ')}`).join('\n')
  return { overview, samples, rowCount: dataRows.length, columnCount: width }
}

function trimSummary(text) {
  if (text.length <= MAX_SPREADSHEET_TEXT) return { text, status: 'ready' }
  const suffix = `\n\n${TRUNCATION_HINT}`
  const available = Math.max(0, MAX_SPREADSHEET_TEXT - suffix.length)
  return { text: `${text.slice(0, available)}${suffix}`.slice(0, MAX_SPREADSHEET_TEXT), status: 'truncated' }
}

export function isSpreadsheetAttachment(file) {
  const mime = String(file?.type || '').toLowerCase()
  return SPREADSHEET_MIME_TYPES.has(mime) || SPREADSHEET_EXTENSIONS.test(fileName(file))
}

export async function extractSpreadsheetText(file) {
  const name = fileName(file)
  if (Number(file?.size) > MAX_SPREADSHEET_BYTES) throw new Error(`${name} 超过 20MB，请拆分或压缩后再试。`)
  let workbook
  try {
    workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, cellNF: true, cellText: false })
  } catch {
    throw new Error(`${name} 无法读取，文件可能已损坏或格式不受支持；请另存为 xlsx 或 CSV 后重试。`)
  }
  const sheetNames = Array.isArray(workbook.SheetNames) ? workbook.SheetNames : []
  if (!sheetNames.length) return { text: `文件：${name}\n工作簿没有可分析的工作表。`, status: 'ready' }
  const visibleNames = sheetNames.slice(0, MAX_SHEETS)
  const parts = [`文件：${name}`, `格式：${/\.csv$/i.test(name) ? 'CSV' : 'Excel'}`, `工作表：${sheetNames.length} 张`]
  if (sheetNames.length > MAX_SHEETS) parts.push(`仅处理前 ${MAX_SHEETS} 张，另外 ${sheetNames.length - MAX_SHEETS} 张未读取。`)
  const sheetSections = []
  for (const sheetName of visibleNames) {
    const details = sheetDetails(workbook.Sheets[sheetName])
    sheetSections.push([`工作表：${sheetName}`, details.overview, details.samples ? `代表性样本：\n${details.samples}` : ''].filter(Boolean).join('\n'))
  }
  return trimSummary(`${parts.join('\n')}\n\n${sheetSections.join('\n\n')}`)
}

export const MAX_ATTACHMENT_CONTEXT = 7_200

const STATUS_LABELS = Object.freeze({
  zh: { ready: '已读取', truncated: '已截断', error: '未解析', 'preview-only': '图片预览' },
  en: { ready: 'Read', truncated: 'Truncated', error: 'Unread', 'preview-only': 'Image preview' },
  ja: { ready: '読み取り済み', truncated: '一部表示', error: '未解析', 'preview-only': '画像プレビュー' },
})

const TRUNCATION_HINT = '已显示统计和代表性样本，未包含全部行；如需继续分析，请指定工作表、列或筛选条件。'

function languageFrom(input) {
  if (typeof input === 'string') return STATUS_LABELS[input] ? input : 'zh'
  return input?.language && STATUS_LABELS[input.language] ? input.language : 'zh'
}

function statusOf(file) {
  if (file?.readStatus) return file.readStatus
  if (file?.text) return 'ready'
  if (file?.preview) return 'preview-only'
  return 'error'
}

function formatSize(size) {
  const bytes = Number(size) || 0
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fileContext(file, language) {
  const status = statusOf(file)
  const label = attachmentStatusLabel(status, language)
  const details = file?.text || (file?.readError ? `[读取说明：${file.readError}]` : '当前没有可发送的文字摘要；如果这是图片，请结合图片本身分析。')
  return `文件：${String(file?.name || '未命名附件')}\n解析状态：${label}\n类型：${String(file?.type || '未知')}；大小：${formatSize(file?.size)}\n${details}`
}

export function attachmentStatusLabel(status, input = 'zh') {
  const language = languageFrom(input)
  return STATUS_LABELS[language][status] || STATUS_LABELS[language].error
}

export function buildAttachmentContext(attachments = [], input = 'zh') {
  const files = Array.isArray(attachments) ? attachments : []
  if (!files.length) return ''
  const language = languageFrom(input)
  const full = `[附件解析摘要]\n${files.map(file => fileContext(file, language)).join('\n\n')}\n[/附件解析摘要]`
  if (full.length <= MAX_ATTACHMENT_CONTEXT) return full
  const suffix = `\n\n${TRUNCATION_HINT}\n[/附件解析摘要]`
  const available = Math.max(0, MAX_ATTACHMENT_CONTEXT - suffix.length)
  return `${full.slice(0, available)}${suffix}`.slice(0, MAX_ATTACHMENT_CONTEXT)
}

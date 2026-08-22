function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function inlineMarkdown(value) {
  let html = escapeHtml(value)
  const code = []
  html = html.replace(/`([^`]+)`/g, (_, text) => { code.push(`<code>${text}</code>`); return `\u0000${code.length - 1}\u0000` })
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>')
  return html.replace(/\u0000(\d+)\u0000/g, (_, index) => code[Number(index)])
}

function stripHiddenReasoning(value) {
  return String(value || '').replace(/<\s*(?:think|analysis|reasoning)\b[^>]*>[\s\S]*?<\s*\/\s*(?:think|analysis|reasoning)\s*>/giu, '')
}

function tableCells(line) {
  const value = String(line || '').trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells = value.split('|').map(cell => cell.trim())
  return cells.length > 1 && cells.some(Boolean) ? cells : null
}

function isTableSeparator(line) {
  const cells = tableCells(line)
  return Boolean(cells?.length && cells.every(cell => /^:?-{3,}:?$/.test(cell)))
}

function renderTable(header, rows) {
  const head = `<thead><tr>${header.map(cell => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead>`
  const body = rows.map(row => `<tr>${header.map((_, index) => `<td>${inlineMarkdown(row[index] || '')}</td>`).join('')}</tr>`).join('')
  return `<table>${head}<tbody>${body}</tbody></table>`
}

export function renderMarkdown(markdown = '') {
  const lines = stripHiddenReasoning(markdown).replace(/\r\n?/g, '\n').split('\n')
  const output = []
  let paragraph = []
  let list = []
  let listType = null
  let code = null
  const flushParagraph = () => { if (paragraph.length) { output.push(`<p>${inlineMarkdown(paragraph.join('\n')).replaceAll('\n', '<br />')}</p>`); paragraph = [] } }
  const flushList = () => {
    if (list.length) {
      const tag = listType === 'ol' ? 'ol' : 'ul'
      output.push(`<${tag}>${list.map(item => `<li>${inlineMarkdown(item)}</li>`).join('')}</${tag}>`)
      list = []
      listType = null
    }
  }
  const flushBlocks = () => { flushParagraph(); flushList() }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.startsWith('```')) {
      if (code === null) { flushBlocks(); code = [] } else { output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = null }
      continue
    }
    if (code !== null) { code.push(line); continue }

    const header = tableCells(line)
    if (header && isTableSeparator(lines[index + 1] || '')) {
      flushBlocks()
      const rows = []
      index += 2
      while (index < lines.length) {
        const row = tableCells(lines[index])
        if (!row || isTableSeparator(lines[index])) { index -= 1; break }
        rows.push(row)
        index += 1
      }
      output.push(renderTable(header, rows))
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/)
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/)
    const quote = line.match(/^\s*>\s?(.*)$/)
    if (heading) { flushBlocks(); const level = heading[1].length; output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); continue }
    if (unordered || ordered) {
      const nextType = ordered ? 'ol' : 'ul'
      if (listType && listType !== nextType) flushList()
      flushParagraph(); listType = nextType; list.push((ordered || unordered)[1]); continue
    }
    if (quote) { flushBlocks(); output.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`); continue }
    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) { flushBlocks(); output.push('<hr />'); continue }
    if (!line.trim()) { flushBlocks(); continue }
    flushList(); paragraph.push(line)
  }
  if (code !== null) output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
  flushBlocks()
  return output.join('')
}

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

export function renderMarkdown(markdown = '') {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n')
  const output = []
  let paragraph = []
  let list = []
  let code = null
  const flushParagraph = () => { if (paragraph.length) { output.push(`<p>${inlineMarkdown(paragraph.join('\n')).replaceAll('\n', '<br />')}</p>`); paragraph = [] } }
  const flushList = () => { if (list.length) { output.push(`<ul>${list.map(item => `<li>${inlineMarkdown(item)}</li>`).join('')}</ul>`); list = [] } }
  for (const line of lines) {
    if (line.startsWith('```')) {
      if (code === null) { flushParagraph(); flushList(); code = [] } else { output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = null }
      continue
    }
    if (code !== null) { code.push(line); continue }
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    const item = line.match(/^\s*[-*+]\s+(.+)$/)
    if (heading) { flushParagraph(); flushList(); const level = heading[1].length; output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); continue }
    if (item) { flushParagraph(); list.push(item[1]); continue }
    if (!line.trim()) { flushParagraph(); flushList(); continue }
    flushList(); paragraph.push(line)
  }
  if (code !== null) output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
  flushParagraph(); flushList()
  return output.join('')
}

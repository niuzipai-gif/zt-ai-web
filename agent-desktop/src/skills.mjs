import fs from 'node:fs/promises'
import path from 'node:path'

function frontmatterValue(source, key) {
  const match = String(source).match(new RegExp(`^${key}:\\s*(.+)$`, 'mi'))
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, '') || ''
}

function firstMarkdownParagraph(source) {
  return String(source).split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('#') && !line.startsWith('---') && !line.startsWith('>')) || ''
}

export function parseSkillDocument(source, filePath) {
  const folder = path.basename(path.dirname(filePath))
  const name = frontmatterValue(source, 'name') || folder
  const description = frontmatterValue(source, 'description') || firstMarkdownParagraph(source) || '本地 Skill'
  return { id: name, name, description, path: filePath, source: 'local' }
}

async function walkForSkillDocs(root, result, depth = 0) {
  if (depth > 4) return
  let entries
  try { entries = await fs.readdir(root, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const fullPath = path.join(root, entry.name)
    if (entry.isFile() && entry.name.toLowerCase() === 'skill.md') {
      try { result.push(parseSkillDocument(await fs.readFile(fullPath, 'utf8'), fullPath)) } catch { /* ignore unreadable skill */ }
    } else if (entry.isDirectory()) {
      await walkForSkillDocs(fullPath, result, depth + 1)
    }
  }
}

export async function scanSkillRoots(roots) {
  const result = []
  for (const root of [...new Set(roots.map(item => path.resolve(item)).filter(Boolean))]) await walkForSkillDocs(root, result)
  const unique = new Map(result.map(skill => [`${skill.name}:${skill.path}`, skill]))
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name))
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSkillDocument } from './skills.mjs'

test('parses a local SKILL.md into a selectable skill reference', () => {
  const skill = parseSkillDocument(`---\nname: amazon-listing-doc-writer\ndescription: 写作亚马逊 Listing 文档\n---\n正文`, 'C:\\Users\\Administrator\\.codex\\skills\\amazon-listing-doc-writer\\SKILL.md')

  assert.deepEqual(skill, {
    id: 'amazon-listing-doc-writer',
    name: 'amazon-listing-doc-writer',
    description: '写作亚马逊 Listing 文档',
    path: 'C:\\Users\\Administrator\\.codex\\skills\\amazon-listing-doc-writer\\SKILL.md',
    source: 'local',
  })
})

test('uses the folder name when a skill document has no frontmatter name', () => {
  const skill = parseSkillDocument('# Skill\n用于测试', 'E:\\skills\\demo-skill\\SKILL.md')
  assert.equal(skill.id, 'demo-skill')
  assert.equal(skill.description, '用于测试')
})

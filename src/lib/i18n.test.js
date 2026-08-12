import test from 'node:test'
import assert from 'node:assert/strict'
import { getInitialLanguage, LANGUAGE_OPTIONS, resumeDocumentByLanguage, siteCopy } from './i18n.js'

test('selects and persists supported language choices', () => {
  const storage = { getItem: key => key === 'zt-ai:language' ? 'ja' : null }
  assert.equal(getInitialLanguage(storage, 'en-US'), 'ja')
  const emptyStorage = { getItem: () => null }
  assert.equal(getInitialLanguage(emptyStorage, 'en-US'), 'en')
  assert.equal(getInitialLanguage(emptyStorage, 'ja-JP'), 'ja')
  assert.equal(getInitialLanguage(emptyStorage, 'zh-CN'), 'zh')
  assert.deepEqual(LANGUAGE_OPTIONS.map(([code]) => code), ['zh', 'en', 'ja'])
})

test('provides a matching resume file for every interface language', () => {
  for (const code of ['zh', 'en', 'ja']) {
    assert.ok(resumeDocumentByLanguage[code].path.endsWith('.docx'))
    assert.ok(siteCopy[code].nav.home)
    assert.ok(siteCopy[code].resume.download)
    assert.ok(siteCopy[code].chat.startPrompt)
    assert.ok(siteCopy[code].chat.sendFallback)
    assert.ok(siteCopy[code].chat.gatewayError)
  }
})

test('Japanese chat starter is Japanese rather than a copied Chinese prompt', () => {
  assert.match(siteCopy.ja.chat.startPrompt, /蔡宙廷の現在のAIプロダクト開発経験/)
  assert.doesNotMatch(siteCopy.ja.chat.startPrompt, /请介绍/)
})

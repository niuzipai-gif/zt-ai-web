import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assets from './voice-greeting-assets.json' with { type: 'json' }
import { preparedVoiceGreeting } from './voice-greeting.js'
import { siteCopy } from './i18n.js'

test('recorded greetings retain the approved voice source, language and exact bytes', async () => {
  for (const [file, hash] of Object.entries(assets.protectedHashes)) {
    const text = (await fs.readFile(new URL('../../' + file, import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
    assert.equal(createHash('sha256').update(text).digest('hex'), hash, `Regenerate approved greetings after changing ${file}`)
  }
  for (const [language, entry] of Object.entries(assets.greetings)) {
    assert.equal(entry.text, siteCopy[language].chat.voiceGreeting)
    const bytes = await fs.readFile(new URL('../../public/' + entry.path, import.meta.url))
    const result = await preparedVoiceGreeting(entry.text, language, { baseUrl: 'https://site.test/zt-ai-web/', fetchImpl: async url => { assert.equal(url, 'https://site.test/zt-ai-web/' + entry.path); return new Response(bytes) } })
    assert.ok(result.url.startsWith('blob:'))
    assert.deepEqual(Buffer.from(await (await fetch(result.url)).arrayBuffer()), bytes)
    result.release()
    await assert.rejects(fetch(result.url))
  }
})

test('greeting mismatch, failed download, corruption and timeout permit live synthesis fallback', async () => {
  const entry = assets.greetings.zh
  const never = () => { throw Error('must not fetch') }
  assert.equal(await preparedVoiceGreeting('different answer', 'zh', { fetchImpl: never }), null)
  assert.equal(await preparedVoiceGreeting(entry.text, 'en', { fetchImpl: never }), null)
  assert.equal(await preparedVoiceGreeting(entry.text, 'constructor', { fetchImpl: never }), null)
  for (const response of [new Response('', { status: 404 }), new Response(new Uint8Array(entry.bytes)), new Response('invalid')]) {
    assert.equal(await preparedVoiceGreeting(entry.text, 'zh', { fetchImpl: async () => response }), null)
  }
  assert.equal(await preparedVoiceGreeting(entry.text, 'zh', { timeoutMs: 5, fetchImpl: (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))) }), null)
})

test('closing during a greeting load cancels without requesting live synthesis', async () => {
  const abort = new AbortController(), entry = assets.greetings.zh
  const pending = preparedVoiceGreeting(entry.text, 'zh', { signal: abort.signal, fetchImpl: (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))) })
  abort.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  await assert.rejects(preparedVoiceGreeting(entry.text, 'zh', { signal: abort.signal }), { name: 'AbortError' })
})

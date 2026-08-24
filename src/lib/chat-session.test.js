import test from 'node:test'
import assert from 'node:assert/strict'
import {
  VISITOR_STATE_KEY,
  VISITOR_ID_KEY,
  createChatSession,
  createVisitorId,
  createVisitorState,
  getVisitorStateKey,
  loadVisitorState,
  saveVisitorState,
} from './chat-session.js'

test('creates different visitor ids for independent browser contexts', () => {
  assert.notEqual(createVisitorId(), createVisitorId())
})

test('uses a separate visitor id for each independent identity storage', () => {
  const sharedStorage = new Map()
  const firstIdentity = new Map()
  const secondIdentity = new Map()
  const first = loadVisitorState(sharedStorage, [], firstIdentity)
  const second = loadVisitorState(sharedStorage, [], secondIdentity)
  saveVisitorState(sharedStorage, first)
  saveVisitorState(sharedStorage, second)
  assert.notEqual(first.visitorId, second.visitorId)
  assert.equal(firstIdentity.has(VISITOR_ID_KEY), true)
  assert.equal(secondIdentity.has(VISITOR_ID_KEY), true)
  assert.equal(sharedStorage.has(getVisitorStateKey(first.visitorId)), true)
  assert.equal(sharedStorage.has(getVisitorStateKey(second.visitorId)), true)
})

test('persists and restores multiple sessions with an active session', () => {
  const storage = new Map()
  const identityStorage = new Map([['zt-ai:visitor-id:v1', 'visitor-a']])
  const first = createChatSession({ title: '第一条聊天', messages: [{ role: 'user', text: '你好' }] })
  const second = createChatSession({ title: '第二条聊天', messages: [{ role: 'user', text: '项目经历' }], model: 'DEEPSEEK' })
  const state = createVisitorState({ visitorId: 'visitor-a', sessions: [second, first], activeSessionId: first.id })
  saveVisitorState(storage, state)
  const restored = loadVisitorState(storage, [], identityStorage)
  assert.equal(restored.visitorId, 'visitor-a')
  assert.equal(restored.activeSessionId, first.id)
  assert.equal(restored.sessions.length, 2)
  assert.equal(restored.sessions[1].title, '第一条聊天')
  assert.equal(restored.sessions[0].model, 'DEEPSEEK')
})

test('migrates the previous single-session state into a private visitor session', () => {
  const storage = new Map([['zt-ai:public-chat:v2', JSON.stringify({ version: 2, model: 'MINIMAX', messages: [{ id: 'old', role: 'user', text: '旧记录' }] })]])
  const restored = loadVisitorState(storage)
  assert.equal(restored.version, 3)
  assert.equal(restored.sessions.length, 1)
  assert.equal(restored.sessions[0].messages[0].text, '旧记录')
  assert.equal(restored.sessions[0].model, 'MINIMAX')
  assert.notEqual(restored.visitorId, 'visitor-a')
})

test('saves each browser store under its own visitor state key and keeps bounded image context', () => {
  const firstStorage = new Map()
  const secondStorage = new Map()
  const first = createVisitorState({ visitorId: 'visitor-one', sessions: [createChatSession({ messages: [{ role: 'user', text: 'A', content: [{ type: 'text', text: 'A' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,secret' } }], attachments: [{ name: 'a.png', preview: 'data:image/png;base64,secret' }] }] })] })
  const second = createVisitorState({ visitorId: 'visitor-two', sessions: [createChatSession({ messages: [{ role: 'user', text: 'B' }] })] })
  saveVisitorState(firstStorage, first)
  saveVisitorState(secondStorage, second)
  assert.notEqual(firstStorage.get(getVisitorStateKey(first.visitorId)), secondStorage.get(getVisitorStateKey(second.visitorId)))
  assert.equal(JSON.parse(firstStorage.get(getVisitorStateKey(first.visitorId))).sessions[0].messages[0].attachments[0].preview, undefined)
  assert.deepEqual(JSON.parse(firstStorage.get(getVisitorStateKey(first.visitorId))).sessions[0].messages[0].content[1], { type: 'image_url', image_url: { url: 'data:image/png;base64,secret' } })
  assert.equal(JSON.parse(secondStorage.get(getVisitorStateKey(second.visitorId))).sessions[0].messages[0].text, 'B')
})

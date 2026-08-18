import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { JsonDataStore } from './data-store.js'
import { createTelemetry, estimateTokens, maskIp, scopedVisitorId } from './telemetry.js'

async function telemetry() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zt-ai-telemetry-'))
  let clock = 1_700_000_000_000
  return createTelemetry({ store: new JsonDataStore(path.join(dir, 'data.json')), now: () => ++clock })
}

test('IP display is masked by default', () => {
  assert.equal(maskIp('203.0.113.42'), '203.0.*.*')
  assert.equal(maskIp('2001:db8:85a3::8a2e:370:7334'), '2001:db8:85a3:*')
})

test('token estimation is explicit approximate accounting', () => {
  assert.equal(estimateTokens('12345678'), 2)
  assert.equal(estimateTokens(''), 0)
})

test('visitor ids are scoped by product', () => {
  assert.notEqual(scopedVisitorId('web', 'same-id'), scopedVisitorId('desktop-agent', 'same-id'))
})

test('records a page visit without fabricating a model request', async () => {
  const audit = await telemetry()
  await audit.recordVisit({ product: 'web', visitorId: 'browser-visit', page: '/chat', language: 'zh', ip: '203.0.113.42', userAgent: 'test' })
  const data = await audit.store.read()
  assert.equal(data.pageViews.length, 1)
  assert.equal(data.visitors[0].pageViewCount, 1)
  assert.equal(data.visitors[0].requestCount, 0)
  assert.equal((await audit.overview()).visitors, 1)
  assert.equal((await audit.overview()).requests, 0)
  assert.equal((await audit.visitorDetail('web:browser-visit')).pageViews.length, 1)
})

test('telemetry records a message, usage event, and aggregate visitor', async () => {
  const audit = await telemetry()
  await audit.recordRequest({
    product: 'web', visitorId: 'browser-1', conversationId: 'chat-1', model: 'MiniMax-M3',
    requestType: 'chat', status: 'success', ip: '203.0.113.42', userAgent: 'test',
    inputText: 'hello', outputText: 'world',
  })
  const data = await audit.store.read()
  assert.equal(data.messages.length, 2)
  assert.equal(data.usageEvents[0].estimatedTotalTokens, 4)
  assert.equal(data.visitors[0].maskedIp, '203.0.*.*')
})

test('lists usage events newest first with product and model filters', async () => {
  const audit = await telemetry()
  await audit.recordRequest({ product: 'web', visitorId: 'browser-1', model: 'MiniMax-M3', requestType: 'chat', status: 'success', inputText: 'one', outputText: 'two' })
  await audit.recordRequest({ product: 'desktop-agent', visitorId: 'desktop-1', model: 'deepseek-v4-flash', requestType: 'agent-plan', status: 'success', inputText: 'three', outputText: 'four' })
  const all = await audit.listUsage()
  assert.equal(all.length, 2)
  assert.equal(all[0].product, 'desktop-agent')
  assert.equal((await audit.listUsage({ product: 'web' }))[0].model, 'MiniMax-M3')
  assert.equal((await audit.listUsage({ model: 'deepseek-v4-flash' }))[0].requestType, 'agent-plan')
})

test('recovers the associated account from historical request records', async () => {
  const audit = await telemetry()
  const visitorId = 'desktop-agent:anonymous'
  await audit.store.update(data => {
    data.visitors.push({ id: visitorId, product: 'desktop-agent', visitorId: 'anonymous', userId: null, firstSeenAt: 1, lastSeenAt: 3, pageViewCount: 0, requestCount: 1, models: ['MiniMax-M3'], maskedIp: '203.0.*.*' })
    data.usageEvents.push({ id: 'usage-1', visitorId, userId: 'user-niulai', createdAt: 3 })
    data.messages.push({ id: 'message-1', visitorId, userId: 'user-niulai', createdAt: 3, role: 'assistant', content: 'ok' })
  })
  const listed = await audit.listVisitors({ product: 'desktop-agent' })
  assert.equal(listed[0].userId, 'user-niulai')
  const detail = await audit.visitorDetail(visitorId)
  assert.equal(detail.visitor.userId, 'user-niulai')
})

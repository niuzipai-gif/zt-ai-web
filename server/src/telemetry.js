import crypto from 'node:crypto'
import { getDataStore } from './data-store.js'

export function estimateTokens(text = '') {
  return Math.ceil(String(text || '').length / 4)
}

export function maskIp(value = '') {
  const ip = String(value || 'unknown').replace(/^::ffff:/i, '')
  if (ip.includes('.')) {
    const parts = ip.split('.')
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.*.*` : 'unknown'
  }
  if (ip.includes(':')) return `${ip.split(':').slice(0, 3).join(':')}:*`
  return 'unknown'
}

export function scopedVisitorId(product, visitorId) {
  return `${String(product || 'unknown')}:${String(visitorId || 'anonymous').slice(0, 160)}`
}

function costEstimate(model, inputTokens, outputTokens) {
  const input = Number(process.env[`${String(model).toUpperCase().replaceAll('-', '_')}_INPUT_USD_PER_MILLION`] || 0)
  const output = Number(process.env[`${String(model).toUpperCase().replaceAll('-', '_')}_OUTPUT_USD_PER_MILLION`] || 0)
  if (!input && !output) return null
  return Number(((inputTokens * input + outputTokens * output) / 1_000_000).toFixed(8))
}

export function createTelemetry({ store = getDataStore(), now = () => Date.now(), retentionDays = Number(process.env.DATA_RETENTION_DAYS || 90) } = {}) {
  return {
    store,
    async recordRequest({ product, visitorId, conversationId, userId = null, model, requestType, status, ip, userAgent, inputText = '', outputText = '', inputTokens, outputTokens, metadata = {} }) {
      const timestamp = now()
      const input = inputTokens ?? estimateTokens(inputText)
      const output = outputTokens ?? estimateTokens(outputText)
      const scopedId = scopedVisitorId(product, visitorId)
      const event = {
        id: crypto.randomUUID(), product, visitorId: scopedId, conversationId: conversationId || null, userId,
        model, requestType, status, ip: String(ip || 'unknown'), maskedIp: maskIp(ip), userAgent: String(userAgent || '').slice(0, 300),
        estimatedInputTokens: input, estimatedOutputTokens: output, estimatedTotalTokens: input + output,
        estimatedCostUsd: costEstimate(model, input, output), createdAt: timestamp, metadata,
      }
      await store.update(data => {
        data.usageEvents.push(event)
        const visitor = data.visitors.find(item => item.id === scopedId)
        if (visitor) {
          visitor.lastSeenAt = timestamp
          visitor.requestCount += 1
          visitor.models = [...new Set([...(visitor.models || []), model])]
          visitor.lastIp = event.ip
          visitor.maskedIp = event.maskedIp
          visitor.userId = userId || visitor.userId || null
        } else {
          data.visitors.push({ id: scopedId, product, visitorId: String(visitorId || 'anonymous'), userId, firstSeenAt: timestamp, lastSeenAt: timestamp, requestCount: 1, models: [model], lastIp: event.ip, maskedIp: event.maskedIp, userAgent: event.userAgent })
        }
        if (conversationId) {
          let conversation = data.conversations.find(item => item.id === conversationId && item.visitorId === scopedId)
          if (!conversation) {
            conversation = { id: conversationId, visitorId: scopedId, product, userId, createdAt: timestamp, updatedAt: timestamp }
            data.conversations.push(conversation)
          } else conversation.updatedAt = timestamp
          if (inputText) data.messages.push({ id: crypto.randomUUID(), conversationId, visitorId: scopedId, product, userId, role: 'user', content: String(inputText).slice(0, 20_000), createdAt: timestamp })
          if (outputText) data.messages.push({ id: crypto.randomUUID(), conversationId, visitorId: scopedId, product, userId, role: 'assistant', content: String(outputText).slice(0, 20_000), model, createdAt: timestamp })
        }
      })
      return event
    },
    async cleanup() {
      const cutoff = now() - retentionDays * 24 * 60 * 60 * 1000
      await store.update(data => {
        data.usageEvents = data.usageEvents.filter(item => item.createdAt >= cutoff)
        data.messages = data.messages.filter(item => item.createdAt >= cutoff)
        data.conversations = data.conversations.filter(item => item.updatedAt >= cutoff)
        data.visitors = data.visitors.filter(item => item.lastSeenAt >= cutoff)
      })
    },
    async overview() {
      const data = await store.read()
      const usage = data.usageEvents
      return {
        visitors: data.visitors.length,
        conversations: data.conversations.length,
        requests: usage.length,
        estimatedTokens: usage.reduce((sum, item) => sum + item.estimatedTotalTokens, 0),
        estimatedCostUsd: usage.every(item => item.estimatedCostUsd == null) ? null : Number(usage.reduce((sum, item) => sum + (item.estimatedCostUsd || 0), 0).toFixed(8)),
        byProduct: Object.fromEntries([...new Set(usage.map(item => item.product))].map(product => [product, usage.filter(item => item.product === product).length])),
        byModel: Object.fromEntries([...new Set(usage.map(item => item.model))].map(model => [model, usage.filter(item => item.model === model).length])),
      }
    },
    async listVisitors({ product, query } = {}) {
      const data = await store.read()
      return data.visitors.filter(item => (!product || item.product === product) && (!query || `${item.id} ${item.maskedIp} ${item.product}`.toLowerCase().includes(String(query).toLowerCase()))).map(({ lastIp, ...safe }) => safe).sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    },
    async listUsage({ product, model, query, limit = 200 } = {}) {
      const data = await store.read()
      const normalizedQuery = String(query || '').toLowerCase()
      return data.usageEvents
        .filter(item => (!product || item.product === product) && (!model || item.model === model) && (!normalizedQuery || `${item.visitorId} ${item.requestType} ${item.status}`.toLowerCase().includes(normalizedQuery)))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, Math.max(1, Math.min(Number(limit) || 200, 500)))
        .map(({ ip, userAgent, ...safe }) => safe)
    },
    async visitorDetail(id) {
      const data = await store.read()
      const visitor = data.visitors.find(item => item.id === id)
      if (!visitor) return null
      const conversations = data.conversations.filter(item => item.visitorId === id)
      const messages = data.messages.filter(item => item.visitorId === id).sort((a, b) => a.createdAt - b.createdAt)
      const usage = data.usageEvents.filter(item => item.visitorId === id)
      return { visitor, conversations, messages, usage }
    },
  }
}

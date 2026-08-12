import http from 'node:http'
import fs from 'node:fs'
import { CHAT_MODELS, contentToText, isMediaIntent, normalizeChatRequest } from './contracts/chat.js'
import { streamMinimax } from './providers/minimax.js'
import { streamDeepseek } from './providers/deepseek.js'
import { runHiddenMediaRequest } from './providers/mmx.js'
import { AGENT_SYSTEM_PROMPT, CHAT_LANGUAGE_PROMPTS, ZT_PROFILE, ZT_SYSTEM_PROMPT } from './profile.js'

function loadEnvFile(path) {
  try {
    const text = fs.readFileSync(path, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
    }
  } catch {
    // An environment file is optional in hosted deployments.
  }
}

await loadEnvFile(new URL('../../aikey.env', import.meta.url))
await loadEnvFile(new URL('../../.env', import.meta.url))
await loadEnvFile(new URL('../.env', import.meta.url))

const port = Number(process.env.PORT || 8790)
const allowedOrigins = (process.env.CORS_ORIGIN || '*').split(',').map(value => value.trim()).filter(Boolean)
const requestWindows = new Map()

function corsOrigin(request) {
  const requestOrigin = request.headers.origin
  if (allowedOrigins.includes('*')) return '*'
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) return requestOrigin
  return allowedOrigins[0] || '*'
}

function rateLimit(request) {
  const key = request.socket.remoteAddress || 'unknown'
  const now = Date.now()
  const current = requestWindows.get(key)
  if (!current || now - current.startedAt >= 60_000) {
    requestWindows.set(key, { startedAt: now, count: 1 })
    return true
  }
  current.count += 1
  return current.count <= Number(process.env.CHAT_RATE_LIMIT || 30)
}

function sendJson(request, response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': corsOrigin(request), vary: 'Origin' })
  response.end(JSON.stringify(payload))
}

function sseStart(request, response) {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    'x-accel-buffering': 'no',
    connection: 'keep-alive',
    'access-control-allow-origin': corsOrigin(request),
    vary: 'Origin',
  })
  response.flushHeaders?.()
}

function sse(response, event, data) {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = ''
    request.on('data', chunk => { raw += chunk; if (raw.length > 12_000_000) reject(new Error('请求过大，请压缩图片后再上传')) })
    request.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { reject(new Error('请求不是有效 JSON')) } })
    request.on('error', reject)
  })
}

async function handleChat(request, response) {
  if (!rateLimit(request)) { sendJson(request, response, 429, { error: '请求过于频繁，请稍后再试' }); return }
  const body = await readBody(request)
  const { model, messages } = normalizeChatRequest(body)
  const language = ['zh', 'en', 'ja'].includes(body.language) ? body.language : 'zh'
  const providerMessages = [{ role: 'system', content: `${ZT_SYSTEM_PROMPT}\n${CHAT_LANGUAGE_PROMPTS[language]}` }, ...messages.filter(message => message.role !== 'system')]
  const incomingAttachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 8) : []
  const attachmentNotes = incomingAttachments
    .filter(file => file && file.name)
    .map(file => `[附件：${String(file.name).slice(0, 160)}，类型：${String(file.type || '未知').slice(0, 80)}]`)
  const latestUser = providerMessages.findLast(message => message.role === 'user')
  if (latestUser && attachmentNotes.length) {
    const note = `\n\n${attachmentNotes.join('\n')}`
    latestUser.content = typeof latestUser.content === 'string'
      ? `${latestUser.content}${note}`
      : [{ type: 'text', text: note }, ...(latestUser.content || [])]
  }
  sseStart(request, response)
  const latest = contentToText(providerMessages.findLast(message => message.role === 'user')?.content || '')
  sse(response, 'message.start', { model: CHAT_MODELS[model], media: isMediaIntent(latest) })
  if (isMediaIntent(latest)) {
    try {
      const media = await runHiddenMediaRequest({ text: latest })
      if (media) {
        sse(response, 'media.started', { kind: media.kind, status: media.status })
        if (media.url) sse(response, 'media.completed', { kind: media.kind, url: media.url })
        else sse(response, 'message.delta', { text: media.taskId ? '创作任务已经提交，完成后会回到这段对话里。' : '我已经记下你的创作描述，正在准备结果。' })
      } else {
        sse(response, 'message.delta', { text: '我理解你想做一项视觉创作。当前媒体服务还没有配置完成，你可以先继续描述画面、风格和用途。' })
      }
    } catch (error) {
      sse(response, 'message.error', { message: error.message })
    }
    sse(response, 'message.done', {})
    response.end()
    return
  }
  try {
    const stream = model === 'deepseek'
      ? streamDeepseek({ model: CHAT_MODELS.deepseek, messages: providerMessages })
      : streamMinimax({ model: CHAT_MODELS.minimax, messages: providerMessages })
    for await (const text of stream) sse(response, 'message.delta', { text })
  } catch (error) {
    sse(response, 'message.error', { message: error.message })
  }
  sse(response, 'message.done', {})
  response.end()
}

async function handleAgentChat(request, response) {
  if (!rateLimit(request)) { sendJson(request, response, 429, { error: '请求过于频繁，请稍后再试' }); return }
  const body = await readBody(request)
  const { model, messages } = normalizeChatRequest(body)
  const language = ['zh', 'en', 'ja'].includes(body.language) ? body.language : 'zh'
  const providerMessages = [{ role: 'system', content: `${AGENT_SYSTEM_PROMPT}\n${CHAT_LANGUAGE_PROMPTS[language]}` }, ...messages.filter(message => message.role !== 'system')]
  sseStart(request, response)
  sse(response, 'message.start', { model: CHAT_MODELS[model], mode: 'execute' })
  try {
    const stream = model === 'deepseek'
      ? streamDeepseek({ model: CHAT_MODELS.deepseek, messages: providerMessages })
      : streamMinimax({ model: CHAT_MODELS.minimax, messages: providerMessages })
    for await (const text of stream) sse(response, 'message.delta', { text })
  } catch (error) {
    sse(response, 'message.error', { message: error.message })
  }
  sse(response, 'message.done', {})
  response.end()
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') { response.writeHead(204, { 'access-control-allow-origin': corsOrigin(request), 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'Origin' }); response.end(); return }
  try {
    if (request.method === 'GET' && request.url === '/api/health') return sendJson(request, response, 200, { ok: true, service: 'zt-ai-gateway', profile: { name: ZT_PROFILE.name, identity: ZT_PROFILE.identity }, models: CHAT_MODELS, providers: { minimax: Boolean(process.env.MINIMAX_API_KEY), deepseek: Boolean(process.env.DEEPSEEK_API_KEY) } })
    if (request.method === 'POST' && request.url === '/api/chat') return await handleChat(request, response)
    if (request.method === 'POST' && request.url === '/api/agent/chat') return await handleAgentChat(request, response)
    sendJson(request, response, 404, { error: 'Not found' })
  } catch (error) {
    sendJson(request, response, 400, { error: error.message })
  }
})

server.listen(port, '0.0.0.0', () => console.log(`ZT.AI gateway listening on http://localhost:${port}`))

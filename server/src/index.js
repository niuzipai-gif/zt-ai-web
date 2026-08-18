import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHAT_MODELS, contentToText, isMediaIntent, normalizeChatRequest } from './contracts/chat.js'
import { streamMinimax } from './providers/minimax.js'
import { streamDeepseek } from './providers/deepseek.js'
import { runHiddenMediaRequest } from './providers/mmx.js'
import { AGENT_PLANNER_PROMPT, AGENT_SYSTEM_PROMPT, CHAT_LANGUAGE_PROMPTS, ZT_PROFILE, ZT_SYSTEM_PROMPT } from './profile.js'
import { createAuthService } from './auth.js'
import { createTelemetry } from './telemetry.js'
import { createAdminApi } from './admin.js'
import { isAllowedOrigin } from './cors.js'
import { MODEL_CATALOG, completeMiMoResponse, isPrivateDesktopRuntimeRequest, streamChatCompletionEvents, streamGatewayChat, streamResponseEvents } from './mimocode-openai.js'

function loadEnvFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
    }
  } catch {
    // An environment file is optional in hosted deployments.
  }
}

if (process.env.ZT_AI_TEST_MODE !== '1') {
  await loadEnvFile(new URL('../../aikey.env', import.meta.url))
  await loadEnvFile(new URL('../../.env', import.meta.url))
  await loadEnvFile(new URL('../.env', import.meta.url))
}

const port = Number(process.env.PORT || 8790)
const allowedOrigins = (process.env.CORS_ORIGIN || '*').split(',').map(value => value.trim()).filter(Boolean)
const requestWindows = new Map()
const auth = createAuthService()
const telemetry = createTelemetry()
const adminApi = createAdminApi({ auth, telemetry })
const CONTROL_ROOM_PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/control-room')

function corsOrigin(request) {
  const requestOrigin = request.headers.origin
  if (allowedOrigins.includes('*')) return '*'
  if (isAllowedOrigin(requestOrigin, allowedOrigins)) return requestOrigin
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

function sendPrivateJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(payload))
}

function bearerToken(request) {
  const header = String(request.headers.authorization || '')
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
}

function adminToken(request) {
  const header = String(request.headers.authorization || '')
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
}

async function requireUser(request, response) {
  const session = await auth.getSession(bearerToken(request), 'user')
  if (!session) {
    sendJson(request, response, 401, { error: '需要登录桌面 Agent 账户' })
    return null
  }
  return session
}

function clientIp(request) {
  return String(request.headers['x-forwarded-for'] || request.headers['x-real-ip'] || request.socket.remoteAddress || 'unknown').split(',')[0].trim()
}

export function clientContext(request, body = {}, session = null, product = 'web') {
  const requestedVisitorId = String(body.visitorId || request.headers['x-zt-visitor-id'] || '').trim()
  const accountId = String(session?.user?.id || '').trim()
  // Authenticated desktop traffic is grouped by the account on the server. This
  // prevents a missing renderer field (or a stale anonymous id) from creating a
  // second visitor row that cannot be joined back to the account in Control Room.
  const visitorId = accountId && product === 'desktop-agent'
    ? `account-${accountId}`
    : requestedVisitorId || 'anonymous'
  return {
    visitorId: visitorId.slice(0, 160),
    conversationId: String(body.conversationId || request.headers['x-zt-conversation-id'] || '').slice(0, 160) || null,
    ip: clientIp(request),
    userAgent: request.headers['user-agent'] || '',
  }
}

async function recordTelemetry(input) {
  try { await telemetry.recordRequest(input) } catch (error) { console.error('ZT.AI telemetry write failed:', error.message) }
}

async function recordVisit(input) {
  try { await telemetry.recordVisit(input) } catch (error) { console.error('ZT.AI visit write failed:', error.message) }
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

function privateSseStart(response) {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    'x-accel-buffering': 'no',
    connection: 'keep-alive',
  })
  response.flushHeaders?.()
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = ''
    request.on('data', chunk => { raw += chunk; if (raw.length > 12_000_000) reject(new Error('请求过大，请压缩图片后再上传')) })
    request.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { reject(new Error('请求不是有效 JSON')) } })
    request.on('error', reject)
  })
}

async function serveControlRoom(request, response) {
  const pathname = new URL(request.url, 'http://localhost').pathname
  const relative = pathname === '/admin' || pathname === '/admin/' ? 'index.html' : pathname.replace(/^\/admin\//, '')
  const candidate = path.resolve(CONTROL_ROOM_PUBLIC, relative)
  if (!candidate.startsWith(CONTROL_ROOM_PUBLIC)) return sendJson(request, response, 403, { error: 'Forbidden' })
  try {
    const body = await fs.promises.readFile(candidate)
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }
    response.writeHead(200, { 'content-type': types[path.extname(candidate).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' })
    response.end(body)
  } catch { sendJson(request, response, 404, { error: 'Not found' }) }
}

function adminErrorStatus(error) {
  return /需要管理员登录|管理员账号或密码错误|管理员密码错误|访客不存在/.test(error.message) ? 401 : 400
}

function attachmentMetadata(attachments) {
  return (Array.isArray(attachments) ? attachments : []).slice(0, 8).map(file => ({ name: String(file?.name || '').slice(0, 160), type: String(file?.type || '').slice(0, 80) }))
}

async function handleChat(request, response) {
  if (!rateLimit(request)) { sendJson(request, response, 429, { error: '请求过于频繁，请稍后再试' }); return }
  const body = await readBody(request)
  const { model, messages } = normalizeChatRequest(body)
  const language = ['zh', 'en', 'ja'].includes(body.language) ? body.language : 'zh'
  const providerMessages = [{ role: 'system', content: `${ZT_SYSTEM_PROMPT}\n${CHAT_LANGUAGE_PROMPTS[language]}` }, ...messages.filter(message => message.role !== 'system')]
  const incomingAttachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 8) : []
  const attachmentNotes = incomingAttachments.filter(file => file && file.name).map(file => `[附件：${String(file.name).slice(0, 160)}，类型：${String(file.type || '未知').slice(0, 80)}]`)
  const latestUser = providerMessages.findLast(message => message.role === 'user')
  if (latestUser && attachmentNotes.length) {
    const note = `\n\n${attachmentNotes.join('\n')}`
    latestUser.content = typeof latestUser.content === 'string' ? `${latestUser.content}${note}` : [{ type: 'text', text: note }, ...(latestUser.content || [])]
  }
  const context = clientContext(request, body, null, 'web')
  const inputText = contentToText(providerMessages.findLast(message => message.role === 'user')?.content || '')
  let outputText = ''
  let status = 'success'
  const media = isMediaIntent(inputText)
  sseStart(request, response)
  sse(response, 'message.start', { model: CHAT_MODELS[model], media })
  if (media) {
    try {
      const result = await runHiddenMediaRequest({ text: inputText })
      if (result) {
        sse(response, 'media.started', { kind: result.kind, status: result.status })
        if (result.url) sse(response, 'media.completed', { kind: result.kind, url: result.url })
        else { outputText = result.taskId ? '创作任务已经提交，完成后会回到这段对话里。' : '我已经记下你的创作描述，正在准备结果。'; sse(response, 'message.delta', { text: outputText }) }
      } else { outputText = '我理解你想做一项视觉创作。当前媒体服务还没有配置完成，你可以先继续描述画面、风格和用途。'; sse(response, 'message.delta', { text: outputText }) }
    } catch (error) { status = 'error'; sse(response, 'message.error', { message: error.message }) }
    sse(response, 'message.done', {})
    response.end()
    await recordTelemetry({ product: 'web', ...context, model: CHAT_MODELS[model], requestType: 'media', status, inputText, outputText, metadata: { attachments: attachmentMetadata(incomingAttachments) } })
    return
  }
  try {
    const stream = model === 'deepseek' ? streamDeepseek({ model: CHAT_MODELS.deepseek, messages: providerMessages }) : streamMinimax({ model: CHAT_MODELS.minimax, messages: providerMessages })
    for await (const text of stream) { outputText += text; sse(response, 'message.delta', { text }) }
  } catch (error) { status = 'error'; sse(response, 'message.error', { message: error.message }) }
  sse(response, 'message.done', {})
  response.end()
  await recordTelemetry({ product: 'web', ...context, model: CHAT_MODELS[model], requestType: 'chat', status, inputText, outputText, metadata: { attachments: attachmentMetadata(incomingAttachments) } })
}

async function handleAgentChat(request, response) {
  const session = await requireUser(request, response)
  if (!session) return
  if (!rateLimit(request)) { sendJson(request, response, 429, { error: '请求过于频繁，请稍后再试' }); return }
  const body = await readBody(request)
  const { model, messages } = normalizeChatRequest(body)
  const language = ['zh', 'en', 'ja'].includes(body.language) ? body.language : 'zh'
  const providerMessages = [{ role: 'system', content: `${AGENT_SYSTEM_PROMPT}\n${CHAT_LANGUAGE_PROMPTS[language]}` }, ...messages.filter(message => message.role !== 'system')]
  const context = clientContext(request, body, session, 'desktop-agent')
  const inputText = contentToText(providerMessages.findLast(message => message.role === 'user')?.content || '')
  let outputText = ''
  let status = 'success'
  sseStart(request, response)
  sse(response, 'message.start', { model: CHAT_MODELS[model], mode: 'execute' })
  try {
    const stream = model === 'deepseek' ? streamDeepseek({ model: CHAT_MODELS.deepseek, messages: providerMessages }) : streamMinimax({ model: CHAT_MODELS.minimax, messages: providerMessages })
    for await (const text of stream) { outputText += text; sse(response, 'message.delta', { text }) }
  } catch (error) { status = 'error'; sse(response, 'message.error', { message: error.message }) }
  sse(response, 'message.done', {})
  response.end()
  await recordTelemetry({ product: 'desktop-agent', ...context, userId: session.user.id, model: CHAT_MODELS[model], requestType: 'agent-chat', status, inputText, outputText })
}

async function handleAgentPlan(request, response) {
  const session = await requireUser(request, response)
  if (!session) return
  if (!rateLimit(request)) { sendJson(request, response, 429, { error: '请求过于频繁，请稍后再试' }); return }
  const body = await readBody(request)
  const task = String(body.task || '').trim().slice(0, 8_000)
  if (!task) { sendJson(request, response, 400, { error: '缺少 Agent 任务目标' }); return }
  const model = String(body.model || '').toLowerCase() === 'deepseek' ? 'deepseek' : 'minimax'
  const language = ['zh', 'en', 'ja'].includes(body.language) ? body.language : 'zh'
  const context = clientContext(request, body, session, 'desktop-agent')
  const providerMessages = [{ role: 'system', content: `${AGENT_SYSTEM_PROMPT}\n${AGENT_PLANNER_PROMPT}\n${CHAT_LANGUAGE_PROMPTS[language]}` }, { role: 'user', content: `工作目标：\n${task}\n\n请只返回符合约束的 JSON 计划。` }]
  try {
    const stream = model === 'deepseek' ? streamDeepseek({ model: CHAT_MODELS.deepseek, messages: providerMessages }) : streamMinimax({ model: CHAT_MODELS.minimax, messages: providerMessages })
    let text = ''
    for await (const chunk of stream) text += chunk
    sendJson(request, response, 200, { ok: true, model: CHAT_MODELS[model], text })
    await recordTelemetry({ product: 'desktop-agent', ...context, userId: session.user.id, model: CHAT_MODELS[model], requestType: 'agent-plan', status: 'success', inputText: task, outputText: text, metadata: { taskId: body.taskId || null } })
  } catch (error) {
    sendJson(request, response, 502, { error: error.message })
    await recordTelemetry({ product: 'desktop-agent', ...context, userId: session.user.id, model: CHAT_MODELS[model], requestType: 'agent-plan', status: 'error', inputText: task, outputText: '', metadata: { taskId: body.taskId || null, error: error.message } })
  }
}

async function handleMiMoOpenAI(request, response, route) {
  if (!isPrivateDesktopRuntimeRequest(request.headers.origin)) {
    sendPrivateJson(response, 403, { error: '该接口仅供本机桌面运行时调用' })
    return
  }
  const session = await auth.getSession(bearerToken(request), 'user')
  if (!session) {
    sendPrivateJson(response, 401, { error: '需要登录桌面 Agent 账户' })
    return
  }
  if (!rateLimit(request)) {
    sendPrivateJson(response, 429, { error: '请求过于频繁，请稍后再试' })
    return
  }
  if (request.method === 'GET' && route === '/api/agent/openai/v1/models') {
    sendPrivateJson(response, 200, {
      object: 'list',
      data: Object.entries(MODEL_CATALOG).map(([id, value]) => ({ id, object: 'model', owned_by: 'zt-ai-gateway', name: value.label })),
    })
    return
  }
  const body = await readBody(request)
  const context = clientContext(request, body, session, 'desktop-agent')
  const streamChat = input => streamGatewayChat(input)
  const responseId = `resp_zt_${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`
  const requestedModel = String(body.model || 'zt-minimax-m3')
  const modelLabel = MODEL_CATALOG[requestedModel]?.label || requestedModel

  if (request.method === 'POST' && route === '/api/agent/openai/v1/responses') {
    let outputText = ''
    let status = 'success'
    if (body.stream === false) {
      try {
        const completed = await completeMiMoResponse({ request: body, systemPrompt: AGENT_SYSTEM_PROMPT, streamChat, responseId })
        outputText = completed.output
          .filter(item => item.type === 'message')
          .flatMap(item => item.content || [])
          .map(item => item.text || '')
          .join('')
        sendPrivateJson(response, 200, completed)
      } catch {
        status = 'error'
        sendPrivateJson(response, 502, { error: { code: 'server_error', message: '所选模型暂时无法完成本次请求。' } })
      }
      await recordTelemetry({ product: 'desktop-agent', ...context, userId: session.user.id, model: modelLabel, requestType: 'mimocode-responses', status, inputText: String(body.input || '').slice(0, 8_000), outputText })
      return
    }
    privateSseStart(response)
    try {
      for await (const frame of streamResponseEvents({ request: body, systemPrompt: AGENT_SYSTEM_PROMPT, streamChat, responseId })) {
        if (frame.type === 'response.output_text.delta') outputText += frame.data.delta || ''
        sse(response, frame.type, frame.data)
      }
    } catch {
      status = 'error'
      sse(response, 'response.failed', { response: { id: responseId, object: 'response', status: 'failed', error: { code: 'server_error', message: '所选模型暂时无法完成本次请求。' } } })
    }
    response.end()
    await recordTelemetry({ product: 'desktop-agent', ...context, userId: session.user.id, model: modelLabel, requestType: 'mimocode-responses', status, inputText: String(body.input || '').slice(0, 8_000), outputText })
    return
  }

  if (request.method === 'POST' && route === '/api/agent/openai/v1/chat/completions') {
    let status = 'success'
    let outputText = ''
    privateSseStart(response)
    try {
      for await (const frame of streamChatCompletionEvents({ request: body, systemPrompt: AGENT_SYSTEM_PROMPT, streamChat })) {
        const text = frame.choices?.[0]?.delta?.content || ''
        outputText += text
        response.write(`data: ${JSON.stringify(frame)}\n\n`)
      }
      response.write('data: [DONE]\n\n')
    } catch {
      status = 'error'
      response.write(`data: ${JSON.stringify({ error: { message: '所选模型暂时无法完成本次请求。' } })}\n\n`)
      response.write('data: [DONE]\n\n')
    }
    response.end()
    await recordTelemetry({ product: 'desktop-agent', ...context, userId: session.user.id, model: modelLabel, requestType: 'mimocode-chat-completions', status, inputText: String(body.messages?.at?.(-1)?.content || '').slice(0, 8_000), outputText })
    return
  }
  sendPrivateJson(response, 404, { error: 'Not found' })
}

export function createServer() {
  return http.createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      const optionRoute = request.url.split('?')[0]
      if (optionRoute.startsWith('/api/agent/openai/v1/')) { sendPrivateJson(response, 403, { error: '该接口仅供本机桌面运行时调用' }); return }
      response.writeHead(204, { 'access-control-allow-origin': corsOrigin(request), 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'content-type, authorization, x-zt-agent-secret', vary: 'Origin' }); response.end(); return
    }
    try {
      const route = request.url.split('?')[0]
      if ((route === '/admin' || route.startsWith('/admin/')) && !route.startsWith('/admin/api/')) return await serveControlRoom(request, response)
      if (request.method === 'GET' && route === '/api/health') return sendJson(request, response, 200, { ok: true, service: 'zt-ai-gateway', profile: { name: ZT_PROFILE.name, identity: ZT_PROFILE.identity }, models: CHAT_MODELS, providers: { minimax: Boolean(process.env.MINIMAX_API_KEY), deepseek: Boolean(process.env.DEEPSEEK_API_KEY) } })
      if (request.method === 'POST' && route === '/api/visit') {
        if (!rateLimit(request)) return sendJson(request, response, 429, { error: '访问过于频繁，请稍后再试' })
        const body = await readBody(request)
        await recordVisit({ ...clientContext(request, body, null, 'web'), product: 'web', page: String(body.page || '/'), language: String(body.language || '') })
        return sendJson(request, response, 200, { ok: true })
      }
      if ((request.method === 'GET' && route === '/api/agent/openai/v1/models') || (request.method === 'POST' && (route === '/api/agent/openai/v1/responses' || route === '/api/agent/openai/v1/chat/completions'))) return await handleMiMoOpenAI(request, response, route)
      if (request.method === 'POST' && route === '/api/auth/register') { const body = await readBody(request); return sendJson(request, response, 201, await auth.register(body)) }
      if (request.method === 'POST' && route === '/api/auth/login') { const body = await readBody(request); return sendJson(request, response, 200, await auth.login(body)) }
      if (request.method === 'GET' && route === '/api/auth/me') { const session = await auth.getSession(bearerToken(request), 'user'); return session ? sendJson(request, response, 200, { user: session.user }) : sendJson(request, response, 401, { error: '未登录' }) }
      if (request.method === 'POST' && route === '/api/auth/logout') { await auth.revoke(bearerToken(request), 'user'); return sendJson(request, response, 200, { ok: true }) }
      if (request.method === 'POST' && route === '/api/admin/login') {
        try { const body = await readBody(request); return sendJson(request, response, 200, await adminApi.login({ username: String(body.username || ''), password: String(body.password || '') })) }
        catch (error) { return sendJson(request, response, 401, { error: error.message }) }
      }
      if (request.method === 'POST' && route === '/api/admin/logout') {
        try { return sendJson(request, response, 200, await adminApi.logout(adminToken(request))) }
        catch (error) { return sendJson(request, response, adminErrorStatus(error), { error: error.message }) }
      }
      if (request.method === 'GET' && route === '/api/admin/me') {
        try { return sendJson(request, response, 200, await adminApi.me(adminToken(request))) }
        catch (error) { return sendJson(request, response, 401, { error: error.message }) }
      }
      if (request.method === 'GET' && route === '/api/admin/overview') {
        try { return sendJson(request, response, 200, await adminApi.overview(adminToken(request))) }
        catch (error) { return sendJson(request, response, 401, { error: error.message }) }
      }
      if (request.method === 'GET' && route === '/api/admin/visitors') {
        try { const query = new URL(request.url, 'http://localhost').searchParams; return sendJson(request, response, 200, await adminApi.visitors(adminToken(request), { product: query.get('product') || undefined, query: query.get('q') || undefined })) }
        catch (error) { return sendJson(request, response, 401, { error: error.message }) }
      }
      if (request.method === 'GET' && route === '/api/admin/usage') {
        try { const query = new URL(request.url, 'http://localhost').searchParams; return sendJson(request, response, 200, await adminApi.usage(adminToken(request), { product: query.get('product') || undefined, model: query.get('model') || undefined, query: query.get('q') || undefined, limit: query.get('limit') || undefined })) }
        catch (error) { return sendJson(request, response, 401, { error: error.message }) }
      }
      if (request.method === 'GET' && route === '/api/admin/users') {
        try { const query = new URL(request.url, 'http://localhost').searchParams; return sendJson(request, response, 200, await adminApi.users(adminToken(request), { status: query.get('status') || undefined, query: query.get('q') || undefined })) }
        catch (error) { return sendJson(request, response, adminErrorStatus(error), { error: error.message }) }
      }
      const userActionMatch = route.match(/^\/api\/admin\/users\/([^/]+)\/(approve|access|revoke)$/)
      if (request.method === 'POST' && userActionMatch) {
        try {
          const userId = decodeURIComponent(userActionMatch[1])
          const action = userActionMatch[2]
          const body = action === 'revoke' ? {} : await readBody(request)
          const options = { durationHours: body.durationHours, permanent: body.permanent === true }
          const result = action === 'approve'
            ? await adminApi.approveUser(adminToken(request), userId, options)
            : action === 'access'
              ? await adminApi.setUserAccess(adminToken(request), userId, options)
              : await adminApi.revokeUser(adminToken(request), userId)
          return sendJson(request, response, 200, result)
        } catch (error) { return sendJson(request, response, adminErrorStatus(error), { error: error.message }) }
      }
      const visitorMatch = route.match(/^\/api\/admin\/visitors\/([^/]+)$/)
      if (request.method === 'GET' && visitorMatch) {
        try { return sendJson(request, response, 200, await adminApi.detail(adminToken(request), decodeURIComponent(visitorMatch[1]))) }
        catch (error) { return sendJson(request, response, adminErrorStatus(error), { error: error.message }) }
      }
      if (request.method === 'POST' && route === '/api/chat') return await handleChat(request, response)
      if (request.method === 'POST' && route === '/api/agent/chat') return await handleAgentChat(request, response)
      if (request.method === 'POST' && route === '/api/agent/plan') return await handleAgentPlan(request, response)
      sendJson(request, response, 404, { error: 'Not found' })
    } catch (error) { sendJson(request, response, 400, { error: error.message }) }
  })
}

const server = createServer()
void telemetry.cleanup().catch(error => console.error('ZT.AI telemetry cleanup failed:', error.message))
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) server.listen(port, '0.0.0.0', () => console.log(`ZT.AI gateway listening on http://localhost:${port}`))

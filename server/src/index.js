import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHAT_MODELS, contentToText, isMediaIntent, normalizeChatRequest } from './contracts/chat.js'
import { streamMinimax } from './providers/minimax.js'
import { streamDeepseek } from './providers/deepseek.js'
import { runHiddenMediaRequest, synthesizeVoice } from './providers/mmx.js'
import { ZT_PROFILE } from './profile.js'
import { createAuthService } from './auth.js'
import { createTelemetry } from './telemetry.js'
import { createAdminApi } from './admin.js'
import { isAllowedOrigin } from './cors.js'
import { MODEL_CATALOG, completeMiMoResponse, isPrivateDesktopRuntimeRequest, streamChatCompletionEvents, streamGatewayChat, streamResponseEvents } from './mimocode-openai.js'
import { buildWebVerificationContext, buildWebVerificationQuery, requiresWebVerification, sourcePayload } from './web-verification.js'
import { searchWeb } from './web-search.js'
import { buildResearchPlan, runAdaptiveResearch } from './web-research.js'
import { resolveImageSearchConfig, searchGoogleWebDetection, searchTinEye } from './image-search.js'
import { buildAgentPlannerSystemPrompt, buildAgentSystemPrompt, buildPublicSystemPrompt } from './prompt-context.js'
import { buildImageVerificationQuery, carryForwardImages, hasImageContent, hasImageInput, isImageIdentificationRequest, latestImage } from './image-input.js'
import { voiceCapability } from './contracts/voice.js'

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

function imageResearchPrompt(language) {
  if (language === 'en') return 'Inspect the image before web research. Return one short, cautious line of searchable visual clues. Do not state an unverified identity as fact. If no useful clue is visible, return "unidentified". Do not output tools, JSON, or a general answer.'
  if (language === 'ja') return 'ウェブ検索の前に画像を実際に確認し、検索に使える視覚的な手掛かりを慎重に一行で返してください。未確認の名前を事実として断定せず、手掛かりがなければ「未特定」と返してください。ツール、JSON、一般回答は出力しないでください。'
  return '联网搜索前必须先实际观察对话中的图片。只输出一行谨慎的、可用于搜索的视觉线索：可读文字、品牌标志、物体类别、型号、地点或明显特征。不能把未核实的身份当成事实；没有线索只输出“未识别”。不要输出工具、JSON 或完整回答。'
}

async function collectModelText(stream) {
  let text = ''
  for await (const chunk of stream) text += chunk
  return text.replace(/\s+/gu, ' ').trim().slice(0, 1_000)
}

async function runImageVisionPreflight({ model, messages, language }) {
  const system = messages.find(message => message.role === 'system')?.content || ''
  const visionMessages = [
    { role: 'system', content: `${system}\n\n${imageResearchPrompt(language)}` },
    ...messages.filter(message => message.role !== 'system'),
  ]
  const stream = model === 'deepseek'
    ? streamDeepseek({ model: CHAT_MODELS.deepseek, messages: visionMessages })
    : streamMinimax({ model: CHAT_MODELS.minimax, messages: visionMessages })
  return collectModelText(stream)
}

function imageResearchFailureContext(inputText, visionHint) {
  return `${inputText}\n\n[图片联网核验失败]\n这次公开资料检索没有拿到可核验来源。图片本身仍然可供视觉模型观察，但视觉线索${visionHint ? `“${visionHint}”` : ''}只是未核实线索，不能当成品牌、型号、人物、地点或产品身份的结论。回答时先描述能直接从图片看到的内容；涉及具体身份必须明确标注未核实，不能用旧知识补全、猜测或编造来源。不要因为检索失败就说没有看到图片。`
}

function imageResearchHintContext(visionHint) {
  return visionHint ? `\n\n[图片初步视觉线索（未核实）]\n${visionHint}\n这只是检索线索，不是事实结论；必须以图片可见内容和下方公开来源共同核对。` : ''
}

function researchQueries({ inputText, query, imageRequest, visionHint = '', entities = [] }) {
  const queries = [query]
  if (imageRequest) {
    if (visionHint) queries.push(`图片原始出处：${visionHint}`)
    queries.push(`${query} 原图出处`, `${query} 具体来源`)
    for (const entity of entities.slice(0, 4)) queries.push(`图片实体 ${entity} 原图出处`)
  } else {
    if (/(?:来源|出处|官方|核实|证据|验证)/iu.test(inputText)) queries.push(`${query} 官方来源`, `${query} 原始资料`)
    if (/(?:最新|最近|当前|今天|新闻|动态)/iu.test(inputText)) queries.push(`${query} 最新消息`, `${query} 官方公告`)
    if (/(?:是什么|谁是|哪个|哪些)/iu.test(inputText)) queries.push(`${query} 资料介绍`)
  }
  return [...new Set(queries.map(item => String(item || '').replace(/\s+/gu, ' ').trim().slice(0, 240)).filter(Boolean))]
}

function mergeResearchSources(researches = []) {
  const seen = new Set()
  const results = []
  const providers = new Set()
  for (const research of researches) {
    if (research?.provider) providers.add(String(research.provider))
    for (const item of Array.isArray(research?.results) ? research.results : []) {
      const url = String(item?.url || '').trim()
      if (!/^https?:\/\//iu.test(url) || seen.has(url)) continue
      seen.add(url)
      results.push({ ...item, rank: results.length + 1 })
      if (results.length >= 24) break
    }
    if (results.length >= 24) break
  }
  return { results, provider: providers.size > 1 ? 'multi' : [...providers][0] || '公开检索' }
}

async function runImageWebResearch({ imageDataUrl, inputText, visionHint, onProgress }) {
  const config = resolveImageSearchConfig()
  const reverseResearch = []
  const providerErrors = []
  const reverseProviders = []
  const providerTasks = [
    ['google-vision', config.googleApiKey, searchGoogleWebDetection],
    ['tineye', config.tineyeApiKey, searchTinEye],
  ]
  for (const [name, apiKey, search] of providerTasks) {
    if (!apiKey) continue
    try {
      onProgress?.(`正在使用 ${name === 'google-vision' ? 'Google 图片网页检测' : 'TinEye 反向搜图'}…`)
      const result = await search({ imageDataUrl, config: { apiKey }, onProgress })
      reverseResearch.push(result)
      reverseProviders.push(name)
    } catch (error) {
      providerErrors.push({ provider: name, message: String(error?.message || '图片检索失败').slice(0, 240) })
    }
  }
  const entities = reverseResearch.flatMap(item => Array.isArray(item.entities) ? item.entities.map(entity => entity.description) : []).filter(Boolean)
  const queryList = researchQueries({ inputText, query: buildImageVerificationQuery(inputText, visionHint), imageRequest: true, visionHint, entities })
  const plan = buildResearchPlan({ inputText, imageRequest: true, ambiguous: !visionHint || !reverseResearch.length })
  let textResearch = null
  try {
    textResearch = await runAdaptiveResearch({
      queries: queryList,
      ...plan,
      onProgress,
    })
  } catch (error) {
    providerErrors.push({ provider: 'text-search', message: String(error?.message || '文字核验失败').slice(0, 240) })
  }
  const merged = mergeResearchSources([...reverseResearch, textResearch])
  if (!merged.results.length) {
    throw new Error(providerErrors.map(item => item.message).filter(Boolean).join('；') || '未找到可核验的公开来源')
  }
  return {
    provider: merged.provider,
    query: queryList.join(' | ').slice(0, 240),
    queries: queryList,
    results: merged.results,
    expanded: Boolean(textResearch?.expanded || merged.results.length > plan.initialLimit),
    searchedQueryCount: Number(textResearch?.searchedQueryCount || 0),
    reverseProviders,
    providerErrors,
  }
}

async function handleChat(request, response) {
  if (!rateLimit(request)) { sendJson(request, response, 429, { error: '请求过于频繁，请稍后再试' }); return }
  const body = await readBody(request)
  const { model, messages } = normalizeChatRequest(body)
  const language = ['zh', 'en', 'ja'].includes(body.language) ? body.language : 'zh'
  const originalMessages = messages.filter(message => message.role !== 'system')
  const directlyAttachedImage = hasImageContent(originalMessages.findLast(message => message.role === 'user')?.content)
  const providerMessages = carryForwardImages([{ role: 'system', content: buildPublicSystemPrompt(language) }, ...originalMessages])
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
  const imageRequest = !media && (directlyAttachedImage || (hasImageInput(providerMessages) && isImageIdentificationRequest(inputText)))
  sseStart(request, response)
  sse(response, 'message.start', { model: CHAT_MODELS[model], media })
  const shouldResearch = !media && (requiresWebVerification(inputText) || imageRequest)
  let research = null
  let researchError = null
  let query = ''
  let visionHint = ''
  if (shouldResearch) {
    if (imageRequest) {
      sse(response, 'research.started', { query: '图片识别中' })
      sse(response, 'research.progress', { message: '正在先观察图片，提取可核验线索…' })
      try { visionHint = await runImageVisionPreflight({ model, messages: providerMessages, language }) } catch { visionHint = '' }
      query = buildImageVerificationQuery(inputText, visionHint)
      sse(response, 'research.progress', { message: `正在用图片线索核验公开资料：${query}` })
    } else {
      query = buildWebVerificationQuery(inputText)
      sse(response, 'research.started', { query })
    }
    try {
      const onProgress = message => sse(response, 'research.progress', { message })
      if (imageRequest) {
        research = await runImageWebResearch({
          imageDataUrl: latestImage(providerMessages)?.image_url?.url || '',
          inputText,
          visionHint,
          onProgress,
        })
      } else {
        const queries = researchQueries({ inputText, query, imageRequest: false })
        const plan = buildResearchPlan({ inputText })
        research = await runAdaptiveResearch({ queries, ...plan, onProgress })
      }
      providerMessages.splice(1, 0, { role: 'system', content: `${buildWebVerificationContext(inputText, research)}${imageResearchHintContext(visionHint)}` })
      sse(response, 'research.sources', sourcePayload(research))
    } catch (error) {
      researchError = error
      sse(response, 'research.error', { message: error.message })
      if (imageRequest) providerMessages.splice(1, 0, { role: 'system', content: imageResearchFailureContext(inputText, visionHint) })
      else {
        status = 'error'
        outputText = '我暂时没有拿到可核验的公开来源，所以不根据旧知识直接猜测。请稍后重试，或换一个更具体的关键词。'
        sse(response, 'message.delta', { text: outputText })
        sse(response, 'message.done', {})
        response.end()
        await recordTelemetry({ product: 'web', ...context, model: CHAT_MODELS[model], requestType: 'chat-research', status, inputText, outputText, metadata: { attachments: attachmentMetadata(incomingAttachments), webResearch: true, query, provider: null, sourceCount: 0, researchError: error.message } })
        return
      }
    }
  }
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
    await recordTelemetry({ product: 'web', ...context, model: CHAT_MODELS[model], requestType: 'media', status, inputText, outputText, metadata: { attachments: attachmentMetadata(incomingAttachments), webResearch: false } })
    return
  }
  try {
    const stream = model === 'deepseek' ? streamDeepseek({ model: CHAT_MODELS.deepseek, messages: providerMessages }) : streamMinimax({ model: CHAT_MODELS.minimax, messages: providerMessages })
    for await (const text of stream) { outputText += text; sse(response, 'message.delta', { text }) }
  } catch (error) { status = 'error'; sse(response, 'message.error', { message: error.message }) }
  sse(response, 'message.done', {})
  response.end()
  await recordTelemetry({ product: 'web', ...context, model: CHAT_MODELS[model], requestType: shouldResearch ? 'chat-research' : 'chat', status, inputText, outputText, metadata: { attachments: attachmentMetadata(incomingAttachments), webResearch: shouldResearch, query: research?.query || query || null, provider: research?.provider || null, sourceCount: research?.results?.length || 0, researchError: researchError?.message || null, imageRequest } })
}

async function handleAgentChat(request, response) {
  const session = await requireUser(request, response)
  if (!session) return
  if (!rateLimit(request)) { sendJson(request, response, 429, { error: '请求过于频繁，请稍后再试' }); return }
  const body = await readBody(request)
  const { model, messages } = normalizeChatRequest(body)
  const language = ['zh', 'en', 'ja'].includes(body.language) ? body.language : 'zh'
  const providerMessages = carryForwardImages([{ role: 'system', content: buildAgentSystemPrompt(language) }, ...messages.filter(message => message.role !== 'system')])
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
  const providerMessages = [{ role: 'system', content: buildAgentPlannerSystemPrompt(language) }, { role: 'user', content: `工作目标：\n${task}\n\n请只返回符合约束的 JSON 计划。` }]
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
        const completed = await completeMiMoResponse({ request: body, systemPrompt: buildAgentSystemPrompt(body.language || 'zh'), streamChat, responseId })
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
      await recordTelemetry({ product: 'desktop-agent', ...context, userId: session.user.id, model: modelLabel, requestType: 'codex-responses', status, inputText: String(body.input || '').slice(0, 8_000), outputText })
      return
    }
    privateSseStart(response)
    try {
      for await (const frame of streamResponseEvents({ request: body, systemPrompt: buildAgentSystemPrompt(body.language || 'zh'), streamChat, responseId })) {
        if (frame.type === 'response.output_text.delta') outputText += frame.data.delta || ''
        sse(response, frame.type, frame.data)
      }
    } catch {
      status = 'error'
      sse(response, 'response.failed', { response: { id: responseId, object: 'response', status: 'failed', error: { code: 'server_error', message: '所选模型暂时无法完成本次请求。' } } })
    }
    response.end()
    await recordTelemetry({ product: 'desktop-agent', ...context, userId: session.user.id, model: modelLabel, requestType: 'codex-responses', status, inputText: String(body.input || '').slice(0, 8_000), outputText })
    return
  }

  if (request.method === 'POST' && route === '/api/agent/openai/v1/chat/completions') {
    let status = 'success'
    let outputText = ''
    privateSseStart(response)
    try {
      for await (const frame of streamChatCompletionEvents({ request: body, systemPrompt: buildAgentSystemPrompt(body.language || 'zh'), streamChat })) {
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
    await recordTelemetry({ product: 'desktop-agent', ...context, userId: session.user.id, model: modelLabel, requestType: 'codex-chat-completions', status, inputText: String(body.messages?.at?.(-1)?.content || '').slice(0, 8_000), outputText })
    return
  }
  sendPrivateJson(response, 404, { error: 'Not found' })
}

export function createServer() {
  return http.createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      const optionRoute = request.url.split('?')[0]
      if (optionRoute.startsWith('/api/agent/openai/v1/')) { sendPrivateJson(response, 403, { error: '该接口仅供本机桌面运行时调用' }); return }
      response.writeHead(204, { 'access-control-allow-origin': corsOrigin(request), 'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS', 'access-control-allow-headers': 'content-type, authorization, x-zt-agent-secret', vary: 'Origin' }); response.end(); return
    }
    try {
      const route = request.url.split('?')[0]
      if ((route === '/admin' || route.startsWith('/admin/')) && !route.startsWith('/admin/api/')) return await serveControlRoom(request, response)
      if (request.method === 'GET' && route === '/api/voice/status') {
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': corsOrigin(request), vary: 'Origin' })
        response.end(JSON.stringify(voiceCapability()))
        return
      }
      if (request.method === 'POST' && route === '/api/voice/synthesize') {
        if (!rateLimit(request)) return sendJson(request, response, 429, { error: '语音请求过于频繁，请稍后再试' })
        const body = await readBody(request)
        try {
          return sendJson(request, response, 200, await synthesizeVoice({ text: body.text, language: body.language }))
        } catch (error) {
          return sendJson(request, response, 502, { error: error.message || '语音合成暂时不可用' })
        }
      }
      if (request.method === 'GET' && route === '/api/health') {
        const imageSearchConfig = resolveImageSearchConfig()
        const voice = voiceCapability()
        return sendJson(request, response, 200, {
          ok: true,
          service: 'zt-ai-gateway',
          profile: { name: ZT_PROFILE.name, identity: ZT_PROFILE.identity },
          models: CHAT_MODELS,
          providers: {
            minimax: Boolean(process.env.MINIMAX_API_KEY),
            media: Boolean((process.env.MMX_API_KEY || process.env.MINIMAX_API_KEY) && process.env.MMX_ENABLED === 'true'),
            deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
            googleVision: Boolean(imageSearchConfig.googleApiKey),
            tineye: Boolean(imageSearchConfig.tineyeApiKey),
            voice: voice.enabled,
          },
          storage: telemetry.storage,
        })
      }
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

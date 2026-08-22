import { contextMeter, normalizeModel } from './chat-state.mjs'
import { addConversationMessage, conversationStorageKeys, conversationTitle, createConversation, mergeServerConversations, messageContentWithImages, normalizeConversations, prependConversation } from './conversation-state.mjs'
import { createSmoothStream } from './streaming.mjs'
import { renderMarkdown } from './markdown.mjs'
import { classifyIntent } from './intent-router.mjs'
import { conversationFailurePresentation, executionDrawerPresentation, executionPresentation, sanitizeAssistantPresentation } from './presentation.mjs'
import { authPresentation, shouldSubmitComposer } from './interaction-state.mjs'
import { attachmentReadFailure, extractDocxText, extractPdfText, extractSpreadsheetText, filesFromDataTransfer, hasFilePayload, isDocxAttachment, isPdfAttachment, isSpreadsheetAttachment, isTextAttachment } from './attachment-reader.mjs'
import { createNavigationState, goBack, goForward, pushNavigationState } from './navigation-state.mjs'
import { createTaskRunRegistry } from './task-runs.mjs'

const $ = selector => document.querySelector(selector)
const CHAT_TIMEOUT_MS = 45_000
const CHAT_SLOW_NOTICE_MS = 8_000
const DRAWER_TRANSITION_MS = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 1 : 180
const drawerCloseTimers = new WeakMap()
const state = {
  mode: 'BUDDY',
  model: normalizeModel(localStorage.getItem('zt-ai:agent-model')),
  taskId: null,
  eventCount: 0,
  reader: null,
  authToken: localStorage.getItem('zt-ai:desktop-token') || '',
  accountId: localStorage.getItem('zt-ai:desktop-account-id') || '',
  gatewayUrl: '',
  localSecret: '',
  registering: false,
  pendingApproval: null,
  usedTokens: 12_400,
  chatSessions: [],
  activeChatId: '',
  pendingAttachments: [],
  activeSkills: [],
  activeAgentMessage: null,
  activeAgentTask: '',
  agentStream: null,
  inspectorOpen: false,
  chatController: null,
  railCollapsed: localStorage.getItem('zt-ai:desktop-rail-collapsed') === 'true',
  navigation: createNavigationState(),
  taskRuns: createTaskRunRegistry(),
}

const els = {
  root: $('.app-shell'), railTitle: $('#rail-title'), railStatus: $('#rail-status'),
  conversationEyebrow: $('#conversation-eyebrow'), conversationTitle: $('#conversation-title'), conversationSubtitle: $('#conversation-subtitle'),
  messages: $('#messages'), taskInput: $('#task-input'), composer: $('#composer'), attachmentPreview: $('#attachment-preview'), fileInput: $('#file-input'), run: $('#run-task'), newTask: $('#new-task'), refresh: $('#app-refresh'), history: $('#history'), sidebarToggle: $('#sidebar-toggle'), appBack: $('#app-back'), appForward: $('#app-forward'),
  toolTrigger: $('#tool-trigger'), toolDrawer: $('#tool-drawer'), permissionDrawer: $('#permission-drawer'), permissionTrigger: $('#permission-trigger'), voice: $('#voice-button'), modelSelect: $('#model-select'),
  inspectorToggle: $('#inspector-toggle'), executionSummary: $('#execution-summary'),
  contextRing: $('#context-ring'), contextRingLarge: $('#context-ring-large'), contextPercent: $('#context-percent'), contextPercentLarge: $('#context-percent-large'), contextModel: $('#context-model'), contextUsed: $('#context-used'), contextUsedLarge: $('#context-used-large'), contextRemaining: $('#context-remaining'),
  plan: $('#plan'), log: $('#activity-log'), logCount: $('#log-count'), title: $('#execution-title'), status: $('#execution-status'),
  taskId: $('#current-task-id'), resultPanel: $('#result-panel'), resultText: $('#result-text'), approval: $('#approval-card'), approvalTitle: $('#approval-title'), approvalPreview: $('#approval-preview'), composerApproval: $('#composer-approval'), skillBrowser: $('#skill-browser'),
  gateway: $('#gateway-url'), workspace: $('#workspace-path'), workspaceShort: $('#workspace-short'), gatewayStatus: $('#gateway-status'), authorize: $('#authorize-device'), authorizationStatus: $('#authorization-status'), logout: $('#logout'), accountLabel: $('#account-label'),
  authGate: $('#auth-gate'), authLoginView: $('#auth-login-view'), authRegisterView: $('#auth-register-view'), authForm: $('#auth-form'), authUsername: $('#auth-username'), authPassword: $('#auth-password'), rememberLogin: $('#remember-login'), authSubmit: $('#auth-submit'), authToggle: $('#auth-toggle'), authLoginToggle: $('#auth-login-toggle'), authError: $('#auth-error'), authStatus: $('#auth-status'), registerForm: $('#register-form'), registerUsername: $('#register-username'), registerPassword: $('#register-password'), authPhone: $('#auth-phone'), authEmail: $('#auth-email'), registerSubmit: $('#register-submit'), registerError: $('#register-error'), registerStatus: $('#register-status'),
}

const REMEMBERED_USERNAME_KEY = 'zt-ai:desktop-remembered-username'
const REMEMBERED_PASSWORD_KEY = 'zt-ai:desktop-remembered-password'

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])) }
function displayText(value, fallback = '') { return String(value ?? fallback).replace(/mimo\s*code/ig, '执行引擎').replace(/mimo/ig, '执行引擎').trim() }
function assistantText(value, fallback = '') { return sanitizeAssistantPresentation(displayText(value, fallback)) }
function formatTokens(value) { return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(value % 1_000_000 ? 2 : 0)}M` : `${(value / 1_000).toFixed(value % 1_000 ? 1 : 0)}k` }
function formatAttachmentSize(value) { const bytes = Number(value) || 0; if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB` }
function newChatId() { return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
function currentConversation() { return state.chatSessions.find(item => item.id === state.activeChatId) || null }
function currentTaskRun() { return state.taskRuns.get(state.activeChatId) }
function isVisibleTaskRun(run) { return Boolean(run && run.chatId === state.activeChatId && run.activeAgentMessage?.row?.isConnected !== false) }
function syncComposerWithActiveRun() {
  const busy = Boolean(currentTaskRun() && !currentTaskRun().finished)
  els.taskInput.disabled = busy
  els.run.disabled = busy
}
function storageKeys() { return conversationStorageKeys(state.accountId) }
function navigationSnapshot() { return { chatId: state.activeChatId, railCollapsed: state.railCollapsed } }
function renderNavigationControls() {
  if (els.appBack) els.appBack.disabled = !state.navigation.canGoBack
  if (els.appForward) els.appForward.disabled = !state.navigation.canGoForward
  if (els.sidebarToggle) {
    els.sidebarToggle.setAttribute('aria-expanded', String(!state.railCollapsed))
    els.sidebarToggle.setAttribute('aria-label', state.railCollapsed ? '展开聊天列表' : '收起聊天列表')
    els.sidebarToggle.title = state.railCollapsed ? '展开聊天列表' : '收起聊天列表'
  }
}
function setRailCollapsed(collapsed, { recordNavigation = true } = {}) {
  state.railCollapsed = Boolean(collapsed)
  els.root.dataset.railCollapsed = String(state.railCollapsed)
  localStorage.setItem('zt-ai:desktop-rail-collapsed', String(state.railCollapsed))
  if (recordNavigation) state.navigation = pushNavigationState(state.navigation, navigationSnapshot())
  renderNavigationControls()
}
function rememberNavigation() {
  state.navigation = pushNavigationState(state.navigation, navigationSnapshot())
  renderNavigationControls()
}
function applyNavigationSnapshot(snapshot) {
  if (!snapshot) return
  state.mode = 'BUDDY'
  if (state.chatSessions.some(item => item.id === snapshot.chatId)) state.activeChatId = snapshot.chatId
  setRailCollapsed(snapshot.railCollapsed, { recordNavigation: false })
  persistChats()
  renderMessages()
  renderChatHistory()
  renderNavigationControls()
}
function renderPendingAttachments() {
  if (!els.attachmentPreview) return
  els.attachmentPreview.innerHTML = state.pendingAttachments.map((attachment, index) => `<span class="attachment-chip${attachment.loading ? ' is-reading' : ''}">${attachment.dataUrl ? `<img src="${escapeHtml(attachment.dataUrl)}" alt="${escapeHtml(attachment.name)}">` : '<span class="attachment-file-icon" aria-hidden="true">▧</span>'}<span title="${escapeHtml(attachment.name)}">${escapeHtml(attachment.name)}</span>${attachment.loading ? '<span class="attachment-reading" aria-label="正在读取附件"><i></i>正在读取</span>' : ''}<button type="button" data-remove-attachment="${index}" aria-label="移除 ${escapeHtml(attachment.name)}">×</button></span>`).join('')
  els.attachmentPreview.querySelectorAll('[data-remove-attachment]').forEach(button => button.addEventListener('click', () => {
    state.pendingAttachments.splice(Number(button.dataset.removeAttachment), 1)
    renderPendingAttachments()
  }))
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}
function createDesktopAttachment(file, index = state.pendingAttachments.length + 1) {
  return { name: file.name || `剪贴板文件-${index}`, type: file.type || 'application/octet-stream', size: Number(file.size) || 0 }
}
async function readNativeSpreadsheetPreview(file) {
  const response = await apiFetch('/api/attachments/spreadsheet-preview', {
    method: 'POST',
    headers: {
      'content-type': file.type || 'application/octet-stream',
      'x-zt-attachment-name': encodeURIComponent(file.name || 'spreadsheet.xlsx'),
    },
    body: file,
  })
  const body = await readJson(response)
  if (!response.ok) throw new Error(body.error || '本机表格读取暂时不可用。')
  return String(body.text || '')
}
async function prepareDesktopAttachment(file, attachment = createDesktopAttachment(file)) {
  if (file.type?.startsWith('image/')) {
    if (file.size > 5_000_000) throw new Error(`${attachment.name} 超过 5MB，图片请压缩后再试。`)
    attachment.dataUrl = await fileToDataUrl(file)
  } else if (isPdfAttachment(file)) {
    attachment.text = await extractPdfText(file)
    if (!attachment.text) attachment.readError = '这个 PDF 没有可提取的文字，可能是扫描图片；请改传截图或图片。'
  } else if (isDocxAttachment(file) && file.size <= 20_000_000) {
    try { attachment.text = await extractDocxText(file) }
    catch (error) { attachment.readError = attachmentReadFailure(error) }
    if (!attachment.text && !attachment.readError) attachment.readError = '这个 Word 文档没有可提取的文字。'
  } else if (isSpreadsheetAttachment(file)) {
    const nativeReader = window.ztaiDesktop?.runtime === 'electron' ? readNativeSpreadsheetPreview : null
    try { attachment.text = await extractSpreadsheetText(file, { nativeReader }) }
    catch (error) { attachment.readError = attachmentReadFailure(error) }
    if (!attachment.text && !attachment.readError) attachment.readError = '这个 Excel 表格没有可读取的数据。'
  } else if (isTextAttachment(file) && file.size <= 2_000_000) {
    attachment.text = (await file.text()).slice(0, 20_000)
  } else {
    attachment.readError = '当前可直接读取图片、PDF、DOCX、Excel 和文本文件；已保留文件名，暂未解析此文件内容。'
  }
  return attachment
}
async function addFiles(files) {
  const incoming = Array.from(files || []).slice(0, Math.max(0, 4 - state.pendingAttachments.length))
  for (const file of incoming) {
    const attachment = createDesktopAttachment(file)
    attachment.loading = true
    state.pendingAttachments.push(attachment)
    renderPendingAttachments()
    try { await prepareDesktopAttachment(file, attachment) }
    catch (error) { attachment.readError = attachmentReadFailure(error); setNotice(error.message || '附件读取失败') }
    finally { attachment.loading = false; renderPendingAttachments() }
  }
}
function handleComposerPaste(event) {
  const items = filesFromDataTransfer(event.clipboardData)
  if (!items.length) return
  event.preventDefault(); event.stopPropagation()
  void addFiles(items)
}
function handleComposerDragOver(event) { if (!hasFilePayload(event.dataTransfer)) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; els.composer.classList.add('is-dragging') }
function handleComposerDragLeave(event) { if (!event.currentTarget.contains(event.relatedTarget)) els.composer.classList.remove('is-dragging') }
function handleComposerDrop(event) { const files = filesFromDataTransfer(event.dataTransfer); if (!files.length) return; event.preventDefault(); event.stopPropagation(); els.composer.classList.remove('is-dragging'); void addFiles(files) }
function redactSensitiveAttachmentText(value) {
  return String(value || '')
    .replace(/((?:api[_ -]?(?:key|token)|access[_ -]?token|secret|password|authorization)\s*(?:=|:)\s*)([^\r\n]+)/gi, '$1[已隐藏]')
    .replace(/((?:api[_ -]?(?:key|token)|access[_ -]?token|secret|password|authorization)\s*:\s*\r?\n)[^\r\n]+/gi, '$1[已隐藏]')
}
function buildAttachmentPrompt(task, attachments = []) {
  const attachmentNotes = attachments.map(item => {
    const header = '[附件：' + item.name + '，类型：' + (item.type || '未知') + '，大小：' + formatAttachmentSize(item.size) + ']'
    const text = redactSensitiveAttachmentText(item.text).trim()
    if (text) return header + '\n以下是已提取的内容，仅用于分析，不要在回答中逐字复述：\n' + text
    return item.readError ? header + '\n[读取说明：' + item.readError + ']' : header
  }).join('\n\n')
  return [task, attachmentNotes].filter(Boolean).join('\n\n')
}
function restoreLoginFields() {
  if (!els.authUsername) return
  els.authUsername.value = localStorage.getItem(REMEMBERED_USERNAME_KEY) || ''
  const rememberedPassword = localStorage.getItem(REMEMBERED_PASSWORD_KEY) || ''
  els.authPassword.value = rememberedPassword
  if (els.rememberLogin) els.rememberLogin.checked = Boolean(rememberedPassword)
}
function saveLoginFields() {
  const username = els.authUsername.value.trim()
  if (username) localStorage.setItem(REMEMBERED_USERNAME_KEY, username)
  else localStorage.removeItem(REMEMBERED_USERNAME_KEY)
  if (els.rememberLogin?.checked && els.authPassword.value) localStorage.setItem(REMEMBERED_PASSWORD_KEY, els.authPassword.value)
  else localStorage.removeItem(REMEMBERED_PASSWORD_KEY)
}
function persistChats() {
  if (!state.accountId) return
  const keys = storageKeys()
  const durable = state.chatSessions.slice(0, 30).map(conversation => ({ ...conversation, messages: conversation.messages.map(message => ({ ...message, attachments: Array.isArray(message.attachments) ? message.attachments.map(({ dataUrl, text, ...metadata }) => metadata) : message.attachments })) }))
  localStorage.setItem(keys.chats, JSON.stringify(durable))
  localStorage.setItem(keys.active, state.activeChatId)
  void apiFetch('/api/conversations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conversations: durable }) }).catch(() => {})
}
function compactLegacyAttachmentMessages(conversations) {
  return normalizeConversations(conversations).map(conversation => ({
    ...conversation,
    messages: conversation.messages.map(message => {
      if (message.role !== 'user' || !message.attachments?.length) return message
      const attachmentStart = message.content.indexOf('\n[附件：')
      if (attachmentStart < 0) return message
      return { ...message, content: message.content.slice(0, attachmentStart).trim() || '已发送附件' }
    }),
  }))
}
function initChatState() {
  if (!state.accountId) { state.chatSessions = []; state.activeChatId = ''; return }
  const keys = storageKeys()
  let stored = null
  try { stored = JSON.parse(localStorage.getItem(keys.chats) || 'null') } catch { stored = null }
  state.chatSessions = compactLegacyAttachmentMessages(stored)
  state.activeChatId = localStorage.getItem(keys.active) || ''
  if (!state.chatSessions.length) state.chatSessions = [createConversation(newChatId())]
  if (!state.chatSessions.some(item => item.id === state.activeChatId)) state.activeChatId = state.chatSessions[0].id
  state.navigation = createNavigationState(navigationSnapshot())
  renderNavigationControls()
  persistChats()
}
function appendAttachmentPreview(container, attachments = []) {
  if (!attachments.length) return
  const list = document.createElement('div'); list.className = 'attachment-preview'
  list.innerHTML = attachments.slice(0, 4).map(attachment => attachment.dataUrl
    ? `<a class="attachment-chip attachment-open" href="${escapeHtml(attachment.dataUrl)}" target="_blank" rel="noreferrer" title="打开 ${escapeHtml(attachment.name)}"><img src="${escapeHtml(attachment.dataUrl)}" alt="${escapeHtml(attachment.name)}"><span>${escapeHtml(attachment.name)}</span></a>`
    : `<span class="attachment-chip"><span class="attachment-file-icon" aria-hidden="true">▧</span><span>${escapeHtml(attachment.name)}</span></span>`).join('')
  container.appendChild(list)
}
function renderMessages() {
  const conversation = currentConversation()
  els.messages.innerHTML = ''
  if (!conversation) return
  for (const message of conversation.messages) appendMessage(message.role, message.content, false, message.attachments)
}
function recordChatMessage(role, content, chatId = state.activeChatId, extras = {}) {
  const conversation = state.chatSessions.find(item => item.id === chatId) || null
  if (!conversation) return
  const updated = addConversationMessage(conversation, { role, content, ...extras })
  state.chatSessions = state.chatSessions.map(item => item.id === updated.id ? updated : item)
  persistChats()
}
function markAgentContext(chatId = state.activeChatId) {
  state.chatSessions = state.chatSessions.map(conversation => conversation.id === chatId ? { ...conversation, agentContext: true } : conversation)
  persistChats()
}
function renderChatHistory() {
  const data = state.chatSessions.slice().sort((a, b) => b.updatedAt - a.updatedAt)
  els.history.innerHTML = data.map(item => `<button class="history-item ${item.id === state.activeChatId ? 'active' : ''}" data-chat-id="${escapeHtml(item.id)}"><strong>${escapeHtml(conversationTitle(item))}</strong><small>${new Date(item.updatedAt).toLocaleString()}</small></button>`).join('')
  els.history.querySelectorAll('[data-chat-id]').forEach(button => button.addEventListener('click', () => {
    state.activeChatId = button.dataset.chatId
    const run = currentTaskRun()
    state.taskId = run?.taskId || null
    state.activeAgentMessage = run?.activeAgentMessage || null
    state.activeAgentTask = run?.activeAgentTask || ''
    state.agentStream = run?.agentStream || null
    state.pendingApproval = run?.pendingApproval || null
    persistChats()
    renderMessages()
    renderChatHistory()
    if (state.pendingApproval) renderComposerApproval(state.pendingApproval)
    else hideInlineApproval()
    syncComposerWithActiveRun()
    rememberNavigation()
  }))
}
function startNewChat() {
  const conversation = createConversation(newChatId())
  state.chatSessions = prependConversation(state.chatSessions, conversation)
  state.activeChatId = conversation.id
  state.activeSkills = []
  state.pendingAttachments = []
  renderPendingAttachments()
  els.taskInput.value = ''
  els.taskInput.disabled = false
  els.run.disabled = false
  persistChats()
  renderMessages()
  renderChatHistory()
  resetExecution()
  state.taskId = null; state.reader = null; state.chatController = null; state.agentStream = null; state.activeAgentMessage = null; state.activeAgentTask = ''; state.pendingApproval = null
  syncComposerWithActiveRun()
  rememberNavigation()
  els.taskInput.focus()
}
function setStatus(value, className = '') { els.status.textContent = value; els.status.className = `status-badge ${className}` }
function addLog(text, kind = '') {
  const empty = els.log.querySelector('.empty-log'); if (empty) empty.remove()
  state.eventCount += 1; els.logCount.textContent = `${state.eventCount} events`
  const line = document.createElement('div'); line.className = `log-line ${kind}`; line.textContent = `[${new Date().toLocaleTimeString()}] ${displayText(text)}`; els.log.appendChild(line); els.log.scrollTop = els.log.scrollHeight
}
function renderContext() {
  const meter = contextMeter(state.model, state.usedTokens)
  const angle = Math.max(0, meter.percent)
  const gradient = `conic-gradient(var(--mint) 0 ${angle}%, #e8edef ${angle}% 100%)`
  ;[els.contextRing, els.contextRingLarge].forEach(element => { if (element) element.style.background = gradient })
  ;[els.contextPercent, els.contextPercentLarge].forEach(element => { if (element) element.textContent = `${meter.percent}%` })
  els.contextModel.textContent = meter.label
  els.contextUsed.textContent = `1M · ${formatTokens(meter.usedTokens)} used`
  els.contextUsedLarge.textContent = `${formatTokens(meter.usedTokens)} / 1M`
  els.contextRemaining.textContent = `剩余约 ${formatTokens(meter.remainingTokens)} tokens`
}
function setInspectorOpen(open) {
  state.inspectorOpen = Boolean(open)
  els.root.dataset.inspectorOpen = String(state.inspectorOpen)
  els.inspectorToggle?.setAttribute('aria-expanded', String(state.inspectorOpen))
  if (els.executionSummary) els.executionSummary.textContent = state.inspectorOpen ? '执行上下文已展开。' : '执行上下文已收起；可随时展开查看模型上下文、权限和设备状态。'
}
function setMode(_mode = 'BUDDY', { recordNavigation = true } = {}) {
  state.mode = 'BUDDY'; els.root.dataset.mode = 'BUDDY'
  els.railTitle.textContent = 'ZT.buddy'; els.railStatus.textContent = '本机执行工作区'
  els.conversationEyebrow.textContent = 'SMART EXECUTION CHAT'; els.conversationTitle.textContent = 'ZT.buddy 工作区'; els.conversationSubtitle.textContent = '自动判断 · 执行优先 · 继续上次上下文'
  els.taskInput.placeholder = '给 ZT.buddy 一个任务，或直接开始聊天……'
  if (state.chatSessions.length) renderChatHistory()
  renderContext()
  if (recordNavigation) rememberNavigation()
}
function appendMessage(role, content, streaming = false, attachments = []) {
  const row = document.createElement('div'); row.className = `message ${role === 'user' ? 'user-message' : 'assistant-message'}`
  const bubble = document.createElement('div'); bubble.className = 'bubble'
  if (role === 'assistant') { const label = document.createElement('div'); label.className = 'message-label'; label.textContent = 'ZT.AI'; bubble.appendChild(label) }
  const body = document.createElement('div'); body.className = 'message-body markdown-message'
  if (streaming) body.innerHTML = '<span class="typing-indicator" aria-label="ZT.AI 正在思考"><i></i><i></i><i></i></span>'
  else body.innerHTML = renderMarkdown(role === 'assistant' ? assistantText(content) : content || '')
  bubble.appendChild(body); appendAttachmentPreview(bubble, attachments); row.appendChild(bubble); els.messages.appendChild(row); els.messages.scrollTop = els.messages.scrollHeight
  return body
}

function appendAgentMessage(task, presentation, attachments = [], chatId = state.activeChatId) {
  const row = document.createElement('div'); row.className = 'message assistant-message agent-message'
  const bubble = document.createElement('div'); bubble.className = 'bubble agent-bubble'
  const label = document.createElement('div'); label.className = 'message-label'; label.textContent = 'ZT.BUDDY · EXECUTION'
  const status = document.createElement('div'); status.className = 'agent-statusline running'; status.innerHTML = `<span class="pulse"></span><span>${escapeHtml(presentation?.summary || '正在理解任务并规划执行步骤…')}</span>`
  const taskLine = document.createElement('div'); taskLine.className = 'agent-taskline'; taskLine.textContent = task
  const progress = document.createElement('div'); progress.className = 'agent-live-progress'; progress.setAttribute('aria-live', 'polite'); progress.textContent = '正在理解任务并准备执行…'
  const details = document.createElement('details'); details.className = 'execution-details'; details.open = false
  const detailsSummary = document.createElement('summary'); detailsSummary.textContent = executionDrawerPresentation({ status: 'running', elapsedMs: 0, stepCount: 0 }).label
  const detailBody = document.createElement('div'); detailBody.className = 'execution-detail-body'
  const plan = document.createElement('div'); plan.className = 'agent-plan-inline'
  const activity = document.createElement('div'); activity.className = 'agent-activity-inline'
  detailBody.append(plan, activity); details.append(detailsSummary, detailBody)
  const result = document.createElement('div'); result.className = 'agent-result-inline markdown-message'
  bubble.append(label, status, taskLine); appendAttachmentPreview(bubble, attachments); bubble.append(progress, details, result)
  row.appendChild(bubble); els.messages.appendChild(row); els.messages.scrollTop = els.messages.scrollHeight
  const live = { row, status, progress, details, detailsSummary, plan, activity, result, output: '', persisted: false, chatId, stepIds: new Set(), startedAt: Date.now() }
  state.activeAgentMessage = live
  return live
}

function setAgentStatus(text, kind = 'running') {
  const live = state.activeAgentMessage
  if (!live) return
  live.status.className = `agent-statusline ${kind}`
  live.status.innerHTML = `<span class="pulse"></span><span>${escapeHtml(text)}</span>`
  els.messages.scrollTop = els.messages.scrollHeight
}

function renderInlinePlan(steps = []) {
  const live = state.activeAgentMessage
  if (!live) return
  live.stepIds = new Set(steps.map(step => step.id).filter(Boolean))
  live.plan.innerHTML = steps.map((step, index) => `<div class="inline-plan-step" data-step="${escapeHtml(step.id)}"><span>${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(displayText(step.label, '执行步骤'))}</strong><small>${escapeHtml(displayText(step.tool, '工具'))} · ${escapeHtml(displayText(step.capability, '按需授权'))}</small></div>`).join('')
  els.messages.scrollTop = els.messages.scrollHeight
}

function markInlineStep(id, stateName) {
  const live = state.activeAgentMessage
  const step = live?.plan.querySelector(`[data-step="${CSS.escape(id)}"]`)
  if (!step) return
  step.classList.toggle('active', stateName === 'active')
  step.classList.toggle('done', stateName === 'done')
}

function addInlineActivity(text, kind = '') {
  const live = state.activeAgentMessage
  if (!live) return
  live.progress.textContent = displayText(String(text || '正在继续执行…').replace(/\s+/g, ' '), '正在继续执行…')
  live.progress.classList.toggle('is-running', kind !== 'result')
  const line = document.createElement('div'); line.className = `inline-activity-line ${kind}`; line.textContent = displayText(text)
  live.activity.appendChild(line); live.activity.scrollTop = live.activity.scrollHeight; els.messages.scrollTop = els.messages.scrollHeight
}

function showInlineApproval(data) {
  const live = state.activeAgentMessage
  if (!live) return
  state.pendingApproval = data
  renderComposerApproval(data)
  setAgentStatus('等待你确认本机执行权限…', 'waiting')
  addInlineActivity(`等待确认：${data.capabilityLabel || data.label}`, 'warning')
}

function renderComposerApproval(data, { pending = false, error = '' } = {}) {
  if (!els.composerApproval) return
  els.composerApproval.classList.remove('hidden')
  const title = error || (pending ? '已授权，正在继续执行…' : `${data.capabilityLabel || data.label} · 需要确认`)
  const preview = pending ? '正在把这次授权交给正在运行的任务。' : (data.preview || data.label || '该操作需要你的确认。')
  els.composerApproval.innerHTML = `<div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(preview)}</small></div><div class="composer-approval-actions"><button type="button" data-composer-approval="once" ${pending ? 'disabled' : ''}>${pending ? '处理中…' : '允许一次'}</button><button type="button" data-composer-approval="always" ${pending ? 'disabled' : ''}>记住权限</button><button type="button" data-composer-approval="reject" ${pending ? 'disabled' : ''}>拒绝</button></div>`
  if (!pending) {
    els.composerApproval.querySelector('[data-composer-approval="once"]').addEventListener('click', () => approve(false))
    els.composerApproval.querySelector('[data-composer-approval="always"]').addEventListener('click', () => approve(true))
    els.composerApproval.querySelector('[data-composer-approval="reject"]').addEventListener('click', reject)
  }
}

function hideInlineApproval() {
  if (els.composerApproval) { els.composerApproval.classList.add('hidden'); els.composerApproval.innerHTML = '' }
  state.pendingApproval = null
}

function persistAgentMessage(live, summary) {
  if (!live || live.persisted) return
  live.output = assistantText(summary || live.output || '本机执行已完成。') || '本机执行已完成。'
  recordChatMessage('assistant', live.output, live.chatId)
  live.persisted = true
  renderChatHistory()
}

function completeAgentMessage(summary, status = 'done', live = state.activeAgentMessage) {
  if (!live) return
  live.output = assistantText(summary || live.output || '本机执行已完成。') || '本机执行已完成。'
  live.progress.classList.remove('is-running')
  live.progress.textContent = status === 'done' ? '执行完成 · 点击查看执行详情' : '执行已停止 · 点击查看执行详情'
  live.result.innerHTML = renderMarkdown(live.output)
  live.result.classList.add('is-visible')
  live.status.className = `agent-statusline ${status === 'done' ? 'done' : 'error'}`
  live.status.innerHTML = `<span class="pulse"></span><span>${escapeHtml(status === 'done' ? '任务已完成' : `任务${status === 'blocked' ? '已暂停' : '执行失败'}`)}</span>`
  if (state.activeAgentMessage === live) hideInlineApproval()
  const view = executionDrawerPresentation({ status, elapsedMs: Date.now() - live.startedAt, stepCount: live.stepIds.size })
  live.details.open = view.open
  live.detailsSummary.textContent = view.label
  persistAgentMessage(live, live.output)
  if (state.activeAgentMessage === live) els.messages.scrollTop = els.messages.scrollHeight
}
function offerTaskRetry(live, task) {
  if (!live?.result || !task || live.retry) return
  const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'execution-log-toggle'; retry.textContent = '重新尝试'
  retry.addEventListener('click', () => { els.taskInput.value = task; els.taskInput.focus() })
  live.result.after(retry)
  live.retry = retry
}
function resetExecution() {
  state.taskId = null; state.eventCount = 0; if (els.taskId) els.taskId.textContent = 'READY'; if (els.title) els.title.textContent = '等待新的任务'; if (els.status) setStatus('IDLE')
  if (els.plan) els.plan.innerHTML = '<div class="empty-state"><span class="empty-mark">◎</span><p>任务开始后，执行计划会出现在这里。</p></div>'
  if (els.log) els.log.innerHTML = '<div class="empty-log">等待工具调用…</div>'
  if (els.logCount) els.logCount.textContent = '0 events'
  if (els.resultPanel) els.resultPanel.classList.add('hidden')
  if (els.resultText) els.resultText.textContent = ''
  hideApproval()
}
function renderPlan(steps) { els.plan.innerHTML = steps.map((step, index) => `<div class="plan-step" data-step="${escapeHtml(step.id)}"><span class="step-index">${String(index + 1).padStart(2, '0')}</span><div><strong>${escapeHtml(displayText(step.label, '执行步骤'))}</strong><small>${escapeHtml(displayText(step.tool, '工具'))}</small></div><span class="step-cap">${escapeHtml(displayText(step.capability, '按需授权'))}</span></div>`).join('') }
function markStep(id, stateName) { const step = els.plan.querySelector(`[data-step="${CSS.escape(id)}"]`); if (step) { step.classList.toggle('active', stateName === 'active'); step.classList.toggle('done', stateName === 'done') } }
function showApproval(data) {
  state.pendingApproval = data
  els.approvalTitle.textContent = displayText(data.capabilityLabel || data.label, '需要你的确认')
  els.approvalPreview.textContent = displayText(data.preview || data.label, '该操作需要你的确认。')
  els.approval.classList.remove('hidden')
  setStatus('WAITING', 'waiting')
  addLog(`等待批准：${displayText(data.label)}`, 'warning')
  requestAnimationFrame(() => els.composerApproval?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
}
function hideApproval() { state.pendingApproval = null; els.approval.classList.add('hidden') }
async function readJson(response) { const text = await response.text(); try { return JSON.parse(text) } catch { return { error: text } } }
async function apiFetch(path, options = {}) { const headers = { ...(options.headers || {}), 'x-zt-agent-secret': state.localSecret }; if (state.authToken) headers.authorization = `Bearer ${state.authToken}`; return fetch(path, { ...options, headers }) }
function showAuthError(message = '') { els.authError.textContent = message }
function setAuthStatus(message = '') { if (els.authStatus) els.authStatus.textContent = message }
function setAuthPending(pending) {
  const view = authPresentation({ registering: state.registering, pending })
  els.authForm.setAttribute('aria-busy', String(view.busy))
  els.authSubmit.disabled = view.busy
  els.authSubmit.classList.toggle('is-loading', view.busy)
  els.authSubmit.innerHTML = `${view.busy ? '<span class="auth-spinner" aria-hidden="true"></span>' : ''}<span>${view.button}</span>`
  els.authUsername.disabled = view.busy
  els.authPassword.disabled = view.busy
  if (els.rememberLogin) els.rememberLogin.disabled = view.busy
  els.authToggle.disabled = view.busy
  setAuthStatus(view.status)
}
function showWorkspace() { els.authGate.classList.add('hidden'); els.taskInput.disabled = false; els.accountLabel.textContent = 'ACCOUNT ACTIVE'; setAuthPending(false) }
function showLogin() { els.authGate.classList.remove('hidden'); els.authLoginView.classList.remove('hidden'); els.authRegisterView.classList.add('hidden'); els.taskInput.disabled = true; showAuthError(''); if (els.registerError) els.registerError.textContent = ''; restoreLoginFields(); setAuthPending(false) }
function showRegister() { els.authGate.classList.remove('hidden'); els.authLoginView.classList.add('hidden'); els.authRegisterView.classList.remove('hidden'); els.registerError.textContent = ''; els.registerStatus.textContent = ''; els.registerUsername.focus() }
function setAccount(user) {
  state.accountId = String(user?.id || '')
  if (state.accountId) localStorage.setItem('zt-ai:desktop-account-id', state.accountId)
  else localStorage.removeItem('zt-ai:desktop-account-id')
  initChatState()
  renderMessages()
  renderChatHistory()
}
function describeNetworkError(error, action = '连接 ZT.AI 网关') { const message = String(error?.message || error || ''); return /failed to fetch|networkerror|load failed/i.test(message) ? `${action}失败：当前无法访问 ${state.gatewayUrl || 'ZT.AI 网关'}，请确认网络正常或稍后重试。` : message || `${action}失败` }

async function submitAuth(event) {
  event.preventDefault(); showAuthError(''); saveLoginFields(); setAuthPending(true)
  try {
    const response = await fetch(`${state.gatewayUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: els.authUsername.value.trim(), password: els.authPassword.value }) })
    const body = await readJson(response)
    if (!response.ok) throw new Error(body.error || '登录失败')
    if (!body.token) throw new Error('登录响应缺少账户凭证')
    state.authToken = body.token
    localStorage.setItem('zt-ai:desktop-token', state.authToken)
    els.authPassword.value = ''
    setAccount(body.user)
    showWorkspace()
    await refreshState()
  } catch (error) { showAuthError(describeNetworkError(error, '登录账户')) } finally { setAuthPending(false) }
}
async function submitRegistration(event) {
  event.preventDefault(); els.registerError.textContent = ''; els.registerStatus.textContent = ''
  if (!els.registerForm.reportValidity()) return
  els.registerSubmit.disabled = true; els.registerSubmit.classList.add('is-loading'); els.registerSubmit.innerHTML = '<span class="auth-spinner" aria-hidden="true"></span><span>正在提交注册…</span>'
  try {
    const response = await fetch(`${state.gatewayUrl}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: els.registerUsername.value.trim(), phone: els.authPhone.value.trim(), email: els.authEmail.value.trim(), password: els.registerPassword.value }) })
    const body = await readJson(response)
    if (!response.ok) throw new Error(body.error || '注册失败')
    localStorage.setItem(REMEMBERED_USERNAME_KEY, els.registerUsername.value.trim())
    localStorage.removeItem(REMEMBERED_PASSWORD_KEY)
    if (els.rememberLogin) els.rememberLogin.checked = false
    els.authUsername.value = els.registerUsername.value.trim()
    els.registerPassword.value = ''; els.authPhone.value = ''; els.authEmail.value = ''; els.authPassword.value = ''
    showLogin(); setAuthStatus('注册申请已提交，请等待管理员审核通过后再登录。')
  } catch (error) { els.registerError.textContent = describeNetworkError(error, '提交注册申请') } finally { els.registerSubmit.disabled = false; els.registerSubmit.classList.remove('is-loading'); els.registerSubmit.innerHTML = '<span>提交注册申请</span>' }
}
async function logout() { if (state.authToken) await fetch(`${state.gatewayUrl}/api/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${state.authToken}` } }).catch(() => {}); state.authToken = ''; localStorage.removeItem('zt-ai:desktop-token'); setAccount(null); showLogin() }

async function consumeSse(response, onEvent, { signal, run } = {}) {
  if (!response.ok || !response.body) { const body = await readJson(response); throw new Error(body.error || `请求失败（${response.status}）`) }
  const reader = response.body.getReader(); if (run) run.reader = reader; const decoder = new TextDecoder(); let buffer = ''
  const cancelReader = () => { void reader.cancel().catch(() => {}) }
  if (signal) { if (signal.aborted) cancelReader(); else signal.addEventListener('abort', cancelReader, { once: true }) }
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const chunks = buffer.split(/\r?\n\n/); buffer = chunks.pop() || ''; for (const chunk of chunks) { const eventLine = chunk.split(/\r?\n/).find(line => line.startsWith('event:')); const dataLine = chunk.split(/\r?\n/).find(line => line.startsWith('data:')); if (!eventLine || !dataLine) continue; let data = {}; try { data = JSON.parse(dataLine.slice(5).trim()) } catch { continue } onEvent(eventLine.slice(6).trim(), data) } }
  } finally { signal?.removeEventListener('abort', cancelReader); if (run?.reader === reader) run.reader = null }
}

function buddyCapabilityAnswer(input) {
  const text = String(input || '').trim()
  const mentionsBuddy = (/(zt\s*\.?\s*buddy)/i.test(text) || /^(你|你都|这个|它).*(能|可以).*(做什么|干什么|功能)/i.test(text))
  const asksAboutCapabilities = /(是什么|能(?:为我|帮我)?做什么|能做哪些|能干什么|可以做什么|可以帮我什么|有什么功能|怎么使用|怎么用)/i.test(text)
  if (!mentionsBuddy || !asksAboutCapabilities) return ''
  return 'ZT.buddy 是 ZT.AI 的桌面执行型协作 Agent，不只是聊天。它可以在你授权的当前工作区里：\n\n- 检查项目文件、定位问题并解释结果；\n- 修改代码、整理文件、运行测试或构建；\n- 检索公开资料并返回来源；\n- 把重复工作整理成可复用的流程和工具。\n\n涉及读取、写入、命令或联网时，我会先按权限执行；高风险操作会在执行前请求你的确认。你可以直接告诉我目标，例如“检查这个项目并找出启动问题”或“整理工作区里的安装包”。'
}

async function runChat({ agent = false, localAnswer = '' } = {}) {
  if (state.pendingAttachments.some(attachment => attachment.loading)) { setNotice('附件仍在读取，完成后再发送。'); return }
  const task = els.taskInput.value.trim(); if (!task || els.run.disabled) return
  const attachments = state.pendingAttachments.slice()
  const chatId = state.activeChatId
  const conversation = currentConversation()
  const chatIntent = classifyIntent(task, { mode: 'CHAT', hasAgentContext: conversation?.agentContext === true })
  const requiresResearch = chatIntent.route === 'agent' && chatIntent.kind === 'research'
  const taskForModel = buildAttachmentPrompt(task, attachments)
  recordChatMessage('user', task, chatId, { attachments }); state.pendingAttachments = []; renderPendingAttachments(); renderMessages(); els.taskInput.value = ''; els.taskInput.disabled = true; els.run.disabled = true
  const body = appendMessage('assistant', '', true)
  const controller = new AbortController()
  const run = state.taskRuns.create(chatId, { kind: 'chat', task, controller, agentStream: null })
  run.activeAgentMessage = { row: body.parentElement?.parentElement || null, output: '', chatId }
  const smooth = createSmoothStream({ onUpdate: output => { run.output = output; if (state.activeChatId !== chatId) return; body.innerHTML = renderMarkdown(assistantText(output)); els.messages.scrollTop = els.messages.scrollHeight; state.usedTokens += 1; renderContext() } })
  run.agentStream = smooth
  if (state.activeChatId === chatId) state.agentStream = smooth
  const timeout = window.setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS)
  const slowNotice = window.setTimeout(() => { if (state.agentStream === smooth) setNotice('模型响应较慢，仍在等待结果；如果超过 45 秒会自动结束并允许重试。') }, CHAT_SLOW_NOTICE_MS)
  if (state.activeChatId === chatId) state.chatController = controller
  try {
    const activeConversation = state.chatSessions.find(item => item.id === chatId) || null
    const messages = (activeConversation?.messages || [{ role: 'user', content: task }]).map(message => ({ ...message }))
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === 'user') {
        messages[index].content = messageContentWithImages(taskForModel, attachments)
        break
      }
    }
    if (localAnswer) {
      smooth.push(localAnswer)
    } else {
      const payload = { task, model: state.model === 'DEEPSEEK' ? 'deepseek' : 'minimax', language: 'zh', skills: state.activeSkills.map(skill => skill.name), visitorId: `desktop-${state.accountId || 'guest'}`, conversationId: chatId, messages }
      let response
      if (requiresResearch) {
        setNotice('正在联网核验公开信息…')
        response = await apiFetch('/api/chat/research', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal })
      } else {
        const headers = { 'content-type': 'application/json' }
        if (agent && state.authToken) headers.authorization = `Bearer ${state.authToken}`
        const endpoint = agent ? '/api/agent/chat' : '/api/chat'
        response = await fetch(`${state.gatewayUrl}${endpoint}`, { method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal })
      }
      await consumeSse(response, (event, data) => { if (event === 'message.delta') smooth.push(data.text || ''); if (event === 'message.error') smooth.push(conversationFailurePresentation(data.message)) }, { signal: controller.signal, run })
      if (controller.signal.aborted) throw new DOMException('聊天请求超时', 'AbortError')
    }
    smooth.finish()
    const output = assistantText(await smooth.done)
    recordChatMessage('assistant', output, chatId)
  } catch (error) {
    const message = error?.name === 'AbortError' ? '这次回答等待超时了，网关没有及时返回结果。消息已保留，你可以直接重试。' : describeNetworkError(error, '发送消息')
    smooth.push(message); smooth.finish(); const output = assistantText(await smooth.done); recordChatMessage('assistant', output, chatId)
  } finally {
    window.clearTimeout(timeout); window.clearTimeout(slowNotice)
    if (state.chatController === controller) state.chatController = null
    run.finished = true; state.taskRuns.delete(chatId)
    if (state.activeChatId === chatId) { state.reader = null; state.agentStream = null; els.taskInput.disabled = false; els.run.disabled = false; renderChatHistory(); els.taskInput.focus() }
  }
}
function handleAgentEvent(run, event, data) {
  if (!isVisibleTaskRun(run)) {
    if (event === 'task.start') run.taskId = data.id
    if (event === 'agent.delta') run.output += String(data.text || '')
    if (event === 'approval.required') run.pendingApproval = data
    if (event === 'task.error') run.output = displayText(data.message, '任务暂时没有完成，请检查设备授权或网关连接后重试。')
    if (event === 'task.done') {
      run.finished = true
      recordChatMessage('assistant', data.summary || run.output || '本机执行已完成。', run.chatId)
      renderChatHistory()
      if (state.activeChatId === run.chatId) renderMessages()
    }
    return
  }
  if (event === 'task.start') {
    run.taskId = data.id; state.taskId = data.id
    if (els.taskId) els.taskId.textContent = data.id.slice(0, 8).toUpperCase()
    if (els.title) els.title.textContent = data.task
    setAgentStatus('任务已接收，正在准备执行…', 'running')
    setStatus('RUNNING', 'running')
    addInlineActivity(`任务开始 · ${data.model} · 执行模式`, 'tool')
  } else if (event === 'plan.ready') {
    renderInlinePlan(data.steps || [])
    renderPlan(data.steps || [])
    setAgentStatus('执行计划已生成，正在按步骤推进…', 'running')
    addInlineActivity(`已拆解 ${data.steps?.length || 0} 个执行步骤`, 'tool')
  } else if (event === 'tool.start') {
    markInlineStep(data.id, 'active'); markStep(data.id, 'active')
    addInlineActivity(`调用 ${displayText(data.label, '工具')} · ${displayText(data.capability, '执行工具')}`, 'tool')
    addLog(`调用 ${displayText(data.label, '工具')} · ${displayText(data.capability, '执行工具')}`, 'tool')
  } else if (event === 'tool.progress') {
    addInlineActivity(data.message || '正在继续执行…', 'tool')
    addLog(data.message || '正在继续执行…', 'tool')
  } else if (event === 'tool.result') {
    markInlineStep(data.id, 'done'); markStep(data.id, 'done')
    addInlineActivity(displayText(data.result, '工具已返回结果'), 'result')
    addLog(displayText(data.result, '工具已返回结果'), 'result')
  } else if (event === 'approval.required') {
    showInlineApproval(data); showApproval(data)
  } else if (event === 'agent.start') {
    if (!run.agentStream) { const streamMessage = run.activeAgentMessage; run.agentStream = createSmoothStream({ onUpdate: output => { if (streamMessage) { streamMessage.output = assistantText(output); streamMessage.result.innerHTML = renderMarkdown(streamMessage.output); streamMessage.result.classList.add('is-visible'); if (state.activeAgentMessage === streamMessage) els.messages.scrollTop = els.messages.scrollHeight } } }); state.agentStream = run.agentStream }
    setAgentStatus('执行步骤已完成，正在整理结果…', 'running')
    addInlineActivity(`正在用 ${data.model} 汇总执行结果`, 'tool')
  } else if (event === 'agent.delta') {
    if (!run.agentStream) { const streamMessage = run.activeAgentMessage; run.agentStream = createSmoothStream({ onUpdate: output => { if (streamMessage) { streamMessage.output = assistantText(output); streamMessage.result.innerHTML = renderMarkdown(streamMessage.output); streamMessage.result.classList.add('is-visible'); if (state.activeAgentMessage === streamMessage) els.messages.scrollTop = els.messages.scrollHeight } } }); state.agentStream = run.agentStream }
    run.agentStream.push(data.text || '')
  } else if (event === 'agent.warning') {
    addInlineActivity(displayText(data.message, '执行提示'), 'warning'); addLog(displayText(data.message, '执行提示'), 'warning')
  } else if (event === 'task.blocked') {
    setStatus('BLOCKED', 'blocked'); addInlineActivity(data.reason, 'warning'); setAgentStatus('任务已暂停，等待后续操作…', 'error'); hideApproval(); hideInlineApproval(); completeAgentMessage(data.reason, 'blocked', run.activeAgentMessage)
  } else if (event === 'task.error') {
    const message = displayText(data.message, '任务暂时没有完成，请检查设备授权或网关连接后重试。')
    setStatus('ERROR', 'error'); addLog(displayText(data.message, '任务执行失败'), 'warning'); addInlineActivity('执行没有完成，已保留原任务。', 'warning'); setAgentStatus(message, 'error'); completeAgentMessage(message, 'error', run.activeAgentMessage); offerTaskRetry(run.activeAgentMessage, run.activeAgentTask)
  } else if (event === 'task.done') {
    const completedMessage = run.activeAgentMessage || state.activeAgentMessage
    const completedStream = run.agentStream
    if (data.summary) persistAgentMessage(completedMessage, data.summary)
    if (completedStream) { completedStream.finish(); void completedStream.done.then(output => { const summary = data.summary || output; completeAgentMessage(summary, data.status, completedMessage); if (state.agentStream === completedStream) state.agentStream = null; run.finished = true }) } else { completeAgentMessage(data.summary, data.status, completedMessage); run.finished = true }
    setStatus(data.status === 'done' ? 'DONE' : data.status.toUpperCase(), data.status === 'done' ? 'done' : 'blocked')
    hideApproval(); hideInlineApproval(); refreshState()
  }
}

async function runAgentTask() {
  if (state.pendingAttachments.some(attachment => attachment.loading)) { setNotice('附件仍在读取，完成后再发送。'); return }
  const task = els.taskInput.value.trim(); if (!task || els.run.disabled) return
  const conversation = currentConversation()
  const intent = classifyIntent(task, { mode: state.mode, hasAgentContext: conversation?.agentContext === true })
  const presentation = executionPresentation(intent)
  if (intent.route === 'chat') {
    const request = runChat({ agent: true, localAnswer: buddyCapabilityAnswer(task) })
    setNotice(presentation.summary)
    return request
  }
  const attachments = state.pendingAttachments.slice()
  const taskForModel = buildAttachmentPrompt(task, attachments)
  markAgentContext(state.activeChatId)
  recordChatMessage('user', task, state.activeChatId, { attachments }); state.pendingAttachments = []; renderPendingAttachments(); renderMessages(); renderChatHistory(); els.taskInput.value = ''
  const live = appendAgentMessage(task, presentation, attachments, state.activeChatId)
  const chatId = state.activeChatId
  const run = state.taskRuns.create(chatId, { kind: 'agent', task, activeAgentMessage: live, activeAgentTask: task })
  state.activeAgentTask = task
  resetExecution()
  state.activeAgentMessage = live
  els.taskInput.disabled = true; els.run.disabled = true
  try {
    const response = await apiFetch('/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json', 'x-zt-conversation-id': chatId }, body: JSON.stringify({ task: taskForModel, model: state.model, accountToken: state.authToken, continuation: intent.kind === 'followup', attachments: attachments.map(({ name, type, size }) => ({ name, type, size })) }) })
    await consumeSse(response, (event, data) => handleAgentEvent(run, event, data), { run })
  } catch (error) {
    const rawMessage = describeNetworkError(error, '执行任务')
    const message = rawMessage || '任务暂时没有完成，请检查设备授权或网关连接后重试。'
    run.output = message
    if (isVisibleTaskRun(run)) {
      addLog(rawMessage, 'warning'); addInlineActivity('执行连接失败，已保留原任务。', 'warning'); setAgentStatus(message, 'error'); completeAgentMessage(message, 'error', live); setStatus('ERROR', 'error')
      offerTaskRetry(live, task)
    } else {
      recordChatMessage('assistant', message, chatId)
      renderChatHistory()
    }
  } finally {
    run.finished = true; state.taskRuns.delete(chatId)
    if (state.activeChatId === chatId) { state.reader = null; els.taskInput.disabled = false; els.run.disabled = false; els.taskInput.focus() }
  }
}
async function approve(remember) {
  if (!state.taskId || !state.pendingApproval) return
  const approval = state.pendingApproval
  const { capability } = approval
  renderComposerApproval(approval, { pending: true })
  setAgentStatus('已授权，正在继续执行…', 'running')
  addInlineActivity(remember ? `已记住 ${approval.capabilityLabel || capability}，正在继续执行…` : '已授权，正在继续执行…', 'result')
  try {
    const response = await apiFetch(`/api/tasks/${state.taskId}/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ capability, permissionId: approval.permissionId, remember }) })
    const body = await readJson(response)
    if (!response.ok) throw new Error(body.error || '批准失败')
    addLog(remember ? `已记住权限：${capability}` : `已允许一次：${capability}`, 'result')
    hideApproval(); hideInlineApproval()
  } catch (error) {
    addLog(error.message || '批准失败', 'warning')
    renderComposerApproval(approval, { error: '授权暂未成功，请重试' })
    setAgentStatus('授权暂未成功，请重试。', 'waiting')
  }
}
async function reject() {
  if (!state.taskId || !state.pendingApproval) return
  const approval = state.pendingApproval
  renderComposerApproval(approval, { pending: true })
  try {
    const response = await apiFetch(`/api/tasks/${state.taskId}/reject`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: '用户拒绝了这一步' }) })
    const body = await readJson(response)
    if (!response.ok) throw new Error(body.error || '拒绝失败')
    hideApproval(); hideInlineApproval()
    setAgentStatus('已拒绝该操作，任务已暂停。', 'error')
  } catch (error) {
    addLog(error.message || '拒绝失败', 'warning')
    renderComposerApproval(approval, { error: '操作暂未提交，请重试' })
  }
}
async function updatePermission(capability, enabled) { const response = await apiFetch('/api/permissions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ capability, enabled }) }); const body = await readJson(response); if (!response.ok) addLog(body.error || '权限更新失败', 'warning'); else addLog(`${enabled ? '已开启' : '已关闭'}权限：${capability}`, enabled ? 'warning' : '') }
async function updateAuthorization() { const response = await apiFetch('/api/authorization', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ authorized: true }) }); const body = await readJson(response); if (!response.ok) { addLog(body.error || '本机授权失败', 'warning'); return } addLog('已确认：Agent 只可在当前设备执行', 'result'); refreshState() }
async function refreshState() {
  try {
    const response = await apiFetch('/api/state'); if (response.status === 401) { await logout(); return }
    const data = await response.json()
    if (Array.isArray(data.conversations)) {
      state.chatSessions = compactLegacyAttachmentMessages(mergeServerConversations(state.chatSessions, data.conversations))
      if (!state.chatSessions.some(item => item.id === state.activeChatId)) state.activeChatId = state.chatSessions[0]?.id || ''
      persistChats(); renderMessages()
    }
    renderChatHistory()
    if (els.workspaceShort) els.workspaceShort.textContent = data.workspaceRoot
    if (els.gatewayStatus) els.gatewayStatus.textContent = `本机已连接 · ${data.mode === 'execute' ? '执行模式' : '待机'}`
    const authorized = data.deviceAuthorization?.authorized === true
    if (els.authorizationStatus) els.authorizationStatus.textContent = authorized ? `已确认本机 · ${new Date(data.deviceAuthorization.authorizedAt).toLocaleString()}` : '尚未确认本机执行'
    if (els.authorize) { els.authorize.textContent = authorized ? '已确认' : '确认这台设备'; els.authorize.disabled = authorized }
    document.querySelectorAll('[data-capability]').forEach(input => { const needsDevice = ['workspace_write', 'command_exec', 'full_access'].includes(input.dataset.capability); if (needsDevice) input.disabled = !authorized; if (data.permissions[input.dataset.capability] !== undefined) input.checked = data.permissions[input.dataset.capability] })
  } catch (error) { if (els.gatewayStatus) els.gatewayStatus.textContent = '本机 Agent 未连接'; if (els.log) addLog(error.message, 'warning') }
}
function isDrawerVisible(drawer) { return Boolean(drawer && !drawer.classList.contains('hidden') && !drawer.classList.contains('is-closing')) }
function setDrawerVisible(drawer, visible) {
  if (!drawer) return
  const pendingClose = drawerCloseTimers.get(drawer)
  if (pendingClose) { clearTimeout(pendingClose); drawerCloseTimers.delete(drawer) }
  if (visible) {
    drawer.classList.remove('hidden', 'is-closing')
    drawer.setAttribute('aria-hidden', 'false')
    drawer.classList.add('is-opening')
    requestAnimationFrame(() => { if (!drawer.classList.contains('hidden')) drawer.classList.remove('is-opening') })
    return
  }
  if (drawer.classList.contains('hidden')) return
  drawer.classList.remove('is-opening')
  drawer.classList.add('is-closing')
  drawer.setAttribute('aria-hidden', 'true')
  drawerCloseTimers.set(drawer, setTimeout(() => {
    drawer.classList.add('hidden')
    drawer.classList.remove('is-closing')
    drawerCloseTimers.delete(drawer)
  }, DRAWER_TRANSITION_MS))
}
function closeDrawer(drawer = null) {
  const drawers = drawer ? [drawer] : [els.toolDrawer, els.permissionDrawer]
  drawers.forEach(item => setDrawerVisible(item, false))
  if (!drawer || drawer === els.toolDrawer) els.toolTrigger.classList.remove('active')
  if (!drawer || drawer === els.permissionDrawer) els.permissionTrigger.classList.remove('active')
}
function openToolDrawer() {
  closeDrawer(els.permissionDrawer)
  setDrawerVisible(els.toolDrawer, true)
  els.toolTrigger.classList.add('active')
}
function openPermissionDrawer(section = 'permissions') {
  closeDrawer(els.toolDrawer)
  setDrawerVisible(els.permissionDrawer, true)
  els.permissionTrigger.classList.add('active')
  document.querySelector(`#permission-drawer [data-drawer-section="${section}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}
function toggleDrawer() { isDrawerVisible(els.toolDrawer) ? closeDrawer(els.toolDrawer) : openToolDrawer() }
function renderSkillBrowser(skills = []) {
  if (!els.skillBrowser) return
  if (!skills.length) { els.skillBrowser.innerHTML = '<div class="skill-empty">没有扫描到可用的本地 Skill</div>'; return }
  els.skillBrowser.innerHTML = `<div class="skill-browser-head"><strong>本机 Skills</strong><button id="skill-back" type="button">返回工具</button></div>${skills.map(skill => `<button class="skill-reference" type="button" data-skill-id="${escapeHtml(skill.id)}"><strong>${escapeHtml(skill.name)}</strong><small>${escapeHtml(skill.description)}</small></button>`).join('')}`
  $('#skill-back')?.addEventListener('click', () => { els.skillBrowser.classList.add('hidden') })
  els.skillBrowser.querySelectorAll('.skill-reference').forEach(button => button.addEventListener('click', () => {
    const skill = skills.find(item => item.id === button.dataset.skillId)
    if (!skill) return
    if (!state.activeSkills.some(item => item.id === skill.id)) state.activeSkills.push(skill)
    const reference = `@${skill.name}`
    if (!els.taskInput.value.includes(reference)) els.taskInput.value = `${els.taskInput.value.trim()} ${reference}`.trimStart() + ' '
    closeDrawer(); els.skillBrowser.classList.add('hidden'); els.taskInput.focus()
  }))
}
async function showSkillBrowser() {
  if (!els.skillBrowser) return
  els.skillBrowser.classList.remove('hidden')
  els.skillBrowser.innerHTML = '<div class="skill-empty">正在扫描本机 Skills…</div>'
  try { const response = await apiFetch('/api/skills'); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Skill 扫描失败'); renderSkillBrowser(body.skills || []) } catch (error) { els.skillBrowser.innerHTML = `<div class="skill-empty">${escapeHtml(error.message)}</div>` }
}
function toolAction(tool) { if (tool === 'file') { els.fileInput?.click(); return } setNotice(`${tool} 已加入当前对话工具范围`) }
function setNotice(text) { const body = appendMessage('assistant', text); body.closest('.message')?.classList.add('system-message'); setTimeout(() => body.closest('.message')?.remove(), 3500) }

els.sidebarToggle?.addEventListener('click', () => setRailCollapsed(!state.railCollapsed))
els.appBack?.addEventListener('click', () => { state.navigation = goBack(state.navigation); applyNavigationSnapshot(state.navigation.current) })
els.appForward?.addEventListener('click', () => { state.navigation = goForward(state.navigation); applyNavigationSnapshot(state.navigation.current) })
els.modelSelect.addEventListener('change', () => { state.model = normalizeModel(els.modelSelect.value); localStorage.setItem('zt-ai:agent-model', state.model); renderContext() })
els.toolTrigger.addEventListener('click', toggleDrawer); $('#drawer-close')?.addEventListener('click', () => closeDrawer(els.toolDrawer)); $('#permission-drawer-close')?.addEventListener('click', () => closeDrawer(els.permissionDrawer)); els.permissionTrigger.addEventListener('click', () => { isDrawerVisible(els.permissionDrawer) ? closeDrawer(els.permissionDrawer) : openPermissionDrawer() }); document.addEventListener('keydown', event => { if (event.key === 'Escape' && (isDrawerVisible(els.toolDrawer) || isDrawerVisible(els.permissionDrawer))) closeDrawer() }); document.addEventListener('click', event => { const inDrawer = els.toolDrawer.contains(event.target) || els.permissionDrawer.contains(event.target); const onTrigger = els.toolTrigger.contains(event.target) || els.permissionTrigger.contains(event.target); if (!inDrawer && !onTrigger && (isDrawerVisible(els.toolDrawer) || isDrawerVisible(els.permissionDrawer))) closeDrawer() }); els.inspectorToggle?.addEventListener('click', () => setInspectorOpen(!state.inspectorOpen)); els.voice.addEventListener('click', () => { setNotice('语音入口已准备；接入声音模型后可开始语音输入。') })
document.querySelectorAll('.drawer-option').forEach(button => button.addEventListener('click', async () => { if (button.dataset.tool === 'skills') { await showSkillBrowser(); return } toolAction(button.dataset.tool); toggleDrawer() }))
document.querySelectorAll('[data-capability]').forEach(input => input.addEventListener('change', () => updatePermission(input.dataset.capability, input.checked)))
els.taskInput.addEventListener('paste', handleComposerPaste)
els.composer.addEventListener('dragover', handleComposerDragOver)
els.composer.addEventListener('dragleave', handleComposerDragLeave)
els.composer.addEventListener('drop', handleComposerDrop)
els.fileInput?.addEventListener('change', event => { void addFiles(event.target.files); event.target.value = '' })
els.composer.addEventListener('submit', event => { event.preventDefault(); runAgentTask() }); els.taskInput.addEventListener('keydown', event => { if (shouldSubmitComposer({ key: event.key, shiftKey: event.shiftKey, isComposing: event.isComposing || event.keyCode === 229, disabled: els.run.disabled })) { event.preventDefault(); runAgentTask() } }); els.newTask.addEventListener('click', startNewChat); els.refresh.addEventListener('click', refreshState); els.authorize.addEventListener('click', updateAuthorization); $('#approve-once').addEventListener('click', () => approve(false)); $('#approve-always').addEventListener('click', () => approve(true)); $('#reject').addEventListener('click', reject); els.authForm.addEventListener('submit', submitAuth); els.registerForm.addEventListener('submit', submitRegistration); els.authToggle.addEventListener('click', showRegister); els.authLoginToggle.addEventListener('click', showLogin); els.logout.addEventListener('click', logout)
els.run.onclick = event => { event.preventDefault(); if (els.run.disabled) return; runAgentTask() };

async function bootstrap() { try { const configResponse = await fetch('/api/config'); const config = await configResponse.json(); state.gatewayUrl = config.gatewayUrl; state.localSecret = config.localSecret || ''; els.modelSelect.value = state.model; setRailCollapsed(state.railCollapsed, { recordNavigation: false }); setMode('BUDDY', { recordNavigation: false }); renderNavigationControls(); if (state.authToken) { const session = await fetch(`${state.gatewayUrl}/api/auth/me`, { headers: { authorization: `Bearer ${state.authToken}` } }); if (session.ok) { const body = await session.json(); setAccount(body.user); showWorkspace(); await refreshState(); return } localStorage.removeItem('zt-ai:desktop-token'); state.authToken = '' } } catch (error) { showAuthError(describeNetworkError(error, '工作台启动')) } setAccount(null); showLogin() }
setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, 1000); bootstrap()

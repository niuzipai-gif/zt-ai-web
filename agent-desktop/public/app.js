import { contextMeter, nextMode, normalizeModel } from './chat-state.mjs'
import { addConversationMessage, conversationTitle, createConversation, normalizeConversations } from './conversation-state.mjs'
import { createSmoothStream } from './streaming.mjs'
import { renderMarkdown } from './markdown.mjs'

const $ = selector => document.querySelector(selector)
const state = {
  mode: localStorage.getItem('zt-ai:desktop-mode') === 'BUDDY' ? 'BUDDY' : 'CHAT',
  model: normalizeModel(localStorage.getItem('zt-ai:agent-model')),
  taskId: null,
  eventCount: 0,
  reader: null,
  authToken: localStorage.getItem('zt-ai:desktop-token') || '',
  gatewayUrl: '',
  localSecret: '',
  registering: false,
  pendingApproval: null,
  usedTokens: 12_400,
  chatSessions: [],
  activeChatId: '',
  activeSkills: [],
  activeAgentMessage: null,
  agentStream: null,
}

const els = {
  root: $('.app-shell'), modeChat: $('#mode-chat'), modeBuddy: $('#mode-buddy'), railTitle: $('#rail-title'), railStatus: $('#rail-status'),
  conversationEyebrow: $('#conversation-eyebrow'), conversationTitle: $('#conversation-title'), conversationSubtitle: $('#conversation-subtitle'),
  messages: $('#messages'), taskInput: $('#task-input'), composer: $('#composer'), run: $('#run-task'), newTask: $('#new-task'), refresh: $('#refresh'), history: $('#history'),
  toolTrigger: $('#tool-trigger'), toolDrawer: $('#tool-drawer'), permissionTrigger: $('#permission-trigger'), voice: $('#voice-button'), modelSelect: $('#model-select'),
  contextRing: $('#context-ring'), contextRingLarge: $('#context-ring-large'), contextPercent: $('#context-percent'), contextPercentLarge: $('#context-percent-large'), contextModel: $('#context-model'), contextUsed: $('#context-used'), contextUsedLarge: $('#context-used-large'), contextRemaining: $('#context-remaining'),
  plan: $('#plan'), log: $('#activity-log'), logCount: $('#log-count'), title: $('#execution-title'), status: $('#execution-status'),
  taskId: $('#current-task-id'), resultPanel: $('#result-panel'), resultText: $('#result-text'), approval: $('#approval-card'), approvalTitle: $('#approval-title'), approvalPreview: $('#approval-preview'), skillBrowser: $('#skill-browser'),
  gateway: $('#gateway-url'), workspace: $('#workspace-path'), workspaceShort: $('#workspace-short'), gatewayStatus: $('#gateway-status'), authorize: $('#authorize-device'), authorizationStatus: $('#authorization-status'), logout: $('#logout'), accountLabel: $('#account-label'),
  authGate: $('#auth-gate'), authForm: $('#auth-form'), authUsername: $('#auth-username'), authPassword: $('#auth-password'), authSubmit: $('#auth-submit'), authToggle: $('#auth-toggle'), authError: $('#auth-error'),
}

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])) }
function formatTokens(value) { return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(value % 1_000_000 ? 2 : 0)}M` : `${(value / 1_000).toFixed(value % 1_000 ? 1 : 0)}k` }
function newChatId() { return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
function currentConversation() { return state.chatSessions.find(item => item.id === state.activeChatId) || null }
function persistChats() {
  localStorage.setItem('zt-ai:desktop-chats', JSON.stringify(state.chatSessions.slice(0, 30)))
  localStorage.setItem('zt-ai:desktop-active-chat', state.activeChatId)
}
function initChatState() {
  let stored = null
  try { stored = JSON.parse(localStorage.getItem('zt-ai:desktop-chats') || 'null') } catch { stored = null }
  state.chatSessions = normalizeConversations(stored)
  state.activeChatId = localStorage.getItem('zt-ai:desktop-active-chat') || ''
  if (!state.chatSessions.length) state.chatSessions = [createConversation(newChatId())]
  if (!state.chatSessions.some(item => item.id === state.activeChatId)) state.activeChatId = state.chatSessions[0].id
  persistChats()
}
function renderMessages() {
  const conversation = currentConversation()
  if (!conversation) return
  els.messages.innerHTML = ''
  for (const message of conversation.messages) appendMessage(message.role, message.content)
}
function recordChatMessage(role, content) {
  const conversation = currentConversation()
  if (!conversation) return
  const updated = addConversationMessage(conversation, { role, content })
  state.chatSessions = state.chatSessions.map(item => item.id === updated.id ? updated : item)
  persistChats()
}
function renderChatHistory() {
  const data = state.chatSessions.slice().sort((a, b) => b.updatedAt - a.updatedAt)
  els.history.innerHTML = data.map(item => `<button class="history-item ${item.id === state.activeChatId ? 'active' : ''}" data-chat-id="${escapeHtml(item.id)}"><strong>${escapeHtml(conversationTitle(item))}</strong><small>${new Date(item.updatedAt).toLocaleString()}</small></button>`).join('')
  els.history.querySelectorAll('[data-chat-id]').forEach(button => button.addEventListener('click', () => {
    state.activeChatId = button.dataset.chatId
    persistChats()
    renderMessages()
    renderChatHistory()
  }))
}
function startNewChat() {
  if (state.reader) { state.reader.cancel?.(); state.reader = null }
  state.agentStream?.cancel?.(); state.agentStream = null; state.activeAgentMessage = null
  const conversation = createConversation(newChatId())
  state.chatSessions = [conversation, ...state.chatSessions.filter(item => item.id !== state.activeChatId)].slice(0, 30)
  state.activeChatId = conversation.id
  state.activeSkills = []
  els.taskInput.value = ''
  els.taskInput.disabled = false
  els.run.disabled = false
  persistChats()
  renderMessages()
  renderChatHistory()
  if (state.mode === 'BUDDY') resetExecution()
  els.taskInput.focus()
}
function setStatus(value, className = '') { els.status.textContent = value; els.status.className = `status-badge ${className}` }
function addLog(text, kind = '') {
  const empty = els.log.querySelector('.empty-log'); if (empty) empty.remove()
  state.eventCount += 1; els.logCount.textContent = `${state.eventCount} events`
  const line = document.createElement('div'); line.className = `log-line ${kind}`; line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`; els.log.appendChild(line); els.log.scrollTop = els.log.scrollHeight
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
function setMode(mode) {
  state.mode = mode === 'BUDDY' ? 'BUDDY' : 'CHAT'; localStorage.setItem('zt-ai:desktop-mode', state.mode); els.root.dataset.mode = state.mode
  const buddy = state.mode === 'BUDDY'
  els.modeChat.classList.toggle('active', !buddy); els.modeBuddy.classList.toggle('active', buddy); els.modeChat.setAttribute('aria-selected', String(!buddy)); els.modeBuddy.setAttribute('aria-selected', String(buddy))
  els.railTitle.textContent = buddy ? 'ZT.buddy' : '普通聊天'; els.railStatus.textContent = buddy ? '本机执行工作区' : '本机工作区'
  els.conversationEyebrow.textContent = buddy ? 'EXECUTION CHAT' : 'CONVERSATION'; els.conversationTitle.textContent = buddy ? 'ZT.buddy 工作区' : 'ZT.AI 对话'; els.conversationSubtitle.textContent = buddy ? '默认执行 · 继续上次上下文' : '普通聊天 · 继续上次上下文'
  els.taskInput.placeholder = buddy ? '给 ZT.buddy 一个任务，或直接开始聊天……' : '给 ZT.AI 发消息……'
  if (!buddy) { els.toolDrawer.classList.add('hidden'); hideApproval() }
  if (state.chatSessions.length) renderChatHistory()
  renderContext()
}
function appendMessage(role, content, streaming = false) {
  const row = document.createElement('div'); row.className = `message ${role === 'user' ? 'user-message' : 'assistant-message'}`
  const bubble = document.createElement('div'); bubble.className = 'bubble'
  if (role === 'assistant') { const label = document.createElement('div'); label.className = 'message-label'; label.textContent = 'ZT.AI'; bubble.appendChild(label) }
  const body = document.createElement('div'); body.className = 'message-body markdown-message'
  if (streaming) body.innerHTML = '<span class="typing-indicator" aria-label="ZT.AI 正在思考"><i></i><i></i><i></i></span>'
  else body.innerHTML = renderMarkdown(content || '')
  bubble.appendChild(body); row.appendChild(bubble); els.messages.appendChild(row); els.messages.scrollTop = els.messages.scrollHeight
  return body
}

function appendAgentMessage(task) {
  const row = document.createElement('div'); row.className = 'message assistant-message agent-message'
  const bubble = document.createElement('div'); bubble.className = 'bubble agent-bubble'
  const label = document.createElement('div'); label.className = 'message-label'; label.textContent = 'ZT.BUDDY · EXECUTION'
  const status = document.createElement('div'); status.className = 'agent-statusline running'; status.innerHTML = '<span class="pulse"></span><span>正在理解任务并规划执行步骤…</span>'
  const taskLine = document.createElement('div'); taskLine.className = 'agent-taskline'; taskLine.textContent = task
  const plan = document.createElement('div'); plan.className = 'agent-plan-inline'
  const activity = document.createElement('div'); activity.className = 'agent-activity-inline'
  const result = document.createElement('div'); result.className = 'agent-result-inline markdown-message'
  const approval = document.createElement('div'); approval.className = 'agent-approval-inline hidden'
  bubble.append(label, status, taskLine, plan, activity, result, approval)
  row.appendChild(bubble); els.messages.appendChild(row); els.messages.scrollTop = els.messages.scrollHeight
  const live = { row, status, plan, activity, result, approval, output: '', persisted: false }
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
  live.plan.innerHTML = steps.map((step, index) => `<div class="inline-plan-step" data-step="${escapeHtml(step.id)}"><span>${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(step.label)}</strong><small>${escapeHtml(step.tool)} · ${escapeHtml(step.capability)}</small></div>`).join('')
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
  const line = document.createElement('div'); line.className = `inline-activity-line ${kind}`; line.textContent = text
  live.activity.appendChild(line); live.activity.scrollTop = live.activity.scrollHeight; els.messages.scrollTop = els.messages.scrollHeight
}

function showInlineApproval(data) {
  const live = state.activeAgentMessage
  if (!live) return
  state.pendingApproval = data
  live.approval.classList.remove('hidden')
  live.approval.innerHTML = `<strong>${escapeHtml(data.capabilityLabel)} · 需要你的确认</strong><p>${escapeHtml(data.preview || data.label)}</p><div class="inline-approval-actions"><button type="button" data-approval="once">允许一次</button><button type="button" data-approval="always">记住权限</button><button type="button" data-approval="reject">拒绝</button></div>`
  live.approval.querySelector('[data-approval="once"]').addEventListener('click', () => approve(false))
  live.approval.querySelector('[data-approval="always"]').addEventListener('click', () => approve(true))
  live.approval.querySelector('[data-approval="reject"]').addEventListener('click', reject)
  setAgentStatus('等待你确认本机执行权限…', 'waiting')
  els.messages.scrollTop = els.messages.scrollHeight
}

function hideInlineApproval() {
  const live = state.activeAgentMessage
  if (live?.approval) { live.approval.classList.add('hidden'); live.approval.innerHTML = '' }
  state.pendingApproval = null
}

function completeAgentMessage(summary, status = 'done') {
  const live = state.activeAgentMessage
  if (!live) return
  live.output = summary || live.output || '本机执行已完成。'
  live.result.innerHTML = renderMarkdown(live.output)
  live.result.classList.add('is-visible')
  setAgentStatus(status === 'done' ? '任务已完成' : `任务${status === 'blocked' ? '已暂停' : '执行失败'}`, status === 'done' ? 'done' : 'error')
  hideInlineApproval()
  if (!live.persisted) {
    recordChatMessage('assistant', live.output)
    live.persisted = true
    renderChatHistory()
  }
  els.messages.scrollTop = els.messages.scrollHeight
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
function renderPlan(steps) { els.plan.innerHTML = steps.map((step, index) => `<div class="plan-step" data-step="${escapeHtml(step.id)}"><span class="step-index">${String(index + 1).padStart(2, '0')}</span><div><strong>${escapeHtml(step.label)}</strong><small>${escapeHtml(step.tool)}</small></div><span class="step-cap">${escapeHtml(step.capability)}</span></div>`).join('') }
function markStep(id, stateName) { const step = els.plan.querySelector(`[data-step="${CSS.escape(id)}"]`); if (step) { step.classList.toggle('active', stateName === 'active'); step.classList.toggle('done', stateName === 'done') } }
function showApproval(data) { state.pendingApproval = data; els.approval.classList.add('hidden'); setStatus('WAITING', 'waiting'); addLog(`等待批准：${data.label}`, 'warning') }
function hideApproval() { state.pendingApproval = null; els.approval.classList.add('hidden') }
async function readJson(response) { const text = await response.text(); try { return JSON.parse(text) } catch { return { error: text } } }
async function apiFetch(path, options = {}) { const headers = { ...(options.headers || {}), 'x-zt-agent-secret': state.localSecret }; if (state.authToken) headers.authorization = `Bearer ${state.authToken}`; return fetch(path, { ...options, headers }) }
function showAuthError(message = '') { els.authError.textContent = message }
function showWorkspace() { els.authGate.classList.add('hidden'); els.taskInput.disabled = false; els.accountLabel.textContent = 'ACCOUNT ACTIVE' }
function showLogin() { els.authGate.classList.remove('hidden'); els.taskInput.disabled = true; showAuthError('') }
function describeNetworkError(error, action = '连接 ZT.AI 网关') { const message = String(error?.message || error || ''); return /failed to fetch|networkerror|load failed/i.test(message) ? `${action}失败：当前无法访问 ${state.gatewayUrl || 'ZT.AI 网关'}，请确认网络正常或稍后重试。` : message || `${action}失败` }

async function submitAuth(event) {
  event.preventDefault(); showAuthError(''); els.authSubmit.disabled = true
  const registering = state.registering
  try {
    const response = await fetch(`${state.gatewayUrl}/api/auth/${registering ? 'register' : 'login'}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: els.authUsername.value.trim(), password: els.authPassword.value }) })
    const body = await readJson(response)
    if (!response.ok) throw new Error(body.error || (registering ? '注册失败' : '登录失败'))
    if (registering) {
      els.authPassword.value = ''
      state.registering = false
      els.authSubmit.textContent = '登录'
      els.authToggle.textContent = '没有账户？注册一个'
      els.authPassword.autocomplete = 'current-password'
      showAuthError('注册申请已提交，请等待管理员审核通过后再登录。')
      return
    }
    if (!body.token) throw new Error('登录响应缺少账户凭证')
    state.authToken = body.token
    localStorage.setItem('zt-ai:desktop-token', state.authToken)
    els.authPassword.value = ''
    showWorkspace()
    await refreshState()
  } catch (error) { showAuthError(describeNetworkError(error, registering ? '注册账户' : '登录账户')) } finally { els.authSubmit.disabled = false }
}
async function logout() { if (state.authToken) await fetch(`${state.gatewayUrl}/api/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${state.authToken}` } }).catch(() => {}); state.authToken = ''; localStorage.removeItem('zt-ai:desktop-token'); showLogin() }

async function consumeSse(response, onEvent) {
  if (!response.ok || !response.body) { const body = await readJson(response); throw new Error(body.error || `请求失败（${response.status}）`) }
  const reader = response.body.getReader(); state.reader = reader; const decoder = new TextDecoder(); let buffer = ''
  while (true) { const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const chunks = buffer.split(/\r?\n\n/); buffer = chunks.pop() || ''; for (const chunk of chunks) { const eventLine = chunk.split(/\r?\n/).find(line => line.startsWith('event:')); const dataLine = chunk.split(/\r?\n/).find(line => line.startsWith('data:')); if (!eventLine || !dataLine) continue; let data = {}; try { data = JSON.parse(dataLine.slice(5).trim()) } catch { continue } onEvent(eventLine.slice(6).trim(), data) } }
}

async function runChat() {
  const task = els.taskInput.value.trim(); if (!task || els.run.disabled) return
  recordChatMessage('user', task); renderMessages(); els.taskInput.value = ''; els.taskInput.disabled = true; els.run.disabled = true
  const body = appendMessage('assistant', '', true)
  const smooth = createSmoothStream({ onUpdate: output => { body.innerHTML = renderMarkdown(output); els.messages.scrollTop = els.messages.scrollHeight; state.usedTokens += 1; renderContext() } })
  state.agentStream = smooth
  try {
    const conversation = currentConversation()
    const messages = conversation?.messages || [{ role: 'user', content: task }]
    const response = await fetch(`${state.gatewayUrl}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: state.model === 'DEEPSEEK' ? 'deepseek' : 'minimax', language: 'zh', skills: state.activeSkills.map(skill => skill.name), messages }) })
    await consumeSse(response, (event, data) => { if (event === 'message.delta') smooth.push(data.text || ''); if (event === 'message.error') smooth.push(data.message || '模型请求失败') })
    smooth.finish()
    const output = await smooth.done
    recordChatMessage('assistant', output)
  } catch (error) { smooth.push(describeNetworkError(error, '发送消息')); smooth.finish(); const output = await smooth.done; recordChatMessage('assistant', output) } finally { state.reader = null; state.agentStream = null; els.taskInput.disabled = false; els.run.disabled = false; renderChatHistory(); els.taskInput.focus() }
}
function handleAgentEvent(event, data) {
  if (event === 'task.start') {
    state.taskId = data.id
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
    addInlineActivity(`调用 ${data.label} · ${data.capability}`, 'tool')
    addLog(`调用 ${data.label} · ${data.capability}`, 'tool')
  } else if (event === 'tool.result') {
    markInlineStep(data.id, 'done'); markStep(data.id, 'done')
    addInlineActivity(data.result || '工具已返回结果', 'result')
    addLog(data.result || '工具已返回结果', 'result')
  } else if (event === 'approval.required') {
    showInlineApproval(data); showApproval(data)
  } else if (event === 'agent.start') {
    if (!state.agentStream) state.agentStream = createSmoothStream({ onUpdate: output => { const live = state.activeAgentMessage; if (live) { live.output = output; live.result.innerHTML = renderMarkdown(output); live.result.classList.add('is-visible'); els.messages.scrollTop = els.messages.scrollHeight } } })
    setAgentStatus('执行步骤已完成，正在整理结果…', 'running')
    addInlineActivity(`正在用 ${data.model} 汇总执行结果`, 'tool')
  } else if (event === 'agent.delta') {
    if (!state.agentStream) state.agentStream = createSmoothStream({ onUpdate: output => { const live = state.activeAgentMessage; if (live) { live.output = output; live.result.innerHTML = renderMarkdown(output); live.result.classList.add('is-visible'); els.messages.scrollTop = els.messages.scrollHeight } } })
    state.agentStream.push(data.text || '')
  } else if (event === 'agent.warning') {
    addInlineActivity(data.message, 'warning'); addLog(data.message, 'warning')
  } else if (event === 'task.blocked') {
    setStatus('BLOCKED', 'blocked'); addInlineActivity(data.reason, 'warning'); setAgentStatus('任务已暂停，等待后续操作…', 'error'); hideApproval(); hideInlineApproval(); completeAgentMessage(data.reason, 'blocked')
  } else if (event === 'task.error') {
    setStatus('ERROR', 'error'); addInlineActivity(data.message, 'warning'); setAgentStatus('执行失败，请检查权限或网关状态。', 'error'); completeAgentMessage(data.message, 'error')
  } else if (event === 'task.done') {
    if (state.agentStream) { state.agentStream.finish(); void state.agentStream.done.then(output => { const summary = data.summary || output; completeAgentMessage(summary, data.status); state.agentStream = null }) } else completeAgentMessage(data.summary, data.status)
    setStatus(data.status === 'done' ? 'DONE' : data.status.toUpperCase(), data.status === 'done' ? 'done' : 'blocked')
    hideApproval(); hideInlineApproval(); refreshState()
  }
}

async function runAgentTask() {
  const task = els.taskInput.value.trim(); if (!task || els.run.disabled) return
  recordChatMessage('user', task); renderMessages(); renderChatHistory(); els.taskInput.value = ''
  const live = appendAgentMessage(task)
  resetExecution()
  state.activeAgentMessage = live
  els.taskInput.disabled = true; els.run.disabled = true
  try {
    const response = await apiFetch('/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task, model: state.model, accountToken: state.authToken }) })
    await consumeSse(response, handleAgentEvent)
  } catch (error) {
    const message = describeNetworkError(error, '执行任务')
    addInlineActivity(message, 'warning'); setAgentStatus(message, 'error'); completeAgentMessage(message, 'error'); setStatus('ERROR', 'error')
  } finally {
    state.reader = null; els.taskInput.disabled = false; els.run.disabled = false; els.taskInput.focus()
  }
}
async function approve(remember) { if (!state.taskId || !state.pendingApproval) return; const { capability } = state.pendingApproval; const response = await apiFetch(`/api/tasks/${state.taskId}/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ capability, remember }) }); const body = await readJson(response); if (!response.ok) addLog(body.error || '批准失败', 'warning'); else { addLog(remember ? `已记住权限：${capability}` : `已允许一次：${capability}`, 'result'); hideApproval() } }
async function reject() { if (!state.taskId) return; const response = await apiFetch(`/api/tasks/${state.taskId}/reject`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: '用户拒绝了这一步' }) }); const body = await readJson(response); if (!response.ok) addLog(body.error || '拒绝失败', 'warning'); else hideApproval() }
async function updatePermission(capability, enabled) { const response = await apiFetch('/api/permissions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ capability, enabled }) }); const body = await readJson(response); if (!response.ok) addLog(body.error || '权限更新失败', 'warning'); else addLog(`${enabled ? '已开启' : '已关闭'}权限：${capability}`, enabled ? 'warning' : '') }
async function updateAuthorization() { const response = await apiFetch('/api/authorization', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ authorized: true }) }); const body = await readJson(response); if (!response.ok) { addLog(body.error || '本机授权失败', 'warning'); return } addLog('已确认：Agent 只可在当前设备执行', 'result'); refreshState() }
function renderExecutionHistory(items = []) { const data = items.slice().reverse(); if (!data.length) { els.history.innerHTML = '<div class="empty-history">还没有执行记录</div>'; return } els.history.innerHTML = data.map(item => `<button class="history-item"><strong>${escapeHtml(item.task)}</strong><small>${escapeHtml(item.status)} · ${new Date(item.createdAt).toLocaleString()}</small></button>`).join('') }
async function refreshState() {
  try {
    const response = await apiFetch('/api/state'); if (response.status === 401) { await logout(); return }
    const data = await response.json(); if (state.mode === 'BUDDY') renderExecutionHistory(data.history); else renderChatHistory()
    if (els.workspaceShort) els.workspaceShort.textContent = data.workspaceRoot
    if (els.gatewayStatus) els.gatewayStatus.textContent = `本机已连接 · ${data.mode === 'execute' ? '执行模式' : '待机'}`
    const authorized = data.deviceAuthorization?.authorized === true
    if (els.authorizationStatus) els.authorizationStatus.textContent = authorized ? `已确认本机 · ${new Date(data.deviceAuthorization.authorizedAt).toLocaleString()}` : '尚未确认本机执行'
    if (els.authorize) { els.authorize.textContent = authorized ? '已确认' : '确认这台设备'; els.authorize.disabled = authorized }
    document.querySelectorAll('[data-capability]').forEach(input => { if (input.dataset.capability !== 'read') input.disabled = !authorized; if (data.permissions[input.dataset.capability] !== undefined) input.checked = data.permissions[input.dataset.capability] })
  } catch (error) { if (els.gatewayStatus) els.gatewayStatus.textContent = '本机 Agent 未连接'; if (els.log) addLog(error.message, 'warning') }
}
function toggleDrawer() { els.toolDrawer.classList.toggle('hidden'); els.toolTrigger.classList.toggle('active', !els.toolDrawer.classList.contains('hidden')) }
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
    els.toolDrawer.classList.add('hidden'); els.skillBrowser.classList.add('hidden'); els.toolTrigger.classList.remove('active'); els.taskInput.focus()
  }))
}
async function showSkillBrowser() {
  if (!els.skillBrowser) return
  els.skillBrowser.classList.remove('hidden')
  els.skillBrowser.innerHTML = '<div class="skill-empty">正在扫描本机 Skills…</div>'
  try { const response = await apiFetch('/api/skills'); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Skill 扫描失败'); renderSkillBrowser(body.skills || []) } catch (error) { els.skillBrowser.innerHTML = `<div class="skill-empty">${escapeHtml(error.message)}</div>` }
}
function toolAction(tool) { if (tool === 'file') { setNotice('文件入口已打开；选择文件后会作为当前对话附件引用。'); return } setNotice(`${tool} 已加入当前对话工具范围`) }
function setNotice(text) { const body = appendMessage('assistant', text); body.closest('.message')?.classList.add('system-message'); setTimeout(() => body.closest('.message')?.remove(), 3500) }

els.modeChat.addEventListener('click', () => setMode(nextMode('BUDDY'))); els.modeBuddy.addEventListener('click', () => setMode(nextMode('CHAT')))
els.modelSelect.addEventListener('change', () => { state.model = normalizeModel(els.modelSelect.value); localStorage.setItem('zt-ai:agent-model', state.model); renderContext() })
els.toolTrigger.addEventListener('click', toggleDrawer); els.permissionTrigger.addEventListener('click', () => { $('#buddy-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }); els.voice.addEventListener('click', () => { els.voice.classList.toggle('active'); setNotice(els.voice.classList.contains('active') ? '麦克风入口已准备，接入你的声音模型后可开始语音聊天。' : '已关闭语音入口。') })
document.querySelectorAll('.drawer-option').forEach(button => button.addEventListener('click', async () => { if (button.dataset.tool === 'skills') { await showSkillBrowser(); return } toolAction(button.dataset.tool); toggleDrawer() }))
document.querySelectorAll('[data-capability]').forEach(input => input.addEventListener('change', () => updatePermission(input.dataset.capability, input.checked)))
els.composer.addEventListener('submit', event => { event.preventDefault(); state.mode === 'BUDDY' ? runAgentTask() : runChat() }); els.taskInput.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); state.mode === 'BUDDY' ? runAgentTask() : runChat() } }); els.newTask.addEventListener('click', startNewChat); els.refresh.addEventListener('click', refreshState); els.authorize.addEventListener('click', updateAuthorization); $('#approve-once').addEventListener('click', () => approve(false)); $('#approve-always').addEventListener('click', () => approve(true)); $('#reject').addEventListener('click', reject); els.authForm.addEventListener('submit', submitAuth); els.authToggle.addEventListener('click', () => { state.registering = !state.registering; els.authSubmit.textContent = state.registering ? '注册并进入' : '登录'; els.authToggle.textContent = state.registering ? '已有账户？返回登录' : '没有账户？注册一个'; els.authPassword.autocomplete = state.registering ? 'new-password' : 'current-password'; showAuthError('') }); els.logout.addEventListener('click', logout)
els.run.onclick = event => { event.preventDefault(); if (els.run.disabled) return; state.mode === 'BUDDY' ? runAgentTask() : runChat() };

async function bootstrap() { try { initChatState(); renderMessages(); renderChatHistory(); const configResponse = await fetch('/api/config'); const config = await configResponse.json(); state.gatewayUrl = config.gatewayUrl; state.localSecret = config.localSecret || ''; els.modelSelect.value = state.model; setMode(state.mode); if (state.authToken) { const session = await fetch(`${state.gatewayUrl}/api/auth/me`, { headers: { authorization: `Bearer ${state.authToken}` } }); if (session.ok) { showWorkspace(); await refreshState(); return } localStorage.removeItem('zt-ai:desktop-token'); state.authToken = '' } } catch (error) { showAuthError(describeNetworkError(error, '工作台启动')) } showLogin() }
setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, 1000); bootstrap()

const $ = selector => document.querySelector(selector)
const state = { model: localStorage.getItem('zt-ai:agent-model') || 'MINIMAX', taskId: null, eventCount: 0, reader: null }

const els = {
  taskInput: $('#task-input'), run: $('#run-task'), newTask: $('#new-task'), refresh: $('#refresh'), history: $('#history'),
  plan: $('#plan'), log: $('#activity-log'), logCount: $('#log-count'), title: $('#execution-title'), status: $('#execution-status'),
  taskId: $('#current-task-id'), resultPanel: $('#result-panel'), resultText: $('#result-text'), approval: $('#approval-card'), approvalTitle: $('#approval-title'),
  approvalPreview: $('#approval-preview'), gateway: $('#gateway-url'), workspace: $('#workspace-path'), workspaceShort: $('#workspace-short'), gatewayStatus: $('#gateway-status'),
  authorize: $('#authorize-device'), authorizationStatus: $('#authorization-status'),
}

function escapeHtml(value) { return String(value).replace(/[&<>'\"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])) }
function setStatus(value, className = '') { els.status.textContent = value; els.status.className = `status-badge ${className}` }
function addLog(text, kind = '') {
  const empty = els.log.querySelector('.empty-log'); if (empty) empty.remove()
  state.eventCount += 1; els.logCount.textContent = `${state.eventCount} events`
  const line = document.createElement('div'); line.className = `log-line ${kind}`; line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`; els.log.appendChild(line); els.log.scrollTop = els.log.scrollHeight
}
function resetExecution() {
  state.taskId = null; state.eventCount = 0; els.taskId.textContent = 'READY'; els.title.textContent = '等待新的任务'; setStatus('IDLE')
  els.plan.innerHTML = '<div class="empty-state"><span class="empty-mark">◎</span><p>任务开始后，执行计划会出现在这里。</p></div>'
  els.log.innerHTML = '<div class="empty-log">等待工具调用…</div>'; els.logCount.textContent = '0 events'; els.resultPanel.classList.add('hidden'); els.resultText.textContent = ''; hideApproval()
}
function renderPlan(steps) {
  els.plan.innerHTML = steps.map((step, index) => `<div class="plan-step" data-step="${escapeHtml(step.id)}"><span class="step-index">${String(index + 1).padStart(2, '0')}</span><div><strong>${escapeHtml(step.label)}</strong><small>${escapeHtml(step.tool)}</small></div><span class="step-cap">${escapeHtml(step.capability)}</span></div>`).join('')
}
function markStep(id, stateName) { const step = els.plan.querySelector(`[data-step="${CSS.escape(id)}"]`); if (step) { step.classList.toggle('active', stateName === 'active'); step.classList.toggle('done', stateName === 'done') } }
function showApproval(data) { state.pendingApproval = data; els.approvalTitle.textContent = `${data.capabilityLabel} · 需要你的确认`; els.approvalPreview.textContent = data.preview || data.label; els.approval.classList.remove('hidden'); setStatus('WAITING', 'waiting'); addLog(`等待批准：${data.label}`, 'warning') }
function hideApproval() { state.pendingApproval = null; els.approval.classList.add('hidden') }

async function readJson(response) { const text = await response.text(); try { return JSON.parse(text) } catch { return { error: text } } }

async function consumeSse(response) {
  if (!response.ok || !response.body) { const body = await readJson(response); throw new Error(body.error || `请求失败（${response.status}）`) }
  const reader = response.body.getReader(); state.reader = reader; const decoder = new TextDecoder(); let buffer = ''
  while (true) {
    const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const chunks = buffer.split(/\r?\n\n/); buffer = chunks.pop() || ''
    for (const chunk of chunks) {
      const eventLine = chunk.split(/\r?\n/).find(line => line.startsWith('event:'))
      const dataLine = chunk.split(/\r?\n/).find(line => line.startsWith('data:'))
      if (!eventLine || !dataLine) continue
      let data = {}; try { data = JSON.parse(dataLine.slice(5).trim()) } catch { continue }
      handleEvent(eventLine.slice(6).trim(), data)
    }
  }
}

function handleEvent(event, data) {
  if (event === 'task.start') { state.taskId = data.id; els.taskId.textContent = data.id.slice(0, 8).toUpperCase(); els.title.textContent = data.task; setStatus('RUNNING', 'running'); addLog(`任务开始 · ${data.model} · 执行模式`, 'tool'); return }
  if (event === 'plan.ready') { renderPlan(data.steps || []); addLog(`已拆解 ${data.steps?.length || 0} 个执行步骤`, 'tool'); return }
  if (event === 'tool.start') { markStep(data.id, 'active'); addLog(`调用 ${data.label} · ${data.capability}`, 'tool'); return }
  if (event === 'tool.result') { markStep(data.id, 'done'); addLog(data.result || '工具已返回结果', 'result'); return }
  if (event === 'approval.required') { showApproval(data); return }
  if (event === 'agent.start') { els.resultPanel.classList.remove('hidden'); els.resultText.textContent = ''; addLog(`正在用 ${data.model} 汇总执行结果`, 'tool'); return }
  if (event === 'agent.delta') { els.resultPanel.classList.remove('hidden'); els.resultText.textContent += data.text || ''; els.resultText.scrollIntoView({ block: 'nearest' }); return }
  if (event === 'agent.warning') { addLog(data.message, 'warning'); return }
  if (event === 'task.blocked') { setStatus('BLOCKED', 'blocked'); addLog(data.reason, 'warning'); hideApproval(); return }
  if (event === 'task.error') { setStatus('ERROR', 'error'); addLog(data.message, 'warning'); return }
  if (event === 'task.done') { setStatus(data.status === 'done' ? 'DONE' : data.status.toUpperCase(), data.status === 'done' ? 'done' : 'blocked'); hideApproval(); refreshState(); return }
}

async function runTask() {
  const task = els.taskInput.value.trim(); if (!task || state.reader) return
  resetExecution(); els.taskInput.disabled = true; els.run.disabled = true; els.run.querySelector('span').textContent = '执行中…'
  try {
    const response = await fetch('/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task, model: state.model }) })
    await consumeSse(response)
  } catch (error) { setStatus('ERROR', 'error'); addLog(error.message, 'warning') }
  finally { state.reader = null; els.taskInput.disabled = false; els.run.disabled = false; els.run.querySelector('span').textContent = '执行任务' }
}

async function approve(remember) {
  if (!state.taskId || !state.pendingApproval) return
  const { capability } = state.pendingApproval
  const response = await fetch(`/api/tasks/${state.taskId}/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ capability, remember }) })
  const body = await readJson(response); if (!response.ok) addLog(body.error || '批准失败', 'warning'); else { addLog(remember ? `已记住权限：${capability}` : `已允许一次：${capability}`, 'result'); hideApproval() }
}
async function reject() {
  if (!state.taskId) return
  const response = await fetch(`/api/tasks/${state.taskId}/reject`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: '用户拒绝了这一步' }) })
  const body = await readJson(response); if (!response.ok) addLog(body.error || '拒绝失败', 'warning'); else hideApproval()
}

async function updatePermission(capability, enabled) {
  const response = await fetch('/api/permissions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ capability, enabled }) })
  const body = await readJson(response); if (!response.ok) addLog(body.error || '权限更新失败', 'warning'); else addLog(`${enabled ? '已开启' : '已关闭'}权限：${capability}`, enabled ? 'warning' : '')
}

async function updateAuthorization() {
  const response = await fetch('/api/authorization', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ authorized: true }) })
  const body = await readJson(response)
  if (!response.ok) { addLog(body.error || '本机授权失败', 'warning'); return }
  addLog('已确认：Agent 只可在当前设备执行', 'result')
  refreshState()
}

function renderHistory(items = []) {
  const data = items.slice().reverse(); if (!data.length) { els.history.innerHTML = '<div class="empty-history">还没有执行记录</div>'; return }
  els.history.innerHTML = data.map(item => `<div class="history-item"><strong>${escapeHtml(item.task)}</strong><small>${escapeHtml(item.status)} · ${new Date(item.createdAt).toLocaleString()}</small></div>`).join('')
}
async function refreshState() {
  try {
    const response = await fetch('/api/state'); const data = await response.json(); renderHistory(data.history); els.gateway.textContent = data.gatewayUrl.replace(/^https?:\/\//, ''); els.workspace.textContent = data.workspaceRoot; els.workspaceShort.textContent = data.workspaceRoot; els.gatewayStatus.textContent = `本机工作台 · ${data.mode === 'execute' ? '执行模式' : '待机'}`
    const authorized = data.deviceAuthorization?.authorized === true
    els.authorizationStatus.textContent = authorized ? `已确认本机 · ${new Date(data.deviceAuthorization.authorizedAt).toLocaleString()}` : '尚未确认本机执行'
    els.authorize.textContent = authorized ? '已确认' : '确认这台设备'
    els.authorize.disabled = authorized
    document.querySelectorAll('[data-capability]').forEach(input => { if (input.dataset.capability !== 'read') input.disabled = !authorized; if (data.permissions[input.dataset.capability] !== undefined) input.checked = data.permissions[input.dataset.capability] })
  } catch (error) { els.gatewayStatus.textContent = '本机 Agent 未连接'; addLog(error.message, 'warning') }
}

document.querySelectorAll('[data-model]').forEach(button => button.addEventListener('click', () => { state.model = button.dataset.model; localStorage.setItem('zt-ai:agent-model', state.model); document.querySelectorAll('[data-model]').forEach(item => item.classList.toggle('active', item === button)) }))
document.querySelectorAll('[data-task]').forEach(button => button.addEventListener('click', () => { els.taskInput.value = button.dataset.task; els.taskInput.focus() }))
document.querySelectorAll('[data-capability]').forEach(input => input.addEventListener('change', () => updatePermission(input.dataset.capability, input.checked)))
els.run.addEventListener('click', runTask); els.taskInput.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') runTask() }); els.newTask.addEventListener('click', () => { els.taskInput.value = ''; resetExecution(); els.taskInput.focus() }); els.refresh.addEventListener('click', refreshState)
els.authorize.addEventListener('click', updateAuthorization)
$('#approve-once').addEventListener('click', () => approve(false)); $('#approve-always').addEventListener('click', () => approve(true)); $('#reject').addEventListener('click', reject)
setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, 1000); refreshState(); document.querySelector(`[data-model="${state.model}"]`)?.classList.add('active')

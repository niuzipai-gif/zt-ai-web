const MAP = {
  chat: ['普通聊天', '我会直接回答，不会读取文件或调用本机工具。', false],
  read: ['准备读取', '准备查看当前工作区内容，只读取，不修改文件。', false],
  research: ['准备检索', '准备检索公开资料并在结果中附上来源链接。', false],
  write: ['准备修改', '准备在当前工作区写入或整理文件，执行前会请求写入确认。', true],
  command: ['准备执行', '准备运行命令、测试或构建，执行前会请求命令确认。', true],
  sensitive: ['需要额外确认', '该任务可能涉及高影响操作；我会在每一步请求明确确认。', true],
}

export function executionPresentation(intent = {}) {
  const [title, summary, approval] = MAP[intent.kind] || MAP.chat
  return { title, summary, approval: Boolean(intent.requiresApproval || approval) }
}

export function conversationFailurePresentation() {
  return '暂时无法获取模型回复。你的消息和当前对话已保留，请稍后重试或切换模型。'
}

export function executionDrawerPresentation({ status = 'running', elapsedMs = 0, stepCount = 0 } = {}) {
  const terminal = status === 'done' || status === 'blocked' || status === 'error'
  const stateLabel = status === 'done' ? '已完成' : status === 'blocked' ? '等待确认' : status === 'error' ? '未完成' : '执行中'
  const seconds = Math.max(0, Number(elapsedMs) || 0) / 1_000
  const duration = seconds >= 10 ? `${seconds.toFixed(0)} 秒` : `${seconds.toFixed(1)} 秒`
  const steps = Math.max(0, Number(stepCount) || 0)
  return { open: !terminal, label: `执行详情 · ${stateLabel} · ${duration} · ${steps} 步` }
}

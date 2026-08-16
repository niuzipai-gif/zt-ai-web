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

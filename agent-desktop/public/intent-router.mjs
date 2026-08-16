const CHAT_ONLY_PATTERNS = [
  /^(?:你好|您好|嗨|哈喽|hello|hi|hey|早上好|晚上好|晚安|谢谢|感谢|再见|拜拜|在吗|你是谁|你能做什么|介绍一下自己)[!！?？。…\s]*$/iu,
  /^(?:你觉得|你怎么看|怎么看|解释一下|讲讲|聊聊|为什么|怎么理解|给我建议|请问)[\s\S]{0,120}[?？。！!]?$/iu,
]

const RESEARCH_PATTERN = /(?:搜索|查资料|查找资料|查一下|检索|联网|官网|官方文档|来源|资料链接|research|search|look\s*up|documentation|official\s+docs?)/iu
const COMMAND_PATTERN = /(?:运行|测试|构建|执行命令|启动|安装|部署|发布|run|test|build|execute|command|install|deploy)/iu
const WRITE_PATTERN = /(?:创建|新建|写入|修改|编辑|实现|开发|重构|生成|整理|移动|归档|复制|重命名|删除|清理|上传|发送|保存|create|write|edit|implement|refactor|generate|organize|move|rename|delete|upload|send)/iu
const READ_PATTERN = /(?:查看|看看|读取|打开|列出|扫描|检查|分析|统计|识别|找出|有哪些|桌面|工作区|目录|文件夹|文件|项目|仓库|代码|日志|read|inspect|review|open|list|scan|analy[sz]e)/iu
const WORKSPACE_CONTEXT_PATTERN = /(?:桌面|工作区|目录|文件夹|文件|项目|仓库|代码|README|\.md\b|\.json\b|\.js\b|\.py\b|workspace|folder|file|repository|code)/iu
const SENSITIVE_PATTERN = /(?:删除|清空|卸载|安装软件|发送邮件|发消息|发布到|修改系统|注册表|权限提升|delete|uninstall|send\s+(?:an?\s+)?email|publish|system\s+settings?|registry|elevat(?:e|ion))/iu

function result(kind, route, confidence, reason, extra = {}) {
  return { kind, route, confidence, reason, ...extra }
}

export function classifyIntent(input, { mode = 'BUDDY' } = {}) {
  const text = String(input || '').trim()
  if (mode !== 'BUDDY' || !text) return result('chat', 'chat', 1, mode !== 'BUDDY' ? '普通聊天模式固定走聊天接口' : '空消息不执行')

  const explicitAction = RESEARCH_PATTERN.test(text) || COMMAND_PATTERN.test(text) || WRITE_PATTERN.test(text) || (READ_PATTERN.test(text) && WORKSPACE_CONTEXT_PATTERN.test(text))
  if (!explicitAction && CHAT_ONLY_PATTERNS.some(pattern => pattern.test(text))) return result('chat', 'chat', 0.99, '识别为问候或普通对话')

  if (RESEARCH_PATTERN.test(text)) return result('research', 'agent', 0.96, '包含检索、资料或来源请求')
  if (COMMAND_PATTERN.test(text)) return result('command', 'agent', 0.94, '包含运行、测试或命令执行请求', { requiresApproval: true })
  if (WRITE_PATTERN.test(text)) {
    return result(SENSITIVE_PATTERN.test(text) ? 'sensitive' : 'write', 'agent', SENSITIVE_PATTERN.test(text) ? 0.98 : 0.94, SENSITIVE_PATTERN.test(text) ? '包含高风险文件或系统操作' : '包含创建、修改或整理请求', { requiresApproval: true })
  }
  if (READ_PATTERN.test(text) && WORKSPACE_CONTEXT_PATTERN.test(text)) return result('read', 'agent', 0.92, '包含工作区、文件或项目读取请求')

  return result('chat', 'chat', 0.72, '未检测到明确的本机执行目标')
}

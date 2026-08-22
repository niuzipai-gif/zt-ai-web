const CHAT_ONLY_PATTERNS = [
  /^(?:你好|您好|嗨|哈喽|hello|hi|hey|早上好|晚上好|晚安|谢谢|感谢|再见|拜拜|在吗|你是谁|你能做什么|介绍一下自己)[!！?？。…\s]*$/iu,
  /^(?:你觉得|你怎么看|怎么看|解释一下|讲讲|聊聊|为什么|怎么理解|给我建议|请问)[\s\S]{0,120}[?？。！!]?$/iu,
]

const RESEARCH_PATTERN = /(?:搜索|搜一下|上网搜|查资料|查找资料|查一下|调查一下|检索|联网|核实|确认一下|官网|官方文档|来源|资料链接|research|search|look\s*up|documentation|official\s+docs?)/iu
const COMMAND_PATTERN = /(?:运行|测试|构建|执行命令|启动|安装|部署|发布|run|test|build|execute|command|install|deploy)/iu
const WRITE_PATTERN = /(?:创建|新建|写入|修改|编辑|实现|开发|重构|生成|整理|移动|归档|复制|重命名|删除|清理|上传|发送|保存|create|write|edit|implement|refactor|generate|organize|move|rename|delete|upload|send)/iu
const READ_PATTERN = /(?:查看|看看|读取|打开|列出|扫描|检查|分析|统计|识别|找出|有哪些|桌面|工作区|目录|文件夹|文件|项目|仓库|代码|日志|read|inspect|review|open|list|scan|analy[sz]e)/iu
const WORKSPACE_CONTEXT_PATTERN = /(?:桌面|工作区|目录|文件夹|文件|项目|仓库|代码|README|\.md\b|\.json\b|\.js\b|\.py\b|workspace|folder|file|repository|code)/iu
const SENSITIVE_PATTERN = /(?:删除|清空|卸载|安装软件|发送邮件|发消息|发布到|修改系统|注册表|权限提升|delete|uninstall|send\s+(?:an?\s+)?email|publish|system\s+settings?|registry|elevat(?:e|ion))/iu
const URL_PATTERN = /https?:\/\/[^\s<>]+/iu
const AUTO_VERIFY_TIME_PATTERN = /(?:最近|最新|现在|目前|今天|今年|这两天|刚刚|近期|当下|很火|爆火|火了|流行|热门|趋势)/u
const AUTO_VERIFY_QUESTION_PATTERN = /(?:是什么|什么是|谁是|谁的|哪家|哪里|哪个|多少|怎么回事|知道吗|有没有|是真是假|真的?吗|靠谱吗)[？?！!。\s]*$/u
const UNKNOWN_ENTITY_PATTERN = /(?:不知道|不确定|没见过|没听过|不认识|不清楚|确认未知)/u
const AGENT_FOLLOWUP_PATTERN = /^(?:调查|搜索|检索|查找|分析|执行|处理)?(?:好(?:了)?没|完(?:成)?了没|到哪了|怎么样了|有结果了吗|查到了吗|弄好了吗)|^(?:结果呢|进度呢|继续|继续查|继续调查|继续处理|然后呢|下一步|再试一次|重试)[？?！!。…\s]*$/u

function result(kind, route, confidence, reason, extra = {}) {
  return { kind, route, confidence, reason, ...extra }
}

export function classifyIntent(input, { mode = 'BUDDY', hasAgentContext = false } = {}) {
  const text = String(input || '').trim()
  if (!text) return result('chat', 'chat', 1, '空消息不执行')

  const needsVerification = UNKNOWN_ENTITY_PATTERN.test(text) || AUTO_VERIFY_QUESTION_PATTERN.test(text) || (AUTO_VERIFY_TIME_PATTERN.test(text) && /(?:是什么|什么是|谁是|怎么样|怎么回事|知道吗|有没有|真假|靠谱吗)/u.test(text))

  // Chat mode never receives device/file execution rights, but factual web
  // verification is still available so the assistant does not guess about
  // current or unfamiliar information.
  if (mode === 'CHAT') {
    if (RESEARCH_PATTERN.test(text) || URL_PATTERN.test(text) || needsVerification) return result('research', 'agent', 0.95, '普通聊天需要先联网核验公开事实')
    return result('chat', 'chat', 1, '普通聊天无需调用本机工具')
  }
  if (mode !== 'BUDDY') return result('chat', 'chat', 1, '未知模式不执行')

  if (hasAgentContext && AGENT_FOLLOWUP_PATTERN.test(text)) return result('followup', 'agent', 0.98, '延续当前 ZT.buddy 执行会话')

  // Buddy treats uncertain or time-sensitive factual questions as verification
  // work, not ordinary chat. The service performs the actual source lookup
  // before the model is allowed to compose an answer.
  if (needsVerification) {
    return result('research', 'agent', 0.95, '包含需要先联网核验的不确定或时效性事实')
  }

  const explicitAction = URL_PATTERN.test(text) || RESEARCH_PATTERN.test(text) || COMMAND_PATTERN.test(text) || WRITE_PATTERN.test(text) || (READ_PATTERN.test(text) && WORKSPACE_CONTEXT_PATTERN.test(text))
  if (!explicitAction && CHAT_ONLY_PATTERNS.some(pattern => pattern.test(text))) return result('chat', 'chat', 0.99, '识别为问候或普通对话')

  if (RESEARCH_PATTERN.test(text)) return result('research', 'agent', 0.96, '包含检索、资料或来源请求')
  if (URL_PATTERN.test(text)) return result('research', 'agent', 0.96, '包含需要打开并核验的网页链接')
  if (COMMAND_PATTERN.test(text)) return result('command', 'agent', 0.94, '包含运行、测试或命令执行请求', { requiresApproval: true })
  if (WRITE_PATTERN.test(text)) {
    return result(SENSITIVE_PATTERN.test(text) ? 'sensitive' : 'write', 'agent', SENSITIVE_PATTERN.test(text) ? 0.98 : 0.94, SENSITIVE_PATTERN.test(text) ? '包含高风险文件或系统操作' : '包含创建、修改或整理请求', { requiresApproval: true })
  }
  if (READ_PATTERN.test(text) && WORKSPACE_CONTEXT_PATTERN.test(text)) return result('read', 'agent', 0.92, '包含工作区、文件或项目读取请求')

  return result('chat', 'chat', 0.72, '未检测到明确的本机执行目标')
}

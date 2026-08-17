const permissionCapabilities = {
  read: { capability: 'workspace_read', label: '读取工作区' },
  edit: { capability: 'workspace_write', label: '修改工作区' },
  write: { capability: 'workspace_write', label: '修改工作区' },
  bash: { capability: 'command_exec', label: '运行命令' },
  command: { capability: 'command_exec', label: '运行命令' },
  webfetch: { capability: 'web_access', label: '访问网页' },
  web: { capability: 'web_access', label: '访问网页' },
}

const toolLabels = {
  read: '读取文件',
  glob: '查找文件',
  grep: '搜索内容',
  list: '查看目录',
  bash: '运行命令',
  edit: '修改文件',
  write: '写入文件',
  webfetch: '访问网页',
}

function unwrap(event) {
  const payload = event?.payload ?? event
  if (!payload || typeof payload !== 'object') return null
  if (payload.type === 'sync' && payload.name && payload.data) {
    return { type: payload.name, properties: payload.data }
  }
  return payload.type ? payload : null
}

function sessionId(properties = {}) {
  return properties.sessionID ?? properties.sessionId ?? null
}

function safeDetails(values) {
  const source = Array.isArray(values) ? values : values == null ? [] : [values]
  return source
    .filter(value => typeof value === 'string' && value.trim())
    .slice(0, 8)
    .map(value => value.trim().slice(0, 240))
}

function toolLabel(tool) {
  return toolLabels[String(tool ?? '').toLowerCase()] ?? '调用工具'
}

function toolDetails(input = {}) {
  if (!input || typeof input !== 'object') return []
  return safeDetails([
    input.file_path,
    input.path,
    input.query,
    input.command,
    input.url,
  ])
}

function safeToolResult(state = {}) {
  if (state.status === 'completed' && typeof state.output === 'string') {
    return state.output.slice(0, 2400)
  }
  if (state.status === 'error') return '该工具未完成。'
  return ''
}

export function capabilityForMiMoPermission(permission) {
  return permissionCapabilities[String(permission ?? '').toLowerCase()]?.capability ?? 'sensitive_action'
}

export function normalizeMiMoEvent(input) {
  const event = unwrap(input)
  if (!event) return null
  const properties = event.properties ?? {}
  const currentSessionId = sessionId(properties)

  switch (event.type) {
    case 'session.created':
      return currentSessionId ? { type: 'session.started', sessionId: currentSessionId } : null

    case 'session.status': {
      if (!currentSessionId) return null
      if (properties.status?.type === 'busy') {
        return { type: 'plan.ready', sessionId: currentSessionId, label: '正在分析并准备执行' }
      }
      if (properties.status?.type === 'idle') return { type: 'session.completed', sessionId: currentSessionId }
      return null
    }

    case 'session.idle':
      return currentSessionId ? { type: 'session.completed', sessionId: currentSessionId } : null

    case 'message.part.delta':
      if (!currentSessionId || typeof properties.delta !== 'string' || !properties.delta) return null
      return { type: 'result.delta', sessionId: currentSessionId, text: properties.delta }

    case 'message.part.updated': {
      const part = properties.part
      if (!currentSessionId || part?.type !== 'tool') return null
      const toolId = part.id ?? part.callID
      if (!toolId) return null
      const state = part.state ?? {}
      if (state.status === 'pending' || state.status === 'running') {
        return {
          type: 'tool.started',
          sessionId: currentSessionId,
          toolId,
          label: toolLabel(part.tool),
          details: toolDetails(state.input),
        }
      }
      if (state.status === 'completed' || state.status === 'error') {
        return {
          type: 'tool.completed',
          sessionId: currentSessionId,
          toolId,
          label: toolLabel(part.tool),
          result: safeToolResult(state),
        }
      }
      return null
    }

    case 'permission.asked': {
      if (!currentSessionId || !properties.id) return null
      const permission = String(properties.permission ?? '')
      const mapped = permissionCapabilities[permission.toLowerCase()]
      return {
        type: 'approval.required',
        sessionId: currentSessionId,
        permissionId: properties.id,
        capability: mapped?.capability ?? 'sensitive_action',
        label: mapped?.label ?? '敏感操作',
        details: safeDetails(properties.patterns),
      }
    }

    case 'session.error':
      return {
        type: 'session.failed',
        sessionId: currentSessionId,
        message: '执行暂时未完成，请检查权限或稍后重试。',
      }

    default:
      return null
  }
}

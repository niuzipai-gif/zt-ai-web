export function createTaskRunRegistry() {
  const runs = new Map()

  return {
    create(chatId, fields = {}) {
      const id = String(chatId || '')
      if (!id) throw new Error('任务运行缺少会话标识')
      const run = {
        chatId: id,
        kind: 'agent',
        taskId: null,
        task: '',
        controller: null,
        reader: null,
        activeAgentMessage: null,
        activeAgentTask: '',
        agentStream: null,
        pendingApproval: null,
        output: '',
        finished: false,
        ...fields,
      }
      runs.set(id, run)
      return run
    },
    get(chatId) {
      return runs.get(String(chatId || '')) || null
    },
    has(chatId) {
      return runs.has(String(chatId || ''))
    },
    delete(chatId) {
      return runs.delete(String(chatId || ''))
    },
    values() {
      return [...runs.values()]
    },
    size() {
      return runs.size
    },
  }
}

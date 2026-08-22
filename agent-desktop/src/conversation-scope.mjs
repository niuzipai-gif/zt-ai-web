export function scopedConversationId(accountId, conversationId) {
  const account = String(accountId || 'local').trim()
  const conversation = String(conversationId || '').trim()
  if (!account || !conversation) throw new Error('ZT.buddy 会话需要账户和对话标识')
  return `${account}:${conversation}`
}

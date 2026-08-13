export function readAuthToken(storage) {
  try { return storage.getItem('zt-ai:desktop-token') || '' } catch { return '' }
}

export function saveAuthToken(storage, token) {
  if (!token) return clearAuthToken(storage)
  storage.setItem('zt-ai:desktop-token', token)
  return token
}

export function clearAuthToken(storage) {
  try { storage.removeItem('zt-ai:desktop-token') } catch {}
  return ''
}

export function persistModel(storage, model) {
  const next = String(model || '').toUpperCase() === 'DEEPSEEK' ? 'DEEPSEEK' : 'MINIMAX'
  storage.setItem('zt-ai:agent-model', next)
  return next
}


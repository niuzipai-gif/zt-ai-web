function sameSnapshot(left = {}, right = {}) {
  return left.chatId === right.chatId
    && left.mode === right.mode
    && Boolean(left.railCollapsed) === Boolean(right.railCollapsed)
}

function normalizeSnapshot(value = {}) {
  return {
    chatId: String(value.chatId || ''),
    mode: value.mode === 'BUDDY' ? 'BUDDY' : 'CHAT',
    railCollapsed: Boolean(value.railCollapsed),
  }
}

export function createNavigationState(initial = {}) {
  const current = normalizeSnapshot(initial)
  return { entries: [current], index: 0, current, canGoBack: false, canGoForward: false }
}

function at(state, index) {
  const entries = state.entries || []
  const safeIndex = Math.max(0, Math.min(index, entries.length - 1))
  const current = entries[safeIndex] || normalizeSnapshot()
  return {
    entries,
    index: safeIndex,
    current,
    canGoBack: safeIndex > 0,
    canGoForward: safeIndex < entries.length - 1,
  }
}

export function pushNavigationState(state, snapshot) {
  const next = normalizeSnapshot(snapshot)
  const base = at(state, Number(state?.index) || 0)
  if (sameSnapshot(base.current, next)) return base
  return at({ ...base, entries: [...base.entries.slice(0, base.index + 1), next] }, base.index + 1)
}

export function goBack(state) {
  const base = at(state, Number(state?.index) || 0)
  return at(base, base.index - 1)
}

export function goForward(state) {
  const base = at(state, Number(state?.index) || 0)
  return at(base, base.index + 1)
}

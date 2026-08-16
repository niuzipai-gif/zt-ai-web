export function buildStarterPrompts(copy) {
  return Array.isArray(copy?.starterPrompts) ? copy.starterPrompts.filter(Boolean).slice(0, 3) : []
}

export function formatRelativeSessionTime(timestamp, now = Date.now(), language = 'zh') {
  const minutes = Math.max(0, Math.round((now - Number(timestamp || now)) / 60_000))
  if (language === 'zh') return minutes < 1 ? '刚刚' : minutes < 60 ? `${minutes} 分钟前` : minutes < 1_440 ? `${Math.floor(minutes / 60)} 小时前` : `${Math.floor(minutes / 1_440)} 天前`
  if (language === 'ja') return minutes < 1 ? 'たった今' : minutes < 60 ? `${minutes}分前` : minutes < 1_440 ? `${Math.floor(minutes / 60)}時間前` : `${Math.floor(minutes / 1_440)}日前`
  return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes}m ago` : minutes < 1_440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1_440)}d ago`
}

export function shouldUseCompactProfile({ viewportWidth, messageCount }) {
  return Number(viewportWidth) <= 800 && Number(messageCount) > 0
}

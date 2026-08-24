const DEFAULT_TIME_ZONE = 'Asia/Shanghai'

function safeTimeZone(value) {
  const candidate = String(value || DEFAULT_TIME_ZONE).trim() || DEFAULT_TIME_ZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format()
    return candidate
  } catch {
    return DEFAULT_TIME_ZONE
  }
}

function partsFor(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  }).formatToParts(now)
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
}

export function buildRuntimeContext({ now = new Date(), timeZone = process.env.ZT_AI_TIME_ZONE || DEFAULT_TIME_ZONE } = {}) {
  const resolvedTimeZone = safeTimeZone(timeZone)
  const parts = partsFor(now, resolvedTimeZone)
  const weekday = new Intl.DateTimeFormat('zh-CN', { timeZone: resolvedTimeZone, weekday: 'long' }).format(now)
  const offset = parts.timeZoneName || 'GMT+08:00'
  return `【系统当前日期与时间】\n+- 当前日期：${parts.year}-${parts.month}-${parts.day}（${weekday}）\n+- 当前时间：${parts.hour}:${parts.minute}:${parts.second}\n+- 时区：${resolvedTimeZone}（${offset}）\n+- 这是本次请求的权威运行时钟，不得用模型训练记忆替代。用户说“今天、昨天、明天、这周六”等相对日期时，必须先按这个日期换算；涉及展会、新闻、价格、安排等现实信息时，仍必须联网核验。`
}

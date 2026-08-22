function sanitize(message) {
  return String(message || '')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[已隐藏]')
    .replace(/https?:\/\/[^\s)]+/gi, '[服务地址]')
    .replace(/[A-Za-z]:\\[^\r\n]+/g, '[本机路径]')
    .trim()
    .slice(0, 320)
}

export function publicTaskFailure(error, fallback = '桌面任务暂时没有完成，请稍后重试。') {
  const raw = sanitize(error?.message || error)
  if (!raw) return fallback
  if (/failed to fetch|networkerror|econnrefused|enotfound|etimedout|网络|网关|服务地址/iu.test(raw)) return '网关或网络连接暂时不可用，请检查网络与桌面服务后重试。'
  if (/权限|授权|approval|permission/iu.test(raw)) return raw
  if (/执行内核|codex|内核.*安装|版本不匹配/iu.test(raw)) return raw
  return raw
}

const LOOPBACK_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i

export function isAllowedOrigin(requestOrigin, allowedOrigins = []) {
  const origin = String(requestOrigin || '').trim()
  return Boolean(origin) && (allowedOrigins.includes('*') || allowedOrigins.includes(origin) || LOOPBACK_ORIGIN.test(origin))
}

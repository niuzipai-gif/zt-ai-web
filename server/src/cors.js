const LOOPBACK_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i
// The asset-only public mirror uses the same gateway and voice configuration.
const PUBLIC_STATIC_ORIGIN = 'https://zt-ai-static.niuzipai.workers.dev'

export function isAllowedOrigin(requestOrigin, allowedOrigins = []) {
  const origin = String(requestOrigin || '').trim()
  return Boolean(origin) && (allowedOrigins.includes('*') || allowedOrigins.includes(origin) || origin === PUBLIC_STATIC_ORIGIN || LOOPBACK_ORIGIN.test(origin))
}

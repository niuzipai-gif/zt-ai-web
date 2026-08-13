export function createAdminApi({ auth, telemetry }) {
  async function requireAdmin(token) {
    const session = await auth.getSession(token, 'admin')
    if (!session) throw new Error('需要管理员登录')
    return session
  }

  return {
    async login(password) { return auth.loginAdmin(password) },
    async logout(token) { await requireAdmin(token); await auth.revoke(token, 'admin'); return { ok: true } },
    async me(token) { const session = await requireAdmin(token); return { id: session.user.id, username: session.user.username, expiresAt: session.expiresAt } },
    async overview(token) { await requireAdmin(token); return telemetry.overview() },
    async visitors(token, filters) { await requireAdmin(token); return telemetry.listVisitors(filters) },
    async usage(token, filters) { await requireAdmin(token); return telemetry.listUsage(filters) },
    async detail(token, id) { await requireAdmin(token); const detail = await telemetry.visitorDetail(id); if (!detail) throw new Error('访客不存在'); return detail },
  }
}

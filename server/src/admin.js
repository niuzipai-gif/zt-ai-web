function adminUserSummary(user) {
  if (!user) return null
  return {
    id: user.id,
    username: user.username,
    email: user.email || null,
    phone: user.phone || null,
    status: user.status || 'active',
    accessExpiresAt: user.accessExpiresAt ?? null,
    accessExpired: user.accessExpired === true,
  }
}

export function createAdminApi({ auth, telemetry }) {
  async function requireAdmin(token) {
    const session = await auth.getSession(token, 'admin')
    if (!session) throw new Error('需要管理员登录')
    return session
  }

  return {
    async login(input) { return auth.loginAdmin(input) },
    async logout(token) { await requireAdmin(token); await auth.revoke(token, 'admin'); return { ok: true } },
    async me(token) { const session = await requireAdmin(token); return { id: session.user.id, username: session.user.username, expiresAt: session.expiresAt } },
    async overview(token) {
      await requireAdmin(token)
      const [overview, users] = await Promise.all([telemetry.overview(), auth.users()])
      return {
        ...overview,
        accounts: users.length,
        pendingAccounts: users.filter(user => user.status === 'pending').length,
        activeAccounts: users.filter(user => user.status === 'active' && !user.accessExpired).length,
      }
    },
    async visitors(token, filters) {
      await requireAdmin(token)
      const [visitors, users] = await Promise.all([telemetry.listVisitors({ ...(filters || {}), query: '' }), auth.users()])
      const byId = new Map(users.map(user => [user.id, user]))
      const query = String(filters?.query || '').trim().toLowerCase()
      return visitors.map(visitor => ({ ...visitor, user: adminUserSummary(byId.get(visitor.userId)) })).filter(visitor => !query || `${visitor.id} ${visitor.visitorId} ${visitor.maskedIp} ${visitor.product} ${visitor.user?.username || ''} ${visitor.user?.email || ''} ${visitor.user?.phone || ''}`.toLowerCase().includes(query))
    },
    async usage(token, filters) {
      await requireAdmin(token)
      const [events, users] = await Promise.all([telemetry.listUsage(filters), auth.users()])
      const byId = new Map(users.map(user => [user.id, user]))
      return events.map(event => ({ ...event, user: adminUserSummary(byId.get(event.userId)) }))
    },
    async detail(token, id) {
      await requireAdmin(token)
      const detail = await telemetry.visitorDetail(id)
      if (!detail) throw new Error('访客不存在')
      const users = await auth.users()
      const user = users.find(item => item.id === detail.visitor.userId)
      return { ...detail, visitor: { ...detail.visitor, user: adminUserSummary(user) }, user: adminUserSummary(user) }
    },
    async users(token, filters) { await requireAdmin(token); return auth.users(filters) },
    async approveUser(token, id, options = {}) { await requireAdmin(token); return auth.approveUser(id, options) },
    async setUserAccess(token, id, options = {}) { await requireAdmin(token); return auth.setUserAccess(id, options) },
    async revokeUser(token, id) { await requireAdmin(token); return auth.revokeUser(id) },
  }
}

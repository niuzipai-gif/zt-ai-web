(function installVisitorDetailEnhancements() {
  function install() {
    if (typeof window.openDetail !== 'function' || window.openDetail.__ztEnhanced) return false
    const originalOpenDetail = window.openDetail
    const enhancedOpenDetail = async function (id) {
      await originalOpenDetail(id)
      try {
        const detail = await window.request(`/api/admin/visitors/${encodeURIComponent(id)}`)
        const content = document.querySelector('#detail-content')
        if (!content) return
        const user = detail.user || detail.visitor?.user
        const accountSection = user
          ? `<div class="drawer-section visitor-account"><h3>访问账号</h3><div class="detail-grid"><div><span>用户名</span><strong>${window.escapeHtml(user.username)}</strong></div><div><span>邮箱</span><strong>${window.escapeHtml(user.email || '未填写')}</strong></div><div><span>手机号</span><strong>${window.escapeHtml(user.phone || '未填写')}</strong></div><div><span>账号状态</span><strong>${window.escapeHtml(user.status || '—')}</strong></div><div><span>使用期限</span><strong>${user.accessExpiresAt ? window.date(user.accessExpiresAt) : '长期有效'}</strong></div></div></div>`
          : '<div class="drawer-section visitor-account"><h3>访问账号</h3><div class="empty">匿名公开访客，未关联桌面账号</div></div>'
        const conversations = detail.conversations || []
        const conversationSection = `<div class="drawer-section visitor-conversations"><h3>会话记录 · ${conversations.length} 个</h3>${conversations.length ? conversations.map(item => `<div class="usage-card"><span>${window.date(item.createdAt)} · ${window.escapeHtml(item.product || detail.visitor.product)}</span><strong>${window.escapeHtml(item.id)}${item.userId ? ` · ${window.escapeHtml(item.userId)}` : ''}</strong></div>`).join('') : '<div class="empty">暂无会话记录</div>'}</div>`
        content.insertAdjacentHTML('afterbegin', `${accountSection}${conversationSection}`)
      } catch (error) {
        console.warn('访客详细账号信息加载失败', error)
      }
    }
    enhancedOpenDetail.__ztEnhanced = true
    window.openDetail = enhancedOpenDetail
    return true
  }
  const timer = window.setInterval(() => { if (install()) window.clearInterval(timer) }, 0)
  window.setTimeout(() => window.clearInterval(timer), 10_000)
})()

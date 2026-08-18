import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { getDataStore } from './data-store.js'

const scrypt = promisify(crypto.scrypt)
const USER_SESSION_MS = 30 * 24 * 60 * 60 * 1000
const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function validateEmail(value) {
  const email = normalizeEmail(value)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('请输入有效邮箱地址')
  return email
}

function validateCredentials({ username, password }) {
  const normalized = normalizeUsername(username)
  if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/i.test(normalized)) throw new Error('用户名需为 3-32 位字母、数字、点、下划线或短横线')
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new Error('密码需为 8-128 位')
  return { username: normalized, password }
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString('base64url')) {
  const derived = await scrypt(password, salt, 32)
  return { salt, hash: Buffer.from(derived).toString('base64url') }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function randomVerificationCode() {
  return String(crypto.randomInt(100000, 1000000))
}

async function defaultVerificationMailer({ email, code }) {
  const webhook = String(process.env.ZT_AI_EMAIL_WEBHOOK_URL || '').trim()
  if (webhook) {
    const response = await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: email, code, subject: 'ZT.AI 邮箱验证码' }) })
    if (!response.ok) throw new Error('邮箱验证码发送失败，请稍后重试')
    return { delivery: 'webhook' }
  }
  const resendKey = String(process.env.RESEND_API_KEY || '').trim()
  const resendFrom = String(process.env.RESEND_FROM_EMAIL || '').trim()
  if (resendKey && resendFrom) {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: resendFrom, to: [email], subject: 'ZT.AI 邮箱验证码', text: `你的 ZT.AI 注册验证码是 ${code}，10 分钟内有效。` }) })
    if (!response.ok) throw new Error('邮箱验证码发送失败，请稍后重试')
    return { delivery: 'resend' }
  }
  if (process.env.ZT_AI_TEST_MODE === '1' || process.env.ZT_AI_EMAIL_CONSOLE === '1') {
    console.log(`[ZT.AI verification] ${email}: ${code}`)
    return { delivery: 'console' }
  }
  throw new Error('邮件验证码服务未配置，请联系管理员')
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email || null,
    status: user.status || 'active',
    createdAt: user.createdAt,
    requestedAt: user.requestedAt || user.createdAt,
    approvedAt: user.approvedAt || null,
    revokedAt: user.revokedAt || null,
    lastLoginAt: user.lastLoginAt || null,
  }
}

function userStatus(user) {
  return user?.status || 'active'
}

export function createAuthService({ store = getDataStore(), now = () => Date.now(), adminUsername = process.env.ADMIN_USERNAME || 'shali', adminPassword = process.env.ADMIN_PASSWORD || '', adminSalt = process.env.ADMIN_PASSWORD_SALT, adminHash = process.env.ADMIN_PASSWORD_HASH, adminSessionMs = Number(process.env.ADMIN_SESSION_MS || ADMIN_SESSION_MS), requireEmailVerification = process.env.REQUIRE_EMAIL_VERIFICATION !== '0', verificationMailer = defaultVerificationMailer, verificationCode = randomVerificationCode, verificationTtlMs = 10 * 60 * 1000, verificationCooldownMs = 60 * 1000 } = {}) {
  const configuredAdmin = adminHash && adminSalt
    ? { salt: adminSalt, hash: adminHash }
    : adminPassword ? null : null

  async function isValidAdminPassword(password) {
    if (configuredAdmin) return (await hashPassword(password, configuredAdmin.salt)).hash === configuredAdmin.hash
    if (!adminPassword) return false
    const supplied = crypto.createHash('sha256').update(String(password)).digest()
    const expected = crypto.createHash('sha256').update(String(adminPassword)).digest()
    return crypto.timingSafeEqual(supplied, expected)
  }

  async function createSession(userId, type, duration) {
    const token = crypto.randomBytes(32).toString('base64url')
    await store.update(data => {
      const collection = type === 'admin' ? data.adminSessions : data.sessions
      collection.push({ id: crypto.randomUUID(), userId, tokenHash: hashToken(token), type, createdAt: now(), expiresAt: now() + duration })
    })
    return token
  }

  async function getSession(token, type = 'user') {
    if (!token) return null
    const tokenHash = hashToken(token)
    const data = await store.read()
    const collection = type === 'admin' ? data.adminSessions : data.sessions
    const session = collection.find(item => item.tokenHash === tokenHash && item.type === type)
    if (!session || session.expiresAt <= now()) return null
    if (type === 'admin') return { ...session, user: { id: 'admin', username: normalizeUsername(adminUsername) } }
    const user = data.users.find(item => item.id === session.userId)
    return user && userStatus(user) === 'active' ? { ...session, user: publicUser(user) } : null
  }

  async function updateUserStatus(userId, status) {
    let updated
    await store.update(data => {
      const user = data.users.find(item => item.id === userId)
      if (!user) throw new Error('用户不存在')
      user.status = status
      if (status === 'active') {
        user.approvedAt = user.approvedAt || now()
        user.revokedAt = null
      } else if (status === 'revoked') {
        user.revokedAt = now()
      }
      updated = publicUser(user)
      if (status === 'revoked') data.sessions = data.sessions.filter(session => session.userId !== userId)
    })
    return updated
  }

  async function requestEmailVerification(input) {
    const email = validateEmail(input)
    const data = await store.read()
    const existing = data.users.find(user => user.email === email && userStatus(user) !== 'revoked')
    if (existing) throw new Error('该邮箱已注册')
    const recent = data.verificationChallenges.find(item => item.email === email && !item.usedAt && now() - item.createdAt < verificationCooldownMs)
    if (recent) throw new Error('验证码已发送，请稍后再试')
    const id = crypto.randomUUID()
    const code = String(verificationCode()).replace(/\D/g, '').padStart(6, '0').slice(-6)
    const expiresAt = now() + verificationTtlMs
    await store.update(next => {
      next.verificationChallenges = next.verificationChallenges.filter(item => item.email !== email || item.usedAt || item.expiresAt > now())
      next.verificationChallenges.push({ id, email, codeHash: hashToken(`${id}:${code}`), createdAt: now(), expiresAt, usedAt: null })
    })
    const delivery = await verificationMailer({ email, code, verificationId: id, expiresAt })
    return { verificationId: id, expiresAt, expiresIn: verificationTtlMs, ...(process.env.ZT_AI_TEST_MODE === '1' && delivery?.delivery === 'console' ? { debugCode: code } : {}) }
  }

  async function consumeEmailVerification({ email, verificationId, verificationCode: suppliedCode }) {
    const normalizedEmail = validateEmail(email)
    if (!verificationId || !suppliedCode) throw new Error('请先获取并填写邮箱验证码')
    let valid = false
    await store.update(data => {
      const challenge = data.verificationChallenges.find(item => item.id === String(verificationId) && item.email === normalizedEmail && !item.usedAt)
      if (!challenge || challenge.expiresAt <= now() || challenge.codeHash !== hashToken(`${challenge.id}:${String(suppliedCode).trim()}`)) throw new Error('邮箱验证码错误或已过期')
      challenge.usedAt = now()
      valid = true
    })
    return valid
  }

  return {
    store,
    async requestEmailVerification(email) { return requestEmailVerification(email) },
    async register(input) {
      const { username, password } = validateCredentials(input)
      const email = requireEmailVerification ? validateEmail(input.email) : input.email ? validateEmail(input.email) : null
      if (requireEmailVerification) await consumeEmailVerification({ email, verificationId: input.verificationId, verificationCode: input.verificationCode })
      const data = await store.read()
      if (data.users.some(user => user.username === username)) throw new Error('用户名已存在')
      if (email && data.users.some(user => user.email === email)) throw new Error('该邮箱已注册')
      const credentials = await hashPassword(password)
      const user = { id: crypto.randomUUID(), username, email, ...{ passwordHash: credentials.hash, passwordSalt: credentials.salt }, createdAt: now(), requestedAt: now(), status: 'pending', approvedAt: null, revokedAt: null, lastLoginAt: null }
      await store.update(next => { next.users.push(user) })
      return { pending: true, user: publicUser(user) }
    },
    async login(input) {
      const { username, password } = validateCredentials(input)
      const data = await store.read()
      let user = data.users.find(item => item.username === username)
      if (!user && username === normalizeUsername(adminUsername) && await isValidAdminPassword(password)) {
        const credentials = await hashPassword(password)
        const bootstrapUser = { id: crypto.randomUUID(), username, passwordHash: credentials.hash, passwordSalt: credentials.salt, createdAt: now(), requestedAt: now(), status: 'active', approvedAt: now(), revokedAt: null, lastLoginAt: null }
        await store.update(next => {
          if (!next.users.some(item => item.username === username)) next.users.push(bootstrapUser)
        })
        user = bootstrapUser
      }
      if (!user || (await hashPassword(password, user.passwordSalt)).hash !== user.passwordHash) throw new Error('用户名或密码错误')
      if (userStatus(user) === 'pending') throw new Error('账号正在等待管理员审核')
      if (userStatus(user) === 'revoked') throw new Error('账号已被注销')
      await store.update(next => {
        const current = next.users.find(item => item.id === user.id)
        if (current) current.lastLoginAt = now()
      })
      const token = await createSession(user.id, 'user', USER_SESSION_MS)
      return { token, user: publicUser({ ...user, lastLoginAt: now() }) }
    },
    async loginAdmin(input) {
      const username = normalizeUsername(typeof input === 'string' ? adminUsername : input?.username)
      const password = typeof input === 'string' ? input : input?.password
      if (username !== normalizeUsername(adminUsername)) throw new Error('管理员账号或密码错误')
      if (!await isValidAdminPassword(password)) throw new Error('管理员账号或密码错误')
      const token = await createSession('admin', 'admin', adminSessionMs)
      return { token, username: normalizeUsername(adminUsername), expiresIn: adminSessionMs }
    },
    async users(filters = {}) {
      const data = await store.read()
      const status = filters.status ? String(filters.status) : ''
      const query = String(filters.query || '').trim().toLowerCase()
      return data.users
        .filter(user => !status || userStatus(user) === status)
        .filter(user => !query || user.username.includes(query) || user.id.toLowerCase().includes(query))
        .sort((a, b) => (b.requestedAt || b.createdAt) - (a.requestedAt || a.createdAt))
        .map(publicUser)
    },
    async approveUser(userId) { return updateUserStatus(userId, 'active') },
    async revokeUser(userId) { return updateUserStatus(userId, 'revoked') },
    getSession,
    async revoke(token, type = 'user') {
      const tokenHash = hashToken(token)
      await store.update(data => {
        const collection = type === 'admin' ? data.adminSessions : data.sessions
        const index = collection.findIndex(item => item.tokenHash === tokenHash)
        if (index >= 0) collection.splice(index, 1)
      })
    },
  }
}

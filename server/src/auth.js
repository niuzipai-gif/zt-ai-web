import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { getDataStore } from './data-store.js'

const scrypt = promisify(crypto.scrypt)
const USER_SESSION_MS = 30 * 24 * 60 * 60 * 1000
const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000
const DEFAULT_USER_ACCESS_HOURS = 24
const MAX_USER_ACCESS_HOURS = 10 * 365 * 24
const HOUR_MS = 60 * 60 * 1000

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase()
}

function validatePhone(value) {
  const phone = String(value || '').trim().replace(/[\s()（）-－]/g, '')
  if (!/^\+?\d{7,20}$/.test(phone)) throw new Error('请输入有效手机号')
  return phone
}

function validateEmail(value) {
  const email = String(value || '').trim().toLowerCase()
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

function normalizeAccessDuration({ durationHours, permanent = false } = {}) {
  if (permanent === true) return null
  if (durationHours === undefined || durationHours === null || durationHours === '') return DEFAULT_USER_ACCESS_HOURS
  const hours = Number(durationHours)
  if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_USER_ACCESS_HOURS) throw new Error(`使用时长需为 1-${MAX_USER_ACCESS_HOURS} 小时，或选择永久`)
  return hours
}

function isAccessExpired(user, timestamp) {
  return user?.accessExpiresAt !== null && user?.accessExpiresAt !== undefined && Number.isFinite(Number(user.accessExpiresAt)) && Number(user.accessExpiresAt) <= timestamp
}

function publicUser(user, timestamp = Date.now()) {
  return {
    id: user.id,
    username: user.username,
    email: user.email || null,
    phone: user.phone || null,
    status: user.status || 'active',
    createdAt: user.createdAt,
    requestedAt: user.requestedAt || user.createdAt,
    approvedAt: user.approvedAt || null,
    revokedAt: user.revokedAt || null,
    lastLoginAt: user.lastLoginAt || null,
    accessExpiresAt: user.accessExpiresAt ?? null,
    accessDurationHours: user.accessDurationHours ?? null,
    accessExpired: userStatus(user) === 'active' && isAccessExpired(user, timestamp),
  }
}

function userStatus(user) {
  return user?.status || 'active'
}

export function createAuthService({ store = getDataStore(), now = () => Date.now(), adminUsername = process.env.ADMIN_USERNAME || 'shali', adminPassword = process.env.ADMIN_PASSWORD || '', adminSalt = process.env.ADMIN_PASSWORD_SALT, adminHash = process.env.ADMIN_PASSWORD_HASH, adminSessionMs = Number(process.env.ADMIN_SESSION_MS || ADMIN_SESSION_MS) } = {}) {
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
    return user && userStatus(user) === 'active' && !isAccessExpired(user, now()) ? { ...session, user: publicUser(user, now()) } : null
  }

  async function updateUserStatus(userId, status, options = {}) {
    let updated
    await store.update(data => {
      const user = data.users.find(item => item.id === userId)
      if (!user) throw new Error('用户不存在')
      const timestamp = now()
      user.status = status
      if (status === 'active') {
        user.approvedAt = timestamp
        user.revokedAt = null
        const accessHours = normalizeAccessDuration(options)
        user.accessDurationHours = accessHours
        user.accessExpiresAt = accessHours === null ? null : timestamp + accessHours * HOUR_MS
      } else if (status === 'revoked') {
        user.revokedAt = timestamp
      }
      updated = publicUser(user, timestamp)
      if (status === 'revoked') data.sessions = data.sessions.filter(session => session.userId !== userId)
    })
    return updated
  }

  async function updateUserAccess(userId, options = {}) {
    let updated
    await store.update(data => {
      const user = data.users.find(item => item.id === userId)
      if (!user) throw new Error('用户不存在')
      if (userStatus(user) !== 'active') throw new Error('只有已通过的账号可以调整使用期限')
      const timestamp = now()
      const accessHours = normalizeAccessDuration(options)
      user.accessDurationHours = accessHours
      user.accessExpiresAt = accessHours === null ? null : timestamp + accessHours * HOUR_MS
      updated = publicUser(user, timestamp)
    })
    return updated
  }

  return {
    store,
    async register(input) {
      const { username, password } = validateCredentials(input)
      const phone = validatePhone(input.phone)
      const email = validateEmail(input.email)
      const data = await store.read()
      if (data.users.some(user => user.username === username)) throw new Error('用户名已存在')
      if (data.users.some(user => user.phone === phone)) throw new Error('该手机号已注册')
      if (data.users.some(user => user.email === email)) throw new Error('该邮箱已注册')
      const credentials = await hashPassword(password)
      const user = { id: crypto.randomUUID(), username, phone, email, ...{ passwordHash: credentials.hash, passwordSalt: credentials.salt }, createdAt: now(), requestedAt: now(), status: 'pending', approvedAt: null, revokedAt: null, lastLoginAt: null, accessExpiresAt: null, accessDurationHours: null }
      await store.update(next => { next.users.push(user) })
      return { pending: true, user: publicUser(user) }
    },
    async login(input) {
      const { username, password } = validateCredentials(input)
      const data = await store.read()
      let user = data.users.find(item => item.username === username)
      if (!user && username === normalizeUsername(adminUsername) && await isValidAdminPassword(password)) {
        const credentials = await hashPassword(password)
        const bootstrapUser = { id: crypto.randomUUID(), username, phone: null, passwordHash: credentials.hash, passwordSalt: credentials.salt, createdAt: now(), requestedAt: now(), status: 'active', approvedAt: now(), revokedAt: null, lastLoginAt: null, accessExpiresAt: null, accessDurationHours: null }
        await store.update(next => {
          if (!next.users.some(item => item.username === username)) next.users.push(bootstrapUser)
        })
        user = bootstrapUser
      }
      if (!user || (await hashPassword(password, user.passwordSalt)).hash !== user.passwordHash) throw new Error('用户名或密码错误')
      if (userStatus(user) === 'pending') throw new Error('账号正在等待管理员审核')
      if (userStatus(user) === 'revoked') throw new Error('账号已被注销')
      if (isAccessExpired(user, now())) throw new Error('账号使用期限已到期，请联系管理员')
      const loginAt = now()
      await store.update(next => {
        const current = next.users.find(item => item.id === user.id)
        if (current) current.lastLoginAt = loginAt
      })
      const token = await createSession(user.id, 'user', USER_SESSION_MS)
      return { token, user: publicUser({ ...user, lastLoginAt: loginAt }, loginAt) }
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
      const timestamp = now()
      return data.users
        .filter(user => !status || userStatus(user) === status)
        .filter(user => !query || user.username.includes(query) || String(user.phone || '').includes(query) || String(user.email || '').includes(query) || user.id.toLowerCase().includes(query))
        .sort((a, b) => (b.requestedAt || b.createdAt) - (a.requestedAt || a.createdAt))
        .map(user => publicUser(user, timestamp))
    },
    async approveUser(userId, options = {}) { return updateUserStatus(userId, 'active', options) },
    async setUserAccess(userId, options = {}) { return updateUserAccess(userId, options) },
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

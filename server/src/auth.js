import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { getDataStore } from './data-store.js'

const scrypt = promisify(crypto.scrypt)
const USER_SESSION_MS = 30 * 24 * 60 * 60 * 1000
const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase()
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

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
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

export function createAuthService({ store = getDataStore(), now = () => Date.now(), adminUsername = process.env.ADMIN_USERNAME || 'shali', adminPassword = process.env.ADMIN_PASSWORD || '', adminSalt = process.env.ADMIN_PASSWORD_SALT, adminHash = process.env.ADMIN_PASSWORD_HASH, adminSessionMs = Number(process.env.ADMIN_SESSION_MS || ADMIN_SESSION_MS) } = {}) {
  const configuredAdmin = adminHash && adminSalt
    ? { salt: adminSalt, hash: adminHash }
    : adminPassword ? null : null

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

  return {
    store,
    async register(input) {
      const { username, password } = validateCredentials(input)
      const data = await store.read()
      if (data.users.some(user => user.username === username)) throw new Error('用户名已存在')
      const credentials = await hashPassword(password)
      const user = { id: crypto.randomUUID(), username, ...{ passwordHash: credentials.hash, passwordSalt: credentials.salt }, createdAt: now(), requestedAt: now(), status: 'pending', approvedAt: null, revokedAt: null, lastLoginAt: null }
      await store.update(next => { next.users.push(user) })
      return { pending: true, user: publicUser(user) }
    },
    async login(input) {
      const { username, password } = validateCredentials(input)
      const data = await store.read()
      const user = data.users.find(item => item.username === username)
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
      let valid = false
      if (configuredAdmin) valid = (await hashPassword(password, configuredAdmin.salt)).hash === configuredAdmin.hash
      else if (adminPassword) {
        const supplied = crypto.createHash('sha256').update(String(password)).digest()
        const expected = crypto.createHash('sha256').update(String(adminPassword)).digest()
        valid = crypto.timingSafeEqual(supplied, expected)
      }
      if (!valid) throw new Error('管理员账号或密码错误')
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

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
  return { id: user.id, username: user.username, createdAt: user.createdAt }
}

export function createAuthService({ store = getDataStore(), now = () => Date.now(), adminPassword = process.env.ADMIN_PASSWORD || '', adminSalt = process.env.ADMIN_PASSWORD_SALT, adminHash = process.env.ADMIN_PASSWORD_HASH } = {}) {
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
    if (type === 'admin') return { ...session, user: { id: 'admin', username: 'admin' } }
    const user = data.users.find(item => item.id === session.userId)
    return user ? { ...session, user: publicUser(user) } : null
  }

  return {
    store,
    async register(input) {
      const { username, password } = validateCredentials(input)
      const data = await store.read()
      if (data.users.some(user => user.username === username)) throw new Error('用户名已存在')
      const credentials = await hashPassword(password)
      const user = { id: crypto.randomUUID(), username, ...{ passwordHash: credentials.hash, passwordSalt: credentials.salt }, createdAt: now() }
      await store.update(next => { next.users.push(user) })
      const token = await createSession(user.id, 'user', USER_SESSION_MS)
      return { token, user: publicUser(user) }
    },
    async login(input) {
      const { username, password } = validateCredentials(input)
      const data = await store.read()
      const user = data.users.find(item => item.username === username)
      if (!user || (await hashPassword(password, user.passwordSalt)).hash !== user.passwordHash) throw new Error('用户名或密码错误')
      const token = await createSession(user.id, 'user', USER_SESSION_MS)
      return { token, user: publicUser(user) }
    },
    async loginAdmin(password) {
      let valid = false
      if (configuredAdmin) valid = (await hashPassword(password, configuredAdmin.salt)).hash === configuredAdmin.hash
      else if (adminPassword) {
        const supplied = crypto.createHash('sha256').update(String(password)).digest()
        const expected = crypto.createHash('sha256').update(String(adminPassword)).digest()
        valid = crypto.timingSafeEqual(supplied, expected)
      }
      if (!valid) throw new Error('管理员密码错误')
      const token = await createSession('admin', 'admin', ADMIN_SESSION_MS)
      return { token, expiresIn: ADMIN_SESSION_MS }
    },
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

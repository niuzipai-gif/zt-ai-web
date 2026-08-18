import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

export const COLLECTIONS = Object.freeze([
  'users', 'sessions', 'visitors', 'pageViews', 'conversations', 'messages', 'usageEvents', 'adminSessions', 'verificationChallenges',
])

export function emptyData() {
  return Object.fromEntries(COLLECTIONS.map(collection => [collection, []]))
}

function normalizeData(value) {
  const data = value && typeof value === 'object' ? value : {}
  return Object.fromEntries(COLLECTIONS.map(collection => [collection, Array.isArray(data[collection]) ? data[collection] : []]))
}

export class JsonDataStore {
  constructor(filePath = process.env.ZT_AI_DATA_PATH || path.resolve(process.cwd(), 'data', 'zt-ai.json')) {
    this.filePath = filePath
    this.queue = Promise.resolve()
  }

  async read() {
    try {
      return normalizeData(JSON.parse(await fs.readFile(this.filePath, 'utf8')))
    } catch (error) {
      if (error.code === 'ENOENT') return emptyData()
      throw new Error(`读取 ZT.AI 数据失败：${error.message}`)
    }
  }

  async update(mutator) {
    const operation = this.queue.then(async () => {
      const data = await this.read()
      const result = await mutator(data)
      const next = normalizeData(result && typeof result === 'object' ? result : data)
      await fs.mkdir(path.dirname(this.filePath), { recursive: true })
      const temporaryPath = `${this.filePath}.${process.pid}.tmp`
      await fs.writeFile(temporaryPath, JSON.stringify(next, null, 2), 'utf8')
      await fs.rename(temporaryPath, this.filePath)
      return next
    })
    this.queue = operation.catch(() => {})
    return operation
  }
}

export class PostgresDataStore {
  constructor(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) throw new Error('DATABASE_URL 未配置')
    this.kind = 'postgres'
    this.connectionString = connectionString
    this.pool = null
    this.ready = null
    this.queue = Promise.resolve()
  }

  async connect() {
    if (this.ready) return this.ready
    this.ready = (async () => {
      const require = createRequire(import.meta.url)
      const { Pool } = require('pg')
      this.pool = new Pool({
        connectionString: this.connectionString,
        ssl: /sslmode=require|render\.com/i.test(this.connectionString) ? { rejectUnauthorized: false } : undefined,
        max: Number(process.env.DATABASE_POOL_SIZE || 4),
      })
      await this.pool.query(`CREATE TABLE IF NOT EXISTS zt_ai_state (
        id SMALLINT PRIMARY KEY,
        state JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`)
      await this.pool.query('INSERT INTO zt_ai_state (id, state) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING', [JSON.stringify(emptyData())])
      return this.pool
    })()
    return this.ready
  }

  async read() {
    const pool = await this.connect()
    const result = await pool.query('SELECT state FROM zt_ai_state WHERE id = 1')
    return normalizeData(result.rows[0]?.state)
  }

  async update(mutator) {
    const operation = this.queue.then(async () => {
      const pool = await this.connect()
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await client.query('SELECT state FROM zt_ai_state WHERE id = 1 FOR UPDATE')
        const current = normalizeData(result.rows[0]?.state)
        const nextValue = await mutator(current)
        const next = normalizeData(nextValue && typeof nextValue === 'object' ? nextValue : current)
        await client.query('UPDATE zt_ai_state SET state = $1::jsonb, updated_at = NOW() WHERE id = 1', [JSON.stringify(next)])
        await client.query('COMMIT')
        return next
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    })
    this.queue = operation.catch(() => {})
    return operation
  }
}

export function dataStoreInfo(store = getDataStore()) {
  if (store?.kind === 'postgres') return { kind: 'postgres', durable: true, label: 'Postgres 持久化' }
  const filePath = String(store?.filePath || '')
  const durable = process.env.ZT_AI_PERSISTENT_STORAGE === 'true' || /^([A-Z]:[\\/]|\/var\/data)/i.test(filePath)
  return { kind: 'json', durable, label: durable ? '持久化文件' : '临时文件（重启可能丢失）' }
}

let sharedStore
export function getDataStore() {
  const connectionString = String(process.env.DATABASE_URL || '').trim()
  const filePath = process.env.ZT_AI_DATA_PATH || path.resolve(process.cwd(), 'data', 'zt-ai.json')
  const currentKey = connectionString ? `postgres:${connectionString}` : `json:${filePath}`
  if (!sharedStore || sharedStore.key !== currentKey) {
    sharedStore = connectionString ? new PostgresDataStore(connectionString) : new JsonDataStore(filePath)
    sharedStore.key = currentKey
  }
  return sharedStore
}

import fs from 'node:fs/promises'
import path from 'node:path'

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

let sharedStore
export function getDataStore() {
  if (!sharedStore || sharedStore.filePath !== (process.env.ZT_AI_DATA_PATH || path.resolve(process.cwd(), 'data', 'zt-ai.json'))) {
    sharedStore = new JsonDataStore()
  }
  return sharedStore
}

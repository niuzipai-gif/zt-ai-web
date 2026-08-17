import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const sourcePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.mjs')

test('desktop task API routes new work through MiMoBuddyRuntime rather than the legacy task engine', async () => {
  const source = await fs.readFile(sourcePath, 'utf8')
  assert.match(source, /import \{ MiMoBuddyRuntime \} from '\.\/mimocode\/runtime\.mjs'/)
  assert.match(source, /void startBuddyTask\(/)
  assert.match(source, /await buddy\.approve\(/)
  assert.match(source, /await buddy\.reject\(/)
  assert.doesNotMatch(source, /new AgentTaskManager\(/)
  assert.match(source, /process\.env\.ZT_AI_TEST_MODE === '1'/)
  assert.doesNotMatch(source, /const mimocodeRuntimeUrl = process\.env\.ZT_AI_MIMOCODE_URL \|\| ''/)
})

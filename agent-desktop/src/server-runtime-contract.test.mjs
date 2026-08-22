import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const sourcePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.mjs')

test('desktop task API routes new work through the Codex app-server runtime rather than the legacy task engine', async () => {
  const source = await fs.readFile(sourcePath, 'utf8')
  assert.match(source, /import \{ CodexBuddyRuntime \} from '\.\/runtime\/codex-app-server\.mjs'/)
  assert.match(source, /const buddy = new CodexBuddyRuntime\(/)
  assert.match(source, /void startBuddyTask\(/)
  assert.match(source, /await buddy\.approve\(/)
  assert.match(source, /await buddy\.reject\(/)
  assert.doesNotMatch(source, /new AgentTaskManager\(/)
  assert.match(source, /ZT_AI_CODEX_BIN/)
  assert.doesNotMatch(source, /MiMoBuddyRuntime|ZT_AI_MIMOCODE_URL|ZT_AI_MIMOCODE_BIN/)
})

test('desktop event bridge keeps the runtime implementation name out of user-facing labels', async () => {
  const source = await fs.readFile(sourcePath, 'utf8')
  assert.doesNotMatch(source, /MiMoCode 正在分析|MiMoCode 请求执行|MiMoCode 本机运行时暂时不可用/)
  assert.match(source, /执行引擎/)
})

test('runtime web tool bridge stores the live task object so search results can stream back', async () => {
  const source = await fs.readFile(sourcePath, 'utf8')
  assert.match(source, /runtimeSessionTasks\.set\(started\.sessionId, state\)/)
  assert.doesNotMatch(source, /runtimeSessionTasks\.set\(started\.sessionId, state\.id\)/)
})

test('uncertain Buddy questions receive a mandatory source-backed web verification preflight', async () => {
  const source = await fs.readFile(sourcePath, 'utf8')
  assert.match(source, /requiresWebVerification\(task\)/)
  assert.doesNotMatch(source, /请使用普通聊天模式/)
  assert.match(source, /ZT\.buddy is the only desktop surface|ZT\.buddy 是唯一的桌面入口/)
  assert.match(source, /await searchWeb\(/)
  assert.match(source, /buildWebVerificationContext\(task, research\)/)
  assert.match(source, /不会根据猜测作答/)
})

test('desktop accepts contextual Buddy follow-ups and gives ordinary chat a web-verification proxy', async () => {
  const source = await fs.readFile(sourcePath, 'utf8')

  assert.match(source, /body\.continuation === true/)
  assert.match(source, /url\.pathname === '\/api\/chat\/research'/)
  assert.match(source, /handleResearchChat/)
  assert.match(source, /buildWebVerificationContext\(task, research\)/)
  assert.match(source, /gatewayUrl.*\/api\/chat/)
})

test('desktop agent streams spreadsheet uploads through its bundled Office reader', async () => {
  const source = await fs.readFile(sourcePath, 'utf8')
  assert.match(source, /readOfficeSpreadsheetPreview/)
  assert.match(source, /ZT_AI_OFFICECLI_PATH/)
  assert.match(source, /\/api\/attachments\/spreadsheet-preview/)
  assert.match(source, /createWriteStream/)
  assert.match(source, /OFFICECLI_MAX_UPLOAD_BYTES/)
})

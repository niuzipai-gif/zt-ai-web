import test from 'node:test'
import assert from 'node:assert/strict'
import { AgentTaskManager, buildPlan, ensureResearchPlan, extractFilePath, extractWebUrl, isStepAllowed, parseAgentPlan } from './agent-core.mjs'

test('execution-first planning identifies read, write and test work', () => {
  assert.equal(extractFilePath('请读取 README.md'), 'README.md')
  const plan = buildPlan('请读取 README.md，修改代码并运行测试', 'task-1')
  assert.deepEqual(plan.map(step => step.tool), ['list_workspace', 'read_file', 'write_file', 'run_command'])
  assert.equal(plan[2].inputPath, 'README.md')
  assert.equal(plan[2].content, null)
  assert.equal(plan[3].command, 'npm test')
})

test('a vague execution task stays safe and does not invent a target file', () => {
  const plan = buildPlan('帮我分析当前项目的结构', 'task-2')
  assert.deepEqual(plan.map(step => step.tool), ['list_workspace'])
})

test('model plan parser accepts fenced JSON and preserves generated file content', () => {
  const raw = JSON.stringify({ steps: [{ tool: 'write_file', label: '创建脚本', inputPath: 'src/hello.py', content: "print('hello')", overwrite: false }, { tool: 'run_command', label: '运行脚本', command: 'python src/hello.py' }] })
  const plan = parseAgentPlan(`\`\`\`json\n${raw}\n\`\`\``, {
    workspaceRoot: 'C:\\workspace',
  })
  assert.deepEqual(plan.map(step => step.tool), ['list_workspace', 'write_file', 'run_command'])
  assert.equal(plan[1].content, "print('hello')")
  assert.equal(plan[2].command, 'python src/hello.py')
})

test('model plan parser rejects unsupported tools and workspace escape paths', () => {
  assert.throws(() => parseAgentPlan('{"steps":[{"tool":"delete_file","inputPath":"x.txt"}]}', { workspaceRoot: 'C:\\workspace' }), /不支持的工具/)
  assert.throws(() => parseAgentPlan('{"steps":[{"tool":"read_file","inputPath":"..\\\\secret.txt"}]}', { workspaceRoot: 'C:\\workspace' }), /工作区内/)
})

test('model plan parser accepts safe workspace moves and web research queries', () => {
  const plan = parseAgentPlan(JSON.stringify({ steps: [
    { tool: 'move_file', label: '归档安装包', inputPath: 'ZT-buddy.exe', targetPath: 'ZT.AI\\安装包\\ZT-buddy.exe' },
    { tool: 'web_search', label: '检索官方资料', query: 'MiniMax M3 official documentation' },
  ] }), { workspaceRoot: 'C:\\workspace' })
  assert.deepEqual(plan.map(step => step.tool), ['list_workspace', 'move_file', 'web_search'])
  assert.equal(plan[1].targetPath, 'ZT.AI\\安装包\\ZT-buddy.exe')
  assert.equal(plan[2].query, 'MiniMax M3 official documentation')
})

test('agent workspace can be changed only while no task is running', () => {
  const manager = new AgentTaskManager({ workspaceRoot: 'C:\\workspace', permissionStore: { has: () => true }, deviceAuthorization: { isAuthorized: () => true }, gatewayUrl: 'http://localhost', historyPath: 'history.json' })
  assert.equal(manager.setWorkspaceRoot('C:\\Users\\Administrator\\Desktop'), 'C:\\Users\\Administrator\\Desktop')
})

test('research tasks replace legacy shell scraping plans with the web search tool', () => {
  const legacyPlan = [{ id: 'context-list', tool: 'list_workspace', label: '检查工作区上下文', inputPath: '.' }, { id: 'legacy-command', tool: 'run_command', label: '抓取网页', command: 'curl ...' }]
  const plan = ensureResearchPlan('检索 MiniMax 官方 API 文档并给出来源', legacyPlan)
  assert.deepEqual(plan.map(step => step.tool), ['list_workspace', 'web_search'])
  assert.match(plan[1].query, /MiniMax 官方 API 文档/)
})

test('a pasted product URL automatically gets a CloakBrowser inspection step', () => {
  const url = 'https://www.amazon.co.uk/dp/B0EXAMPLE?tag=demo'
  assert.equal(extractWebUrl(`分析这个链接 ${url}`), url)
  const plan = ensureResearchPlan(`分析这个链接 ${url}`, [{ id: 'context-list', tool: 'list_workspace', label: '检查工作区上下文' }])
  assert.deepEqual(plan.map(step => step.tool), ['list_workspace', 'browse_url'])
  assert.equal(plan[1].url, url)
})

test('one-time approval is scoped to the exact execution step', () => {
  const state = { approvedSteps: new Set(['step-1']), fullAccess: false }
  const permissionStore = { has: () => false }
  assert.equal(isStepAllowed({ state, step: { id: 'step-1' }, capability: 'web_research', permissionStore }), true)
  assert.equal(isStepAllowed({ state, step: { id: 'step-2' }, capability: 'web_research', permissionStore }), false)
})

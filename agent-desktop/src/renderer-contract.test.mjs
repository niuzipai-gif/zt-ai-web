import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

test('desktop Soft Glass surface keeps the window visually continuous', async () => {
  const styles = await fs.readFile(path.join(root, 'styles.css'), 'utf8')
  const main = await fs.readFile(path.join(root, '..', '..', 'desktop-app', 'main.mjs'), 'utf8')
  assert.match(styles, /backdrop-filter:\s*blur\(/)
  assert.match(styles, /radial-gradient\(/)
  assert.match(styles, /\.desktop-grid\s*\{/)
  assert.match(styles, /\.glass-card\s*\{/)
  assert.match(styles, /:focus-visible\s*\{/)
  assert.match(styles, /prefers-reduced-motion:reduce/)
  assert.match(styles, /-webkit-app-region:\s*drag/)
  assert.match(main, /backgroundColor:\s*'#e9eef2'/)
  assert.match(main, /titleBarStyle:\s*'hidden'/)
  assert.match(main, /titleBarOverlay:/)
})

test('desktop renderer exposes the Agent-first workspace contract', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  for (const id of ['messages', 'composer', 'tool-drawer', 'skill-browser', 'context-ring', 'context-used', 'context-remaining', 'model-select']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`)
  }
  assert.match(html, /\/zt-logo\.png/)
  assert.match(html, /登录你的 ZT\.buddy/)
  assert.match(html, /ZT\.buddy 工作区/)
  assert.doesNotMatch(html, /id=["']mode-(?:chat|buddy)["']/)
  assert.doesNotMatch(html, /普通聊天模式/)
  assert.doesNotMatch(html, /brand-mark[^>]*>\s*R\s*</i)
})

test('desktop renderer exposes an integrated Codex-style application toolbar', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  for (const id of ['sidebar-toggle', 'app-back', 'app-forward', 'app-refresh']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`)
  }
  assert.doesNotMatch(html, /id=["']select-workspace["']/)
  assert.match(app, /applyNavigationSnapshot/)
  assert.match(app, /zt-ai:desktop-rail-collapsed/)
})

test('collapsed chat history leaves no residual rail and remains reopenable from the top toolbar', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  const css = await fs.readFile(path.join(root, 'styles.css'), 'utf8')
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')

  assert.doesNotMatch(html, /id=["']chat-rail-drawer-handle["']/)
  assert.match(html, /aria-controls=["']chat-rail["']/)
  assert.match(css, /data-rail-collapsed=["']true["'][\s\S]*grid-template-columns:minmax\(0,1fr\)/)
  assert.match(css, /\.app-shell\[data-rail-collapsed=["']true["']\]\[data-mode\] \.desktop-grid\{grid-template-columns:minmax\(0,1fr\)\}/)
  assert.match(css, /data-rail-collapsed=["']true["'][\s\S]*\.chat-rail[^}]*display:none/)
  assert.match(css, /data-rail-collapsed=["']true["'][\s\S]*\.conversation[^}]*grid-column:1/)
  assert.doesNotMatch(app, /railDrawerHandle/)
})

test('desktop renderer exposes an accessible tool drawer for execution context', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  for (const id of ['execution-summary', 'context-ring', 'tool-trigger', 'voice-button', 'authorize-device']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`)
  }
  for (const id of ['voice-mode', 'voice-orb', 'voice-status', 'voice-transcript', 'voice-close', 'voice-stop']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`)
  }
  assert.match(html, /id="voice-mode"[^>]*class="[^"]*hidden/)
  assert.match(app, /openVoiceMode/)
  assert.match(app, /createVoiceAudioController/)
  assert.match(app, /createVoiceRecognition/)
  assert.match(app, /createVoicePlayback/)
  assert.match(app, /api\/voice\/synthesize/)
  assert.doesNotMatch(app, /语音入口已准备；接入声音模型后可开始语音输入/)
  assert.match(html, /data-drawer-section="context"/)
  assert.match(html, /data-drawer-section="permissions"/)
})

test('desktop renderer keeps tools in the plus drawer and uses a microphone control', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  const drawerStart = html.indexOf('id="tool-drawer"')
  const drawerEnd = html.indexOf('</div>', drawerStart)
  assert.ok(drawerStart >= 0)
  assert.ok(drawerEnd > drawerStart)
  assert.match(html.slice(drawerStart), /Skill/)
  assert.match(html.slice(drawerStart), /插件/)
  assert.match(html, /aria-label="语音输入"/)
  assert.match(html, /data-tool="research"/)
  assert.match(html, /data-capability="web_research"/)
})

test('desktop tool drawer has an explicit close path and synchronizes its open state', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  assert.match(html, /id="drawer-close"/)
  assert.match(html, /aria-label="关闭添加内容与工具抽屉"/)
  assert.match(app, /function closeDrawer\(/)
  assert.match(app, /drawer-close/)
  assert.match(app, /Escape/)
})

test('desktop separates add-tools drawer from permissions and execution drawer', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  assert.match(html, /id="tool-drawer"/)
  assert.match(html, /id="permission-drawer"/)
  assert.match(html, /id="permission-drawer-close"/)
  assert.match(html, /data-drawer-section="permissions"/)
  assert.match(html, /data-drawer-section="context"/)
  assert.match(app, /openToolDrawer/)
  assert.match(app, /openPermissionDrawer/)
})

test('ZT.buddy routes ordinary questions through the desktop agent context', async () => {
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  assert.match(app, /runChat\(\{ agent: true/)
  assert.match(app, /\/api\/agent\/chat/)
  assert.match(app, /ZT\.buddy.*能做什么|buddyCapabilityAnswer/)
})

test('desktop preserves agent context for follow-ups and gives normal chat a source-backed research route', async () => {
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')

  assert.match(app, /hasAgentContext:\s*conversation\?\.agentContext === true/)
  assert.match(app, /continuation:\s*intent\.kind === 'followup'/)
  assert.match(app, /\/api\/chat\/research/)
  assert.match(app, /const requiresResearch = chatIntent\.route === 'agent' && chatIntent\.kind === 'research'/)
})

test('starting a new chat does not cancel another chat transport', async () => {
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')

  assert.match(app, /state\.taskRuns/)
  const start = app.slice(app.indexOf('function startNewChat()'), app.indexOf('function setStatus', app.indexOf('function startNewChat()')))
  assert.doesNotMatch(start, /resetExecution\(\)/)
  assert.doesNotMatch(start, /state\.(reader|chatController|agentStream)\s*=\s*null/)
  assert.doesNotMatch(app, /state\.reader\)\s*\{\s*state\.reader\.cancel/)
  assert.doesNotMatch(app, /state\.chatController\?\.abort\(\)/)
  assert.doesNotMatch(app, /state\.agentStream\?\.cancel\(\)/)
})

test('research responses expose a collapsible source drawer without mixing source text into the answer', async () => {
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  const server = await fs.readFile(path.join(root, '..', 'src', 'server.mjs'), 'utf8')
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  assert.match(app, /renderSourceDrawer\(/)
  assert.match(app, /research\.sources|sources.*results/)
  assert.match(app, /details\.className\s*=\s*['"]source-drawer['"]|<details class="source-drawer"/)
  assert.match(server, /research\.results/)
  assert.match(server, /research\.sources|event: research\.sources/)
  assert.match(html, /来源|source/i)
})

test('assistant markdown has a bounded reading measure and polished block rhythm', async () => {
  const styles = await fs.readFile(path.join(root, 'styles.css'), 'utf8')
  assert.match(styles, /\.markdown-message\s*\{[^}]*max-width\s*:/s)
  assert.match(styles, /\.markdown-message\s+p\s*\{[^}]*line-height\s*:/s)
  assert.match(styles, /\.markdown-message\s+li\s*\{[^}]*line-height\s*:/s)
  assert.match(styles, /\.source-drawer/)
})

test('a completed agent stream stays bound to its own message and conversation', async () => {
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')

  assert.match(app, /const completedMessage = run\.activeAgentMessage \|\| state\.activeAgentMessage/)
  assert.match(app, /completeAgentMessage\(summary, data\.status, completedMessage\)/)
  assert.match(app, /recordChatMessage\('assistant', live\.output, live\.chatId(?:, \{ sources: live\.sources \})?\)/)
})

test('desktop chat cannot remain stuck on an unfinished stream', async () => {
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  assert.match(app, /CHAT_TIMEOUT_MS\s*=\s*45_000/)
  assert.match(app, /new AbortController\(\)/)
  assert.match(app, /消息已保留，你可以直接重试/)
  assert.match(app, /signal: controller\.signal/)
})

test('desktop Buddy renders execution progress inside the conversation timeline', async () => {
  const html = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  assert.match(html, /agent-message/)
  assert.match(html, /agent-plan-inline/)
  assert.match(html, /agent-activity-inline/)
  assert.match(html, /agent-result-inline/)
  assert.match(html, /recordChatMessage\('assistant'/)
  assert.match(html, /createElement\('details'\)/)
  assert.match(html, /executionDrawerPresentation/)
})

test('desktop Buddy keeps execution details closed and surfaces only the latest live action', async () => {
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  assert.match(app, /details\.open = false/)
  assert.match(app, /agent-live-progress/)
  assert.match(app, /composer-approval/)
  assert.match(app, /已授权，正在继续执行/)
})

test('desktop conversation keeps the composer visible while the message history scrolls internally', async () => {
  const styles = await fs.readFile(path.join(root, 'styles.css'), 'utf8')
  assert.match(styles, /\.conversation\{height:calc\(100vh - 112px\);max-height:calc\(100vh - 112px\)\}/)
  assert.match(styles, /@media\(max-width:800px\)\{\.conversation\{height:calc\(100vh - 90px\);max-height:calc\(100vh - 90px\)\}\}/)
  assert.match(styles, /\.messages\{[^}]*overflow:auto;/)
})

test('desktop workspace gives the conversation the full right side and moves controls into the plus drawer', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  const styles = await fs.readFile(path.join(root, 'styles.css'), 'utf8')
  assert.match(styles, /\.desktop-grid\{grid-template-columns:225px minmax\(0,1fr\)\}/)
  assert.match(styles, /\.buddy-panel\{display:none!important\}/)
  assert.match(html, /data-drawer-section="permissions"/)
  assert.match(html, /data-drawer-section="context"/)
  assert.match(html, /data-capability="command_exec"/)
  assert.match(html, /id="authorize-device"/)
})

test('desktop login and registration are separate views with phone collection', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  assert.match(html, /id="auth-login-view"/)
  assert.match(html, /id="auth-register-view"/)
  assert.match(html, /id="auth-phone"/)
  assert.match(html, /id="auth-email"/)
  assert.doesNotMatch(html, /验证码|auth-code|auth-send-code/)
  assert.match(app, /phone:/)
  assert.match(app, /email:/)
  assert.doesNotMatch(app, /\/api\/auth\/send-code|verificationId/)
})

test('desktop restores account conversations from the durable Codex-backed history response', async () => {
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  const server = await fs.readFile(path.join(root, '..', 'src', 'server.mjs'), 'utf8')
  assert.match(app, /mergeServerConversations/)
  assert.match(app, /data\.conversations/)
  assert.match(app, /\/api\/conversations/)
  assert.match(server, /conversations:/)
  assert.match(server, /\/api\/conversations/)
})

test('desktop renderer uses the same smooth stream queue for chat and Buddy summaries', async () => {
  const html = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  assert.match(html, /createSmoothStream/)
  assert.match(html, /agentStream/)
})

test('desktop login exposes a live loading status and the composer uses IME-safe Enter submission', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  assert.match(html, /id="auth-status"/)
  assert.match(html, /aria-live="polite"/)
  assert.match(app, /authPresentation/)
  assert.match(app, /auth-spinner/)
  assert.match(app, /shouldSubmitComposer/)
  assert.match(app, /event\.isComposing \|\| event\.keyCode === 229/)
})

test('desktop remembers the login fields and accepts pasted or dropped file attachments', async () => {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  const styles = await fs.readFile(path.join(root, 'styles.css'), 'utf8')
  assert.match(html, /id="remember-login"/)
  assert.match(html, /id="attachment-preview"/)
  assert.match(html, /id="file-input"/)
  assert.match(html, /id="inspector-toggle"/)
  assert.doesNotMatch(html, /id="file-input"[^>]+accept="image\/\*"/)
  assert.match(app, /restoreLoginFields\(\)/)
  assert.match(app, /saveLoginFields\(\)/)
  assert.match(app, /addEventListener\('paste', handleComposerPaste\)/)
  assert.match(app, /addEventListener\('dragover', handleComposerDragOver\)/)
  assert.match(app, /addEventListener\('drop', handleComposerDrop\)/)
  assert.match(app, /buildAttachmentPrompt\(task, attachments\)/)
  assert.match(app, /messageContentWithImages\(taskForModel, attachments\)/)
  assert.match(app, /recordChatMessage\('user', task, chatId, \{ attachments \}\)/)
  assert.doesNotMatch(app, /recordChatMessage\('user', taskWithAttachments/)
  assert.match(app, /\(\{ dataUrl, text, \.\.\.metadata \}\)/)
  assert.match(app, /compactLegacyAttachmentMessages/)
  assert.match(app, /extractPdfText\(file\)/)
  assert.match(app, /extractDocxText\(file\)/)
  assert.match(app, /extractSpreadsheetText\(file, \{ nativeReader \}\)/)
  assert.match(app, /attachment\.loading = true/)
  assert.match(app, /正在读取/)
  assert.match(app, /附件仍在读取，完成后再发送/)
  assert.match(styles, /\.attachment-reading/)
  assert.match(app, /filesFromDataTransfer\(/)
  assert.match(app, /hasFilePayload\(/)
  assert.match(app, /readError/)
  assert.match(app, /prependConversation\(/)
})

test('desktop attachment reader supports pasted files and packaged document readers', async () => {
  const reader = await fs.readFile(path.join(root, 'attachment-reader.mjs'), 'utf8')
  const server = await fs.readFile(path.join(root, '..', 'src', 'server.mjs'), 'utf8')
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  assert.match(reader, /getAsFile/)
  assert.match(reader, /vendor\/pdfjs\.mjs/)
  assert.match(reader, /window\.mammoth/)
  assert.match(reader, /isSpreadsheetAttachment/)
  assert.match(reader, /extractSpreadsheetText/)
  assert.match(reader, /new Worker\(new URL\('\.\/spreadsheet-worker\.js', import\.meta\.url\)\)/)
  assert.match(reader, /SPREADSHEET_PARSE_TIMEOUT_MS/)
  assert.match(server, /vendor\/xlsx\.full\.min\.js/)
  assert.match(server, /pdfjs-dist.*pdf\.mjs/)
  assert.match(server, /mammoth\.browser\.js/)
  assert.match(html, /vendor\/xlsx\.full\.min\.js/)
  assert.match(html, /vendor\/mammoth\.browser\.js/)
})

test('desktop workbook uploads prefer the bundled native Office reader before the browser worker', async () => {
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  const main = await fs.readFile(path.join(root, '..', '..', 'desktop-app', 'main.mjs'), 'utf8')
  const builder = await fs.readFile(path.join(root, '..', '..', 'desktop-app', 'electron-builder.yml'), 'utf8')
  assert.match(app, /readNativeSpreadsheetPreview/)
  assert.match(app, /\/api\/attachments\/spreadsheet-preview/)
  assert.match(app, /const nativeReader = window\.ztaiDesktop\?\.runtime === 'electron' \? readNativeSpreadsheetPreview : null/)
  assert.match(app, /extractSpreadsheetText\(file, \{ nativeReader \}\)/)
  assert.match(main, /ZT_AI_OFFICECLI_PATH/)
  assert.match(builder, /resources\/officecli/)
})

test('desktop tool drawers animate their opening and closing states', async () => {
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8')
  const styles = await fs.readFile(path.join(root, 'styles.css'), 'utf8')
  assert.match(app, /DRAWER_TRANSITION_MS/)
  assert.match(app, /classList\.add\('is-opening'\)/)
  assert.match(app, /classList\.add\('is-closing'\)/)
  assert.match(app, /setTimeout\(\(\) => \{[\s\S]*classList\.add\('hidden'\)/)
  assert.match(styles, /\.tool-drawer\.is-opening/)
  assert.match(styles, /\.tool-drawer\.is-closing/)
  assert.match(styles, /transition:opacity \.18s ease,transform \.18s cubic-bezier/)
})

test('control room exposes account identity on review and visitor detail surfaces', async () => {
  const controlApp = await fs.readFile(path.join(root, '..', '..', 'server', 'public', 'control-room', 'app.js'), 'utf8')
  const detailApp = await fs.readFile(path.join(root, '..', '..', 'server', 'public', 'control-room', 'detail-enhancements.js'), 'utf8')
  assert.match(controlApp, /user-email/)
  assert.match(controlApp, /visitor-user/)
  assert.match(detailApp, /访问账号/)
  assert.match(detailApp, /邮箱/)
  assert.match(detailApp, /手机号/)
  assert.match(detailApp, /会话记录/)
})

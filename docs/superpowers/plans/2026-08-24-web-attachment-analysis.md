# 网页基础文件分析 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让网页公开聊天在浏览器本地解析常见基础文件，并把受限、可验证的文件摘要交给模型分析。

**Architecture:** 新增独立的表格读取器和附件上下文格式化器；`main.jsx` 只负责浏览器 File、图片预览和聊天状态，不把原始文件上传网关。服务端只补充公开人格对“已解析附件”的防猜测规则，继续使用现有聊天协议和 8,000 字符单条消息边界。

**Tech Stack:** React、Vite、SheetJS `xlsx`、现有 `pdfjs-dist`、Mammoth、Node test runner、GitHub Pages 发布脚本。

---

## 文件边界

- Create: `src/lib/spreadsheet-reader.js` — 识别并解析 `xlsx/xls/csv`，生成工作表统计、样本和受限摘要。
- Modify: `src/lib/attachment-reader.js` — 暴露表格识别，保留 PDF/文本读取接口和现有上限。
- Create: `src/lib/attachment-context.js` — 把多个附件的状态和内容合并到不超过 7,200 字符的模型上下文。
- Modify: `src/main.jsx` — 接入表格读取、统一读取状态、无输入时的附件分析默认请求和上下文发送。
- Modify: `src/lib/i18n.js` — 增加中文、英文、日文的附件状态和默认分析文案。
- Modify: `src/styles.css` — 给截断和失败状态提供稳定的视觉区分与辅助文本样式。
- Modify: `server/src/profile.js` — 增加公开聊天对附件摘要的事实边界和禁止猜测规则。
- Modify: `src/lib/attachment-reader.test.js` — 分类、PDF/文本兼容和表格入口测试。
- Create: `src/lib/spreadsheet-reader.test.js` — 生成内存工作簿并验证摘要、统计、公式/错误和截断。
- Create: `src/lib/attachment-context.test.js` — 验证上下文边界、失败说明和多附件合并。
- Modify: `server/src/profile.test.js` — 验证公开人格提示包含附件事实边界。

## Task 1: 先为表格读取器写失败测试

**Files:**
- Create: `src/lib/spreadsheet-reader.test.js`
- Modify: `src/lib/attachment-reader.test.js`

- [ ] **Step 1: 锁定表格扩展名和 MIME 行为**

在 `src/lib/attachment-reader.test.js` 追加：

```js
import { isSpreadsheetAttachment } from './attachment-reader.js'

assert.equal(isSpreadsheetAttachment({ name: 'sales.xlsx', type: '' }), true)
assert.equal(isSpreadsheetAttachment({ name: 'legacy.xls', type: 'application/vnd.ms-excel' }), true)
assert.equal(isSpreadsheetAttachment({ name: 'orders.csv', type: 'text/csv' }), true)
assert.equal(isSpreadsheetAttachment({ name: 'notes.txt', type: 'text/plain' }), false)
```

- [ ] **Step 2: 建立内存工作簿夹具**

在 `src/lib/spreadsheet-reader.test.js` 使用 `xlsx` 生成不依赖磁盘的输入：

```js
import * as XLSX from 'xlsx'

function fakeFile(name, type, buffer) {
  return { name, type, size: buffer.byteLength, arrayBuffer: async () => buffer }
}

function workbookFile() {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['ASIN', '库存', '仓储费'],
    ['B001', 12, 3.5],
    ['B002', null, 5.5],
  ]), '汇总')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), '空表')
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
  return fakeFile('费用.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes)
}
```

- [ ] **Step 3: 写出实际内容断言**

测试 `extractSpreadsheetText(workbookFile())` 返回 `{ text, status }`，并包含实际工作簿事实：

```js
const result = await extractSpreadsheetText(workbookFile())
assert.equal(result.status, 'ready')
assert.match(result.text, /工作表.*汇总/)
assert.match(result.text, /ASIN.*库存.*仓储费/)
assert.match(result.text, /B001/)
assert.match(result.text, /仓储费.*合计.*9/)
assert.match(result.text, /空表/)
```

- [ ] **Step 4: 写 CSV、损坏和截断测试**

CSV 必须走结构化摘要；损坏 ArrayBuffer 必须返回稳定错误；大量行必须返回 `truncated` 并包含“未包含全部行；如需继续分析”。

- [ ] **Step 5: 运行测试确认先失败**

Run:

```powershell
node --test src/lib/attachment-reader.test.js src/lib/spreadsheet-reader.test.js
```

Expected: FAIL because `isSpreadsheetAttachment` and `extractSpreadsheetText` do not exist yet.

- [ ] **Step 6: Commit the failing tests**

```powershell
git add src/lib/attachment-reader.test.js src/lib/spreadsheet-reader.test.js
git commit -m "test: define web spreadsheet attachment analysis"
```

## Task 2: 实现受限的 Excel/CSV 摘要

**Files:**
- Create: `src/lib/spreadsheet-reader.js`
- Modify: `src/lib/attachment-reader.js`

- [ ] **Step 1: 定义读取接口和资源边界**

在 `src/lib/spreadsheet-reader.js` 导出以下接口：

```js
import * as XLSX from 'xlsx'

export const MAX_SPREADSHEET_BYTES = 20 * 1024 * 1024
export const MAX_SHEETS = 32
export const MAX_SAMPLE_ROWS = 8
export const MAX_SPREADSHEET_TEXT = 7_200
export const SPREADSHEET_EXTENSIONS = /\.(xlsx|xls|csv)$/i

export function isSpreadsheetAttachment(file) { /* MIME 或扩展名 */ }
export async function extractSpreadsheetText(file) { /* { text, status } */ }
```

超过 20MB 抛出含文件名和“20MB”的中文错误；超过 32 张工作表只处理前 32 张并说明剩余数量。

- [ ] **Step 2: 实现单元格安全格式化**

使用 `XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, cellNF: true, cellText: false })`。`null/undefined/''` 显示为“空”，日期转为 ISO 日期，数字保留可读小数，错误单元格显示“单元格错误”。不执行宏、外部链接或公式重算；公式优先使用缓存值，并记录“公式未重新计算”。

- [ ] **Step 3: 实现工作表概览、统计和样本**

按 `sheet['!ref']` 获取范围，去掉尾部全空行，首行作为表头；空表头变成“列 1”等稳定名称。每张表输出工作表名、有效范围、行列数、表头、空值较多列、数字列的非空数/最小值/最大值/平均值/合计、前 8 行样本；统计只使用有限数字。

- [ ] **Step 4: 实现摘要优先级和截断状态**

按“文件/工作表概览 → 字段和统计 → 样本”拼接，超过 7,200 字符时保留概览和统计，裁剪样本，并附加：

```text
已显示统计和代表性样本，未包含全部行；如需继续分析，请指定工作表、列或筛选条件。
```

返回 `{ text, status: textWasTruncated ? 'truncated' : 'ready' }`。无工作表返回“工作簿没有可分析的工作表”；损坏文件抛出受控用户错误。

- [ ] **Step 5: 从附件读取器导出表格接口**

在 `src/lib/attachment-reader.js` 导入并重新导出 `isSpreadsheetAttachment`、`extractSpreadsheetText`，保持现有 PDF、文本接口和测试不变。

- [ ] **Step 6: 运行读取器测试并提交**

Run:

```powershell
node --test src/lib/attachment-reader.test.js src/lib/spreadsheet-reader.test.js
```

Expected: all classification and spreadsheet summary tests PASS.

```powershell
git add src/lib/attachment-reader.js src/lib/spreadsheet-reader.js src/lib/attachment-reader.test.js src/lib/spreadsheet-reader.test.js
git commit -m "feat: parse spreadsheet attachments in browser"
```

## Task 3: 统一附件上下文和读取状态

**Files:**
- Create: `src/lib/attachment-context.js`
- Create: `src/lib/attachment-context.test.js`
- Modify: `src/main.jsx`

- [ ] **Step 1: 写上下文边界测试**

用一个 `ready` 文件和一个 `error` 文件调用 `buildAttachmentContext`，断言结果包含 `[附件解析摘要]`、文件名、`解析状态：已读取`、`解析失败` 和具体 `readError`，且总长度不超过 7,200 字符；再用超长正文断言包含“未包含全部行”。

- [ ] **Step 2: 实现受限上下文格式化**

导出：

```js
export const MAX_ATTACHMENT_CONTEXT = 7_200
export function attachmentStatusLabel(status, language = 'zh') { /* ready/truncated/error/preview-only */ }
export function buildAttachmentContext(attachments, language = 'zh') { /* bounded string */ }
```

每个文件包含文件名、状态、类型/大小和正文或受控失败原因；按“概览优先、样本其次”裁剪。禁止把 `preview`、Data URL 或二进制写入上下文。

- [ ] **Step 3: 给 `prepareAttachment` 补统一状态**

在 `src/main.jsx` 导入表格函数和 `buildAttachmentContext`。分支顺序改为图片 → 表格 → PDF → DOCX → 普通文本；表格把 `{ text, status }` 写入 `attachment.text/readStatus`。PDF、DOCX、文本成功为 `ready`，图片为 `preview-only`，没有内容为 `error`；catch 统一为用户可理解的 `readError`。

- [ ] **Step 4: 把摘要接入发送并保留图片多模态**

把原有附件拼接替换为：

```js
const attachmentText = buildAttachmentContext(nextAttachments, language)
const contentText = [value || (nextAttachments.length ? copy.attachmentFallback : copy.sendFallback), attachmentText]
  .filter(Boolean)
  .join('\\n\\n')
```

继续把图片预览转成 `image_url`；网关 `attachments` 仍只传 `name/type/size`。

- [ ] **Step 5: 更新附件卡片**

`AttachmentList` 根据 `readStatus` 显示状态，失败状态增加 `title={file.readError}` 和 `aria-label`。历史持久化继续移除 `preview`，不持久化原始二进制。

- [ ] **Step 6: 运行测试并提交**

```powershell
node --test src/lib/attachment-reader.test.js src/lib/spreadsheet-reader.test.js src/lib/attachment-context.test.js
git add src/main.jsx src/lib/attachment-context.js src/lib/attachment-context.test.js
git commit -m "feat: send parsed attachment context to web chat"
```

## Task 4: 补齐三语文案和界面状态

**Files:**
- Modify: `src/lib/i18n.js`
- Modify: `src/styles.css`
- Modify: `src/main.jsx`

- [ ] **Step 1: 增加三语状态文案**

在三套 `chat` 文案中增加 `attachmentFallback`、`attachmentReady`、`attachmentTruncated`、`attachmentError`、`attachmentPreviewOnly`。中文默认请求为“请分析我上传的附件。”；失败文案必须给出“另存为 xlsx、CSV、PDF 或 TXT 后重试”等动作，英文和日文保持同等语义。

- [ ] **Step 2: 让状态标签使用语言文案**

让 `attachmentStatusLabel` 接收 `copy` 或对应语言字典，禁止把中文状态硬编码到英文/日文页面。没有输入但有附件时使用 `attachmentFallback`。

- [ ] **Step 3: 增加轻量视觉区分并构建**

在 `src/styles.css` 增加 `.attachment-chip.is-truncated` 和 `.attachment-chip.is-error` 的边框/文字颜色，保持现有紧凑布局。然后运行 `npm run build`，预期 Vite 构建成功；已有 chunk-size warning 可以存在，但不能有 `xlsx` import 或模块解析错误。

- [ ] **Step 4: Commit UI and localization**

```powershell
git add src/main.jsx src/lib/i18n.js src/styles.css
git commit -m "feat: show attachment parsing status"
```

## Task 5: 增加公开模型的文件事实边界

**Files:**
- Modify: `server/src/profile.js`
- Modify: `server/src/profile.test.js`

- [ ] **Step 1: 添加提示词回归断言并确认先失败**

在 `server/src/profile.test.js` 追加：

```js
assert.match(ZT_SYSTEM_PROMPT, /附件.*解析|解析.*附件/)
assert.match(ZT_SYSTEM_PROMPT, /不能.*猜测|禁止.*编造/)
assert.match(ZT_SYSTEM_PROMPT, /摘要.*未包含|文件.*不足/)
```

运行 `node --test server/src/profile.test.js`；预期新增断言在提示词变更前失败。

- [ ] **Step 2: 增加最小公开提示词规则**

在图片规则后加入：已解析摘要中的工作表、字段、行列规模和数值是当前文件事实；摘要已截断时只能分析已提供内容并说明缺口；解析失败时不能声称读过文件，必须说明原因和替代格式。不要修改 `AGENT_SYSTEM_PROMPT`。

- [ ] **Step 3: 运行提示词测试并提交**

```powershell
node --test server/src/profile.test.js
git add server/src/profile.js server/src/profile.test.js
git commit -m "fix: ground public chat in parsed attachments"
```

## Task 6: 回归验证并发布 GitHub Pages

**Files:**
- Modify only if a test exposes a real regression in the files above.
- Preserve untracked `.design-audit/` and `.runtime-qa/`.

- [ ] **Step 1: 运行针对性测试**

```powershell
node --test src/lib/attachment-reader.test.js src/lib/spreadsheet-reader.test.js src/lib/attachment-context.test.js server/src/profile.test.js server/src/contracts/chat.test.js
```

Expected: all selected tests PASS.

- [ ] **Step 2: 运行完整测试和构建**

```powershell
npm test
npm run build
```

Expected: tests PASS and build succeeds; only previously known non-blocking Vite warning may remain.

- [ ] **Step 3: 检查差异和敏感内容**

运行 `git diff --check`、`git status --short --branch` 和 `git log --oneline -8`。预期无空白错误，只有两个既有未跟踪目录保留为未跟踪，没有 API key、原始文件或 Data URL 被暂存。

- [ ] **Step 4: 发布 Pages 并验证入口**

```powershell
npm run publish:pages
Invoke-WebRequest -UseBasicParsing -Uri 'https://niuzipai-gif.github.io/zt-ai-web/' -Method Head
Invoke-WebRequest -UseBasicParsing -Uri 'https://niuzipai-gif.github.io/zt-ai-web/?download=1&v=0.2.26' -Method Head
Invoke-WebRequest -UseBasicParsing -Uri 'https://zt-ai-gateway.onrender.com/api/health' -Method Get
```

Expected: Pages、下载页和 Render 健康检查返回 200；最终报告列出代码提交、Pages 部署提交、测试和链接。

## Self-review checklist

- Spec coverage: Tasks 1–2 cover Excel/CSV parsing, statistics, samples, formula/error notices and truncation; Task 3 covers bounded model context and no raw upload; Task 4 covers visible states and three languages; Task 5 covers no-guessing rules; Task 6 covers regression, build and Pages verification.
- Placeholder scan: every step names an exact file, function, assertion, command or expected result; no executable step is left as an unspecified placeholder.
- Type consistency: `extractSpreadsheetText` returns `{ text, status }`; `prepareAttachment` stores `readStatus`; `buildAttachmentContext` consumes `text/readStatus/readError`; `attachmentStatusLabel` renders the same four states.
- Boundary check: browser sends only bounded text and image preview parts; `/api/chat` attachment metadata remains name/type/size; desktop Agent and Android runtime are untouched.

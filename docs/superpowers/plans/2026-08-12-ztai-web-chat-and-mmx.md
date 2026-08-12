# ZT.AI Web Chat and MMX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 ZT.AI 网页端完成为公开展示、真实对话和聊天内隐式 MMX 创作的轻量产品，暂不实现 Agent 或桌面端执行能力。

**Architecture:** 保留现有 Vite React 前端，媒体能力不新增公开页面或导航，而由轻量 Node 网关在聊天请求中识别明确的媒体意图后调用 MMX；聊天使用 SSE，媒体使用异步任务。密钥只存在后端环境变量，前端不直连模型服务。

**Tech Stack:** React, Vite, lucide-react, Node.js, TypeScript, SSE, SQLite（后端接入阶段）。

---

### Task 1: 收敛公开网页导航与文案

**Files:**
- Modify: `src/main.jsx`
- Modify: `src/styles.css`

- [ ] 删除网页端 Agent、工作台、本机执行、面试官授权相关文案和入口。
- [ ] 保留首页、公开聊天、精选项目、简历摘要，并加入独立 MMX 创作页。
- [ ] 将原访问权限页从导航移除，避免网页端产生 Agent 权限暗示。
- [ ] 验证所有导航项在桌面和移动端可访问。

### Task 2: 保留聊天内媒体任务状态

**Files:**
- Modify: `src/main.jsx`
- Modify: `src/styles.css`

- [ ] 不新增媒体页面、导航入口或显式额度说明。
- [ ] 在聊天消息模型中保留媒体任务卡片的数据结构，只有后端判定为媒体请求时才渲染。
- [ ] 普通聊天继续只渲染文字消息，不触发 MMX。

### Task 3: 固化聊天网关接口契约

**Files:**
- Create: `server/src/contracts/chat.ts`
- Create: `server/src/contracts/media.ts`
- Create: `server/.env.example`

- [ ] 定义模型别名 `minimax`、`deepseek` 和媒体类型 `image`、`video`。
- [ ] 定义 SSE 聊天事件和媒体任务状态，前端状态字段与之对应。
- [ ] 只声明环境变量名，不保存任何真实密钥。

### Task 4: 实现真实聊天网关

**Files:**
- Create: `server/src/index.ts`
- Create: `server/src/providers/minimax.ts`
- Create: `server/src/providers/deepseek.ts`
- Modify: `src/main.jsx`
- Modify: `package.json`

- [ ] 依据官方 API 文档接入 MiniMax M3 和 DeepSeek V4 Flash。
- [ ] 将上游流式响应转换为统一 SSE 事件。
- [ ] 增加输入长度、超时、上游错误和基础限流处理。
- [ ] 前端将本地模拟回答替换为网关流式响应，同时保留现有思考和渐进显示体验。

### Task 5: 实现 MMX 异步媒体网关

**Files:**
- Create: `server/src/providers/mmx.ts`
- Create: `server/src/routes/media.ts`
- Modify: `src/main.jsx`

- [ ] 依据 MMX 官方接口确认图片和视频任务创建、查询和结果字段。
- [ ] 将生成任务统一为 `queued`、`running`、`completed`、`failed`。
- [ ] 前端轮询或 SSE 更新任务状态，并显示结果预览和失败重试。

### Task 6: 验证与交付

**Files:**
- Modify: `design-qa.md`

- [ ] 运行 `npm run build`。
- [ ] 检查 1280px 和 390px 页面布局、导航和聊天交互。
- [ ] 搜索构建产物，确认不存在 API key 字符串或环境变量值。
- [ ] 记录当前网页视觉证据和待接入的真实 API 依赖。

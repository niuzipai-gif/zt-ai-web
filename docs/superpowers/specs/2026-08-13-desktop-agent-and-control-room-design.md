# ZT.AI Desktop Agent 与 Control Room 设计规格

## 目标

把当前本机网页工作台升级为真正的 Windows 桌面应用，并新增一个完全独立的管理员网站。桌面 Agent 面向登录账户，仿 Codex 的任务工作区，默认执行代码、文件和工具任务；Control Room 只面向蔡宙廷，用于统一监控公开网页、桌面 Agent 和未来 ZT.AI 产品的访问、模型调用、token 估算、IP 与会话记录。

## 产品边界

### ZT.AI Desktop Agent

- 使用 Electron 打包为独立 Windows 应用，不依赖浏览器地址栏或手动打开网页。
- 首次打开显示登录/注册；登录后进入执行优先工作区，默认不是闲聊窗口。
- 左侧是新建任务和任务记录，中间是目标、计划、工具日志、审批与结果，右侧是模型、工作区、账户和权限检查器。
- 支持 MiniMax M3 与 DeepSeek v4 flash 切换；模型切换不清空当前任务上下文。
- 本机工具继续受工作区边界、本机授权、单次批准/记住权限控制。
- 通过账户 bearer token 调用网关，桌面任务会记录为 `desktop-agent` 产品事件；本机文件内容不自动上传，只有模型请求必要的摘要/结果进入遥测。

### ZT.AI Control Room

- 独立网站，入口不出现在公开网页和桌面 Agent 的公开导航中。
- 仅使用管理员密码登录，服务端使用 scrypt 哈希校验，不在代码中硬编码明文密码。
- 总览展示所有 ZT.AI 产品的访客数、调用次数、模型分布、输入/输出/总 token 估算、成本估算、错误率与趋势。
- 用户列表展示访客 ID、账户 ID（如有）、产品来源、IP、User-Agent 摘要、最近访问、模型调用与 token；默认对 IP 脱敏，详情页在管理员会话内显示完整值。
- 点击访客/账户 ID 进入详情，展示时间线、模型调用、错误、会话和聊天消息；消息分页，服务端限制单次返回数量。
- 支持产品、模型、时间范围、异常状态筛选；所有管理 API 都要求管理员会话。

## 数据与隐私

- 公开网页和桌面端在首次使用/注册位置显示数据告知：为安全、质量、用量统计和产品改进，服务可能记录访客 ID、来源 IP、设备信息、模型调用摘要与对话内容；不记录上传图片的原始二进制，只记录文件名、类型和大小。
- IP 服务端保存原值用于安全审计，控制台默认显示掩码；保留期由 `DATA_RETENTION_DAYS` 配置，默认 90 天。
- 只记录必要的用户消息、助手回复、模型、时间、状态和 token 估算；不把 API key、密码、工作区密钥或系统敏感信息写入日志。
- 管理员密码使用 `ADMIN_PASSWORD_SALT` 与 `ADMIN_PASSWORD_HASH` 配置；开发机使用脚本生成哈希，生产环境通过 Render 私密环境变量配置。
- 数据存储使用可迁移的本地 JSON store 抽象，路径由 `ZT_AI_DATA_PATH` 配置；部署到 Render 时必须配置持久化目录或外部持久化存储，否则重启可能丢失监控数据。

## 服务端接口

### 账户

- `POST /api/auth/register`：创建用户名、显示名、密码，返回 bearer token 和账户信息。
- `POST /api/auth/login`：登录并返回 bearer token。
- `GET /api/auth/me`：验证当前 bearer token。
- `POST /api/auth/logout`：撤销当前会话。

### 业务遥测

- `/api/chat`：公开网页对话，按 `visitorId`、`conversationId`、`product=web` 记录消息和模型调用。
- `/api/agent/plan`、`/api/agent/chat`：桌面 Agent 请求，要求 bearer token，按账户、任务和 `product=desktop-agent` 记录调用。
- 每次调用记录 `provider/model/requestType/status/inputTokens/outputTokens/totalTokens/error/ip/createdAt`；token 没有上游 usage 时按文本长度估算，并在控制台标注“估算”。

### 管理

- `POST /api/admin/login`、`POST /api/admin/logout`、`GET /api/admin/me`。
- `GET /api/admin/overview`：汇总指标与趋势。
- `GET /api/admin/visitors`：分页列表。
- `GET /api/admin/visitors/:id`：访客/账户详情、调用时间线和消息分页。

## 桌面打包

- `desktop-app/main.mjs` 创建 BrowserWindow、启动本机 Agent 服务、管理 workspace 选择和关闭清理。
- `desktop-app/preload.mjs` 只暴露最小 IPC：读取配置、选择工作区、打开外部链接。
- `desktop-app/renderer/` 是本地登录与 Codex 风格工作区，不加载远程 UI。
- `electron-builder` 生成 Windows 安装包；安装后默认使用用户文档目录下的 `ZT.AI Workspace`，可在应用内切换。

## 验收标准

1. 未登录无法进入桌面任务工作区；注册、登录、退出和过期 token 可验证。
2. 桌面应用以独立 Electron 窗口启动，不显示浏览器地址栏；任务执行、模型切换和审批可用。
3. 公开网页仍能聊天，但不会出现 Agent 或 Control Room 入口。
4. Control Room 未登录只显示密码页；错误密码不能建立管理员会话；登录后可查看总览和按 ID 展开会话。
5. 网页端和桌面端各发起至少一次真实调用后，控制台可看到产品来源、模型、调用次数、token 估算、IP 与消息内容。
6. 不同用户/访客数据相互隔离；附件原始二进制不会进入遥测 store；超过保留期的数据会被清理。
7. 网页测试、服务端测试、桌面 renderer 测试、打包检查和宽窄窗口视觉检查全部通过。

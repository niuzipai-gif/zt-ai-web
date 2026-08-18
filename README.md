# ZT.AI

蔡宙廷的 ZT.AI 个人 AI 系统：公开网页负责多语言对话、个人经历摘要、精选项目与 GitHub Pages 静态部署；桌面端负责默认执行型 Agent 工作台。网页支持中文、English、日本語切换，界面语言和简历下载文件会同步切换。

## 本地运行

```powershell
npm install
Copy-Item .env.example .env
npm run gateway
npm run dev
```

API 密钥只放在项目根目录的 `aikey.env`，该文件已被 `.gitignore` 忽略，不应提交到 GitHub。网页端只通过网关调用模型，不在浏览器中暴露密钥。

## 对话网关

网关默认运行在 `http://localhost:8790`，支持 MiniMax M3、DeepSeek V4 Flash，以及在聊天中隐式触发的 MMX 图片/视频请求。公开网页会在打开或切换内部页面时发送轻量页面访问埋点；真正的聊天/媒体调用仍单独记录模型、估算 token、状态和消息。将网页部署到 GitHub Pages 后，GitHub Pages 只能托管静态前端；要让线上网页使用真实 API，还需要将 `server` 单独部署到 HTTPS 后端，并把该地址配置为构建时的 `VITE_API_BASE_URL`，同时在后端 `CORS_ORIGIN` 中加入 Pages 的 origin。

## GitHub Pages

当前网页构建产物发布到 `pages` 分支，访问地址为：

`https://niuzipai-gif.github.io/zt-ai-web/`

部署过程不会读取 `aikey.env`，也不会把任何模型密钥打进前端产物。

公开聊天支持 Markdown 回复、MiniMax/DeepSeek 模型切换、图片与文本/DOCX 附件、按语言切换的公开简历下载，以及按访客 ID 隔离的多会话聊天记录。每个浏览器会生成独立 visitorId；聊天记录只存在该访客的浏览器本地，网关不保存或广播历史。切换模型只改变当前会话下一次请求使用的模型，不会清空历史消息；“新建聊天”会创建当前访客下的独立会话。

## 桌面 Agent

`agent-desktop/` 是独立的本机执行型工作台。它使用官方 MiMoCode 0.1.12 作为执行内核，支持任务拆解、工作区读取、工作区写入、命令执行、权限审批、工具日志、MiniMax M3 / DeepSeek V4 Flash 切换和本机任务记录。执行权限只作用于启动 Agent 的那台电脑，不会控制蔡宙廷的设备；普通聊天不会调用本地工具。

双击 `agent-desktop/start-agent-silent.vbs` 可静默启动；更完整的迁移说明见 `agent-desktop/README.md` 与 `PORTABLE-SETUP.md`。桌面执行运行时通过 Gateway 的内部 OpenAI 兼容路由调用模型；模型密钥只保留在网关环境变量，桌面端只持有登录账号的临时凭证。

### Electron 桌面版

`npm run desktop:dev` 会打开真正的 Windows Electron 桌面应用：登录/注册后进入执行优先的本机工作台。应用会为每个启动实例生成本地 worker 密钥，worker 只监听 `127.0.0.1`；任务请求带账号 token，经 Gateway 调用模型。安装包内携带官方 MiMoCode 0.1.12 Windows x64 二进制，启动时会核验其版本；不依赖用户另行安装 MiMoCode 或 Node.js。发布安装包使用 `npm run desktop:dist`，输出在 `release/`。桌面端默认连接 `https://zt-ai-gateway.onrender.com`，本地测试前可设置 `$env:ZT_AI_GATEWAY_URL='http://localhost:8790'`。

## Control Room 管理网站

管理员网站与公共网页、桌面 Agent 分离，地址为 Gateway 的 `/admin/`，例如 `https://zt-ai-gateway.onrender.com/admin/`。用 `tools/set-admin-password.ps1` 生成 `ADMIN_PASSWORD_SALT` 和 `ADMIN_PASSWORD_HASH` 后，只把这两个值填入 Render 私密环境变量；不要把密码、API key 或生成结果提交到仓库。`DATA_RETENTION_DAYS` 控制留存周期，`ZT_AI_DATA_PATH` 控制 JSON 审计库位置。生产环境建议配置 Render Postgres 的 `DATABASE_URL`；配置后账号、访客、会话、消息和模型用量会写入持久化数据库，未配置时仍会回退到 JSON 文件。

列表默认显示脱敏 IP，完整 IP 和消息时间线仅在管理员登录后显示。线上 Render 若没有挂载持久化磁盘或外部数据库，JSON 审计数据会在实例重建时丢失；上线前应为 `ZT_AI_DATA_PATH` 配置持久化存储。

简历下载文件位于 `public/`，中文、英文、日文版本按当前简历文件维护。三份文件均基于同一份 FDE 简历的原始版式生成。

## 离职迁移

项目根目录的 `PORTABLE-SETUP.md` 说明了换电脑运行方式。迁移包不包含真实 API key，使用前需要复制 `aikey.env.example` 为 `aikey.env` 并填写密钥，然后运行 `npm install`。`start-gateway-silent.vbs` 使用自身所在目录定位网关，不依赖原来的 E 盘路径。

## 让面试官直接使用真实对话

GitHub Pages 负责前端，`render.yaml` 负责把 `server` 部署成独立网关。第一次部署时，在 Render 中连接本仓库并选择 Blueprint，填入三个私密环境变量：

- `MINIMAX_API_KEY`
- `DEEPSEEK_API_KEY`
- `CORS_ORIGIN=https://niuzipai-gif.github.io`

部署完成后，把网关地址配置到本地构建变量 `VITE_API_BASE_URL`，重新构建 `dist` 并推送 `pages` 分支。API key 永远只放 Render 的环境变量，不放 GitHub。

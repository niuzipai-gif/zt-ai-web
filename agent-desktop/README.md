# ZT.AI Desktop Agent

这是 ZT.AI 的本机执行型工作台，默认是执行任务，不是公开聊天。它沿用网页端的淡灰、白色、金色 Logo 和毛玻璃视觉，但工作内容改为任务计划、工具调用、权限批准和结果汇总。

## 启动

在项目根目录执行：

```powershell
npm run agent:start
```

或双击 `start-agent-silent.vbs`，它会静默启动兼容模式并打开 `http://127.0.0.1:8788/`。正式使用建议运行根目录的 `npm run desktop:dev`，进入 Electron 桌面版。

默认工作区是项目根目录，默认只允许读取。工作区写入、命令执行在右侧权限面板开启后，具体动作仍会在执行前请求一次批准。模型可在 MiniMax M3 与 DeepSeek v4 flash 之间切换。

## 配置

可通过环境变量切换运行目录和网关：

```powershell
$env:ZT_AI_WORKSPACE = 'E:\你的工作区'
$env:ZT_AI_GATEWAY_URL = 'http://localhost:8790'
npm run agent:start
```

Agent 只把任务日志和权限配置写入 `agent-desktop/data`，不把 API key 写进前端。推理请求走 Gateway 的 `/api/agent/chat` 路由。

## 迁移

迁移时优先使用 `release/` 中的 Electron 安装包或 portable 包；它会把任务状态放到当前 Windows 用户目录，不依赖原来的 E 盘路径。若使用兼容模式，则保留 `agent-desktop`、项目根目录的 `server`、`aikey.env`（不上传 GitHub）和 Node.js 环境。

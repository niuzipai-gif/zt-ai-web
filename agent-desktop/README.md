# ZT.AI Desktop Agent

这是 ZT.AI 的本机执行型工作台，默认是执行任务，不是公开聊天。它沿用网页端的淡灰、白色、金色 Logo 和毛玻璃视觉，但工作内容改为任务计划、工具调用、权限批准和结果汇总。ZT.buddy 的执行内核为官方 MiMoCode 0.1.12；ZT.AI 只负责账号、权限、会话和界面适配，不重复实现执行器。

## 启动

在项目根目录执行：

```powershell
npm run agent:start
```

或双击 `start-agent-silent.vbs`，它会静默启动兼容模式并打开 `http://127.0.0.1:8788/`。正式使用建议运行根目录的 `npm run desktop:dev`，进入 Electron 桌面版。

默认工作区只允许读取；点击工作区旁的“选择”可以把桌面或其他文件夹设为当前工作区。工作区写入、命令执行和联网资料检索在右侧权限面板单独开启，具体动作仍会在执行前请求一次批准。模型可在 MiniMax M3 与 DeepSeek v4 flash 之间切换。

## 配置

可通过环境变量切换运行目录和网关：

```powershell
$env:ZT_AI_WORKSPACE = 'E:\你的工作区'
$env:ZT_AI_GATEWAY_URL = 'http://localhost:8790'
npm run agent:start
```

Agent 只把任务日志、已恢复的 MiMo 会话索引和权限配置写入本机数据目录，不把 API key 写进前端。MiMoCode 进程只监听 `127.0.0.1`，模型调用经 Gateway 的 `/api/agent/openai/v1` 内部兼容路由完成；桌面进程仅使用已登录账号的 token，模型 API key 始终留在 Gateway。

## Windows 安装包与升级

`npm run desktop:dist` 生成的 Windows 安装包和 portable 包内含 MiMoCode 0.1.12 Windows x64 运行时及其 MIT 许可证说明，不需要在目标电脑单独安装 MiMoCode。应用每次启动都会调用 `mimo.exe --version` 核验固定版本；缺失或不匹配会停止启动并提示重新安装完整安装包。

升级 MiMoCode 时必须同时更新 `@mimo-ai/cli`、`agent-desktop/mimocode.lock.json`、`desktop-app/mimocode-runtime.mjs` 的固定版本、`desktop-app/THIRD_PARTY_NOTICES.txt` 和打包测试；随后依次运行 `node tools/mimocode-runtime-qa.mjs`、`npm run integration:test`、`npm run desktop:test`、`npm run desktop:dist` 与 `npm run desktop:verify`。不要通过把全局 CLI 路径写入环境变量来绕过安装包校验。

## 权限与会话

普通聊天只调用对话模型，不读取、写入或执行本机内容。ZT.buddy 需要工具时，MiMoCode 会将读取、编辑、命令和联网请求发回桌面端；每项敏感操作默认等待用户在当前电脑确认。会话只保存 MiMo 会话 ID、ZT 对话 ID、工作区和更新时间，原始模型密钥不会写入本机会话文件。

## 迁移

迁移时优先使用 `release/` 中的 Electron 安装包或 portable 包；它会把任务状态放到当前 Windows 用户目录，不依赖原来的 E 盘路径。若使用兼容模式，则保留 `agent-desktop`、项目根目录的 `server`、`aikey.env`（不上传 GitHub）和 Node.js 环境。

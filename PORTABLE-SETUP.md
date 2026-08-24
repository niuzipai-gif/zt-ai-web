# ZT.AI 迁移运行说明

这个压缩包是 ZT.AI 的源码迁移包，包含网页、网关、简历资源、Electron 桌面 Agent、Control Room 源码和静默启动脚本；真实 API key 与管理员密码没有打包进去。

## 换电脑运行

1. 将整个文件夹解压到任意位置，例如 `D:\ZT.AI\zt-ai-web`。
2. 安装 Node.js 18 或更高版本。
3. 在项目根目录复制配置模板：

   ```powershell
   Copy-Item aikey.env.example aikey.env
   ```

4. 打开 `aikey.env`，填入自己的 `MINIMAX_API_KEY`、`DEEPSEEK_API_KEY`；如果媒体服务使用独立密钥，再填写 `MMX_API_KEY` 和可选的 `MMX_BASE_URL`。网关会优先使用 MMX 配置，并在未填写时回退到 `MINIMAX_API_KEY`。
5. 安装依赖：

   ```powershell
   npm install
   ```

6. 双击 `start-gateway-silent.vbs` 静默启动网关；它会自动使用脚本所在目录，不依赖盘符。也可以执行：

   ```powershell
   npm run gateway
   ```

7. 另开一个终端启动网页：

   ```powershell
   npm run dev
   ```

也可以直接运行 `start-local.ps1`，它会检查配置、按需安装依赖、静默启动 8790 网关和 4173 网页，并打开浏览器。

8. 浏览器访问 `http://localhost:4173/`。网关健康检查：`http://localhost:8790/api/health`。

## 启动桌面 Agent

1. 优先运行 `release/` 中的 `ZT.AI-Desktop-Agent-*-x64.exe` 安装包，或直接运行 portable 包；不依赖原来的 E 盘路径。
2. 桌面版第一次需要注册/登录账户，再确认“本机执行”。工作台默认是执行模式，不是闲聊窗口；权限只作用于使用 Agent 的那台电脑。
3. 工作区写入、命令执行需要设备授权和逐次审批。账户 token 过期或无效时，任务不会进入本机执行。
4. 兼容模式仍可双击 `agent-desktop/start-agent-silent.vbs`，它会以 Edge 应用窗口或浏览器打开本机工作台。

## 迁移边界

- 网页公开聊天的上下文保存在每个访问者自己的浏览器中；为了产品运维和成本估算，网关会按访客 ID 记录请求、估算用量及对话内容，访客之间不会共享。
- `aikey.env`、`node_modules`、构建目录、日志和 Git 历史不在迁移包中。
- Agent 的任务记录与权限文件位于 `agent-desktop/data`，只保存在本机；迁移前可按需保留或删除。
- Agent 通过 `/api/agent/plan` 请求所选模型生成受约束的 JSON 计划，再由本机权限层执行；MiniMax M3 与 DeepSeek v4 flash 只切换推理模型，不共享另一台设备的工作区或聊天上下文。
- 面试官拿到迁移包后，授权的是自己运行 Agent 的那台电脑；系统没有远程控制蔡宙廷电脑的通道。
- 如果需要重新部署 GitHub Pages/Render，请按照 `README.md` 的部署说明操作；公开网页不应直接放置 API key。
- Control Room 地址为 Gateway 的 `/admin/`；部署时设置 `ADMIN_PASSWORD_SALT`、`ADMIN_PASSWORD_HASH`、`DATA_RETENTION_DAYS` 和持久化的 `ZT_AI_DATA_PATH`。没有持久化磁盘或外部数据库时，Render 实例重建可能清空 JSON 审计数据。

## 创建桌面快捷方式

在新电脑上可以右键 `start-gateway-silent.vbs` → “发送到” → “桌面快捷方式”。项目内的 `tools/zt-ai.ico` 是 ZT.AI Logo 图标，可在快捷方式属性中更换图标。

也可以在项目根目录运行下面的命令，自动创建带 ZT.AI 图标的桌面快捷方式：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\install-gateway-shortcut.ps1
```

快捷方式会自动使用当前项目路径，不依赖原电脑的 E 盘路径。

## 生成离职迁移包

在项目根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\package-agent.ps1
```

脚本会在桌面生成 `ZT.AI-Desktop-Agent-Portable.zip`，包含网页、网关、简历、Electron Agent 源码和启动脚本，不包含真实 API key、管理员密码、`node_modules`、Git 历史和日志。已构建的 Windows 安装包和 portable 包由 `npm run desktop:dist` 输出到 `release/`。

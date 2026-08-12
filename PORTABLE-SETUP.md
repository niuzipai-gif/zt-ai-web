# ZT.AI 迁移运行说明

这个压缩包是 ZT.AI 的源码迁移包，包含网页、网关、简历资源和静默启动脚本；真实 API key 没有打包进去。

## 换电脑运行

1. 将整个文件夹解压到任意位置，例如 `D:\ZT.AI\zt-ai-web`。
2. 安装 Node.js 18 或更高版本。
3. 在项目根目录复制配置模板：

   ```powershell
   Copy-Item aikey.env.example aikey.env
   ```

4. 打开 `aikey.env`，填入自己的 `MINIMAX_API_KEY`、`DEEPSEEK_API_KEY` 和需要的 `MMX_API_KEY`。
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

1. 网关启动后，双击 `agent-desktop/start-agent-silent.vbs`。
2. 工作台默认是执行模式，不是闲聊窗口；Windows 上会优先以 Edge 应用窗口打开，没有 Edge 时退回默认浏览器。
3. 第一次需要在“本机执行确认”中确认当前设备。确认后，才可以打开工作区写入、命令执行权限；每个高风险动作仍会单独请求批准。
4. 也可以运行 `npm run agent:start`，或通过 `agent-desktop/start-agent.ps1` 指定 `ZT_AI_WORKSPACE` 和 `ZT_AI_GATEWAY_URL`。

## 迁移边界

- 网页公开聊天的上下文保存在每个访问者自己的浏览器中，网关不保存聊天历史。
- `aikey.env`、`node_modules`、构建目录、日志和 Git 历史不在迁移包中。
- Agent 的任务记录与权限文件位于 `agent-desktop/data`，只保存在本机；迁移前可按需保留或删除。
- Agent 通过 `/api/agent/plan` 请求所选模型生成受约束的 JSON 计划，再由本机权限层执行；MiniMax M3 与 DeepSeek v4 flash 只切换推理模型，不共享另一台设备的工作区或聊天上下文。
- 面试官拿到迁移包后，授权的是自己运行 Agent 的那台电脑；系统没有远程控制蔡宙廷电脑的通道。
- 如果需要重新部署 GitHub Pages/Render，请按照 `README.md` 的部署说明操作；公开网页不应直接放置 API key。

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

脚本会在桌面生成 `ZT.AI-Desktop-Agent-Portable.zip`，包含网页、网关、简历、Agent 和启动脚本，不包含真实 API key、`node_modules`、Git 历史和日志。

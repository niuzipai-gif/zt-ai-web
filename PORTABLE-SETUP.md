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

## 迁移边界

- 网页公开聊天的上下文保存在每个访问者自己的浏览器中，网关不保存聊天历史。
- `aikey.env`、`node_modules`、构建目录、日志和 Git 历史不在迁移包中。
- 如果需要重新部署 GitHub Pages/Render，请按照 `README.md` 的部署说明操作；公开网页不应直接放置 API key。

## 创建桌面快捷方式

在新电脑上可以右键 `start-gateway-silent.vbs` → “发送到” → “桌面快捷方式”。项目内的 `tools/zt-ai.ico` 是 ZT.AI Logo 图标，可在快捷方式属性中更换图标。

也可以在项目根目录运行下面的命令，自动创建带 ZT.AI 图标的桌面快捷方式：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\install-gateway-shortcut.ps1
```

快捷方式会自动使用当前项目路径，不依赖原电脑的 E 盘路径。

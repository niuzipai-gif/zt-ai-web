# ZT.AI

蔡宙廷的公开 AI 数字分身网页：公开对话、个人经历摘要、精选项目与 GitHub Pages 静态部署。

## 本地运行

```powershell
npm install
Copy-Item .env.example .env
npm run gateway
npm run dev
```

API 密钥只放在项目根目录的 `aikey.env`，该文件已被 `.gitignore` 忽略，不应提交到 GitHub。网页端只通过网关调用模型，不在浏览器中暴露密钥。

## 对话网关

网关默认运行在 `http://localhost:8790`，支持 MiniMax M3、DeepSeek V4 Flash，以及在聊天中隐式触发的 MMX 图片/视频请求。将网页部署到 GitHub Pages 后，GitHub Pages 只能托管静态前端；要让线上网页使用真实 API，还需要将 `server` 单独部署到 HTTPS 后端，并把该地址配置为构建时的 `VITE_API_BASE_URL`，同时在后端 `CORS_ORIGIN` 中加入 Pages 的 origin。

## GitHub Pages

当前网页构建产物发布到 `pages` 分支，访问地址为：

`https://niuzipai-gif.github.io/zt-ai-web/`

部署过程不会读取 `aikey.env`，也不会把任何模型密钥打进前端产物。

## 让面试官直接使用真实对话

GitHub Pages 负责前端，`render.yaml` 负责把 `server` 部署成独立网关。第一次部署时，在 Render 中连接本仓库并选择 Blueprint，填入三个私密环境变量：

- `MINIMAX_API_KEY`
- `DEEPSEEK_API_KEY`
- `CORS_ORIGIN=https://niuzipai-gif.github.io`

部署完成后，把网关地址配置到本地构建变量 `VITE_API_BASE_URL`，重新构建 `dist` 并推送 `pages` 分支。API key 永远只放 Render 的环境变量，不放 GitHub。

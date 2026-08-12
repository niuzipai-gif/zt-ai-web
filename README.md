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

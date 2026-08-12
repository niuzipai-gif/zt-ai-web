# ZT.AI

蔡宙廷的公开 AI 数字分身网页：公开对话、个人经历摘要、精选项目与 GitHub Pages 静态部署。网页支持中文、English、日本語切换，界面语言和简历下载文件会同步切换。

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

公开聊天支持 Markdown 回复、MiniMax/DeepSeek 模型切换、图片与文本/DOCX 附件、按语言切换的公开简历下载，以及按访客 ID 隔离的多会话聊天记录。每个浏览器会生成独立 visitorId；聊天记录只存在该访客的浏览器本地，网关不保存或广播历史。切换模型只改变当前会话下一次请求使用的模型，不会清空历史消息；“新建聊天”会创建当前访客下的独立会话。

简历下载文件位于 `public/`：`resume.docx` 为中文 FDE 简历，`resume-en.docx` 为英文版，`resume-ja.docx` 为日文版。三份文件均基于同一份 FDE 简历的原始版式生成。

## 离职迁移

项目根目录的 `PORTABLE-SETUP.md` 说明了换电脑运行方式。迁移包不包含真实 API key，使用前需要复制 `aikey.env.example` 为 `aikey.env` 并填写密钥，然后运行 `npm install`。`start-gateway-silent.vbs` 使用自身所在目录定位网关，不依赖原来的 E 盘路径。

## 让面试官直接使用真实对话

GitHub Pages 负责前端，`render.yaml` 负责把 `server` 部署成独立网关。第一次部署时，在 Render 中连接本仓库并选择 Blueprint，填入三个私密环境变量：

- `MINIMAX_API_KEY`
- `DEEPSEEK_API_KEY`
- `CORS_ORIGIN=https://niuzipai-gif.github.io`

部署完成后，把网关地址配置到本地构建变量 `VITE_API_BASE_URL`，重新构建 `dist` 并推送 `pages` 分支。API key 永远只放 Render 的环境变量，不放 GitHub。

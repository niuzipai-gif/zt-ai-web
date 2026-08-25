# ZT.AI Android

这是 ZT.AI 公共聊天网页的 Android 原生 WebView 壳，应用启动后打开：

`https://niuzipai-gif.github.io/zt-ai-web/`

它不内置任何模型 API Key，聊天请求仍由网页端配置的公开网关处理。应用支持网页端文件选择、返回键和外部下载链接。语音模式只允许 GitHub Pages 页面申请麦克风权限，首次使用时由 Android 系统单独询问；其他网页不会获得录音权限。

## 构建

在仓库根目录 PowerShell 执行（脚本会在 `android-toolchain` 下准备 Android SDK，并使用官方 SDK 工具直接构建，避免依赖本机全局 Android Studio）：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\build-android.ps1
```

产物：

`android-app/app/build/outputs/apk/release/app-release.apk`

## 公共下载

构建并发布后，下载中心使用 GitHub Release 的稳定地址：

`https://github.com/niuzipai-gif/zt-ai-web/releases/latest/download/ZT.AI-Android-0.2.2.apk`

当前构建校验：41,438 bytes · SHA-256 `F8A767EE8846B3F8012F69E41712450D9FCE29033CBA06CE3E3E13120F267DE9`

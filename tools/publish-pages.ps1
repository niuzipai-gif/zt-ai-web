param(
  [string]$GatewayUrl = 'https://zt-ai-gateway.onrender.com',
  [string]$VoiceAssetUrl = 'https://cdn.jsdelivr.net/gh/niuzipai-gif/zt-ai-web@ad78c8acfd047627f9b16ea885fd1855934451f3/voice-vad/'
)

$ErrorActionPreference = 'Stop'
$env:GITHUB_PAGES_BUILD = 'true'
$env:VITE_API_BASE_URL = $GatewayUrl.TrimEnd('/')
$env:VITE_VOICE_ASSET_BASE_URL = $VoiceAssetUrl.TrimEnd('/') + '/'
npm run build
$adminSource = Join-Path $PSScriptRoot '..\server\public\control-room'
$adminTarget = Join-Path $PSScriptRoot '..\dist\admin'
New-Item -ItemType Directory -Path $adminTarget -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $adminSource 'styles.css') -Destination (Join-Path $adminTarget 'styles.css') -Force
Copy-Item -LiteralPath (Join-Path $adminSource 'app.js') -Destination (Join-Path $adminTarget 'app.js') -Force
Copy-Item -LiteralPath (Join-Path $adminSource 'detail-enhancements.js') -Destination (Join-Path $adminTarget 'detail-enhancements.js') -Force
Copy-Item -LiteralPath (Join-Path $adminSource 'zt-logo.png') -Destination (Join-Path $adminTarget 'zt-logo.png') -Force
$adminIndex = [System.IO.File]::ReadAllText((Join-Path $adminSource 'index.html'))
$adminIndex = $adminIndex -replace '<script src="\./app\.js"></script>', "<script>window.ZT_AI_ADMIN_API_BASE='$($GatewayUrl.TrimEnd('/'))'</script>`n    <script src='./app.js'></script>"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $adminTarget 'index.html'), $adminIndex, $utf8NoBom)
Write-Output "Built GitHub Pages site with public chat and /admin/ Control Room: $GatewayUrl"

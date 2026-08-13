param(
  [string]$GatewayUrl = 'https://zt-ai-gateway.onrender.com'
)

$ErrorActionPreference = 'Stop'
$env:GITHUB_PAGES_BUILD = 'true'
$env:VITE_API_BASE_URL = $GatewayUrl.TrimEnd('/')
npm run build
$adminSource = Join-Path $PSScriptRoot '..\server\public\control-room'
$adminTarget = Join-Path $PSScriptRoot '..\dist\admin'
New-Item -ItemType Directory -Path $adminTarget -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $adminSource 'styles.css') -Destination (Join-Path $adminTarget 'styles.css') -Force
Copy-Item -LiteralPath (Join-Path $adminSource 'app.js') -Destination (Join-Path $adminTarget 'app.js') -Force
$adminIndex = Get-Content -LiteralPath (Join-Path $adminSource 'index.html') -Raw
$adminIndex = $adminIndex -replace '<script src="\./app\.js"></script>', "<script>window.ZT_AI_ADMIN_API_BASE='$($GatewayUrl.TrimEnd('/'))'</script>`n    <script src='./app.js'></script>"
Set-Content -LiteralPath (Join-Path $adminTarget 'index.html') -Value $adminIndex -Encoding utf8
Write-Output "Built GitHub Pages site with public chat and /admin/ Control Room: $GatewayUrl"


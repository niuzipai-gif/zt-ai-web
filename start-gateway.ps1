$ErrorActionPreference = 'Stop'

$projectRoot = 'E:\ZT.AI\zt-ai-web'
$port = 8790
$logPath = Join-Path $projectRoot 'server-gateway.log'
$errorLogPath = Join-Path $projectRoot 'server-gateway.error.log'

Set-Location -LiteralPath $projectRoot
$listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) { exit 0 }

Start-Process -FilePath 'node.exe' `
  -ArgumentList @('server/src/index.js') `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $logPath `
  -RedirectStandardError $errorLogPath

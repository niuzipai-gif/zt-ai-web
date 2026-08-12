$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'aikey.env'))) {
  Write-Host '未找到 aikey.env。请先复制 aikey.env.example 为 aikey.env 并填入 API key。' -ForegroundColor Yellow
  exit 2
}

$nodeMarker = Join-Path $projectRoot 'node_modules\.bin\vite.cmd'
if (-not (Test-Path -LiteralPath $nodeMarker)) {
  Write-Host '首次运行，正在安装依赖……' -ForegroundColor Cyan
  & npm.cmd install --no-audit --no-fund
}

$gateway = Get-NetTCPConnection -State Listen -LocalPort 8790 -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $gateway) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File (Join-Path $projectRoot 'start-gateway.ps1')
}

$web = Get-NetTCPConnection -State Listen -LocalPort 4173 -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $web) {
  $webLog = Join-Path $projectRoot 'zt-ai-web.log'
  $webErrorLog = Join-Path $projectRoot 'zt-ai-web.error.log'
  Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev', '--', '--host', '127.0.0.1', '--port', '4173') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $webLog -RedirectStandardError $webErrorLog
}

Start-Process 'http://127.0.0.1:4173/'

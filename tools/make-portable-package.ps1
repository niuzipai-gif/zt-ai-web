$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stageRoot = Join-Path $projectRoot ".portable-staging\$stamp\ZT.AI-离职迁移包"
$archivePath = Join-Path ([Environment]::GetFolderPath('Desktop')) "ZT.AI-网关-离职迁移包-$stamp.zip"
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

$files = @('.env.example', '.gitignore', 'README.md', 'PORTABLE-SETUP.md', 'aikey.env.example', 'index.html', 'package.json', 'package-lock.json', 'render.yaml', 'start-gateway.ps1', 'start-gateway-silent.vbs', 'start-local.ps1', 'vite.config.js')
foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $stageRoot $file) -Force }
foreach ($dir in @('server', 'src', 'public', 'tools')) { Copy-Item -LiteralPath (Join-Path $projectRoot $dir) -Destination (Join-Path $stageRoot $dir) -Recurse -Force }

Get-ChildItem -LiteralPath (Join-Path $stageRoot 'src\assets') -Filter '*.docx' -File -ErrorAction SilentlyContinue | Remove-Item -Force
Compress-Archive -Path (Join-Path $stageRoot '*') -DestinationPath $archivePath -CompressionLevel Optimal
Write-Output "ARCHIVE=$archivePath"
Write-Output "BYTES=$((Get-Item -LiteralPath $archivePath).Length)"

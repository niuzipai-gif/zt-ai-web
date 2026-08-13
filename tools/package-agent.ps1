$ErrorActionPreference = 'Stop'
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$stage = Join-Path $projectRoot '.portable-staging\zt-ai-agent'
$desktop = [Environment]::GetFolderPath('Desktop')
$archive = Join-Path $desktop 'ZT.AI-Desktop-Agent-Portable.zip'
$rootFull = [IO.Path]::GetFullPath($projectRoot.Path).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$stageFull = [IO.Path]::GetFullPath($stage)
if (-not $stageFull.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) { throw 'Portable staging path is outside the project root.' }
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

$include = @(
  'agent-desktop', 'desktop-app', 'server', 'src', 'public', 'docs', 'tools', 'package.json', 'package-lock.json',
  'README.md', 'PORTABLE-SETUP.md', 'render.yaml', 'aikey.env.example', 'start-gateway.ps1',
  'start-gateway-silent.vbs', 'start-local.ps1', 'vite.config.js'
)
foreach ($item in $include) {
  $source = Join-Path $projectRoot $item
  if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $stage $item) -Recurse -Force }
}
$stagedAgentData = Join-Path $stage 'agent-desktop\data'
if (Test-Path -LiteralPath $stagedAgentData) { Remove-Item -LiteralPath $stagedAgentData -Recurse -Force }
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $archive -CompressionLevel Optimal
Write-Output "Created $archive"

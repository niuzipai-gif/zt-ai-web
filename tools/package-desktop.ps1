param(
  [switch]$Build
)

$ErrorActionPreference = 'Stop'
if ($Build) { npm run build }
npm run desktop:test
npm run desktop:dist
$releasePath = Join-Path $PSScriptRoot '..\release'
$artifacts = Get-ChildItem -LiteralPath $releasePath -File | Select-Object Name, Length, FullName
if (-not $artifacts) { throw 'No desktop artifacts were produced' }
if (Get-ChildItem -LiteralPath $releasePath -Recurse -File | Select-String -Pattern 'sk-[A-Za-z0-9_-]{20,}' -Quiet) { throw 'A possible API key was found in the desktop release' }
$artifacts | Format-Table -AutoSize


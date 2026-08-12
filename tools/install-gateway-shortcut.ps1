$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'ZT.AI 网关-静默启动.lnk'
$launcher = Join-Path $projectRoot 'start-gateway-silent.vbs'
$icon = Join-Path $projectRoot 'tools\zt-ai.ico'

if (-not (Test-Path -LiteralPath $launcher)) { throw "找不到网关启动脚本：$launcher" }

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$shortcut.Arguments = "`"$launcher`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = "$icon,0"
$shortcut.Description = 'ZT.AI 本地网关静默启动'
$shortcut.Save()

Write-Output "SHORTCUT=$shortcutPath"

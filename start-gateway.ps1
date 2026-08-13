$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8790
$logPath = Join-Path $projectRoot 'server-gateway.log'
$errorLogPath = Join-Path $projectRoot 'server-gateway.error.log'

Set-Location -LiteralPath $projectRoot

# The gateway loads aikey.env itself during normal startup, but child
# processes can retain an older environment from a previous launch.  Load
# the current local configuration before spawning the hidden process so the
# desktop Agent and the gateway always share the same credentials and models.
$envFile = Join-Path $projectRoot 'aikey.env'
if (Test-Path -LiteralPath $envFile) {
  Get-Content -LiteralPath $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#') -and $line -match '^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$') {
      $name = $matches[1]
      $value = $matches[2].Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

$listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) { exit 0 }

Start-Process -FilePath 'node.exe' `
  -ArgumentList @('server/src/index.js') `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $logPath `
  -RedirectStandardError $errorLogPath

$ErrorActionPreference = 'Stop'
$agentRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $agentRoot
Set-Location -LiteralPath $agentRoot
$env:ZT_AI_WORKSPACE = $projectRoot
$env:ZT_AI_AGENT_PORT = if ($env:ZT_AI_AGENT_PORT) { $env:ZT_AI_AGENT_PORT } else { '8788' }
$env:ZT_AI_GATEWAY_URL = if ($env:ZT_AI_GATEWAY_URL) { $env:ZT_AI_GATEWAY_URL } else { 'http://localhost:8790' }
Start-Process -FilePath 'node.exe' -ArgumentList 'src/server.mjs' -WorkingDirectory $agentRoot -WindowStyle Hidden
Start-Sleep -Milliseconds 900
Start-Process "http://127.0.0.1:$($env:ZT_AI_AGENT_PORT)/"

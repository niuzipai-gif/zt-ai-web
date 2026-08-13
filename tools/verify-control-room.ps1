param(
  [string]$BaseUrl = 'http://localhost:8790'
)

$ErrorActionPreference = 'Stop'
$health = Invoke-RestMethod "$BaseUrl/api/health"
if (-not $health.ok) { throw 'Gateway health check failed' }
$page = (Invoke-WebRequest "$BaseUrl/admin/" -UseBasicParsing).Content
if ($page -notmatch '产品监控中枢') { throw 'Control Room page is not served' }
$unauthorized = $null
try { Invoke-WebRequest "$BaseUrl/api/admin/overview" -UseBasicParsing -ErrorAction Stop | Out-Null }
catch { $unauthorized = [int]$_.Exception.Response.StatusCode.value__ }
if ($unauthorized -ne 401) { throw "Expected admin API to return 401, got $unauthorized" }
[pscustomobject]@{ Gateway = $health.service; ControlRoom = $true; UnauthenticatedAdminStatus = $unauthorized } | ConvertTo-Json


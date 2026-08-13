param(
  [string]$Password
)

if (-not $Password) {
  $secure = Read-Host '输入管理员密码' -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

if ($Password.Length -lt 6) { throw '管理员密码至少需要 6 位' }
$env:ZT_ADMIN_PASSWORD_TEMP = $Password
try {
  node --input-type=module -e "import crypto from 'node:crypto'; const p=process.env.ZT_ADMIN_PASSWORD_TEMP; const salt=crypto.randomBytes(16).toString('base64url'); const hash=crypto.scryptSync(p,salt,32).toString('base64url'); console.log('ADMIN_PASSWORD_SALT='+salt); console.log('ADMIN_PASSWORD_HASH='+hash)"
}
finally { Remove-Item Env:ZT_ADMIN_PASSWORD_TEMP -ErrorAction SilentlyContinue }


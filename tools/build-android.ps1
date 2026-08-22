param(
  [string]$SdkRoot = (Join-Path $PSScriptRoot '..\android-toolchain\android-sdk'),
  [switch]$SkipSdkInstall
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$toolchainRoot = Join-Path $repoRoot 'android-toolchain'
$cmdlineToolsBin = Join-Path $toolchainRoot 'cmdline-tools\latest\bin'
$sdkManager = Join-Path $cmdlineToolsBin 'sdkmanager.bat'

function Ensure-Directory([string]$Path) {
  New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Invoke-Checked([string]$FilePath, [string[]]$Arguments) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath failed with exit code $LASTEXITCODE"
  }
}

function Install-SdkTools {
  Ensure-Directory $toolchainRoot
  if (-not (Test-Path -LiteralPath $sdkManager)) {
    $zipPath = Join-Path $toolchainRoot 'commandlinetools-win-latest.zip'
    if ((Test-Path -LiteralPath $zipPath) -and (Get-Item -LiteralPath $zipPath).Length -eq 0) {
      Remove-Item -LiteralPath $zipPath -Force
    }
    if (-not (Test-Path -LiteralPath $zipPath)) {
      & curl.exe -L --fail --retry 3 --retry-delay 2 -o $zipPath 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip'
      if ($LASTEXITCODE -ne 0) { throw 'Android command-line tools download failed' }
    }
    $stage = Join-Path $toolchainRoot 'cmdline-tools-stage'
    Ensure-Directory $stage
    Expand-Archive -LiteralPath $zipPath -DestinationPath $stage -Force
    $latest = Join-Path $toolchainRoot 'cmdline-tools\latest'
    Ensure-Directory $latest
    Copy-Item -Path (Join-Path $stage 'cmdline-tools\*') -Destination $latest -Recurse -Force
  }

  Ensure-Directory $SdkRoot
  $env:ANDROID_HOME = (Resolve-Path $SdkRoot).Path
  $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
  1..20 | ForEach-Object { 'y' } | & $sdkManager --sdk_root=$env:ANDROID_HOME --licenses | Out-Null
  Invoke-Checked $sdkManager @('--sdk_root=' + $env:ANDROID_HOME, 'platform-tools', 'platforms;android-35', 'build-tools;35.0.0')
}

if (-not $SkipSdkInstall) {
  Install-SdkTools
}

$sdkRootResolved = (Resolve-Path $SdkRoot).Path
$androidJar = Join-Path $sdkRootResolved 'platforms\android-35\android.jar'
$buildTools = Join-Path $sdkRootResolved 'build-tools\35.0.0'
$aapt2 = Join-Path $buildTools 'aapt2.exe'
$d8 = Join-Path $buildTools 'd8.bat'
$zipalign = Join-Path $buildTools 'zipalign.exe'
$apksigner = Join-Path $buildTools 'apksigner.bat'
foreach ($required in @($androidJar, $aapt2, $d8, $zipalign, $apksigner)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "Android build dependency not found: $required" }
}

$appRoot = Join-Path $repoRoot 'android-app'
$sourceRoot = Join-Path $appRoot 'app\src\main'
$buildRoot = Join-Path $appRoot '.build'
if (Test-Path -LiteralPath $buildRoot) { Remove-Item -LiteralPath $buildRoot -Recurse -Force }
Ensure-Directory $buildRoot
$resZip = Join-Path $buildRoot 'resources.zip'
$genRoot = Join-Path $buildRoot 'generated'
$classesRoot = Join-Path $buildRoot 'classes'
$dexRoot = Join-Path $buildRoot 'dex'
$unsignedApk = Join-Path $buildRoot 'app-unsigned.apk'
$alignedApk = Join-Path $buildRoot 'app-aligned.apk'
$releaseDir = Join-Path $appRoot 'build\outputs\apk\release'
$releaseApk = Join-Path $releaseDir 'app-release.apk'
Ensure-Directory $genRoot
Ensure-Directory $classesRoot
Ensure-Directory $dexRoot
Ensure-Directory $releaseDir

Push-Location $appRoot
try {
  Invoke-Checked $aapt2 @('compile', '--dir', 'app\src\main\res', '-o', $resZip)
  Invoke-Checked $aapt2 @('link', '-o', $unsignedApk, '-I', $androidJar, '--manifest', 'app\src\main\AndroidManifest.xml', '--java', $genRoot, '--min-sdk-version', '24', '--target-sdk-version', '35', '--version-code', '22', '--version-name', '0.2.2', $resZip)

  $javaFiles = @((Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'java') -Filter '*.java' -Recurse).FullName) + @((Get-ChildItem -LiteralPath $genRoot -Filter 'R.java' -Recurse).FullName)
  $javacArgs = @('-source', '8', '-target', '8', '-encoding', 'UTF-8', '-classpath', $androidJar, '-d', $classesRoot) + $javaFiles
  Invoke-Checked 'javac.exe' $javacArgs
  $classFiles = @((Get-ChildItem -LiteralPath $classesRoot -Filter '*.class' -Recurse).FullName)
  if ($classFiles.Count -eq 0) { throw "No compiled Java classes found in $classesRoot" }
  Invoke-Checked $d8 (@('--lib', $androidJar, '--output', $dexRoot) + $classFiles)

  Invoke-Checked 'jar.exe' @('--update', '--file', $unsignedApk, '-C', $dexRoot, 'classes.dex')
  Invoke-Checked $zipalign @('-f', '4', $unsignedApk, $alignedApk)

  $keystore = Join-Path $toolchainRoot 'ztai-debug.keystore'
  if (-not (Test-Path -LiteralPath $keystore)) {
    Invoke-Checked 'keytool.exe' @('-genkeypair', '-v', '-keystore', $keystore, '-storepass', 'android', '-alias', 'androiddebugkey', '-keypass', 'android', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Android Debug,O=Android,C=US')
  }
  Invoke-Checked $apksigner @('sign', '--ks', $keystore, '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--out', $releaseApk, $alignedApk)
  Invoke-Checked $apksigner @('verify', '--verbose', $releaseApk)
} finally {
  Pop-Location
}

$hash = (Get-FileHash -LiteralPath $releaseApk -Algorithm SHA256).Hash
$size = (Get-Item -LiteralPath $releaseApk).Length
Write-Host "APK=$releaseApk"
Write-Host "SIZE_BYTES=$size"
Write-Host "SHA256=$hash"

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

test('Android shell marks itself for the web header and owns a cancellable loading indicator', async () => {
  const source = await fs.readFile('android-app/app/src/main/java/com/ztai/mobile/MainActivity.java', 'utf8')
  const manifest = await fs.readFile('android-app/app/src/main/AndroidManifest.xml', 'utf8')
  assert.match(source, /zt-shell=android/)
  assert.match(source, /private ProgressBar progressBar/)
  assert.match(source, /progressBar\.setVisibility\(View\.GONE\)/)
  assert.match(source, /onPageFinished\(/)
  assert.match(source, /onPageStarted\(/)
  assert.match(manifest, /android\.permission\.RECORD_AUDIO/)
  assert.match(source, /onPermissionRequest\(/)
  assert.match(source, /RESOURCE_AUDIO_CAPTURE/)
  assert.match(source, /requestPermissions\(/)
  assert.match(source, /addJavascriptInterface\(/)
  assert.match(source, /ztaiAndroidVoice/)
  assert.match(source, /SpeechRecognizer/)
})

test('public web header can suppress the download entry only inside the Android shell', async () => {
  const source = await fs.readFile('src/main.jsx', 'utf8')
  assert.match(source, /isAndroidShell/)
  assert.match(source, /!isAndroidShell/)
  assert.match(source, /android-shell/)
})

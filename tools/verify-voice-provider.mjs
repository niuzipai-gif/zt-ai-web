import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { synthesizeVoice, transcribeVoice, listVoiceClones } from '../server/src/providers/mmx.js'
import { createVoiceService } from '../server/src/voice-service.js'
import { createChatSpeech } from '../server/src/voice-stream.js'

// Explicit bounded QA: 4 HTTP syntheses, 3 streaming syntheses, 6 ASR requests.
// No cloning, no credential output, no automatic retries of paid requests.
const out = path.resolve('output/voice-upgrade-20261022')
await fs.mkdir(out, { recursive: true })
Object.assign(process.env, { MINIMAX_VOICE_ID_ZH: 'CaiZhouTingZhClean20260828', MINIMAX_VOICE_ID_EN: 'CaiZhouTingEnClean20260828', MINIMAX_VOICE_ID_JA: 'CaiZhoutingJaClean20260828' })
const service = createVoiceService({ synthesize: synthesizeVoice, transcribe: transcribeVoice, listVoices: listVoiceClones })
const scripts = {
  en: 'Hello, welcome to ZT.AI. The API is ready. Our meeting is on Friday at three thirty. The total is twenty five dollars.',
  ja: 'こんにちは。ZT.AIへようこそ。APIの準備ができました。打ち合わせは金曜日の午後三時半です。合計は二千五百円です。',
  zh: '你好，欢迎回来。',
}
const results = []
async function recognize(file) {
  const wav = file.replace(/\.(mp3|pcm)$/, '.wav')
  const input = file.endsWith('.pcm') ? ['-f', 's16le', '-ar', '32000', '-ac', '1'] : []
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...input, '-i', file, '-ac', '1', '-ar', '16000', wav], { windowsHide: true })
  return (await transcribeVoice({ audio: (await fs.readFile(wav)).toString('base64'), mimeType: 'audio/wav', language: 'auto' })).text
}
for (const language of ['en', 'ja']) {
  const voiceId = await service.resolveVoice(language)
  for (const version of ['before', 'after']) {
    const suffix = language.toUpperCase()
    process.env[`MINIMAX_TTS_SPEED_${suffix}`] = version === 'before' ? (language === 'en' ? '.90' : '.88') : (language === 'en' ? '.97' : '.96')
    process.env[`MINIMAX_TTS_EMOTION_${suffix}`] = version === 'before' ? 'calm' : 'auto'
    process.env[`MINIMAX_TTS_PRONUNCIATION_${suffix}_JSON`] = version === 'before' ? JSON.stringify(language === 'en' ? { 'ZT.AI': 'zee tee eye', API: 'A P I' } : { 'ZT.AI': 'ゼットエーアイ', API: 'エーピーアイ' }) : ''
    const start = Date.now(), file = path.join(out, `${language}-${version}.mp3`)
    try {
      const response = await synthesizeVoice({ language, text: scripts[language], voiceId })
      const download = await fetch(response.url, { signal: AbortSignal.timeout(20000) })
      if (!download.ok) throw Error('audio download failed')
      const audio = Buffer.from(await download.arrayBuffer()); await fs.writeFile(file, audio)
      const transcript = await recognize(file)
      const row = { language, version, voiceId, bytes: audio.length, elapsedMs: Date.now() - start, transcript }; results.push(row); console.log(JSON.stringify(row))
    } catch (error) { const row = { language, version, failed: true, code: error.providerCode || error.code || error.name }; results.push(row); console.log(JSON.stringify(row)) }
  }
}
for (const language of ['zh', 'en', 'ja']) {
  const start = Date.now(), frames = []; let firstMs
  const stream = createChatSpeech({ language, resolveVoice: service.resolveVoice, onAudio: frame => { firstMs ??= Date.now() - start; frames.push(Buffer.from(frame.audio, 'base64')) } })
  try {
    stream.write(scripts[language]); await stream.finish()
    const file = path.join(out, `${language}-stream.pcm`), bytes = Buffer.concat(frames)
    await fs.writeFile(file, bytes)
    const transcript = language === 'zh' ? null : await recognize(file)
    const row = { language, stream: true, chunks: frames.length, bytes: bytes.length, firstMs, transcript }; results.push(row); console.log(JSON.stringify(row))
  } catch (error) { const row = { language, stream: true, failed: true, code: error.providerCode || error.code || error.name }; results.push(row); console.log(JSON.stringify(row)) }
  finally { stream.cancel() }
}
await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2))
if (results.some(row => row.failed)) process.exitCode = 1

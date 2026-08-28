const MEDIA_API_KEY = () => process.env.MMX_API_KEY || process.env.MINIMAX_API_KEY || ''
const API_ROOT = () => (process.env.MMX_BASE_URL || process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1').replace(/\/v1\/?$/, '')
const mediaTimeout = () => Number(process.env.MMX_HTTP_TIMEOUT_MS || 45_000)
const DEFAULT_PRONUNCIATION_TONES = Object.freeze({
  en: Object.freeze([
    'ZT.AI/zee tee eye',
    'AI/A I',
    'API/A P I',
    'FDE/eff dee ee',
    'ASIN/A S I N',
    'SKU/S K U',
    '蔡宙廷/Zhouting Cai',
  ]),
  ja: Object.freeze([
    '蔡宙廷/さい・ちょうてい',
    'ZT.AI/ゼットエーアイ',
    'AI/エーアイ',
    'API/エーピーアイ',
    'FDE/エフディーイー',
    'Amazon/アマゾン',
    'MiniMax/ミニマックス',
    'LinkFox/リンクフォックス',
    'GitHub/ギットハブ',
  ]),
})

function voiceLanguage(language) {
  const value = String(language || 'zh').toLowerCase()
  if (value.startsWith('en')) return 'en'
  if (value.startsWith('ja') || value.startsWith('jp')) return 'ja'
  return 'zh'
}

function voiceIdForLanguage(language) {
  const suffix = voiceLanguage(language).toUpperCase()
  return String(process.env[`MINIMAX_VOICE_ID_${suffix}`] || process.env.MINIMAX_VOICE_ID || '').trim()
}

function ttsModelForLanguage(language) {
  const suffix = voiceLanguage(language).toUpperCase()
  return process.env[`MINIMAX_TTS_MODEL_${suffix}`] || process.env.MINIMAX_TTS_MODEL || 'speech-2.8-hd'
}

function ttsSpeedForLanguage(language) {
  const normalized = voiceLanguage(language)
  if (normalized === 'zh') return Number(process.env.MINIMAX_TTS_SPEED || 1)
  const suffix = normalized.toUpperCase()
  const fallback = normalized === 'en' ? 0.90 : 0.88
  const value = Number(process.env[`MINIMAX_TTS_SPEED_${suffix}`] || fallback)
  return Number.isFinite(value) && value > 0 ? Math.min(1.5, Math.max(0.5, value)) : fallback
}

function ttsEmotionForLanguage(language) {
  const normalized = voiceLanguage(language)
  if (normalized === 'zh') return ''
  return String(process.env[`MINIMAX_TTS_EMOTION_${normalized.toUpperCase()}`] || 'calm').trim() || 'calm'
}

function pronunciationDictForLanguage(language) {
  const normalized = voiceLanguage(language)
  if (normalized === 'zh') return undefined
  const raw = String(process.env[`MINIMAX_TTS_PRONUNCIATION_${normalized.toUpperCase()}_JSON`] || '').trim()
  if (!raw) return { tone: [...(DEFAULT_PRONUNCIATION_TONES[normalized] || [])] }
  try {
    const parsed = JSON.parse(raw)
    const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.tone) ? parsed.tone : Object.entries(parsed || {}).map(([word, pronunciation]) => `${word}/${pronunciation}`)
    const tone = entries.map(value => String(value || '').trim()).filter(Boolean).slice(0, 100)
    return tone.length ? { tone } : { tone: [...(DEFAULT_PRONUNCIATION_TONES[normalized] || [])] }
  } catch {
    return { tone: [...(DEFAULT_PRONUNCIATION_TONES[normalized] || [])] }
  }
}

function cleanVoiceText(text, language) {
  let raw = String(text || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+|www\.\S+/giu, value => value.match(/[.!?,;:。！？，；：]+$/u)?.[0] || '')
    .replace(/(^|\n)\s*[-*+]\s+/g, '$1')
    .replace(/[*_#>`~]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+([,.;:!?。！？、，；：])/gu, '$1')
    .replace(/\s{2,}/gu, ' ')
    .replace(/\b(?:and|or|but)\s*([.?!])$/iu, '$1')
    .replace(/(?:そして|または|もしくは|しかし)\s*([。！？])$/u, '$1')
    .replace(/\s+([,.;:!?。！？、，；：])/gu, '$1')
  if (voiceLanguage(language) === 'ja') {
    // Keep the visible answer clean and prevent common Han-character + kana/romaji
    // reading annotations from being spoken as part of a Japanese reply.
    raw = raw
      .replace(/([\p{Script=Han}]{1,12})[（(][\p{Script=Hiragana}\p{Script=Katakana}ー・\s]+[）)]/gu, '$1')
      .replace(/([\p{Script=Han}]{1,12})[（(][A-Za-z][A-Za-z .・'\-]{0,40}[）)]/gu, '$1')
  }
  if (voiceLanguage(language) === 'zh') return raw.replace(/\s+/g, ' ').trim().slice(0, 10_000)
  return raw.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 10_000)
}

async function minimaxRequest(path, options = {}) {
  const response = await fetch(`${API_ROOT()}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${MEDIA_API_KEY()}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(options.timeout || mediaTimeout()),
  })
  const raw = await response.text()
  let body = {}
  try { body = raw ? JSON.parse(raw) : {} } catch { body = { raw: raw.slice(0, 300) } }
  if (!response.ok) throw new Error(`MMX 请求失败（${response.status}）：${body.base_resp?.status_msg || body.error?.message || body.raw || '未知错误'}`)
  if (body.base_resp && body.base_resp.status_code && body.base_resp.status_code !== 0) throw new Error(`MMX 请求失败（${body.base_resp.status_code}）：${body.base_resp.status_msg || '未知错误'}`)
  return body
}

async function generateImage(prompt) {
  const body = await minimaxRequest('/v1/image_generation', {
    method: 'POST',
    body: JSON.stringify({
      model: process.env.MMX_IMAGE_MODEL || 'image-01',
      prompt: prompt.slice(0, 1500),
      aspect_ratio: process.env.MMX_IMAGE_ASPECT_RATIO || '1:1',
      response_format: 'url',
      n: 1,
    }),
  })
  const url = body.data?.image_urls?.[0]
  if (!url) throw new Error('MMX 图片接口没有返回图片地址')
  return { kind: 'image', status: 'completed', url }
}

async function createVideo(prompt) {
  const body = await minimaxRequest('/v1/video_generation', {
    method: 'POST',
    body: JSON.stringify({
      model: process.env.MMX_VIDEO_MODEL || 'MiniMax-Hailuo-2.3',
      prompt: prompt.slice(0, 2000),
      duration: Number(process.env.MMX_VIDEO_DURATION || 6),
      resolution: process.env.MMX_VIDEO_RESOLUTION || '768P',
    }),
  })
  const taskId = body.task_id
  if (!taskId) throw new Error('MMX 视频接口没有返回任务 ID')
  return taskId
}

async function queryVideo(taskId) {
  return minimaxRequest(`/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`, { method: 'GET' })
}

async function retrieveFile(fileId) {
  const body = await minimaxRequest(`/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`, { method: 'GET' })
  return body.file?.download_url || body.file?.file_url || null
}

async function generateVideo(prompt) {
  const taskId = await createVideo(prompt)
  const interval = Number(process.env.MMX_VIDEO_POLL_MS || 10_000)
  const maxPolls = Number(process.env.MMX_VIDEO_MAX_POLLS || 30)
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (attempt > 0) await new Promise(resolve => setTimeout(resolve, interval))
    const status = await queryVideo(taskId)
    if (status.status === 'Success') {
      const url = status.file_id ? await retrieveFile(status.file_id) : null
      if (!url) throw new Error('MMX 视频任务完成，但没有返回下载地址')
      return { kind: 'video', status: 'completed', url, taskId }
    }
    if (status.status === 'Fail') throw new Error(`MMX 视频生成失败：${status.error_message || '未知错误'}`)
  }
  return { kind: 'video', status: 'processing', taskId }
}

export async function synthesizeVoice({ text, language = 'zh', leadingPause = false } = {}) {
  if (!MEDIA_API_KEY()) throw new Error('MMX 语音服务未配置')
  const normalizedLanguage = voiceLanguage(language)
  const voiceId = voiceIdForLanguage(normalizedLanguage)
  if (!voiceId) throw new Error('MMX 自定义音色未配置')
  const value = cleanVoiceText(text, normalizedLanguage)
  if (!value) throw new Error('没有可合成的回答内容')
  // Greeting pre-roll is handled by the already-unlocked client audio element.
  // MiniMax pause markers are only reliable between pronounceable text segments;
  // placing one at the beginning can be ignored or cause the first syllables to
  // be swallowed by the provider/mobile audio path.
  const synthesisText = value
  const voiceSetting = { voice_id: voiceId, speed: ttsSpeedForLanguage(normalizedLanguage), vol: 1, pitch: 0 }
  if (normalizedLanguage !== 'zh') voiceSetting.emotion = ttsEmotionForLanguage(normalizedLanguage)
  const pronunciationDict = pronunciationDictForLanguage(normalizedLanguage)
  const body = await minimaxRequest('/v1/t2a_v2', {
    method: 'POST',
    body: JSON.stringify({
      model: ttsModelForLanguage(normalizedLanguage),
      text: synthesisText,
      stream: false,
      language_boost: normalizedLanguage === 'en' ? 'English' : normalizedLanguage === 'ja' ? 'Japanese' : 'Chinese',
      voice_setting: voiceSetting,
      ...(pronunciationDict ? { pronunciation_dict: pronunciationDict } : {}),
      audio_setting: { sample_rate: 32_000, bitrate: 128_000, format: 'mp3', channel: 1 },
      output_format: 'url',
      aigc_watermark: false,
    }),
  })
  const url = String(body.data?.audio || '').trim()
  if (!/^https:\/\//i.test(url)) throw new Error('MMX 语音接口没有返回可播放地址')
  return { kind: 'audio', status: 'completed', url, language: normalizedLanguage }
}

export async function runHiddenMediaRequest({ text }) {
  if (!MEDIA_API_KEY() || process.env.MMX_ENABLED !== 'true') return null
  return /视频|短片|video/i.test(text) ? generateVideo(text) : generateImage(text)
}

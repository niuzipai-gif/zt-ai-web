const API_ROOT = () => (process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1').replace(/\/v1\/?$/, '')
const mediaTimeout = () => Number(process.env.MMX_HTTP_TIMEOUT_MS || 45_000)

async function minimaxRequest(path, options = {}) {
  const response = await fetch(`${API_ROOT()}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${process.env.MINIMAX_API_KEY}`,
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

export async function runHiddenMediaRequest({ text }) {
  if (!process.env.MINIMAX_API_KEY || process.env.MMX_ENABLED !== 'true') return null
  return /视频|短片|video/i.test(text) ? generateVideo(text) : generateImage(text)
}

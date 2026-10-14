export function formatVoiceRequestError(error, copy = {}) {
  const key = ({ voice_connection: 'voiceConnectionError', voice_quota: 'voiceQuotaError', voice_configuration: 'voiceServiceError', voice_identity: 'voiceServiceError', voice_disabled: 'voiceServiceError', voice_input: 'voiceRecordingError', voice_no_speech: 'voiceRecordingError' })[error?.code]
  return (key && copy[key]) || error?.message || copy.voiceUnavailable || '语音暂时不可用，请重试。'
}

export function createVoiceClient({ baseUrl = '', headers = {}, fetchImpl = globalThis.fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), timeoutMs = 55000 } = {}) {
  async function request(route, body, { signal } = {}) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
      const controller = new AbortController()
      const cancel = () => controller.abort()
      signal?.addEventListener('abort', cancel, { once: true })
      const timer = setTimeout(cancel, timeoutMs)
      try {
        const response = await fetchImpl(baseUrl.replace(/\/$/, '') + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : { cache: 'no-store' }), signal: controller.signal })
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw Object.assign(new Error(result.error || '语音连接暂时中断，请重试。'), { code: result.code || 'voice_connection', retryable: result.retryable ?? [429, 500, 502, 503, 504].includes(response.status) })
        return result
      } catch (error) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
        if (error.retryable === false) throw error
        if (attempt === 1) throw Object.assign(new Error('语音连接暂时中断，请重试；输入内容已保留。'), { code: error.code || 'voice_connection' })
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', cancel)
      }
      await sleep(650)
    }
  }
  return {
    status: options => request('/api/voice/status', null, options),
    synthesize: (text, language, options = {}) => { const { signal, ...settings } = options; return request('/api/voice/synthesize', { text, language, ...settings }, { signal }) },
    transcribe: async (blob, options = {}) => {
      if (!blob?.size || blob.size > 6_000_000) throw Object.assign(new Error('录音为空或过大，请重新录制。'), { code: 'voice_input', retryable: false })
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const parts = []
      for (let index = 0; index < bytes.length; index += 32768) parts.push(String.fromCharCode(...bytes.subarray(index, index + 32768)))
      return request('/api/voice/transcribe', { audio: btoa(parts.join('')), mimeType: blob.type || 'audio/wav', language: 'auto' }, options)
    },
  }
}

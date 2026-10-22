import { cleanVoiceText, voiceStreamConfiguration } from './providers/mmx.js'
import { createBidiSpeech } from './providers/minimax-bidi.js'

// Wait for closed Markdown blocks before cleaning: a split fence/link must not be spoken.
export function createSpeechTextBuffer(language) {
  let pending = ''
  return {
    push(text, final = false) {
      pending += text
      if (pending.length > 40_000) throw new Error('语音回答超过长度限制。')
      if (!final && ((pending.match(/```/g) || []).length % 2 || (pending.match(/\[/g) || []).length !== (pending.match(/\]/g) || []).length || (pending.match(/\(/g) || []).length !== (pending.match(/\)/g) || []).length)) return ''
      // Don't split decimals, URLs or a sentence that is still being generated.
      let end = final ? pending.length : 0
      if (!final) for (const match of pending.matchAll(/[。！？\n]|[.!?](?=\s)/g)) end = match.index + match[0].length
      if (!end) return ''
      const textToSpeak = pending.slice(0, end)
      pending = pending.slice(end)
      return cleanVoiceText(textToSpeak.replace(/```[^]*$/g, match => match.includes('```', 3) ? match : ''), language)
    },
  }
}

let activeStreams = 0
export function createChatSpeech({ language, signal, onAudio, factory = createBidiSpeech }) {
  const buffer = createSpeechTextBuffer(language)
  let stream, pending = Promise.resolve(), failure, ended = false
  function release() { if (!ended) { ended = true; if (stream) activeStreams -= 1 }; signal?.removeEventListener('abort', cancel) }
  function cancel() { stream?.cancel(); release() }
  signal?.addEventListener('abort', cancel, { once: true })
  function queue(text) {
    if (!text || failure || ended) return
    pending = pending.then(async () => {
      signal?.throwIfAborted()
      if (ended) return
      if (!stream) {
        if (activeStreams >= 4) throw new Error('语音服务繁忙，请稍后重试。')
        stream = factory({ ...voiceStreamConfiguration(language), signal, onAudio })
        activeStreams += 1
      }
      await stream.write(text)
    }).catch(error => { failure = error; stream?.cancel(); release() })
  }
  return {
    write(text) { try { queue(buffer.push(text)) } catch (error) { failure = error; stream?.cancel(); release() } },
    async finish() {
      queue(buffer.push('', true))
      await pending
      try { if (failure) throw failure; if (!stream) throw new Error('没有可合成的回答内容。'); return await stream.finish() }
      finally { release() }
    },
    cancel,
  }
}

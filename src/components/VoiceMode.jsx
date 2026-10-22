import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Mic, Pause, Play, Send, Square, X } from 'lucide-react'
import { VoiceOrb } from './VoiceOrb.jsx'
import { createVoiceGreetingState, createVoiceState, detectVoiceLanguage, startVoiceCapture, transitionVoiceGreeting, transitionVoiceState } from '../lib/voice-mode.js'
import { createPcmVoiceRecorder, createVoiceAudioController, createVoicePlayback, createVoiceRecognition, formatVoiceRecognitionError, mergeVoiceTranscript } from '../lib/voice-audio.js'
import { formatVoiceRequestError } from '../lib/voice-client.js'
import { createAutomaticVoiceCapture } from '../lib/voice-turn.js'

function browserReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

export function VoiceMode({ copy, preview = false, capability, language = 'zh', audioElement = null, pcmPlayer = null, onSubmit, onGreeting, onTranscribe, onClose }) {
  const [state, setState] = useState(() => createVoiceState())
  const [greeting, setGreeting] = useState(() => createVoiceGreetingState(copy.voiceGreeting))
  const [inputText, setInputText] = useState('')
  const [analyser, setAnalyser] = useState(null)
  const [reducedMotion] = useState(browserReducedMotion)
  const [playbackStatus, setPlaybackStatus] = useState('idle')
  const [greetingAttempt, setGreetingAttempt] = useState(0)
  const [automatic, setAutomatic] = useState(false)
  const [autoStarting, setAutoStarting] = useState(false)
  const automaticRef = useRef(null)
  const automaticEventsRef = useRef({})
  const outputActiveRef = useRef(false)
  const controllerRef = useRef(null)
  const recognitionRef = useRef(null)
  const playbackRef = useRef(null)
  const transcriptRef = useRef('')
  const finalTranscriptRef = useRef('')
  const greetingAudioRef = useRef('')
  const greetingRequestRef = useRef(0)
  const voiceTurnRef = useRef(0)
  const recognitionEndRef = useRef(null)
  const greetingStateRef = useRef(greeting)
  const onGreetingRef = useRef(onGreeting)
  const stopListeningRef = useRef(null)
  const requestAbortRef = useRef(null)
  const pendingRecordingRef = useRef(null)
  const streamedReplyRef = useRef(false)
  const serverCapture = capability?.serverInput === true && typeof onTranscribe === 'function'
  greetingStateRef.current = greeting
  onGreetingRef.current = onGreeting
  outputActiveRef.current = state.status === 'speaking' || greeting.status === 'speaking'

  const visualStatus = state.status !== 'idle' ? state.status : ['speaking', 'ready', 'blocked', 'error'].includes(greeting.status) ? greeting.status : 'idle'

  const statusText = useMemo(() => {
    if (state.status === 'listening') return copy.voiceListening
    if (state.status === 'processing') return copy.voiceProcessing
    if (state.status === 'ready') return copy.voiceReplyReady || copy.voicePlay
    if (state.status === 'blocked') return state.error || copy.voiceReplyUnavailable || copy.voicePlay
    if (state.status === 'speaking') return copy.voiceSpeaking
    if (state.status === 'error') return state.error || copy.voiceUnavailable
    if (greeting.status === 'loading') return copy.voiceGreetingLoading || copy.voiceProcessing
    if (greeting.status === 'speaking') return copy.voiceSpeaking
    if (greeting.status === 'blocked' || greeting.status === 'error') return greeting.error || copy.voiceGreetingUnavailable || copy.voiceUnavailable
    if (automatic) return copy.voiceAutoListening
    return capability?.enabled ? copy.voiceModeTitle : copy.voiceNeedProvider
  }, [automatic, capability?.enabled, copy, greeting, state])

  useEffect(() => {
    const capture = createAutomaticVoiceCapture({
      isOutputActive: () => outputActiveRef.current,
      onSpeechStart: event => automaticEventsRef.current.start?.(event),
      onSpeechEnd: blob => automaticEventsRef.current.end?.(blob),
      onStop: reason => automaticEventsRef.current.stop?.(reason),
    })
    automaticRef.current = capture
    const suspend = () => { if (document.hidden) { void capture.stop(); setAutomatic(false); setAutoStarting(false); automaticEventsRef.current.suspend?.() } }
    document.addEventListener('visibilitychange', suspend)
    return () => { document.removeEventListener('visibilitychange', suspend); automaticEventsRef.current = {}; void capture.dispose() }
  }, [])

  useEffect(() => {
    pcmPlayer?.setOnStateChange(event => {
      if (!streamedReplyRef.current) return
      setPlaybackStatus(event.status)
      if (event.status === 'speaking') {
        setAnalyser(event.analyser)
        setState(current => transitionVoiceState(current, { type: 'start-speaking', stream: true }))
      } else if (event.status === 'processing') {
        setState(current => ({ ...current, status: 'processing' }))
      } else if (event.status === 'blocked') {
        voiceTurnRef.current += 1
        requestAbortRef.current?.abort()
        streamedReplyRef.current = false
        setState(current => ({ ...current, status: 'error', error: copy.voicePlaybackInterrupted }))
      } else if (event.status === 'idle') {
        setAnalyser(null)
        setState(current => current.status === 'speaking' ? transitionVoiceState(current, { type: 'finish-speaking' }) : current)
      }
    })
    controllerRef.current = serverCapture ? createPcmVoiceRecorder({ onLimit: () => { void stopListeningRef.current?.() } }) : createVoiceAudioController()
    recognitionRef.current = createVoiceRecognition({
      language: 'auto',
      onTranscript: (value, isFinal) => {
        if (!value) return
        const merged = mergeVoiceTranscript(finalTranscriptRef.current, value, isFinal)
        finalTranscriptRef.current = merged.stable
        transcriptRef.current = merged.display
        setInputText(merged.display)
      },
      onError: error => {
        void controllerRef.current?.cancel?.()
        setAnalyser(null)
        setState(current => transitionVoiceState(current, { type: 'fail', error: formatVoiceRecognitionError(error, copy) }))
      },
      onEnd: () => {
        recognitionEndRef.current?.()
        recognitionEndRef.current = null
      },
    })
    playbackRef.current = createVoicePlayback({
      audioElement,
      onStateChange: event => {
        setPlaybackStatus(event.status)
        if (event.status === 'speaking') {
          setAnalyser(event.analyser)
          if (greetingStateRef.current.status === 'ready' || greetingStateRef.current.status === 'blocked') setGreeting(current => transitionVoiceGreeting(current, { type: 'start-speaking' }))
          setState(current => current.audioUrl ? transitionVoiceState(current, { type: 'start-speaking', audioUrl: current.audioUrl }) : current)
        }
        if (event.status === 'idle') {
          setAnalyser(null)
          setState(current => current.status === 'speaking' ? transitionVoiceState(current, { type: 'finish-speaking' }) : current)
          setGreeting(current => current.status === 'speaking' ? transitionVoiceGreeting(current, { type: 'finish-speaking' }) : current)
        }
      },
    })
    return () => {
      controllerRef.current?.dispose?.()
      recognitionRef.current?.dispose?.()
      playbackRef.current?.dispose?.()
      requestAbortRef.current?.abort()
      pcmPlayer?.setOnStateChange(null)
      pcmPlayer?.stop()
    }
  }, [audioElement, language, serverCapture])

  const playGreeting = async (requestId = greetingRequestRef.current) => {
    if (!greetingAudioRef.current) return { status: 'unavailable' }
    const result = await playbackRef.current?.play?.()
    if (requestId !== greetingRequestRef.current) return result
    if (result?.status === 'speaking') setGreeting(current => transitionVoiceGreeting(current, { type: 'start-speaking' }))
    else if (result?.status === 'blocked') setGreeting(current => transitionVoiceGreeting(current, { type: 'blocked', error: copy.voiceGreetingUnavailable || copy.voicePlay }))
    else if (result?.status !== 'speaking') setGreeting(current => transitionVoiceGreeting(current, { type: 'fail', error: copy.voiceGreetingUnavailable || copy.voiceUnavailable }))
    return result
  }

  const playReply = async (requestId = null) => {
    const result = await playbackRef.current?.play?.()
    if (requestId !== null && requestId !== voiceTurnRef.current) return result
    if (result?.status === 'speaking') setState(current => transitionVoiceState(current, { type: 'start-speaking' }))
    else if (result?.status === 'blocked') setState(current => transitionVoiceState(current, { type: 'blocked', error: copy.voiceReplyUnavailable || copy.voicePlay }))
    else if (result?.status !== 'speaking') setState(current => transitionVoiceState(current, { type: 'fail', error: copy.voiceReplyUnavailable || copy.voiceUnavailable }))
    return result
  }

  useEffect(() => {
    if (!copy.voiceGreeting || typeof onGreetingRef.current !== 'function' || (!capability?.enabled && !preview)) return undefined
    let active = true
    const abort = new AbortController()
    const requestId = ++greetingRequestRef.current
    setGreeting(current => transitionVoiceGreeting({ ...current, text: copy.voiceGreeting }, { type: 'start', text: copy.voiceGreeting }))
    void (async () => {
      try {
        const reply = await onGreetingRef.current(copy.voiceGreeting, { signal: abort.signal })
        if (!active || requestId !== greetingRequestRef.current) return
        if (!reply?.audioUrl) throw new Error('开场问候没有可播放的音频。')
        greetingAudioRef.current = reply.audioUrl
        playbackRef.current?.load(reply.audioUrl, { preRollMs: reply.preRollMs })
        setGreeting(current => transitionVoiceGreeting(current, { type: 'ready', audioUrl: reply.audioUrl }))
        await playGreeting(requestId)
      } catch (error) {
        if (active && requestId === greetingRequestRef.current) setGreeting(current => transitionVoiceGreeting(current, { type: 'fail', error: formatVoiceRequestError(error, copy) }))
      }
    })()
    return () => {
      active = false
      abort.abort()
      if (greetingRequestRef.current === requestId) greetingRequestRef.current += 1
      greetingAudioRef.current = ''
    }
  }, [capability?.enabled, copy.voiceGreeting, language, preview, greetingAttempt])

  const startListening = async () => {
    if (!capability?.enabled && !preview) {
      setState(current => transitionVoiceState(current, { type: 'fail', error: copy.voiceNeedProvider }))
      return
    }
    const requestId = ++voiceTurnRef.current
    requestAbortRef.current?.abort()
    pcmPlayer?.stop()
    streamedReplyRef.current = false
    playbackRef.current?.stop?.()
    pendingRecordingRef.current = null
    transcriptRef.current = ''
    finalTranscriptRef.current = ''
    setInputText('')
    if (greetingStateRef.current.status !== 'idle') {
      greetingRequestRef.current += 1
      playbackRef.current?.stop?.()
      greetingAudioRef.current = ''
      setGreeting(current => transitionVoiceGreeting(current, { type: 'reset' }))
    }
    setState(current => transitionVoiceState(current, { type: 'reset' }))
    setState(current => transitionVoiceState(current, { type: 'start-listening' }))
    const result = serverCapture ? await controllerRef.current?.start() : await startVoiceCapture({ recognition: recognitionRef.current, recorder: controllerRef.current })
    if (requestId !== voiceTurnRef.current) return
    if (result?.status !== 'recording') {
      setState(current => transitionVoiceState(current, { type: 'fail', error: formatVoiceRecognitionError(result?.error || copy.voiceUnavailable, copy) }))
      return
    }
    setAnalyser(result.analyser)
  }

  const submitVoiceText = async value => {
    const text = String(value || '').trim()
    if (!text) {
      setState(current => transitionVoiceState(current, { type: 'fail', error: copy.voiceNoTranscript || copy.voiceUnavailable }))
      return
    }
    if (typeof onSubmit !== 'function') {
      setState(current => transitionVoiceState(current, { type: 'fail', error: copy.voiceNeedProvider }))
      return
    }
    const requestId = ++voiceTurnRef.current
    requestAbortRef.current?.abort()
    pcmPlayer?.stop()
    playbackRef.current?.stop?.()
    streamedReplyRef.current = false
    const abort = new AbortController()
    requestAbortRef.current = abort
    setInputText(text)
    setState(current => transitionVoiceState(current, { type: 'start-processing', transcript: text }))
    try {
      const detectedLanguage = detectVoiceLanguage(text, language)
      const stream = capability?.streamOutput === true && pcmPlayer?.isReady()
      if (stream) { streamedReplyRef.current = true; pcmPlayer.begin() }
      const reply = await onSubmit(text, detectedLanguage, { signal: abort.signal, stream, onAudio: frame => {
        abort.signal.throwIfAborted()
        if (requestId === voiceTurnRef.current) pcmPlayer.push(frame)
      } })
      if (requestId !== voiceTurnRef.current) return
      if (reply?.streamed) {
        await pcmPlayer.finish()
        if (requestId === voiceTurnRef.current) { streamedReplyRef.current = false; setState(current => transitionVoiceState(current, { type: 'reset' })) }
        return
      }
      pcmPlayer?.stop()
      streamedReplyRef.current = false
      if (!reply?.audioUrl) throw new Error(copy.voiceUnavailable)
      playbackRef.current?.load(reply.audioUrl)
      setState(current => transitionVoiceState(current, { type: 'ready', audioUrl: reply.audioUrl }))
      await playReply(requestId)
    } catch (error) {
      if (requestId !== voiceTurnRef.current) return
      pcmPlayer?.stop()
      streamedReplyRef.current = false
      setState(current => transitionVoiceState(current, { type: 'fail', error: formatVoiceRequestError(error, copy) }))
    }
  }

  const transcribeRecording = async blob => {
    const requestId = ++voiceTurnRef.current
    requestAbortRef.current?.abort()
    const abort = new AbortController()
    requestAbortRef.current = abort
    pendingRecordingRef.current = blob
    setState(current => current.status === 'listening' ? transitionVoiceState(current, { type: 'finish-listening', transcript: inputText }) : current)
    setState(current => transitionVoiceState(current, { type: 'start-processing', transcript: inputText }))
    try {
      const response = await onTranscribe(blob, { signal: abort.signal })
      if (requestId !== voiceTurnRef.current) return
      const text = String(response?.text || '').trim()
      setInputText(text)
      pendingRecordingRef.current = null
      await submitVoiceText(text)
    } catch (error) {
      if (requestId === voiceTurnRef.current) {
        if (['voice_input', 'voice_no_speech'].includes(error.code)) pendingRecordingRef.current = null
        if (error.code === 'voice_no_speech' && automatic) { setState(createVoiceState()); return }
        setState(current => transitionVoiceState(current, { type: 'fail', error: formatVoiceRequestError(error, copy) }))
      }
    }
  }
  const stopListening = async () => {
    if (serverCapture) {
      const requestId = ++voiceTurnRef.current
      const result = await controllerRef.current?.stop()
      if (requestId !== voiceTurnRef.current) return
      setAnalyser(null)
      if (result?.status !== 'ready') { setState(current => transitionVoiceState(current, { type: 'fail', error: result?.error || copy.voiceUnavailable })); return }
      setState(current => transitionVoiceState(current, { type: 'finish-listening', transcript: inputText }))
      await transcribeRecording(result.blob)
      return
    }
    const recognition = recognitionRef.current
    const recognitionSettled = recognition?.isListening?.() ? new Promise(resolve => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        recognitionEndRef.current = null
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(finish, 500)
      recognitionEndRef.current = finish
      recognition.stop?.()
    }) : Promise.resolve()
    const result = await controllerRef.current?.stop?.()
    await recognitionSettled
    setAnalyser(null)
    if (result?.status !== 'ready') {
      setState(current => transitionVoiceState(current, { type: 'fail', error: result?.error || copy.voiceUnavailable }))
      return
    }
    const value = (finalTranscriptRef.current || transcriptRef.current).trim()
    if (!value) {
      setState(current => transitionVoiceState(current, { type: 'fail', error: copy.voiceNoTranscript || copy.voiceUnavailable }))
      return
    }
    setState(current => transitionVoiceState(current, { type: 'finish-listening', transcript: value }))
    await submitVoiceText(value)
  }
  stopListeningRef.current = stopListening

  const interruptOutput = () => {
    voiceTurnRef.current += 1
    greetingRequestRef.current += 1
    requestAbortRef.current?.abort()
    pcmPlayer?.stop()
    streamedReplyRef.current = false
    playbackRef.current?.stop?.()
    greetingAudioRef.current = ''
    pendingRecordingRef.current = null
    setGreeting(current => transitionVoiceGreeting(current, { type: 'reset' }))
    setState(createVoiceState())
  }
  automaticEventsRef.current = {
    start: ({ analyser: inputAnalyser }) => {
      interruptOutput()
      setInputText('')
      setAnalyser(inputAnalyser)
      setState(current => transitionVoiceState(current, { type: 'start-listening' }))
    },
    end: blob => { setAnalyser(null); void transcribeRecording(blob) },
    stop: reason => { setAutomatic(false); setAutoStarting(false); setState(current => reason === 'startup' ? { ...createVoiceState(), status: 'error', error: copy.voiceAutoUnavailable } : current.status === 'listening' ? createVoiceState() : current); setAnalyser(null) },
    suspend: interruptOutput,
  }
  const toggleAutomatic = async () => {
    if (automatic || autoStarting) {
      await automaticRef.current?.stop()
      setAutomatic(false); setAutoStarting(false)
      setAnalyser(null)
      setState(current => current.status === 'listening' ? createVoiceState() : current)
      return
    }
    if (!capability?.enabled && !preview) return
    void pcmPlayer?.unlock()
    setAutoStarting(true)
    const result = await automaticRef.current?.start()
    setAutoStarting(false)
    if (result?.status === 'cancelled') return
    if (result?.status !== 'recording') {
      setState(current => transitionVoiceState(current, { type: 'fail', error: result?.error === 'permission-denied' ? copy.voicePermissionDenied : copy.voiceAutoUnavailable }))
      return
    }
    setAutomatic(true)
    setState(current => current.status === 'error' ? createVoiceState() : current)
  }

  const submitText = async () => {
    pendingRecordingRef.current = null
    if (automatic || autoStarting) { await automaticRef.current?.stop(); setAutomatic(false); setAutoStarting(false) }
    if (state.status === 'listening') {
      recognitionRef.current?.stop?.()
      await controllerRef.current?.cancel?.()
      setAnalyser(null)
      setState(current => transitionVoiceState(current, { type: 'reset' }))
    }
    if (state.status === 'speaking') {
      voiceTurnRef.current += 1
      playbackRef.current?.stop?.()
      setState(current => transitionVoiceState(current, { type: 'reset' }))
    }
    if (greetingStateRef.current.status !== 'idle') {
      greetingRequestRef.current += 1
      playbackRef.current?.stop?.()
      greetingAudioRef.current = ''
      setGreeting(current => transitionVoiceGreeting(current, { type: 'reset' }))
    }
    await submitVoiceText(inputText)
  }

  const handleOrb = () => {
    if (greeting.status === 'loading') return
    if (serverCapture) { void toggleAutomatic(); return }
    if (greeting.status === 'speaking') {
      playbackRef.current?.stop?.()
      setGreeting(current => transitionVoiceGreeting(current, { type: 'reset' }))
      greetingAudioRef.current = ''
      void startListening()
      return
    }
    if (state.status === 'listening') { void stopListening(); return }
    if (state.status === 'speaking') {
      voiceTurnRef.current += 1
      playbackRef.current?.stop?.()
      setState(current => transitionVoiceState(current, { type: 'reset' }))
      void startListening()
      return
    }
    if (state.status === 'processing') {
      voiceTurnRef.current += 1
      requestAbortRef.current?.abort()
      pcmPlayer?.stop()
      setState(current => transitionVoiceState(current, { type: 'reset' }))
    }
    void startListening()
  }

  const close = () => {
    greetingRequestRef.current += 1
    voiceTurnRef.current += 1
    requestAbortRef.current?.abort()
    void automaticRef.current?.stop()
    pcmPlayer?.stop()
    pendingRecordingRef.current = null
    controllerRef.current?.cancel?.()
    playbackRef.current?.stop?.()
    greetingAudioRef.current = ''
    onClose?.()
  }

  const greetingText = String(greeting.text || copy.voiceGreeting || '').trim()
  const transcriptText = inputText || (state.status === 'listening' ? copy.voiceTranscriptPlaceholder : greeting.status !== 'idle' ? greetingText : '')
  const greetingPlayable = ['ready', 'blocked'].includes(greeting.status) && Boolean(greeting.audioUrl)
  const replyPlayable = ['ready', 'blocked'].includes(state.status) && Boolean(state.audioUrl)

  return <div className="voice-mode" data-voice-status={visualStatus} data-auto-listening={automatic ? 'true' : 'false'} data-auto-starting={autoStarting ? 'true' : 'false'} data-reduced-motion={reducedMotion ? 'true' : 'false'} role="dialog" aria-modal="true" aria-label={copy.voiceModeTitle}>
    <div className="voice-mode-panel">
      <div className="voice-mode-head"><div><span className="eyebrow">ZT.AI · VOICE MODE</span><h2>{copy.voiceModeTitle}</h2></div><button className="voice-mode-close" type="button" onClick={close} aria-label={copy.voiceClose}><X size={18} /></button></div>
      <div className="voice-mode-status" data-status={visualStatus} aria-live="polite">{autoStarting ? copy.voiceAutoLoading : statusText}</div>
      <div className="voice-mode-greeting" aria-live="polite">{greeting.status !== 'idle' ? greetingText : ''}</div>
      <VoiceOrb status={visualStatus} analyser={analyser} onClick={handleOrb} disabled={greeting.status === 'loading'} reducedMotion={reducedMotion} />
      <div className="voice-mode-input-row">
        <textarea className="voice-mode-input" value={inputText} onChange={event => setInputText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); void submitText() } }} placeholder={copy.voiceTextPlaceholder || copy.voiceTranscriptPlaceholder} aria-label={copy.voiceTextInput || copy.voiceTextPlaceholder || copy.voiceTranscriptPlaceholder} disabled={greeting.status === 'loading' || ['processing'].includes(state.status)} />
        <button className="voice-mode-submit" type="button" onClick={() => { void submitText() }} disabled={!inputText.trim() || greeting.status === 'loading' || ['processing'].includes(state.status)} aria-label={copy.voiceTextSend || copy.send}><Send size={16} /></button>
      </div>
      <div className="voice-mode-transcript-hint" aria-live="polite">{inputText ? copy.voiceTextHint : greeting.status !== 'idle' ? transcriptText : copy.voiceTranscriptPlaceholder}</div>
      {serverCapture && <div className="voice-mode-auto-hint">{automatic ? copy.voiceAutoHint : copy.voiceAutoStartHint}</div>}
      <div className="voice-mode-actions">
        {state.status === 'error' && pendingRecordingRef.current && <button className="voice-mode-action" type="button" aria-label={copy.voiceRetryRecognition || copy.retry} onClick={() => { void transcribeRecording(pendingRecordingRef.current) }}>{copy.retry}</button>}
        <button className="voice-mode-action" type="button" onClick={handleOrb} disabled={greeting.status === 'loading'} aria-pressed={automatic} aria-label={serverCapture ? (automatic || autoStarting ? copy.voiceAutoStop : copy.voiceAutoStart) : state.status === 'listening' ? copy.voiceStop : copy.voiceInput}>{automatic || autoStarting || state.status === 'listening' ? <Square size={16} /> : <Mic size={17} />}</button>
        {greeting.status === 'speaking' || (state.status === 'speaking' && playbackStatus === 'speaking') ? <button className="voice-mode-action" type="button" onClick={() => { if (streamedReplyRef.current) { voiceTurnRef.current += 1; requestAbortRef.current?.abort(); pcmPlayer?.stop(); streamedReplyRef.current = false; setState(createVoiceState()) }; playbackRef.current?.pause?.(); if (greeting.status === 'speaking') setGreeting(current => transitionVoiceGreeting(current, { type: 'pause' })) }} aria-label={copy.voicePause}><Pause size={16} /></button> : <button className="voice-mode-action" type="button" onClick={() => { if (greeting.status === 'error') setGreetingAttempt(current => current + 1); else if (greetingPlayable) void playGreeting(); else if (replyPlayable) void playReply() }} aria-label={greeting.status === 'error' ? copy.retry : copy.voicePlay} disabled={greeting.status === 'loading' || (greeting.status !== 'error' && !greetingPlayable && !replyPlayable)}><Play size={16} /></button>}
      </div>
      <div className="voice-mode-disclosure">{copy.voiceAiDisclosure}</div>
    </div>
  </div>
}

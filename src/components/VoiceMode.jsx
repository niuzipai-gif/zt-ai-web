import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Mic, Pause, Play, Square, X } from 'lucide-react'
import { VoiceOrb } from './VoiceOrb.jsx'
import { createVoiceGreetingState, createVoiceState, detectVoiceLanguage, startVoiceCapture, transitionVoiceGreeting, transitionVoiceState } from '../lib/voice-mode.js'
import { createVoiceAudioController, createVoicePlayback, createVoiceRecognition, formatVoiceRecognitionError, mergeVoiceTranscript } from '../lib/voice-audio.js'

function browserReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

export function VoiceMode({ copy, preview = false, capability, language = 'zh', onSubmit, onGreeting, onClose }) {
  const [state, setState] = useState(() => createVoiceState())
  const [greeting, setGreeting] = useState(() => createVoiceGreetingState(copy.voiceGreeting))
  const [transcript, setTranscript] = useState('')
  const [analyser, setAnalyser] = useState(null)
  const [reducedMotion] = useState(browserReducedMotion)
  const [playbackStatus, setPlaybackStatus] = useState('idle')
  const controllerRef = useRef(null)
  const recognitionRef = useRef(null)
  const playbackRef = useRef(null)
  const transcriptRef = useRef('')
  const finalTranscriptRef = useRef('')
  const greetingAudioRef = useRef('')
  const greetingStateRef = useRef(greeting)
  const onGreetingRef = useRef(onGreeting)
  greetingStateRef.current = greeting
  onGreetingRef.current = onGreeting

  const visualStatus = state.status !== 'idle' ? state.status : greeting.status === 'speaking' ? 'speaking' : 'idle'

  const statusText = useMemo(() => {
    if (state.status === 'listening') return copy.voiceListening
    if (state.status === 'processing') return copy.voiceProcessing
    if (state.status === 'speaking') return copy.voiceSpeaking
    if (state.status === 'error') return state.error || copy.voiceUnavailable
    if (greeting.status === 'loading') return copy.voiceGreetingLoading || copy.voiceProcessing
    if (greeting.status === 'speaking') return copy.voiceSpeaking
    if (greeting.status === 'blocked' || greeting.status === 'error') return greeting.error || copy.voiceGreetingUnavailable || copy.voiceUnavailable
    return capability?.enabled ? copy.voiceModeTitle : copy.voiceNeedProvider
  }, [capability?.enabled, copy, greeting, state])

  useEffect(() => {
    controllerRef.current = createVoiceAudioController()
    recognitionRef.current = createVoiceRecognition({
      language: 'auto',
      onTranscript: (value, isFinal) => {
        if (!value) return
        const merged = mergeVoiceTranscript(finalTranscriptRef.current, value, isFinal)
        finalTranscriptRef.current = merged.stable
        transcriptRef.current = merged.display
        setTranscript(merged.display)
      },
      onError: error => {
        void controllerRef.current?.cancel?.()
        setAnalyser(null)
        setState(current => transitionVoiceState(current, { type: 'fail', error: formatVoiceRecognitionError(error, copy) }))
      },
    })
    playbackRef.current = createVoicePlayback({
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
    }
  }, [language])

  const playGreeting = async () => {
    if (!greetingAudioRef.current) return { status: 'unavailable' }
    const result = await playbackRef.current?.play?.()
    if (result?.status === 'speaking') setGreeting(current => transitionVoiceGreeting(current, { type: 'start-speaking' }))
    else if (result?.status === 'blocked') setGreeting(current => transitionVoiceGreeting(current, { type: 'blocked', error: copy.voiceGreetingUnavailable || copy.voicePlay }))
    else if (result?.status !== 'speaking') setGreeting(current => transitionVoiceGreeting(current, { type: 'fail', error: copy.voiceGreetingUnavailable || copy.voiceUnavailable }))
    return result
  }

  useEffect(() => {
    if (!copy.voiceGreeting || typeof onGreetingRef.current !== 'function' || (!capability?.enabled && !preview)) return undefined
    let active = true
    setGreeting(current => transitionVoiceGreeting({ ...current, text: copy.voiceGreeting }, { type: 'start', text: copy.voiceGreeting }))
    void (async () => {
      try {
        const reply = await onGreetingRef.current(copy.voiceGreeting)
        if (!active) return
        if (!reply?.audioUrl) throw new Error('开场问候没有可播放的音频。')
        greetingAudioRef.current = reply.audioUrl
        playbackRef.current?.load(reply.audioUrl)
        setGreeting(current => transitionVoiceGreeting(current, { type: 'ready', audioUrl: reply.audioUrl }))
        await playGreeting()
      } catch (error) {
        if (active) setGreeting(current => transitionVoiceGreeting(current, { type: 'fail', error: copy.voiceGreetingError || copy.voiceUnavailable }))
      }
    })()
    return () => {
      active = false
      greetingAudioRef.current = ''
    }
  }, [capability?.enabled, copy.voiceGreeting, language, preview])

  const startListening = async () => {
    if (!capability?.enabled && !preview) {
      setState(current => transitionVoiceState(current, { type: 'fail', error: copy.voiceNeedProvider }))
      return
    }
    transcriptRef.current = ''
    finalTranscriptRef.current = ''
    setTranscript('')
    if (greetingStateRef.current.status !== 'idle') {
      playbackRef.current?.stop?.()
      greetingAudioRef.current = ''
      setGreeting(current => transitionVoiceGreeting(current, { type: 'reset' }))
    }
    setState(current => transitionVoiceState(current, { type: 'start-listening' }))
    const result = await startVoiceCapture({ recognition: recognitionRef.current, recorder: controllerRef.current })
    if (result?.status !== 'recording') {
      setState(current => transitionVoiceState(current, { type: 'fail', error: formatVoiceRecognitionError(result?.error || copy.voiceUnavailable, copy) }))
      return
    }
    setAnalyser(result.analyser)
  }

  const stopListening = async () => {
    recognitionRef.current?.stop?.()
    const result = await controllerRef.current?.stop?.()
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
    if (typeof onSubmit !== 'function') {
      setState(current => transitionVoiceState(current, { type: 'fail', error: copy.voiceNeedProvider }))
      return
    }
    try {
      const detectedLanguage = detectVoiceLanguage(value, language)
      const reply = await onSubmit(value, detectedLanguage)
      if (!reply?.audioUrl) throw new Error(copy.voiceUnavailable)
      playbackRef.current?.load(reply.audioUrl)
      setState(current => transitionVoiceState(current, { type: 'start-speaking', audioUrl: reply.audioUrl }))
      await playbackRef.current?.play?.()
    } catch (error) {
      setState(current => transitionVoiceState(current, { type: 'fail', error: error?.message || copy.voiceUnavailable }))
    }
  }

  const handleOrb = () => {
    if (greeting.status === 'loading') return
    if (greeting.status === 'speaking') { playbackRef.current?.stop?.(); setGreeting(current => transitionVoiceGreeting(current, { type: 'reset' })); greetingAudioRef.current = ''; return }
    if (state.status === 'listening') { void stopListening(); return }
    if (state.status === 'speaking') { playbackRef.current?.stop?.(); return }
    if (state.status === 'processing') return
    void startListening()
  }

  const close = () => {
    controllerRef.current?.cancel?.()
    playbackRef.current?.stop?.()
    greetingAudioRef.current = ''
    onClose?.()
  }

  const transcriptText = transcript || (state.status === 'listening' ? copy.voiceTranscriptPlaceholder : greeting.status === 'blocked' || greeting.status === 'error' ? greeting.error : greeting.status !== 'idle' ? greeting.text : '')
  const greetingPlayable = ['ready', 'blocked'].includes(greeting.status) && Boolean(greeting.audioUrl)

  return <div className="voice-mode" data-voice-status={visualStatus} data-reduced-motion={reducedMotion ? 'true' : 'false'} role="dialog" aria-modal="true" aria-label={copy.voiceModeTitle}>
    <div className="voice-mode-panel">
      <div className="voice-mode-head"><div><span className="eyebrow">ZT.AI · VOICE MODE</span><h2>{copy.voiceModeTitle}</h2></div><button className="voice-mode-close" type="button" onClick={close} aria-label={copy.voiceClose}><X size={18} /></button></div>
      <div className="voice-mode-status" data-status={visualStatus} aria-live="polite">{statusText}</div>
      <VoiceOrb status={visualStatus} analyser={analyser} onClick={handleOrb} disabled={greeting.status === 'loading'} reducedMotion={reducedMotion} />
      <div className="voice-mode-transcript" aria-live="polite">{transcriptText}</div>
      <div className="voice-mode-actions">
        <button className="voice-mode-action" type="button" onClick={handleOrb} disabled={greeting.status === 'loading'} aria-label={state.status === 'listening' ? copy.voiceStop : copy.voiceInput}>{state.status === 'listening' ? <Square size={16} /> : <Mic size={17} />}</button>
        {greeting.status === 'speaking' || (state.status === 'speaking' && playbackStatus === 'speaking') ? <button className="voice-mode-action" type="button" onClick={() => { playbackRef.current?.pause?.(); if (greeting.status === 'speaking') setGreeting(current => transitionVoiceGreeting(current, { type: 'pause' })) }} aria-label={copy.voicePause}><Pause size={16} /></button> : <button className="voice-mode-action" type="button" onClick={() => { if (greetingPlayable) void playGreeting(); else void playbackRef.current?.play?.() }} aria-label={copy.voicePlay} disabled={greeting.status === 'loading'}><Play size={16} /></button>}
      </div>
      <div className="voice-mode-disclosure">{copy.voiceAiDisclosure}</div>
    </div>
  </div>
}

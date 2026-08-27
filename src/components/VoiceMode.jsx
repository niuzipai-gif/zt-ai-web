import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Mic, Pause, Play, Square, X } from 'lucide-react'
import { VoiceOrb } from './VoiceOrb.jsx'
import { createVoiceState, startVoiceCapture, transitionVoiceState } from '../lib/voice-mode.js'
import { createVoiceAudioController, createVoicePlayback, createVoiceRecognition, formatVoiceRecognitionError, mergeVoiceTranscript } from '../lib/voice-audio.js'

function browserReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

export function VoiceMode({ copy, preview = false, capability, language = 'zh', onSubmit, onClose }) {
  const [state, setState] = useState(() => createVoiceState())
  const [transcript, setTranscript] = useState('')
  const [analyser, setAnalyser] = useState(null)
  const [reducedMotion] = useState(browserReducedMotion)
  const [playbackStatus, setPlaybackStatus] = useState('idle')
  const controllerRef = useRef(null)
  const recognitionRef = useRef(null)
  const playbackRef = useRef(null)
  const transcriptRef = useRef('')
  const finalTranscriptRef = useRef('')

  const statusText = useMemo(() => {
    if (state.status === 'listening') return copy.voiceListening
    if (state.status === 'processing') return copy.voiceProcessing
    if (state.status === 'speaking') return copy.voiceSpeaking
    if (state.status === 'error') return state.error || copy.voiceUnavailable
    return capability?.enabled ? copy.voiceModeTitle : copy.voiceNeedProvider
  }, [capability?.enabled, copy, state])

  useEffect(() => {
    controllerRef.current = createVoiceAudioController()
    recognitionRef.current = createVoiceRecognition({
      language,
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
          setState(current => current.audioUrl ? transitionVoiceState(current, { type: 'start-speaking', audioUrl: current.audioUrl }) : current)
        }
        if (event.status === 'idle') setState(current => current.status === 'speaking' ? transitionVoiceState(current, { type: 'finish-speaking' }) : current)
      },
    })
    return () => {
      controllerRef.current?.dispose?.()
      recognitionRef.current?.dispose?.()
      playbackRef.current?.dispose?.()
    }
  }, [language])

  const startListening = async () => {
    if (!capability?.enabled && !preview) {
      setState(current => transitionVoiceState(current, { type: 'fail', error: copy.voiceNeedProvider }))
      return
    }
    transcriptRef.current = ''
    finalTranscriptRef.current = ''
    setTranscript('')
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
      const reply = await onSubmit(value)
      if (!reply?.audioUrl) throw new Error(copy.voiceUnavailable)
      playbackRef.current?.load(reply.audioUrl)
      setState(current => transitionVoiceState(current, { type: 'start-speaking', audioUrl: reply.audioUrl }))
      await playbackRef.current?.play?.()
    } catch (error) {
      setState(current => transitionVoiceState(current, { type: 'fail', error: error?.message || copy.voiceUnavailable }))
    }
  }

  const handleOrb = () => {
    if (state.status === 'listening') { void stopListening(); return }
    if (state.status === 'speaking') { playbackRef.current?.stop?.(); return }
    if (state.status === 'processing') return
    void startListening()
  }

  const close = () => {
    controllerRef.current?.cancel?.()
    playbackRef.current?.stop?.()
    onClose?.()
  }

  return <div className="voice-mode" data-voice-status={state.status} data-reduced-motion={reducedMotion ? 'true' : 'false'} role="dialog" aria-modal="true" aria-label={copy.voiceModeTitle}>
    <div className="voice-mode-panel">
      <div className="voice-mode-head"><div><span className="eyebrow">ZT.AI · VOICE MODE</span><h2>{copy.voiceModeTitle}</h2></div><button className="voice-mode-close" type="button" onClick={close} aria-label={copy.voiceClose}><X size={18} /></button></div>
      <div className="voice-mode-status" data-status={state.status} aria-live="polite">{statusText}</div>
      <VoiceOrb status={state.status} analyser={analyser} onClick={handleOrb} reducedMotion={reducedMotion} />
      <div className="voice-mode-transcript" aria-live="polite">{transcript || (state.status === 'listening' ? copy.voiceTranscriptPlaceholder : '')}</div>
      <div className="voice-mode-actions">
        <button className="voice-mode-action" type="button" onClick={handleOrb} aria-label={state.status === 'listening' ? copy.voiceStop : copy.voiceInput}>{state.status === 'listening' ? <Square size={16} /> : <Mic size={17} />}</button>
        {playbackStatus === 'speaking' ? <button className="voice-mode-action" type="button" onClick={() => playbackRef.current?.pause?.()} aria-label={copy.voicePause}><Pause size={16} /></button> : <button className="voice-mode-action" type="button" onClick={() => playbackRef.current?.play?.()} aria-label={copy.voicePlay}><Play size={16} /></button>}
      </div>
      <div className="voice-mode-disclosure">{copy.voiceAiDisclosure}</div>
    </div>
  </div>
}

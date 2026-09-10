import React, { useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Pause, Play, RotateCcw } from 'lucide-react'
import { flowProgress } from '../lib/project-flow.js'
import { advanceFlowDemo, createFlowDemoState, FLOW_STEP_MS, replayFlowDemo, selectFlowStep, toggleFlowPlayback } from '../lib/project-flow-ui.js'
import { ProjectFlowScene } from './ProjectFlowScene.jsx'
import './project-flow.css'

export function ProjectFlowDemo({ flowDemo, ui, projectId }) {
  if (!flowDemo?.steps?.length) return null
  return <FlowPlayer key={`${projectId}:${ui.flowTitle}`} flowDemo={flowDemo} ui={ui} projectId={projectId} />
}

function FlowPlayer({ flowDemo, ui, projectId }) {
  const steps = flowDemo.steps
  const [state, setState] = useState(() => createFlowDemoState(steps.length))
  const [reduced, setReduced] = useState(() => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false)
  const [inView, setInView] = useState(false)
  const [pageVisible, setPageVisible] = useState(() => !globalThis.document?.hidden)
  const shellRef = useRef(null)
  const buttonsRef = useRef([])
  const remainingRef = useRef(FLOW_STEP_MS)
  const panelId = useId()
  const playing = state.mode === 'auto' && inView && pageVisible && !reduced

  useEffect(() => {
    const media = globalThis.matchMedia('(prefers-reduced-motion: reduce)')
    const onMotion = () => setReduced(media.matches)
    const onVisibility = () => setPageVisible(!document.hidden)
    media.addEventListener('change', onMotion)
    document.addEventListener('visibilitychange', onVisibility)
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      setInView(entries[0].isIntersecting && entries[0].intersectionRatio >= 0.2)
    }, { threshold: [0, 0.2] })
    if (observer) observer.observe(shellRef.current)
    else setInView(true)
    return () => {
      media.removeEventListener('change', onMotion)
      document.removeEventListener('visibilitychange', onVisibility)
      observer?.disconnect()
    }
  }, [])

  useEffect(() => { remainingRef.current = FLOW_STEP_MS }, [state.index, state.run])
  useEffect(() => {
    if (!playing) return undefined
    const started = performance.now()
    const timer = setTimeout(() => setState(advanceFlowDemo), remainingRef.current)
    return () => {
      clearTimeout(timer)
      remainingRef.current = Math.max(0, remainingRef.current - (performance.now() - started))
    }
  }, [playing, state.index, state.run])

  const activeStep = steps[state.index]
  const lastIndex = steps.length - 1
  const status = reduced ? ui.flowManual : state.mode === 'complete' ? ui.flowComplete : playing ? ui.flowPlaying : ui.flowPaused
  const choose = index => setState(previous => selectFlowStep(previous, index))
  const onStepKey = (event, index) => {
    const targets = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: lastIndex }
    if (!(event.key in targets)) return
    event.preventDefault()
    const next = Math.min(lastIndex, Math.max(0, targets[event.key]))
    choose(next)
    buttonsRef.current[next]?.focus()
  }

  return <section ref={shellRef} className="project-flow-demo" aria-label={ui.flowTitle} data-playing={playing} data-mode={state.mode} data-project={projectId} style={{ '--step-duration': `${FLOW_STEP_MS}ms` }}>
    <div className="project-flow-heading">
      <div><span className="eyebrow">{ui.flowEyebrow}</span><h3>{ui.flowTitle}</h3></div>
      <span className="project-flow-status"><i />{status}</span>
    </div>
    <div className="project-flow-stage">
      <div className="project-flow-canvas">
        <span className="project-flow-stage-tag">{ui.flowIllustration}</span>
        <ProjectFlowScene projectId={projectId} step={state.index} labels={ui.flowSceneLabels[projectId]} />
        <span className="project-flow-stage-index">{String(state.index + 1).padStart(2, '0')} <span>/ {String(steps.length).padStart(2, '0')}</span></span>
      </div>
      <div className="project-flow-story" id={panelId}>
        <span className="project-flow-overline">{ui.flowStep} {String(state.index + 1).padStart(2, '0')}</span>
        <div className="project-flow-copy-stack">
          {steps.map((step, index) => <div key={step.id} className={`project-flow-active ${index === state.index ? 'is-current' : ''}`} aria-hidden={index !== state.index}>
            <h4>{step.label}</h4><p>{step.description}</p>
            <div className="project-flow-outcome"><span>{ui.flowOutcome}</span><strong>{flowDemo.outcomes[index]}</strong></div>
          </div>)}
        </div>
        <div className="project-flow-reading" aria-hidden="true"><span key={`${state.run}:${state.index}`} style={{ animationPlayState: playing ? 'running' : 'paused' }} /></div>
      </div>
    </div>
    <div className="project-flow-rail" style={{ '--flow-progress': flowProgress(state.index, steps.length) }}>
      <span className="project-flow-track" aria-hidden="true"><span className="project-flow-progress" /></span>
      <div className="project-flow-steps">
        {steps.map((step, index) => <button ref={element => { buttonsRef.current[index] = element }} type="button" key={step.id}
          className={`project-flow-step ${index === state.index ? 'is-active' : ''} ${index < state.index ? 'is-complete' : ''}`}
          onClick={() => choose(index)} onKeyDown={event => onStepKey(event, index)}
          aria-current={index === state.index ? 'step' : undefined} aria-controls={panelId}>
          <span className="project-flow-node">{index < state.index ? <Check size={14} /> : String(index + 1).padStart(2, '0')}</span>
          <span className="project-flow-label">{step.label}</span>
        </button>)}
      </div>
    </div>
    <div className="project-flow-footer">
      <p>{ui.flowNote}</p>
      <div className="project-flow-controls">
        <button type="button" className="project-flow-icon-button" aria-label={ui.flowPrevious} disabled={state.index === 0} onClick={() => choose(state.index - 1)}><ArrowLeft size={16} /></button>
        {!reduced && <button type="button" className="project-flow-action" onClick={() => setState(toggleFlowPlayback)}>
          {state.mode === 'complete' ? <RotateCcw size={14} /> : state.mode === 'auto' ? <Pause size={14} /> : <Play size={14} />}
          {state.mode === 'complete' ? ui.flowReplay : state.mode === 'auto' ? ui.flowPause : ui.flowContinue}
        </button>}
        {(reduced || state.mode !== 'complete') && <button type="button" className="project-flow-icon-button project-flow-replay" aria-label={ui.flowReplay} onClick={() => setState(replayFlowDemo)}><RotateCcw size={15} /></button>}
        <button type="button" className="project-flow-icon-button" aria-label={ui.flowNext} disabled={state.index === lastIndex} onClick={() => choose(state.index + 1)}><ArrowRight size={16} /></button>
      </div>
    </div>
    <span className="project-flow-sr" aria-live={playing ? 'off' : 'polite'} aria-atomic="true">{activeStep.label}。{activeStep.description}</span>
  </section>
}

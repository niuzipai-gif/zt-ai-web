import React, { useEffect, useMemo, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { flowProgress, nextFlowIndex } from '../lib/project-flow.js'
import { createFlowDemoState, finishFlowDemo, selectFlowStep } from '../lib/project-flow-ui.js'

const FLOW_STEP_MS = 1100

export function ProjectFlowDemo({ flowDemo, ui }) {
  const steps = useMemo(() => flowDemo?.steps || [], [flowDemo])
  const [state, setState] = useState(() => createFlowDemoState(steps.length))
  const lastIndex = Math.max(0, steps.length - 1)

  useEffect(() => {
    setState(createFlowDemoState(steps.length))
  }, [steps.length])

  useEffect(() => {
    if (state.mode !== 'auto' || state.index >= lastIndex) return undefined
    const timer = globalThis.setTimeout(() => {
      setState(previous => {
        if (previous.index >= lastIndex) return finishFlowDemo(previous)
        const index = nextFlowIndex(previous.index, steps.length)
        return index >= lastIndex ? finishFlowDemo({ ...previous, index }) : { ...previous, index }
      })
    }, FLOW_STEP_MS)
    return () => globalThis.clearTimeout(timer)
  }, [lastIndex, state.index, state.mode, steps.length])

  if (!steps.length) return null
  const activeStep = steps[state.index] || steps[0]
  const progress = flowProgress(state.index, steps.length)
  const actionLabel = state.mode === 'complete' || state.mode === 'manual' ? ui.flowReplay : ui.flowPlay

  return <section className="project-flow-demo" aria-label={ui.flowTitle}>
    <div className="project-flow-heading">
      <div>
        <span className="eyebrow">{ui.flowEyebrow}</span>
        <h3>{ui.flowTitle}</h3>
        <p>{ui.flowNote}</p>
      </div>
      <button type="button" className="project-flow-action" onClick={() => setState(createFlowDemoState(steps.length))}>
        {state.mode === 'complete' || state.mode === 'manual' ? <RotateCcw size={13} /> : <Play size={13} />}
        {actionLabel}
      </button>
    </div>
    <div className="project-flow-rail" style={{ '--flow-progress': progress }}>
      <span className="project-flow-track" aria-hidden="true" />
      <span className="project-flow-progress" aria-hidden="true" />
      <div className="project-flow-steps">
        {steps.map((step, index) => <button
          type="button"
          className={`project-flow-step ${index === state.index ? 'is-active' : ''} ${index < state.index ? 'is-complete' : ''}`}
          key={step.id}
          onClick={() => setState(previous => selectFlowStep(previous, index))}
          aria-current={index === state.index ? 'step' : undefined}
        >
          <span className="project-flow-node">{String(index + 1).padStart(2, '0')}</span>
          <span className="project-flow-label">{step.label}</span>
        </button>)}
      </div>
    </div>
    <div className="project-flow-active" aria-live="polite">
      <span className="project-flow-active-label">{activeStep.label}</span>
      <p>{activeStep.description}</p>
    </div>
  </section>
}

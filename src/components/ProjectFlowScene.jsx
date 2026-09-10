import React from 'react'

// Illustrative geometry only: no business records or measured financial values.
export function ProjectFlowScene({ projectId, step, labels }) {
  const visible = threshold => ({ opacity: step >= threshold ? 1 : 0.16 })
  return <svg className="project-flow-scene" viewBox="0 0 560 260" fill="none" aria-hidden="true" focusable="false">
    <path className="flow-scene-grid" d="M0 52H560M0 104H560M0 156H560M0 208H560M56 0V260M112 0V260M168 0V260M224 0V260M280 0V260M336 0V260M392 0V260M448 0V260M504 0V260" />
    {projectId === 'selection-workflow' ? <>
      {[0, 1, 2].map((item) => <g key={item} className="flow-scene-item" style={{ transform: `translate(${step > 1 ? 12 : 0}px, ${item * 64 + 30}px)`, opacity: step > 1 && item !== 1 ? .38 : 1 }}>
        <rect className="flow-scene-paper" x="22" width="156" height="48" rx="12" />
        <rect className={step > 0 && item === 1 ? 'flow-scene-solid' : 'flow-scene-soft'} x="34" y="12" width="24" height="24" rx="7" />
        <path className="flow-scene-ink" d="M72 19H149M72 29H126" />
        {step > 0 && item === 1 && <path className="flow-scene-check" d="m40 24 4 4 8-9" />}
      </g>)}
      <path className="flow-scene-route" d="M190 118H252Q266 118 266 132V148Q266 162 280 162H320" pathLength="1" />
      <path className="flow-scene-route-fill" d="M190 118H252Q266 118 266 132V148Q266 162 280 162H320" pathLength="1" style={{ strokeDashoffset: step >= 2 ? 0 : 1 }} />
      <g className="flow-scene-item" style={visible(2)}>
        <rect className="flow-scene-paper" x="320" y="30" width="212" height="180" rx="18" />
        <text x="339" y="59">{labels[0]}</text><path className="flow-scene-rule" d="M338 73H514" />
        {[0, 1, 2].map(item => <g key={item}>
          <rect className="flow-scene-soft" x="338" y={90 + item * 33} width="88" height="17" rx="5" />
          <rect className={step >= 3 ? 'flow-scene-solid' : 'flow-scene-soft'} x="446" y={90 + item * 33} width="22" height="17" rx="5" />
          <rect className={step >= 4 ? 'flow-scene-solid' : 'flow-scene-soft'} x="482" y={90 + item * 33} width="22" height="17" rx="5" />
        </g>)}
      </g>
      <text x="32" y="240">{labels[1]}</text><text x="338" y="240">{labels[2]}</text>
    </> : projectId === 'image-production' ? <>
      <g className="flow-scene-item" style={{ transform: `translate(${step >= 2 ? -8 : 0}px,0)` }}>
        <rect className="flow-scene-paper" x="24" y="39" width="146" height="174" rx="16" />
        <rect className="flow-scene-soft" x="39" y="56" width="116" height="97" rx="10" />
        <path className="flow-scene-product" d="m72 81 25-13 25 13v41l-25 13-25-13Zm0 0 25 14 25-14M97 95v40" />
        <path className="flow-scene-ink" d="M40 172H150M40 185H119" />
      </g>
      <path className="flow-scene-route" d="M180 125H245" pathLength="1" />
      <path className="flow-scene-route-fill" d="M180 125H245" pathLength="1" style={{ strokeDashoffset: step >= 1 ? 0 : 1 }} />
      {[0, 1, 2, 3, 4, 5].map(item => <g key={item} className="flow-scene-item" style={{ transform: `translate(${252 + (item % 3) * 96}px,${38 + Math.floor(item / 3) * 98 + (step >= 2 ? 0 : 10)}px)`, opacity: step >= 2 ? 1 : .24, transitionDelay: `${item * 35}ms` }}>
        <rect className="flow-scene-paper" width="83" height="83" rx="12" />
        <rect className={item % 2 ? 'flow-scene-warm' : 'flow-scene-soft'} x="8" y="8" width="67" height="51" rx="7" />
        <path className="flow-scene-product" d={item % 2 ? 'm24 34 17-9 17 9v15l-17 9-17-9Zm0 0 17 9 17-9M41 43v15' : 'M30 20h23v29H30zM35 24h13'} />
        <path className="flow-scene-ink" d="M12 69H59" />
        <g className="flow-scene-item" style={visible(3)}><circle className="flow-scene-solid" cx="69" cy="14" r="8" /><path className="flow-scene-check" d="m65 14 3 3 5-6" /></g>
      </g>)}
      <text x="32" y="241">{labels[0]}</text><text x="258" y="241">{step >= 4 ? labels[2] : labels[1]}</text>
    </> : <>
      <rect className="flow-scene-paper" x="24" y="23" width="512" height="194" rx="18" />
      <text x="45" y="51">{labels[0]}</text><path className="flow-scene-rule" d="M45 65H515M45 181H515" />
      {[100, 64, 44, 74, 116].map((height, item) => <g key={item}>
        <rect className="flow-scene-bar" x={65 + item * 88} y={181 - height} width="40" height={height} rx="6" style={{ transform: `scaleY(${step >= Math.min(item, 3) ? 1 : .12})`, fill: item === 0 || item === 4 ? 'var(--flow-accent)' : 'var(--flow-gold)', opacity: item === 4 && step < 3 ? .18 : .75 }} />
        <path className="flow-scene-ink" d={`M${69 + item * 88} 197h32`} />
      </g>)}
      <path className="flow-scene-route" d="M484 217v17H78v-17" pathLength="1" />
      <path className="flow-scene-route-fill" d="M484 217v17H78v-17" pathLength="1" style={{ strokeDashoffset: step >= 4 ? 0 : 1 }} />
      <text x="45" y="254">{labels[1]}</text><text x="392" y="254">{labels[2]}</text>
    </>}
  </svg>
}

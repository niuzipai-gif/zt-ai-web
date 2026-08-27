import React, { useEffect, useRef } from 'react'
import { clampLevel, orbVisualState, readAnalyserLevel, shouldAnimateOrb } from '../lib/audio-reactivity.js'

const PARTICLES = Array.from({ length: 36 }, (_, index) => ({
  angle: (Math.PI * 2 * index) / 36,
  distance: 1.05 + ((index * 17) % 31) / 100,
  size: 0.7 + ((index * 11) % 9) / 10,
}))

function drawOrb(context, width, height, status, analyser, buffer, frame, reducedMotion) {
  const size = Math.min(width, height)
  const center = { x: width / 2, y: height / 2 }
  const base = size * 0.22
  const level = clampLevel(readAnalyserLevel(analyser, buffer))
  const visual = orbVisualState(status)
  const phase = reducedMotion ? 0 : frame / 900
  const breath = visual.motion === 'breathing' ? Math.sin(phase * 2.2) * 0.035 : 0
  const pulse = visual.motion === 'rest' ? 0.015 : level * 0.22 + breath
  const radius = base * (1 + pulse)
  const gradient = context.createRadialGradient(center.x - radius * 0.35, center.y - radius * 0.4, radius * 0.1, center.x, center.y, radius * 1.7)
  gradient.addColorStop(0, visual.color.core)
  gradient.addColorStop(0.46, visual.color.glow)
  gradient.addColorStop(1, 'rgba(84,183,137,0)')
  context.clearRect(0, 0, width, height)
  context.globalAlpha = 0.22 + level * 0.25
  context.fillStyle = gradient
  context.beginPath()
  context.arc(center.x, center.y, radius * 1.75, 0, Math.PI * 2)
  context.fill()
  context.globalAlpha = 0.93
  context.fillStyle = visual.color.core
  context.beginPath()
  context.arc(center.x - radius * 0.08, center.y - radius * 0.1, radius, 0, Math.PI * 2)
  context.fill()
  if (!reducedMotion && shouldAnimateOrb(status)) {
    context.globalAlpha = 0.7
    context.fillStyle = visual.color.particle
    PARTICLES.forEach(particle => {
      const distance = radius * (2.25 + particle.distance * (level * 0.7 + 0.15))
      const x = center.x + Math.cos(particle.angle + phase * 0.18) * distance
      const y = center.y + Math.sin(particle.angle + phase * 0.18) * distance
      context.beginPath()
      context.arc(x, y, particle.size * (1 + level * 1.8), 0, Math.PI * 2)
      context.fill()
    })
  }
  context.globalAlpha = 1
  return level
}

export function VoiceOrb({ status = 'idle', analyser = null, onClick, disabled = false, reducedMotion = false }) {
  const canvasRef = useRef(null)
  const frameRef = useRef(0)
  const analyserRef = useRef(analyser)

  useEffect(() => { analyserRef.current = analyser }, [analyser])
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const context = canvas.getContext('2d')
    if (!context) return undefined
    const buffer = new Uint8Array(analyserRef.current?.fftSize || 256)
    let animationFrame = 0
    const animate = shouldAnimateOrb(status) && !reducedMotion
    const render = timestamp => {
      const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
      const rect = canvas.getBoundingClientRect()
      const width = Math.max(1, Math.round(rect.width * ratio))
      const height = Math.max(1, Math.round(rect.height * ratio))
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
      context.save()
      context.scale(ratio, ratio)
      drawOrb(context, rect.width, rect.height, status, analyserRef.current, buffer, timestamp, reducedMotion)
      context.restore()
      if (animate) {
        animationFrame = window.requestAnimationFrame(render)
        frameRef.current = animationFrame
      }
    }
    animationFrame = window.requestAnimationFrame(render)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [status, reducedMotion])

  const activate = event => {
    if (disabled) return
    event.preventDefault()
    onClick?.()
  }

  return <button className="voice-orb" type="button" data-voice-status={status} aria-label="语音模式" disabled={disabled} onClick={activate} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') activate(event) }}>
    <canvas ref={canvasRef} aria-hidden="true" />
  </button>
}

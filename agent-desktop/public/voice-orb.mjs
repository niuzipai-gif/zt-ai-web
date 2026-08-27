export function clampLevel(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0
}

export function readAnalyserLevel(analyser, buffer = new Uint8Array(256)) {
  if (!analyser || !buffer?.length || typeof analyser.getByteTimeDomainData !== 'function') return 0
  analyser.getByteTimeDomainData(buffer)
  const sum = Array.from(buffer).reduce((total, value) => {
    const sample = (value - 128) / 128
    return total + sample * sample
  }, 0)
  return clampLevel(Math.sqrt(sum / buffer.length))
}

export function orbVisualState(status) {
  const palette = {
    core: '#c99654', glow: 'rgba(201,150,84,.34)', particle: '#7ec6a4',
  }
  if (status === 'listening') return { motion: 'input', color: palette, labelKey: 'voiceListening' }
  if (status === 'processing') return { motion: 'breathing', color: { ...palette, core: '#b88745' }, labelKey: 'voiceProcessing' }
  if (status === 'speaking') return { motion: 'output', color: { ...palette, core: '#54b789' }, labelKey: 'voiceSpeaking' }
  if (status === 'error') return { motion: 'error', color: { ...palette, core: '#c47a68' }, labelKey: 'voiceUnavailable' }
  return { motion: 'rest', color: palette, labelKey: 'voiceModeTitle' }
}

export function shouldAnimateOrb(status) {
  return status === 'listening' || status === 'processing' || status === 'speaking'
}

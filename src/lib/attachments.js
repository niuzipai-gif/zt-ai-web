function fileKey(file) {
  return [
    file?.name || '',
    file?.size ?? '',
    file?.lastModified ?? '',
    file?.type || '',
  ].join('\u0000')
}

export function hasFilePayload(dataTransfer) {
  const types = Array.from(dataTransfer?.types || [])
  if (types.includes('Files')) return true
  return Array.from(dataTransfer?.items || []).some(item => item?.kind === 'file')
}

export function filesFromDataTransfer(dataTransfer) {
  const files = Array.from(dataTransfer?.files || [])
  const itemFiles = Array.from(dataTransfer?.items || [])
    .filter(item => item?.kind === 'file')
    .map(item => typeof item.getAsFile === 'function' ? item.getAsFile() : null)
    .filter(Boolean)
  const seen = new Set()
  return [...files, ...itemFiles].filter(file => {
    const key = fileKey(file)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

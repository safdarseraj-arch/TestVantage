/**
 * Column-I rows C/D usually sit in the lower half of JEE match-column screenshots.
 * @param {number} width
 * @param {number} height
 */
export function buildMatrixSupplementCropRect(width, height) {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const y = Math.floor(h * 0.3)
  return {
    x: 0,
    y,
    width: w,
    height: Math.max(80, h - y),
  }
}

/** Bottom ~70% of cached OCR text — mirrors {@link buildMatrixSupplementCropRect}. */
export function sliceMatrixSupplementOcrText(raw) {
  const text = String(raw ?? '').replace(/\r\n/g, '\n').trim()
  if (!text) return ''
  const lines = text.split('\n')
  if (lines.length <= 3) {
    const cut = Math.floor(text.length * 0.3)
    return text.slice(cut)
  }
  const start = Math.floor(lines.length * 0.3)
  const slice = lines.slice(start).join('\n')
  return slice.trim() || text
}

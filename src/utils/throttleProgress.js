/**
 * Throttle OCR progress callbacks so React is not re-rendered hundreds of times per second
 * (which freezes the mouse / UI during Tesseract).
 * @param {(pct: number) => void} [onProgress]
 * @param {number} [minIntervalMs]
 * @returns {(pct: number) => void | undefined}
 */
export function throttleProgress(onProgress, minIntervalMs = 200) {
  if (!onProgress) return undefined
  let lastEmit = 0
  let lastPct = -1
  let timer = null

  const emit = (pct) => {
    lastEmit = Date.now()
    lastPct = pct
    onProgress(pct)
  }

  return (pct) => {
    const now = Date.now()
    if (pct >= 100) {
      if (timer) clearTimeout(timer)
      emit(100)
      return
    }
    if (Math.abs(pct - lastPct) >= 8 || now - lastEmit >= minIntervalMs) {
      if (timer) clearTimeout(timer)
      emit(pct)
      return
    }
    if (!timer) {
      timer = setTimeout(() => {
        timer = null
        emit(pct)
      }, minIntervalMs - (now - lastEmit))
    }
  }
}

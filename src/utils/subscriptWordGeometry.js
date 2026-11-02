/**
 * Subscript/superscript from Tesseract word bbox offsets (no ONNX).
 */

const SUB_MAP = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' }
const SUP_MAP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }

/** @param {import('tesseract.js').Page} page */
export function inferSubscriptsOnTesseractPage(page) {
  for (const line of page?.lines ?? []) {
    const words = line.words ?? []
    for (let i = 0; i < words.length - 1; i += 1) {
      const w = words[i]
      const n = words[i + 1]
      if (!w?.bbox || !n?.bbox) continue
      const wText = String(w.text ?? '').trim()
      const nText = String(n.text ?? '').trim()
      if (!wText || !nText) continue

      const wH = Math.max(1, w.bbox.y1 - w.bbox.y0)
      const nH = Math.max(1, n.bbox.y1 - n.bbox.y0)
      const wCy = (w.bbox.y0 + w.bbox.y1) / 2
      const nCy = (n.bbox.y0 + n.bbox.y1) / 2

      if (/^[A-Za-z]$/.test(wText) && /^[0-9]$/.test(nText) && nH < wH * 0.75 && nCy > wCy + wH * 0.12) {
        w.text = wText + (SUB_MAP[nText] ?? nText)
        n.text = ''
        i += 1
        continue
      }
      if (/^(sin|cos|tan|log|ln)$/i.test(wText) && /^[0-9]$/.test(nText) && nH < wH * 0.8) {
        w.text = `${wText}${SUP_MAP[nText] ?? nText}`
        n.text = ''
        i += 1
      }
    }
    line.text = words
      .map((wd) => String(wd.text ?? '').trim())
      .filter(Boolean)
      .join(' ')
  }
  return page
}

import { mathContentScore } from './fixOcrMathSymbols.js'

/** Mathpix-style broken √ / half-fraction patterns */
function brokenSqrtPenalty(text) {
  return /\$\$?1\$|\$\\frac\{1\}\{2\}\s+\$1\$|\$\$1\$1\$|\(A\)\s*\$2\$/i.test(text ?? '') ? 35 : 0
}

/** @param {string} text polished OCR */
function structureBonus(text) {
  let bonus = 0
  const t = text ?? ''
  const options = (t.match(/\([A-D]\)/gi) || []).length
  if (options >= 2) bonus += 10 + Math.min(options * 2, 14)
  if (/\\begin\{(?:bmatrix|array)\}/.test(t)) bonus += 22
  if (/\\\\/.test(t)) bonus += 10
  if (/\\frac\{|\\sqrt\{|\\sum|\\int|\\lim/.test(t)) bonus += 14
  if (/\\hat\{|\\vec\{/.test(t)) bonus += 12
  if (/\\times\s+\d+\\vec/.test(t)) bonus += 10
  if (/\\ce\{|\\pu\{/.test(t)) bonus += 16
  if (/\$[^$]{2,}\$/.test(t)) bonus += 6
  if (/N_\{?p\}?|Match\s+the\s+Column|Column[- ]I/i.test(t)) bonus += 8
  return bonus
}

/** @param {string} text */
function garbagePenalty(text) {
  let pen = 0
  const t = text ?? ''
  if (t.length < 15) pen += 20
  if (/[Il1|]{8,}/.test(t)) pen += 12
  if (/\b[a-z]\s+[a-z]\s+[a-z]\s+[a-z]\s+[a-z]\s+[a-z]\b/i.test(t) && !/\\/.test(t)) pen += 8
  // Shattered cross-product (hybrid OCR artifact vs Mathpix)
  if (/\\times\s*\^|\$\\times\$\s*\^/i.test(t)) pen += 40
  if (/ax2b|\[a\s+b\s+ax2b\]/i.test(t)) pen += 25
  return pen
}

/**
 * Score a polished OCR candidate (higher = better). Mirrors Mathpix multi-format pick logic.
 * @param {string} polishedText
 * @param {{ confidence?: number, source?: string, psm?: string }} [meta]
 */
export function scoreOcrCandidate(polishedText, meta = {}) {
  const t = String(polishedText ?? '').trim()
  if (!t) return -1000

  let score = mathContentScore(t)
  score += structureBonus(t)
  score -= brokenSqrtPenalty(t)
  score -= garbagePenalty(t)

  if (meta.confidence != null) score += Number(meta.confidence) * 0.2
  if (meta.source === 'preprocessed') score += 4
  if (meta.source === 'high-contrast') score += 2
  if (meta.source === 'texify' || String(meta.source ?? '').startsWith('onnx:')) score += 18
  if (meta.source === 'pix2text') score += 24
  if (meta.source === 'tesseract:lines') score += 6
  if (meta.source === 'hybrid:merged') score += 10
  if (meta.source === 'hybrid:fast') score += 12
  if (meta.source === 'mathpix-style:lines' || meta.source === 'mathpix-style:mcq-lines') score += 16
  if (meta.source === 'hybrid:boost-pass') score += 14
  if (meta.source === 'builtin:synthesis') score += 4
  if (meta.psm === 'SINGLE_BLOCK') score += 3
  if (meta.psm === 'AUTO') score += 1

  // Mathpix picks mmd over latex_styled when MCQ options exist but LaTeX breaks √/fractions
  if (/\([A-D]\)/.test(t)) {
    const options = (t.match(/\([A-D]\)/gi) || []).length
    if (options >= 3) score += 8
    if (brokenSqrtPenalty(t) > 0) score -= 50
  }

  return score
}

/**
 * @typedef {{ text: string, score: number, source: string, raw?: string }} OcrCandidate
 */

/**
 * @param {Array<{ text: string, raw?: string, source?: string, confidence?: number, psm?: string }>} candidates
 * @returns {OcrCandidate}
 */
export function pickBestOcrCandidate(candidates) {
  let best = { text: '', score: -Infinity, source: 'none' }

  for (const c of candidates) {
    const text = String(c.text ?? '').trim()
    if (!text) continue
    const score = scoreOcrCandidate(text, c)
    if (score > best.score) {
      best = {
        text,
        score,
        source: c.source ?? 'builtin',
        raw: c.raw,
      }
    }
  }

  return best
}

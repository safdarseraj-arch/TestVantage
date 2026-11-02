import { normalizeMathText } from './normalizeMathText.js'

/**
 * Tesseract often garbles equation lines into symbol soup.
 * @param {string} line
 */
export function looksLikeGarbledMathLine(line) {
  const t = String(line ?? '').trim()
  if (t.length < 6) return false
  if (/\\begin\{|\\frac\{|\\sqrt|\\sum|\\int|\$[^$]+\$/.test(t)) return false
  if (/^(?:Value\s+of|Find\s+the|Which\s+of|If\s+|Let\s+|Answer\s+)/i.test(t)) return false
  if (/\([A-D]\)/.test(t)) return false

  const letters = (t.match(/[A-Za-z]/g) || []).length
  const digits = (t.match(/\d/g) || []).length
  const symbols = (t.match(/[^A-Za-z0-9\s.,;:'"()\-]/g) || []).length
  const words = (t.match(/\b[a-z]{3,}\b/gi) || []).length

  if (words >= 3 && symbols < letters) return false
  if (symbols >= 4 && symbols >= letters * 0.55) return true
  if (digits >= 3 && symbols >= 2 && words <= 1) return true
  if (/[=+\-*/^_{}\\|<>]{3,}/.test(t) && words <= 2) return true
  return false
}

/**
 * Normalize texify / nougat LaTeX for MathText ($...$).
 * @param {string} raw
 */
export function normalizeTexifyLatex(raw) {
  let t = String(raw ?? '').trim()
  if (!t) return ''
  t = t.replace(/^\$\$?\s*/, '').replace(/\s*\$\$?$/, '')
  t = t.replace(/\\\[|\\\]|\\\(|\\\)/g, '')
  t = t.trim()
  if (!t) return ''
  if (!/\\[a-zA-Z]/.test(t) && !/[{}^_]/.test(t)) return t
  const wrapped = t.length > 80 || /\\begin\{/.test(t) ? `$$${t}$$` : `$${t}$`
  return normalizeMathText(wrapped)
}

/**
 * @typedef {{ rect?: { y?: number }, latex: string, lineText?: string }} RegionOcrResult
 */

function normalizeMatchKey(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[|Il1]/g, 'l')
}

/** @param {string} line @param {string} hint */
function lineMatchesOcrHint(line, hint) {
  const h = normalizeMatchKey(hint)
  const l = normalizeMatchKey(line)
  if (!h || h.length < 4 || !l) return false
  if (l.includes(h.slice(0, Math.min(10, h.length)))) return true
  const chunk = h.slice(0, Math.min(14, h.length))
  let hits = 0
  for (let i = 0; i <= chunk.length - 3; i++) {
    if (l.includes(chunk.slice(i, i + 3))) hits++
  }
  return hits >= 2
}

/**
 * Replace garbled math lines with ONNX LaTeX (bbox hint first, then top-to-bottom).
 * @param {string} proseText Tesseract raw/polished text
 * @param {RegionOcrResult[]} regionResults sorted by y
 * @returns {string}
 */
export function mergeHybridOcrText(proseText, regionResults) {
  const base = String(proseText ?? '')
  const regions = [...(regionResults ?? [])].filter((r) => r?.latex?.trim())
  if (!regions.length) return base

  const lines = base.split(/\r?\n/)
  const usedLines = new Set()
  /** @type {RegionOcrResult[]} */
  const pending = []

  for (const region of regions) {
    const hint = region.lineText?.trim()
    if (!hint) {
      pending.push(region)
      continue
    }
    const idx = lines.findIndex(
      (line, i) =>
        !usedLines.has(i) &&
        looksLikeGarbledMathLine(line) &&
        lineMatchesOcrHint(line, hint),
    )
    if (idx >= 0) {
      lines[idx] = region.latex
      usedLines.add(idx)
    } else {
      pending.push(region)
    }
  }

  const garbledIdx = []
  for (let i = 0; i < lines.length; i++) {
    if (!usedLines.has(i) && looksLikeGarbledMathLine(lines[i])) garbledIdx.push(i)
  }

  let p = 0
  for (const region of pending) {
    if (p >= garbledIdx.length) lines.push(region.latex)
    else {
      lines[garbledIdx[p]] = region.latex
      usedLines.add(garbledIdx[p])
      p++
    }
  }

  return lines.join('\n').trim()
}

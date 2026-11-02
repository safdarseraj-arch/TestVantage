/**
 * PDF vector text → math-aware lines (subscript/superscript from glyph geometry).
 * Mathpix reads positioned glyphs; pdf.js gives transforms we can use locally.
 */

import { normalizeMathText } from './normalizeMathText.js'
import { applyStemPageKnowledge } from './ocrWordData.js'
import { pageNeedsOnnxBoost } from './hybridOcrNeeds.js'
import { filterPdfTextItemsDropWatermarks, stripPdfExtractWatermarks } from './stripImageWatermarkOcr.js'

const SUB_MAP = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' }
const SUP_MAP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }

/** @param {string} d @param {Record<string,string>} map */
function mapDigitScript(d, map) {
  return d
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
}

/**
 * @param {import('pdfjs-dist').TextItem} item
 */
function itemMetrics(item) {
  const t = item.transform ?? [1, 0, 0, 1, 0, 0]
  const fontSize = Math.max(Math.abs(t[0]), Math.abs(t[3]), 1)
  const x = t[4]
  const y = t[5]
  return { x, y, fontSize, text: String(item.str ?? '') }
}

/**
 * @param {import('pdfjs-dist').TextItem[]} items
 * @returns {string[]}
 */
export function pdfItemsToMathLines(items) {
  /** @type {{ y: number, parts: { x: number, text: string, fontSize: number, y: number }[] }[]} */
  const rows = []
  const cleaned = filterPdfTextItemsDropWatermarks(items)

  for (const item of cleaned) {
    if (!('str' in item) || !String(item.str ?? '').trim()) continue
    const m = itemMetrics(item)
    const tol = Math.max(m.fontSize * 1.1, 8)
    let row = rows.find((r) => Math.abs(r.y - m.y) <= tol)
    if (!row) {
      row = { y: m.y, parts: [] }
      rows.push(row)
    }
    row.parts.push({ x: m.x, text: m.text, fontSize: m.fontSize, y: m.y })
  }

  rows.sort((a, b) => b.y - a.y)

  return rows.map((row) => {
    const parts = [...row.parts].sort((a, b) => a.x - b.x)
    /** @type {string[]} */
    const tokens = []
    let i = 0
    while (i < parts.length) {
      const cur = parts[i]
      const next = parts[i + 1]
      if (
        next &&
        /^[A-Za-z]$/.test(cur.text) &&
        /^[0-9]$/.test(next.text) &&
        next.fontSize < cur.fontSize * 0.78 &&
        next.y < cur.y - cur.fontSize * 0.08
      ) {
        tokens.push(cur.text + mapDigitScript(next.text, SUB_MAP))
        i += 2
        continue
      }
      if (
        next &&
        /^[A-Za-z]$/.test(cur.text) &&
        /^[0-9]$/.test(next.text) &&
        next.fontSize < cur.fontSize * 0.78 &&
        next.y > cur.y + cur.fontSize * 0.08
      ) {
        tokens.push(cur.text + mapDigitScript(next.text, SUP_MAP))
        i += 2
        continue
      }
      if (
        next &&
        /^(sin|cos|tan|log|ln)$/i.test(cur.text) &&
        /^[0-9]$/.test(next.text) &&
        next.fontSize < cur.fontSize * 0.82
      ) {
        tokens.push(`${cur.text}${mapDigitScript(next.text, SUP_MAP)}`)
        i += 2
        continue
      }
      tokens.push(cur.text)
      i += 1
    }
    return tokens.join(' ').replace(/\s+([,.;:!?)])/g, '$1').trim()
  })
}

/**
 * @param {string} text
 */
export function pdfTextLayerNeedsMathBoost(text) {
  const t = String(text ?? '')
  if (!t.trim()) return true
  if (pageNeedsOnnxBoost(t)) return true
  if (/[□▯]|\\begin\s+\{|operatorname\s*\{/i.test(t)) return true
  if (/\bT\s*,\s*and\s*T\s*,/i.test(t)) return true
  return false
}

/**
 * @param {import('pdfjs-dist').TextItem[]} items
 */
export function pdfItemsToPolishedText(items) {
  const lines = pdfItemsToMathLines(items)
  const joined = lines.join('\n').trim()
  return stripPdfExtractWatermarks(normalizeMathText(applyStemPageKnowledge(joined)))
}

/** Fast text-layer dump — no polish. Used so Official PYQ upload cannot freeze at 6%. */
export function pdfItemsToPlainText(items) {
  const parts = []
  for (const item of items ?? []) {
    const s = String(item?.str ?? '')
    if (s) parts.push(s)
  }
  return parts.join(' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim()
}

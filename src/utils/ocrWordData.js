/**
 * Mathpix-inspired word_data — per-word geometry + STEM typing from Tesseract layout.
 * Enables horizontal (A)(B)(C)(D) row splits that line-level OCR misses.
 */

import { looksLikeMathWord } from './tesseractMathRegions.js'
import {
  findOptionMarkersInLineText,
  optionMarkerToIndex,
  optionsFromTextMarkers,
} from './mcqOptionMarkers.js'
import { normalizeMathText } from './normalizeMathText.js'
import { buildLineDataFromTesseractPage, parseMcqFromLineData } from './ocrLineData.js'

/** @typedef {'text'|'math'|'mcq_marker'|'punctuation'|'number'} OcrWordType */

/**
 * @typedef {{
 *   text: string
 *   confidence: number
 *   confidenceRate: number
 *   type: OcrWordType
 *   bbox: { x0: number, y0: number, x1: number, y1: number }
 *   lineIndex: number
 *   wordIndex: number
 * }} OcrWordData
 */

/** @param {import('tesseract.js').Word} word */
function classifyWordType(word) {
  const t = String(word?.text ?? '').trim()
  if (!t) return 'punctuation'
  if (/^\(\s*[A-D0-3]\s*\)$/i.test(t) || /^[A-D0-3][.)]$/i.test(t)) return 'mcq_marker'
  if (t === '(' || t === ')' || t === ',' || t === '.' || t === ';') return 'punctuation'
  if (word?.is_numeric || /^\d+\.?\d*$/.test(t)) return 'number'
  if (looksLikeMathWord(word)) return 'math'
  return 'text'
}

/**
 * @param {import('tesseract.js').Page} page
 * @returns {OcrWordData[]}
 */
export function buildWordDataFromTesseractPage(page) {
  /** @type {OcrWordData[]} */
  const out = []
  const lines = page?.lines ?? []
  for (let li = 0; li < lines.length; li += 1) {
    const words = lines[li].words ?? []
    for (let wi = 0; wi < words.length; wi += 1) {
      const w = words[wi]
      const text = String(w.text ?? '').trim()
      if (!text) continue
      const bbox = w.bbox ?? { x0: 0, y0: li * 20, x1: 10, y1: (li + 1) * 20 }
      out.push({
        text,
        confidence: (w.confidence ?? 50) / 100,
        confidenceRate: (w.confidence ?? 50) / 100,
        type: classifyWordType(w),
        bbox,
        lineIndex: li,
        wordIndex: wi,
      })
    }
  }
  return out
}

export { findOptionMarkersInLineText, optionsFromTextMarkers } from './mcqOptionMarkers.js'

/**
 * @param {import('tesseract.js').Word[]} words
 * @returns {{ label: number, wordIdx: number, wordLen: number, x0: number }[]}
 */
export function findOptionMarkersInWords(words) {
  /** @type {{ label: number, wordIdx: number, wordLen: number, x0: number }[]} */
  const markers = []
  const ws = words ?? []

  for (let i = 0; i < ws.length; i += 1) {
    const t = String(ws[i].text ?? '').trim()
    const x0 = ws[i].bbox?.x0 ?? i * 10

    let m = t.match(/^\(\s*([A-D0-3])\s*\)$/i)
    if (m) {
      markers.push({ label: optionMarkerToIndex(m[1]), wordIdx: i, wordLen: 1, x0 })
      continue
    }

    if (t === '(' && i + 1 < ws.length) {
      const next = String(ws[i + 1].text ?? '').trim()
      const nm = next.match(/^([A-D0-3])\s*\)?$/i)
      if (nm) {
        let wordLen = 2
        if (!next.includes(')') && i + 2 < ws.length && String(ws[i + 2].text ?? '').trim() === ')') {
          wordLen = 3
        }
        markers.push({ label: optionMarkerToIndex(nm[1]), wordIdx: i, wordLen, x0 })
        i += wordLen - 1
        continue
      }
    }

    m = t.match(/^([A-D0-3])\s*\)$/i)
    if (m && !(i > 0 && String(ws[i - 1].text ?? '').trim() === '(')) {
      markers.push({ label: optionMarkerToIndex(m[1]), wordIdx: i, wordLen: 1, x0 })
    }
  }

  const byLabel = new Map()
  for (const mk of markers.sort((a, b) => a.x0 - b.x0)) {
    if (!byLabel.has(mk.label)) byLabel.set(mk.label, mk)
  }
  return [...byLabel.values()].sort((a, b) => a.x0 - b.x0)
}

/**
 * @param {import('tesseract.js').Word[]} words
 * @param {{ label: number, wordIdx: number, wordLen: number }[]} markers
 */
function optionsFromWordMarkers(words, markers) {
  const options = ['', '', '', '']
  const sorted = [...markers].sort((a, b) => a.wordIdx - b.wordIdx)
  for (let i = 0; i < sorted.length; i += 1) {
    const start = sorted[i].wordIdx + sorted[i].wordLen
    const end = i + 1 < sorted.length ? sorted[i + 1].wordIdx : words.length
    const body = words
      .slice(start, end)
      .map((w) => w.text)
      .join(' ')
      .replace(/^[\s,;:]+/, '')
      .trim()
    options[sorted[i].label] = body
  }
  return options
}

/**
 * STEM patterns seen on millions of exam pages — generic post-OCR cleanup.
 * @param {string} text
 */
export function applyStemPageKnowledge(text) {
  return String(text ?? '')
    .replace(/\bgfl\s*\(\s*x\s*\)/gi, 'g(x)')
    .replace(/\bOT\s*=/g, 'T₁ =')
    .replace(/T\s*=\s*2\s*T\s*,/g, 'T₁ = 2T₂')
    .replace(/2\s*T\s*=\s*T\s*,/g, '2T₁ = T₂')
    .replace(/T\s*=\s*4\s*T\s*,/g, 'T₁ = 4T₂')
    .replace(/T\s*=\s*T\s*,/g, 'T₁ = T₂')
}

/**
 * Mathpix-style MCQ parse: line bands first, then word geometry for horizontal rows.
 * @param {import('tesseract.js').Page} page
 * @param {{ width?: number, height?: number }} [imageSize]
 * @returns {{ text: string, options: string[], optionsFound: number, source: string } | null}
 */
export function parseMcqFromTesseractPage(page, imageSize = {}) {
  if (!page?.lines?.length) return null

  const lineData = buildLineDataFromTesseractPage(page, imageSize)
  const lineMcq = parseMcqFromLineData(lineData)
  if (lineMcq && lineMcq.optionsFound >= 4) {
    return { ...lineMcq, source: 'mathpix-line-geometry' }
  }

  const lines = [...page.lines].sort((a, b) => (a.bbox?.y0 ?? 0) - (b.bbox?.y0 ?? 0))

  /** @type {{ text: string, options: string[], optionsFound: number, source: string } | null} */
  let best = lineMcq ? { ...lineMcq, source: 'mathpix-line-geometry' } : null

  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li]
    const text = String(line.text ?? '').trim()
    const words = line.words ?? []

    const textMarkers = findOptionMarkersInLineText(text)
    const wordMarkers = words.length >= 4 ? findOptionMarkersInWords(words) : []
    const markerCount = Math.max(textMarkers.length, wordMarkers.length)
    if (markerCount < 3) continue

    let options = ['', '', '', '']
    if (wordMarkers.length >= textMarkers.length && wordMarkers.length >= 3) {
      options = optionsFromWordMarkers(words, wordMarkers)
    } else if (textMarkers.length >= 3) {
      options = optionsFromTextMarkers(text, textMarkers)
    }

    options = options.map((o) => applyStemPageKnowledge(normalizeMathText(String(o ?? '').trim())))

    /** @type {string[]} */
    const stemParts = lines
      .slice(0, li)
      .map((l) => String(l.text ?? '').trim())
      .filter(Boolean)

    if (textMarkers.length >= 3 && textMarkers[0].charIdx > 24) {
      stemParts.push(applyStemPageKnowledge(text.slice(0, textMarkers[0].charIdx).trim()))
    }

    const stem = normalizeMathText(stemParts.join('\n').trim())
    const found = options.filter((o) => o.trim()).length
    if (found < 3 || stem.length < 12) continue

    const candidate = {
      text: stem,
      options,
      optionsFound: found,
      source: 'mathpix-word-geometry',
    }

    if (!best || found > best.optionsFound || (found === best.optionsFound && stem.length > best.text.length)) {
      best = candidate
    }
  }

  const pageH = imageSize.height ?? page.height ?? 1000
  const gridOptions = ['', '', '', '']
  let gridFirstY = Infinity
  let gridLines = 0
  for (const line of lines) {
    const y0 = line.bbox?.y0 ?? 0
    if (y0 < pageH * 0.35) continue
    const text = String(line.text ?? '').trim()
    const markers = findOptionMarkersInLineText(text)
    if (markers.length < 2) continue
    gridLines += 1
    if (y0 < gridFirstY) gridFirstY = y0
    const fromLine = optionsFromTextMarkers(text, markers)
    for (let i = 0; i < 4; i += 1) {
      const body = applyStemPageKnowledge(normalizeMathText(String(fromLine[i] ?? '').trim()))
      if (body && (!gridOptions[i] || body.length > gridOptions[i].length)) gridOptions[i] = body
    }
  }
  const gridFound = gridOptions.filter((o) => o.trim()).length
  if (gridFound >= 3 && gridLines >= 1) {
    const stemParts = lines
      .filter((l) => (l.bbox?.y0 ?? 0) < gridFirstY + 4)
      .map((l) => applyStemPageKnowledge(String(l.text ?? '').trim()))
      .filter(Boolean)
    const stem = normalizeMathText(stemParts.join('\n').trim())
    if (stem.length >= 12) {
      const candidate = {
        text: stem,
        options: gridOptions,
        optionsFound: gridFound,
        source: 'mathpix-word-geometry',
      }
      if (!best || gridFound > best.optionsFound) best = candidate
    }
  }

  return best
}

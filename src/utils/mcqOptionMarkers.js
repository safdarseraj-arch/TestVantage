/**
 * Normalize OCR MCQ option labels to (A)–(D) and map markers to indices 0–3.
 */

import { relabelSequentialOcrOptionMarks } from './splitStemAndGarbledOptions.js'

/** @param {string} marker */
export function optionMarkerToIndex(marker) {
  const k = String(marker ?? '').trim().toUpperCase()
  if (k >= 'A' && k <= 'D') return k.charCodeAt(0) - 65
  if (k === '0' || k === '1' || k === '2' || k === '3') return Number(k)
  if (/^[1-4]$/.test(k)) return Number(k) - 1
  return -1
}

/**
 * OCR often misreads (A)→(4), (B)→(8), or uses (0)–(3) instead of letters.
 * @param {string} text
 */
export function normalizeOptionMarkersInText(text) {
  let out = String(text ?? '').replace(/\r\n/g, '\n')
  if (!out.trim()) return out

  out = out.replace(/（/g, '(').replace(/）/g, ')')
  out = out.replace(/[ＡＢＣＤ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  )

  const hasAMarker = /\(\s*A\s*\)/i.test(out)

  if (!hasAMarker && /\(\s*0\s*\)/.test(out) && /\(\s*1\s*\)/.test(out)) {
    out = out
      .replace(/\(\s*3\s*\)/g, '(D)')
      .replace(/\(\s*2\s*\)/g, '(C)')
      .replace(/\(\s*1\s*\)/g, '(B)')
      .replace(/\(\s*0\s*\)/g, '(A)')
    return out
  }

  const matrixRowLabels =
    /\\begin\{(?:bmatrix|array|pmatrix)\}/i.test(out) &&
    /\(\s*[34]\s*\)/.test(out) &&
    !/\(\s*B\s*\)/i.test(out)
  // List-II (4) is a match row, not a misread (A). Rewriting it splits SMILES on (C).
  const listTwoNumber =
    /(?:List|Column)\s*[-–]?\s*II/i.test(out) &&
    /\(\s*1\s*\)/.test(out) &&
    /\(\s*[235]\s*\)/.test(out)

  if (!hasAMarker && !matrixRowLabels && !listTwoNumber && /\(\s*4\s*\)/i.test(out)) {
    out = out.replace(/\(\s*4\s*\)/gi, '(A)')
    if (/\(\s*8\s*\)/.test(out)) out = out.replace(/\(\s*8\s*\)/gi, '(B)')
    else if (/\(\s*13\s*\)/.test(out)) out = out.replace(/\(\s*13\s*\)/gi, '(B)')
    if (/\(\s*6\s*\)/.test(out)) out = out.replace(/\(\s*6\s*\)/gi, '(C)')
    if (/\(\s*9\s*\)/.test(out) && !/\(\s*[D]\s*\)/i.test(out)) {
      out = out.replace(/\(\s*9\s*\)/gi, '(D)')
    }
  }

  if (!hasAMarker) {
    out = out.replace(/\(\s*O\s*\)(?=\s*[a-z])/gi, '(A)')
    out = out.replace(/\(\s*l\s*\)(?=\s*[a-z])/gi, '(A)')
    out = out.replace(/\(\s*I\s*\)(?=\s*[a-z])/gi, '(A)')
  }

  out = out.replace(/(?:^|\n)\s*A\)\s+/gim, '\n(A) ')
  out = out.replace(/(?:^|\n)\s*B\)\s+/gim, '\n(B) ')
  out = out.replace(/(?:^|\n)\s*C\)\s+/gim, '\n(C) ')
  out = out.replace(/(?:^|\n)\s*D\)\s+/gim, '\n(D) ')

  // OCR: (CO ) / (C O) misread of (C) — common beside "aperiodic ( C )"
  out = out.replace(/\(\s*C\s*O\s*\)/gi, '(C)')

  // OCR: @Aa)1 → (A) 1
  out = out.replace(/@Aa?\s*\)/gi, '(A)')

  // OCR: ®) ©) @) for (B)(C)(A) — common on phone scans of printed papers
  out = out.replace(/@\s*\)/g, '(A)')
  out = out.replace(/®\s*\)/g, '(B)')
  out = out.replace(/©\s*\)/g, '(C)')

  // Glued B+C on one line — "…aperiodic (C) f(x) is even …"
  out = out.replace(
    /(\(\s*B\s*\)[^\n]{4,160}?)\s+\(\s*C\s*\)\s+(?=f\s*\(|g\s*\(|\d)/gi,
    '$1\n(C) ',
  )
  out = out.replace(
    /(\(\s*B\s*\)[^\n]{4,160}?aperiodic)\s*\(\s*C\s*\)\s*/gi,
    '$1\n(C) ',
  )

  // Horizontal row: (A) T1=2T2 (B) 2T1=T2 (C) T1=T2 (D) T1=4T2
  out = out.replace(
    /(\(\s*[A-D]\s*\)\s*[^(\n]{1,100}?)\s+(?=\(\s*[B-D]\s*\)\s*(?:\$|T|T\s*[_\u2080-\u2099\u00b9\u00b2]|2\s*T|\d|none))/gi,
    '$1\n',
  )

  // OCR: gfl(x) misread of g(x)
  out = out.replace(/\bgfl\s*\(\s*x\s*\)/gi, 'g(x)')

  // Options glued after prose — "(A) … g(x) is continuous … (C)"
  out = out.replace(/([.?:])\s*\(\s*([A-D])\s*\)\s*/gi, '$1\n($2) ')

  // "… is (A) …" / "… then (A) …" — force option block onto its own line
  out = out.replace(
    /\b(is|are|then|equals?|be)\s+\(\s*([A-D])\s*\)\s*/gi,
    '$1\n($2) ',
  )

  // Options glued after math — "$\\frac{12}{5}$(B) $6$(C) $4$(D)"
  out = out.replace(
    /(?<=[^A-Za-z\n])\(\s*([B-D])\s*\)\s*(?=\s*(?:\$|\\(?:frac|sqrt)|\d))/gi,
    '\n($1) ',
  )

  // Horizontal row with nested parens: (A) (e^2+…)/2 (B) e^2 (C) …
  out = out.replace(
    /(\(\s*[A-D]\s*\)\s*(?:\([^)]*\)|[^(\n]){1,120}?)\s+(?=\(\s*[B-D]\s*\))/gi,
    '$1\n',
  )

  // Options glued after prose — "(A) … g(x) is continuous … (C)"
  out = out.replace(/([.!?)])\s+(?=\(\s*([B-D])\s*\))/g, '$1\n')
  out = out.replace(
    /(\(\s*A\s*\)[^\n]{6,}?)\s+(?=g\s*\(\s*x\s*\)\s*is\s+continuous)/gi,
    '$1\n(B) ',
  )

  // 2×2 grid / horizontal pairs: (A) [..] (B) [..]
  out = out.replace(/(\])\s*(?=\(\s*[B-D]\s*\))/gi, '$1\n')
  out = out.replace(/(\))\s*(?=\(\s*[B-D]\s*\)\s*[\[\(\\\$-])/gi, '$1\n')

  // Bare Ww / ® / © after "then:" — sequential (A)–(D), not unique letters
  out = relabelSequentialOcrOptionMarks(out)

  return out
}

/**
 * (A) inside P(A), f(A), g(2), \left( — not an MCQ option label.
 * Only when a letter/digit/$/\ is glued immediately before "(" (no space).
 * "is (A)" / "Then (A)" must stay MCQ labels — never treat trailing letters of
 * English words (after whitespace) as function names.
 */
export function isFunctionStyleParen(text, index) {
  if (index <= 0) return false
  const prev = text[index - 1]
  // Space / newline / punctuation before "(" → option label like "is (A)"
  if (/\s/.test(prev)) return false
  // f(A), P(A), g(2), $(A), \left(
  return /[A-Za-z0-9$\\]/.test(prev)
}

/** @param {string} text @param {number} index — index of "(" before A */
export function isMcqOptionBlockStart(text, index) {
  if (isFunctionStyleParen(text, index)) return false
  const tail = text.slice(index, index + 800)
  const hasB = /\(\s*B\s*\)/i.test(tail)
  const hasC = /\(\s*C\s*\)/i.test(tail)
  const hasD = /\(\s*D\s*\)/i.test(tail)
  // A + at least two of B/C/D (tolerate one missing OCR label)
  return (hasB ? 1 : 0) + (hasC ? 1 : 0) + (hasD ? 1 : 0) >= 2
}

/** Index of first plausible (A) or misread (4) / zero-based (0) option block. */
export function findOptionsBlockStart(text) {
  const candidates = []
  const reA = /\(\s*A\s*\)/gi
  let m
  while ((m = reA.exec(text)) !== null) {
    if (!isMcqOptionBlockStart(text, m.index)) continue
    candidates.push(m.index)
  }
  if (candidates.length) return candidates[candidates.length - 1]

  const reAlegacy = /\(\s*A\s*\)/gi
  while ((m = reAlegacy.exec(text)) !== null) {
    const tail = text.slice(m.index, m.index + 1200)
    if (/\(\s*B\s*\)/i.test(tail) && !isFunctionStyleParen(text, m.index)) return m.index
  }

  const re0 = /\(\s*0\s*\)/g
  while ((m = re0.exec(text)) !== null) {
    const tail = text.slice(m.index, m.index + 1200)
    if (/\(\s*1\s*\)/.test(tail)) return m.index
  }

  return -1
}

/** First (A)…(D) block — used when splicing a cut stem so later questions are not eaten. */
export function findFirstOptionsBlockStart(text) {
  const t = String(text ?? '')
  const reA = /\(\s*A\s*\)/gi
  let m
  while ((m = reA.exec(t)) !== null) {
    if (isMcqOptionBlockStart(t, m.index)) return m.index
  }
  const fallback = findOptionsBlockStart(t)
  return fallback
}

/**
 * When OCR merges two option labels into one slot — e.g. B contains "(C) f(x) is even …".
 * @param {string[]} options
 * @returns {string[]}
 */
export function splitEmbeddedMcqOptionMarkers(options) {
  const out = (options ?? []).map((o) => String(o ?? '').trim())
  while (out.length < 4) out.push('')

  for (let i = 0; i < 3; i++) {
    if (!out[i]) continue
    for (let j = i + 1; j <= 3; j++) {
      if (out[j]) continue
      const letter = String.fromCharCode(65 + j)
      const reGen = new RegExp(`^(.+?)\\s+\\(\\s*${letter}(?:O)?\\s*\\)\\s*(.+)$`, 'is')
      const m = out[i].match(reGen)
      if (!m?.[2]?.trim()) continue
      out[i] = m[1].trim()
      out[j] = m[2].trim()
    }
  }
  return out.slice(0, 4)
}

/**
 * @param {string} lineText
 * @returns {{ label: number, charIdx: number, length: number }[]}
 */
export function findOptionMarkersInLineText(lineText) {
  /** @type {{ label: number, charIdx: number, length: number }[]} */
  const markers = []
  const re = /\(\s*([A-D0-3])\s*\)/gi
  let m
  while ((m = re.exec(String(lineText ?? ''))) !== null) {
    if (isFunctionStyleParen(lineText, m.index)) continue
    const label = optionMarkerToIndex(m[1])
    if (label >= 0 && label <= 3) {
      markers.push({ label, charIdx: m.index, length: m[0].length })
    }
  }
  const seen = new Set()
  return markers.filter((mk) => {
    if (seen.has(mk.label)) return false
    seen.add(mk.label)
    return true
  })
}

/**
 * @param {string} lineText
 * @param {{ label: number, charIdx: number, length: number }[]} markers
 */
export function optionsFromTextMarkers(lineText, markers) {
  const options = ['', '', '', '']
  const sorted = [...markers].sort((a, b) => a.charIdx - b.charIdx)
  for (let i = 0; i < sorted.length; i += 1) {
    const start = sorted[i].charIdx + sorted[i].length
    const end = i + 1 < sorted.length ? sorted[i + 1].charIdx : lineText.length
    options[sorted[i].label] = lineText.slice(start, end).replace(/^[\s,;:]+/, '').trim()
  }
  return options
}

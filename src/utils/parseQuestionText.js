/** @typedef {{ text: string, options: string[], parsed: boolean, optionsFound: number }} ParseResult */

import {
  trimQuestionLeakFromOption,
  stripNextQuestionFromOptions,
  stripStemLeakFromOptions,
  stripTrailingOptionMarkerFromStem,
  trimTrailingProseAfterMath,
  mergeSplitMathDollars } from './optionStemLeak.js'
import { fixBrokenMcqOptionLatex } from './repairMcqOption.js'
import { matchOptionCanonical } from './applyOptionCanonicals.js'
import {
  findOptionsBlockStart,
  normalizeOptionMarkersInText,
  optionMarkerToIndex,
  splitEmbeddedMcqOptionMarkers } from './mcqOptionMarkers.js'
import { splitStemAndGarbledOptions } from './splitStemAndGarbledOptions.js'
import {
  looksLikeDeterminantIntegerStem,
  repairDeterminantOcr } from './repairDeterminantOcr.js'

const OPTION_LINE_PATTERNS = [
  /^[\(\[]([A-D])[\)\]]\s*(.+)$/i,
  /^([A-D])[\)\]\.\:]\s+(.+)$/i,
  /^[\(\[]\s*([0-3])\s*[\)][\.\:\-\s]+(.+)$/,
  /^[\(\[]\s*([1-4])\s*[\)][\.\:\-\s]+(.+)$/,
  /^Option\s*([A-D1-4])[\.\:\-\s]+(.+)$/i,
]

const INLINE_SPLIT = /\s+(?=\(\s*[A-D]\s*[\)\]\.\:\-]\s+|\(\s*[1-4]\s*\)[\s\.]|[1-4][\)\]\.\:]\s+)/i

/** OCR often returns (A) opt (B) opt on one line — legacy; prefer marker parser */
/** MCQ markers only — skip P(A), f(A), and (C) inside a structure tag. */
const PAREN_OPTION_RE =
  /(?<![A-Za-z$\\])\(\s*([A-Da-d])\s*\)\s*([^()]+?)(?=\s*(?<![A-Za-z$\\])\(\s*[A-Da-d]\s*\)|$)/gi

function indexInsideSmiles(text, index) {
  const before = String(text ?? '').slice(0, Math.max(0, index)).toLowerCase()
  const open = before.lastIndexOf('<smiles>')
  if (open < 0) return false
  const close = before.lastIndexOf('</smiles>')
  return close < open
}

/** OCR "[A] opt" labels → "(A)". Not inside $…$ ($[B]$ is a dimension) or table rows ([A] is a concentration). */
function bracketLabelsToParens(text) {
  return String(text ?? '')
    .split('\n')
    .map((line) => {
      if (/&|\\hline/.test(line)) return line
      let dollars = 0
      return line.replace(/\\\$|\$|\[\s*([A-D])\s*\]/gi, (m, letter) => {
        if (m === '$') dollars += 1
        if (!letter) return m
        return dollars % 2 ? m : `(${letter})`
      })
    })
    .join('\n')
}

/** Fix misread MCQ labels before parsing */
function normalizeMcqOptionLabels(text) {
  return normalizeOptionMarkersInText(
    bracketLabelsToParens(text)
      .replace(/\(\s*©\s*\)/gi, '(C)')
      .replace(/\(\s*®\s*\)/gi, '(C)')
      .replace(/\(\s*℗\s*\)/gi, '(C)')
      .replace(/\(\s*@\s*\)/gi, '(C)')
      .replace(/\(\s*¢\s*\)/gi, '(C)')
      .replace(/\(\s*C\s*O\s*\)/gi, '(C)'),
  )
}

function cleanQuestionStem(stem, options = []) {
  return stripTrailingOptionMarkerFromStem(
    stem
      .replace(/\s+is equal to\s*[-–—]?\s*$/i, '')
      .replace(/\s+equals?\s*[-–—]?\s*$/i, '')
      .replace(/\s+are equal to\s*[-–—]?\s*$/i, '')
      .replace(/\s+-\s*$/, ''),
    options,
  )
}

/** Wrap bare numeric / simple fraction options for KaTeX preview */
function normalizeOptionContent(content, stem = '') {
  let c = trimQuestionLeakFromOption(content.trim(), stem)
  if (!c) return c
  // Figure option panels: \caption{(A)} … \includegraphics[…]{url} \end{figure}
  // Marker parse leaves a leading "}" from \caption{(A)} — keep only the image.
  const texFig = c.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/i)
  if (texFig) return `\\includegraphics{${texFig[1]}}`
  const mdFig = c.match(/!\[[^\]]*\]\(([^)\s]+)\)/)
  if (mdFig) return `![](${mdFig[1]})`
  if (/^0$/i.test(c)) return '0'
  if (/^113$/.test(c)) return '$\\frac{1}{3}$'
  if (/^112$/.test(c)) return '$\\frac{1}{2}$'
  if (/^114$/.test(c)) return '$\\frac{1}{4}$'
  if (/^\d+$/.test(c)) return c
  const frac = c.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (frac) return `$\\frac{${frac[1]}}{${frac[2]}}$`
  return c
}

/** Only append a line to the previous option if it looks like math, not a new question sentence. */
function isOptionContinuationLine(line) {
  const t = line.trim()
  if (!t) return false
  if (/^[\(\[]?[A-D][\)\]\.\:\-\s]/i.test(t)) return false
  if (
    /^(?:\d{1,3}\.\s*)?(?:If|Let|Given|Find|When|Suppose|Area|The value|Then|A regular|Consider)\s/i.test(
      t,
    )
  ) {
    return false
  }
  if (/\b(?:are one of the sides|medians respectively|is equal to|through the same vertex)\b/i.test(t)) {
    return false
  }
  if (t.length > 160) return false
  if (/\\vec\{|\\hat\{|\\frac|\\sqrt|\$/.test(t)) return true
  if (/^\d+$/.test(t) || /^[\d\s\/\.]+$/.test(t)) return true
  return t.length < 72
}

/** Pictures on their own lines under the last option's words belong to the stem (2013 P1 Q32: "(D) S", then four schemes). */
function withoutTrailingStemFigures(slice) {
  const at = slice.search(/\n[ \t]*(?:!\[[^\]]*\]\(|\\includegraphics)/)
  if (at < 0) return slice
  const head = slice.slice(0, at)
  const words = head.replace(/\\caption\{[^}]*\}|\\(?:begin|end)\{figure\}(?:\[[^\]]*\])?|\\centering|[{}\s]/g, '')
  return words ? head : slice
}

/**
 * Robust parser: slice text between (A)(B)(C)(D) markers — handles $…$ and ©→C.
 * @param {string} text
 */
function parseOptionsByMarkers(text) {
  const start = findOptionsBlockStart(text)
  if (start < 0) return null

  const stem = cleanQuestionStem(text.slice(0, start))
  const block = text.slice(start)
  const markerRe = /\(\s*([A-D])\s*\)/gi
  const hits = []
  let m
  while ((m = markerRe.exec(block)) !== null) {
    if (indexInsideSmiles(text, start + m.index)) continue
    hits.push({
      letter: m[1].toUpperCase(),
      index: m.index,
      contentStart: m.index + m[0].length })
  }
  if (hits.length < 2) return null

  const options = ['', '', '', '']
  for (let i = 0; i < hits.length; i++) {
    let end = i + 1 < hits.length ? hits[i + 1].index : block.length
    const idx = optionMarkerToIndex(hits[i].letter)
    if (idx < 0 || idx > 3) continue
    const slice = block.slice(hits[i].contentStart, end)
    const rawSlice = i === hits.length - 1 ? withoutTrailingStemFigures(slice) : slice
    const content = normalizeOptionContent(rawSlice, stem)
    if (String(content ?? '').trim() !== '' && !options[idx]) options[idx] = content
  }

  const count = options.filter((o) => o.trim()).length
  if (count < 2) return null
  const split = splitEmbeddedMcqOptionMarkers(options)
  const splitCount = split.filter((o) => o.trim()).length

  const cleaned = stripStemLeakFromOptions(splitCount >= count ? split : options, stem)
  const stemText = cleanQuestionStem(stem, cleaned)
  return {
    text: stemText,
    options: cleaned,
    count: cleaned.filter((o) => o.trim()).length,
    parsed: count === 4 }
}

/**
 * @param {string} line
 * @returns {{ index: number, text: string } | null}
 */
function matchOptionLine(line) {
  const trimmed = line.trim()
  for (const re of OPTION_LINE_PATTERNS) {
    const m = trimmed.match(re)
    if (!m) continue
    const key = m[1].toUpperCase()
    const index = optionMarkerToIndex(key)
    if (index >= 0 && index < 4 && m[2]?.trim() !== undefined && m[2]?.trim() !== '') {
      return { index, text: normalizeOptionContent(m[2].trim()) }
    }
  }
  return null
}

/**
 * Parse "A) one B) two C) three D) four" on one line or block.
 * @param {string} block
 */
function parseInlineOptions(block) {
  const options = ['', '', '', '']
  const parts = block.split(/\s*(?=\(\s*[A-D]\s*[\)\]\.\:\-]|\(\s*[1-4]\s*[\)\]\.\:])/i)
  let count = 0
  for (const part of parts) {
    const m = part.trim().match(/^[\(\[]\s*([A-D])\s*[\)\]\.\:\-\s]+(.+)$/is)
    if (!m) continue
    const at = block.indexOf(part.trim().slice(0, 12))
    if (at >= 0 && indexInsideSmiles(block, at)) continue
    const key = m[1].toUpperCase()
    const index = optionMarkerToIndex(key)
    if (index >= 0 && index < 4 && m[2]?.trim()) {
      options[index] = normalizeOptionContent(m[2].trim())
      count++
    }
  }
  return { options, count }
}

/**
 * @param {string} raw
 * @returns {ParseResult}
 */
/** Stem ends with "are in" + A.P. G.P. H.P. A.G.P. without (A) markers */
function parseProgressionOptionsTail(text) {
  const m = text.match(
    /^(.*?)(?:,\s*)?then\s+[^.]{0,80}?\s+are\s+in\s+(.+)$/is,
  )
  if (!m) return null

  const stem = cleanQuestionStem(m[1].trim())
  const tail = m[2].trim()
  const labels = [
    { re: /\bA\.?\s*P\.?/i, value: 'A.P.' },
    { re: /\bG\.?\s*P\.?/i, value: 'G.P.' },
    { re: /\bH\.?\s*P\.?/i, value: 'H.P.' },
    { re: /\bA\.?\s*G\.?\s*P\.?/i, value: 'A.G.P.' },
  ]
  const options = ['', '', '', '']
  let found = 0
  for (let i = 0; i < labels.length; i++) {
    if (labels[i].re.test(tail)) {
      options[i] = labels[i].value
      found++
    }
  }
  if (found < 2) return null
  return { text: stem, options, count: found, parsed: found === 4 }
}

function parseParenOptions(text) {
  const options = ['', '', '', '']
  let count = 0
  PAREN_OPTION_RE.lastIndex = 0
  let m
  while ((m = PAREN_OPTION_RE.exec(text)) !== null) {
    if (indexInsideSmiles(text, m.index)) continue
    const key = m[1].toUpperCase()
    const index = optionMarkerToIndex(key)
    if (index >= 0 && index < 4 && m[2]?.trim()) {
      options[index] = normalizeOptionContent(m[2].trim())
      count++
    }
  }
  return { options, count }
}

/** Strip option tails from text to isolate question stem */
function stripOptionsFromStem(text, options) {
  let stem = text
  for (let i = 0; i < 4; i++) {
    if (!options[i]) continue
    const letter = String.fromCharCode(65 + i)
    stem = stem.replace(
      new RegExp(`[\\(\\[]?${letter}[\\)\\]\\.\\:\\-\\s]+${escapeRegExp(options[i].slice(0, 40))}`, 'i'),
      '',
    )
  }
  const optStart = findOptionsBlockStart(stem)
  if (optStart > 20) stem = stem.slice(0, optStart)
  return cleanQuestionStem(stem, options)
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function parseQuestionText(raw) {
  const normalized = normalizeMcqOptionLabels(raw.replace(/\r\n/g, '\n').trim())
  if (!normalized) {
    return { text: '', options: ['', '', '', ''], parsed: false, optionsFound: 0 }
  }

  if (looksLikeDeterminantIntegerStem(normalized)) {
    return finalizeParseResult({
      text: repairDeterminantOcr(normalized),
      options: ['', '', '', ''],
      parsed: false,
      optionsFound: 0 })
  }

  const markerParsed = parseOptionsByMarkers(normalized)
  if (markerParsed) {
    return finalizeParseResult({
      text:
        markerParsed.text ||
        (findOptionsBlockStart(normalized) > 0
          ? normalized.slice(0, findOptionsBlockStart(normalized))
          : normalized),
      options: markerParsed.options,
      parsed: markerParsed.parsed,
      optionsFound: markerParsed.count })
  }

  const progressionParsed = parseProgressionOptionsTail(normalized)
  if (progressionParsed && progressionParsed.count >= 2) {
    return finalizeParseResult({
      text: progressionParsed.text,
      options: progressionParsed.options,
      parsed: progressionParsed.parsed,
      optionsFound: progressionParsed.count })
  }

  const parenFirst = parseParenOptions(normalized)
  if (parenFirst.count >= 2) {
    const text = stripOptionsFromStem(normalized, parenFirst.options)
    return finalizeParseResult({
      text: text || normalized,
      options: parenFirst.options,
      parsed: parenFirst.count === 4,
      optionsFound: parenFirst.count })
  }

  const options = ['', '', '', '']
  const questionLines = []
  let optionsFound = 0
  let optionMode = false

  const lines = normalized.split(/\n+/).map((l) => l.trim()).filter(Boolean)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const opt = matchOptionLine(line)

    if (opt) {
      optionMode = true
      if (!options[opt.index]) {
        options[opt.index] = opt.text
        optionsFound++
      } else {
        options[opt.index] += ' ' + opt.text
      }
      continue
    }

    if (optionMode && optionsFound > 0) {
      let lastFilled = -1
      for (let j = 3; j >= 0; j--) {
        if (options[j]) {
          lastFilled = j
          break
        }
      }
      if (lastFilled >= 0 && !matchOptionLine(line) && isOptionContinuationLine(line)) {
        options[lastFilled] += ' ' + line
        continue
      }
      if (optionMode && !matchOptionLine(line)) {
        questionLines.push(line)
        continue
      }
    }

    const inline = parseInlineOptions(line)
    if (inline.count >= 2) {
      for (let j = 0; j < 4; j++) {
        if (inline.options[j]) {
          options[j] = inline.options[j]
          optionsFound++
        }
      }
      optionMode = true
      continue
    }

    if (!optionMode) {
      questionLines.push(line)
    }
  }

  if (optionsFound < 4) {
    const blockInline = parseInlineOptions(normalized)
    if (blockInline.count > optionsFound) {
      for (let j = 0; j < 4; j++) {
        if (blockInline.options[j]) options[j] = blockInline.options[j]
      }
      optionsFound = blockInline.count
    }
  }

  if (optionsFound < 2) {
    const chunks = normalized.split(INLINE_SPLIT)
    if (chunks.length >= 2) {
      const q = chunks[0].trim()
      const rest = chunks.slice(1).join(' ')
      const inline = parseInlineOptions(rest)
      if (inline.count >= 2) {
        return finalizeParseResult({
          text: q || questionLines.join(' ').trim(),
          options: inline.options,
          parsed: inline.count === 4,
          optionsFound: inline.count })
      }
    }
  }

  const filled = options.filter((o) => o.trim()).length
  if (filled < 2) {
    const garbled =
      splitStemAndGarbledOptions(raw) || splitStemAndGarbledOptions(normalized)
    if (garbled && garbled.options.filter(Boolean).length >= 2) {
      return finalizeParseResult({
        text: garbled.stem,
        options: garbled.options,
        parsed: garbled.options.filter(Boolean).length === 4,
        optionsFound: garbled.options.filter(Boolean).length })
    }
  }
  return finalizeParseResult({
    text: questionLines.join(' ').trim(),
    options,
    parsed: filled === 4,
    optionsFound: filled })
}

function finalizeParseResult(result) {
  const text = String(result.text ?? '').trim()
  const options = stripNextQuestionFromOptions(
    stripStemLeakFromOptions(result.options ?? [], text),
  ).map((o, i) => {
    const letter = String.fromCharCode(65 + i)
    let fixed = mergeSplitMathDollars(trimQuestionLeakFromOption(trimTrailingProseAfterMath(o), text))
    fixed = fixBrokenMcqOptionLatex(fixed, letter, text)
    fixed = mergeSplitMathDollars(fixed)
    return matchOptionCanonical(fixed, letter)
  })
  const optionsFound = options.filter((o) => o.trim()).length
  return {
    text,
    options,
    parsed: optionsFound === 4,
    optionsFound }
}

/** Apply parse result to form state */
export function applyParsedToForm(parsed, fallbackText = '') {
  return {
    text: parsed.text || fallbackText.split(/\n/)[0]?.trim() || fallbackText.slice(0, 800),
    options: parsed.options.map((o, _i) => o.trim() || ''),
    optionsFound: parsed.optionsFound,
    allOptionsFound: parsed.parsed }
}

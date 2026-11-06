/**
 * Names the Go-to-Q card on the Official PYQ review banner, and finds the
 * exact bad span to mark inside that question. Works for any future upload.
 */

import { closedChemReactionDisplays, hasUnclosedDisplayMath } from './healTruncatedLatex.js'
import { validateMathpixQuestion } from './mathpixCleanPipeline.js'
import { findFracExpression } from './latexBraceMatch.js'
import { convertLatexTabularToArray } from './latexTabularDisplay.js'
import { isOfficialPyqPlaceholder } from './officialPyqMissingSlots.js'
import { reviewOfficialPyqCards } from './officialPyqUnifiedCheck.js'
import { prepareTextForMathTextDisplay } from './prepareMathForRender.js'
import { stemLooksIncompleteOnDisplay } from './sanitizeStemForDisplay.js'
import { visibleLatexSourceHits } from './visibleLatexSource.js'
import { repairScanStructureCodes } from './smilesDisplay.js'
import SmilesDrawer from 'smiles-drawer'

const CHECKER_NOTE =
  /Raw LaTeX is still showing(?: as code)?|Not inventing|Math looks cut off|Extraction incomplete|missing List-I{1,2}/gi

const TABLE_COMMAND = /\\(?:multirow|multicolumn)\b(?:\s*\{[^{}]*\}){0,4}/g

/**
 * A complete tabular that turns into a KaTeX array. A spare $$ after
 * \\end{tabular} is part of that block and is not a broken command.
 * @param {string} text
 */
function drawableTableRanges(text) {
  const raw = String(text ?? '')
  /** @type {{ start: number, end: number }[]} */
  const ranges = []
  const re = /\\begin\{tabular\}(?:\[[^\]]*\])?(?:\{[^}]*\})?[\s\S]*?\\end\{tabular\}(?:\s*\$+)?/gi
  for (const match of raw.matchAll(re)) {
    let shown = match[0]
    try {
      shown = convertLatexTabularToArray(match[0])
    } catch {
      continue
    }
    if (
      (/\\begin\{array\}/.test(shown) || /class="paper-data-table"/.test(shown)) &&
      !/\\begin\{tabular\}/i.test(shown)
    ) {
      ranges.push({ start: match.index, end: match.index + match[0].length })
    }
  }
  return ranges
}

const EMPTY_IMAGE = /!\]\s*\[\s*\(|!\[\s*\]\s*\(\s*\)/g

/**
 * Go-to-Q number, plus the printed paper number when it is different.
 * @param {object} q
 * @param {number} index 0-based card index in the review list
 */
export function reviewQuestionTag(q, index) {
  const go = index + 1
  const printed = Number(q?.printedNumber ?? q?.questionNumber)
  if (Number.isFinite(printed) && printed > 0 && printed !== go) {
    return `${go} (printed ${printed})`
  }
  return String(go)
}

/**
 * @param {string[]} tags
 */
function joinQuestionTags(tags) {
  if (tags.length <= 1) return `Question ${tags[0]}`
  if (tags.length === 2) return `Questions ${tags[0]} and ${tags[1]}`
  return `Questions ${tags.slice(0, -1).join(', ')}, and ${tags[tags.length - 1]}`
}

function expandToSentence(text, index, length) {
  let start = index
  let end = index + length
  while (start > 0 && text[start - 1] !== '\n' && text[start - 1] !== '.') start -= 1
  while (end < text.length && text[end] !== '\n' && text[end] !== '.') end += 1
  if (text[end] === '.') end += 1
  return { start, end }
}

/** Same hiding rules as the raw-LaTeX check, but spaces keep the original indexes. */
function maskBalancedMath(text) {
  return String(text ?? '')
    .replace(/\$\$[\s\S]*?\$\$/g, (m) => ' '.repeat(m.length))
    .replace(/\$[^$\n]*\$/g, (m) => ' '.repeat(m.length))
    .replace(
      /\\begin\{(?:tabular|array)\}[\s\S]*?\\end\{(?:tabular|array)\}/gi,
      (m) => ' '.repeat(m.length),
    )
}

/**
 * Leftover commands and dollar signs that still show as code.
 * @param {string} text
 */
function leftoverCodeSpans(text) {
  const masked = maskBalancedMath(text)
  /** @type {{ start: number, end: number, kind: string }[]} */
  const spans = []
  let i = 0
  while (i < masked.length) {
    const ch = masked[i]
    if (ch === ' ' || ch === '\n' || ch === '\t') {
      i += 1
      continue
    }
    let j = i
    while (j < masked.length && masked[j] !== ' ' && masked[j] !== '\n' && masked[j] !== '\t') j += 1
    const piece = text.slice(i, j)
    if (/\\[a-zA-Z]|\$/.test(piece)) {
      let start = i
      let end = j
      while (start > 0 && text[start - 1] === '$') start -= 1
      while (end < text.length && text[end] === '$') end += 1
      if (text.startsWith(' $$', end)) end += 3
      else if (text.startsWith('$$', end)) end += 2
      if (end - start > 180) {
        const rel = text.slice(start, end)
        const hit = rel.search(/\\[a-zA-Z]+|\$\$/)
        if (hit >= 0) {
          start += hit
          end = Math.min(end, start + 80)
        }
      }
      const kind = /\\(?:multirow|multicolumn)\b/.test(piece)
        ? 'table-command'
        : /\$\$/.test(text.slice(start, end))
          ? 'stray-dollars'
          : 'raw-command'
      spans.push({ start, end, kind })
    }
    i = j
  }
  return spans
}

/**
 * @param {{ start: number, end: number, kind: string }[]} spans
 */
function mergeSpans(spans) {
  const sorted = spans
    .filter((s) => s && s.end > s.start)
    .sort((a, b) => a.start - b.start || b.end - a.end)
  /** @type {{ start: number, end: number, kind: string }[]} */
  const out = []
  for (const span of sorted) {
    const prev = out[out.length - 1]
    if (prev && span.start <= prev.end + 1) {
      prev.end = Math.max(prev.end, span.end)
      continue
    }
    out.push({ start: span.start, end: span.end, kind: span.kind })
  }
  return out
}

/**
 * Bad slices inside one stem, passage, or option. Indexes refer to `text`.
 * @param {unknown} text
 * @returns {{ start: number, end: number, kind: string }[]}
 */
export function findReviewFlagSpans(text) {
  const raw = String(text ?? '')
  if (!raw.trim()) return []
  /** @type {{ start: number, end: number, kind: string }[]} */
  const spans = []

  for (const m of raw.matchAll(CHECKER_NOTE)) {
    const sentence = expandToSentence(raw, m.index, m[0].length)
    spans.push({ ...sentence, kind: 'checker-note' })
  }
  for (const m of raw.matchAll(EMPTY_IMAGE)) {
    spans.push({ start: m.index, end: m.index + m[0].length, kind: 'empty-image' })
  }
  for (const m of raw.matchAll(TABLE_COMMAND)) {
    spans.push({ start: m.index, end: m.index + m[0].length, kind: 'table-command' })
  }

  const fracRe = /\\frac\s*\{/g
  let frac
  while ((frac = fracRe.exec(raw))) {
    const found = findFracExpression(raw, frac.index)
    if (!found || found.start !== frac.index) {
      const lineEnd = raw.indexOf('\n', frac.index)
      const end =
        lineEnd === -1 ? Math.min(raw.length, frac.index + 60) : Math.min(lineEnd, frac.index + 80)
      spans.push({ start: frac.index, end: Math.max(end, frac.index + 5), kind: 'cut-off-fraction' })
    }
  }
  const thenTail = raw.match(/\bThen\s*$/i)
  if (thenTail && thenTail.index != null) {
    spans.push({ start: thenTail.index, end: raw.length, kind: 'cut-off-fraction' })
  }
  const dotsTail = raw.match(/\/\s*(?:…|\.{2,})\s*$/)
  if (dotsTail && dotsTail.index != null) {
    spans.push({ start: dotsTail.index, end: raw.length, kind: 'cut-off-fraction' })
  }

  const rawLeft = leftoverCodeSpans(raw)
  spans.push(...rawLeft)
  let shown = raw
  try {
    shown = prepareTextForMathTextDisplay(raw)
  } catch {
    shown = raw
  }
  if (shown !== raw && !rawLeft.length && hasUnclosedDisplayMath(raw)) {
    for (const span of leftoverCodeSpans(shown)) {
      const piece = shown.slice(span.start, span.end)
      if (!piece.trim()) continue
      const at = raw.lastIndexOf(piece)
      if (at < 0) continue
      let start = at
      let end = at + piece.length
      while (start > 0 && raw[start - 1] === '$') start -= 1
      while (end < raw.length && raw[end] === '$') end += 1
      spans.push({ start, end, kind: span.kind })
    }
  }

  for (const env of ['vmatrix', 'bmatrix', 'pmatrix', 'aligned', 'cases', 'array', 'tabular']) {
    const opens = [...raw.matchAll(new RegExp(`\\\\begin\\{${env}\\}`, 'gi'))]
    const closes = [...raw.matchAll(new RegExp(`\\\\end\\{${env}\\}`, 'gi'))]
    if (opens.length > closes.length) {
      const last = opens[opens.length - 1]
      spans.push({
        start: last.index,
        end: last.index + last[0].length,
        kind: 'cut-off-fraction',
      })
    }
  }

  return mergeSpans(spans)
}

/**
 * Spans to mark, only when this text is one of the reasons the red banner blocks Approve.
 * @param {unknown} text
 */
export function reviewMarkSpans(text, options) {
  const raw = String(text ?? '')
  if (!raw.trim()) return []
  if (closedChemReactionDisplays(raw)) return []
  const finishedByChoices =
    (Array.isArray(options) ? options : []).filter((opt) => String(opt ?? '').trim()).length >= 2
  const thenAt = finishedByChoices ? raw.search(/\bThen\s*$/i) : -1
  const spans = findReviewFlagSpans(raw).filter((span) => !(thenAt >= 0 && span.start === thenAt))
  if (!spans.length) return []
  const tables = drawableTableRanges(raw)
  const kept = spans.filter(
    (span) => !tables.some((table) => span.start < table.end && span.end > table.start),
  )
  if (!kept.length) return []
  if (partNeedsReviewFlag(raw) || stemLooksIncompleteOnDisplay(raw, options)) return kept
  return kept.filter((span) => span.kind === 'table-command')
}

/**
 * @param {string} text
 * @param {{ start: number, end: number, kind?: string }[]} spans
 */
export function sliceTextByFlagSpans(text, spans) {
  const raw = String(text ?? '')
  const merged = mergeSpans(spans)
  /** @type {{ text: string, flag: boolean }[]} */
  const parts = []
  let cursor = 0
  for (const span of merged) {
    const start = Math.max(cursor, Math.max(0, span.start))
    const end = Math.min(raw.length, span.end)
    if (end <= start) continue
    if (start > cursor) parts.push({ text: raw.slice(cursor, start), flag: false })
    parts.push({ text: raw.slice(start, end), flag: true })
    cursor = end
  }
  if (cursor < raw.length) parts.push({ text: raw.slice(cursor), flag: false })
  return parts.filter((p) => p.text.length > 0)
}

function partNeedsReviewFlag(part) {
  const hits = visibleLatexSourceHits(part)
  if (!hits.length) return false
  if (hits.some((hit) => hit !== 'dangling-dollars')) return true
  return hasUnclosedDisplayMath(String(part ?? ''))
}

/**
 * A stored structure code that the drawer cannot turn into a drawing.
 * The words "Chemical structure" are the fallback, not a real molecule.
 * @param {string} code
 */
function smilesCodeFailsToDraw(code) {
  const clean = String(code ?? '').trim()
  if (!clean) return false
  let failed = false
  try {
    SmilesDrawer.parse(
      clean,
      () => {},
      () => {
        failed = true
      },
    )
  } catch {
    failed = true
  }
  return failed
}

function questionHasUndrawableStructure(q) {
  const parts = [q?.text, q?.stem, q?.passageText, ...(Array.isArray(q?.options) ? q.options : [])]
  for (const part of parts) {
    const codes = repairScanStructureCodes(part).matchAll(/<smiles>\s*([\s\S]*?)\s*<\/smiles>/gi)
    for (const match of codes) {
      if (smilesCodeFailsToDraw(match[1])) return true
    }
  }
  return false
}

function questionNeedsRawReview(q) {
  const parts = [q?.text, q?.stem, q?.passageText, ...(Array.isArray(q?.options) ? q.options : [])]
  return parts.some((part) => partNeedsReviewFlag(part))
}

function rawHitsForQuestion(q) {
  /** @type {string[]} */
  const hits = []
  const parts = [q?.text, q?.stem, q?.passageText, ...(Array.isArray(q?.options) ? q.options : [])]
  for (const part of parts) hits.push(...visibleLatexSourceHits(part))
  return hits
}

function rawSentence(tags, hits) {
  const set = new Set(hits)
  const label = joinQuestionTags(tags)
  const plural = tags.length !== 1
  const marked = 'The marked part is the problem. Do not approve. Re-parse stored OCR.'
  const hasChecker = set.has('checker-note')
  const hasTable = set.has('table-command')
  const hasRaw =
    set.has('raw-command') ||
    set.has('dangling-dollars') ||
    set.has('stray-dollars') ||
    set.has('empty-image')
  const kinds = [hasRaw, hasTable, hasChecker].filter(Boolean).length
  if (kinds > 1) {
    const verb = plural ? 'show' : 'shows'
    return `${label} still ${verb} raw code, a broken table command, or a checker note. ${marked}`
  }
  if (hasChecker) {
    const verb = plural ? 'have' : 'has'
    return `${label} ${verb} a checker note inside the question. ${marked}`
  }
  if (hasTable) {
    const verb = plural ? 'have' : 'has'
    return `${label} ${verb} a broken table command. ${marked}`
  }
  const verb = plural ? 'show' : 'shows'
  return `${label} still ${verb} raw code. ${marked}`
}

/**
 * Red-banner lines for incomplete math and raw LaTeX / broken tables / checker notes.
 * `indexOf` maps a healed card back to the Go-to-Q index (0-based).
 * @param {object[]} questions
 * @param {(q: object, index: number) => number} [indexOf]
 * @returns {string[]}
 */
export function officialPyqContentReviewMessages(questions, indexOf, ocr = '') {
  const unified = reviewOfficialPyqCards(questions, ocr, null, { cardsOnly: true, indexOf })
  if (unified.messages.length) return unified.messages
  const list = Array.isArray(questions) ? questions : []
  /** @type {string[]} */
  const cutTags = []
  /** @type {string[]} */
  const rawTags = []
  /** @type {string[]} */
  const rawHits = []
  /** @type {string[]} */
  const structureTags = []
  list.forEach((q, i) => {
    if (!q || isOfficialPyqPlaceholder(q) || q.adminApproved === true) return
    const index = typeof indexOf === 'function' ? indexOf(q, i) : i
    const tag = reviewQuestionTag(q, index)
    // A drawn reaction (balanced $$ and \xrightarrow) is not a cut-off fraction
    // and the \mathrm / \xrightarrow inside those dollars are not raw code.
    const drawnReaction =
      closedChemReactionDisplays(q?.text) || closedChemReactionDisplays(q?.passageText)
    const incomplete =
      !drawnReaction &&
      (stemLooksIncompleteOnDisplay(q?.text, q?.options) || stemLooksIncompleteOnDisplay(q?.passageText))
    if (incomplete) cutTags.push(tag)
    if (!drawnReaction && questionNeedsRawReview(q)) {
      rawTags.push(tag)
      rawHits.push(...rawHitsForQuestion(q))
    }
    if (questionHasUndrawableStructure(q)) structureTags.push(tag)
  })
  /** @type {string[]} */
  const errors = []
  if (cutTags.length) {
    const verb = cutTags.length === 1 ? 'has' : 'have'
    errors.push(
      `${joinQuestionTags(cutTags)} ${verb} incomplete math (a cut-off fraction). The marked part is the problem. Do not approve until the stem is complete.`,
    )
  }
  if (rawTags.length) errors.push(rawSentence(rawTags, rawHits))
  if (structureTags.length) {
    const verb = structureTags.length === 1 ? 'has' : 'have'
    errors.push(
      `${joinQuestionTags(structureTags)} ${verb} a structure the scan could not draw. The marked part is the problem. Do not approve.`,
    )
  }
  return errors
}

/**
 * Same missing-list check as Approve. Names the Go-to-Q card.
 * A card that already has both lists, including an extra List-II row, is not here.
 * @param {object[]} questions
 * @param {(q: object, index: number) => number} [indexOf]
 * @returns {string}
 */
export function officialPyqMissingListMessage(questions, indexOf) {
  const list = Array.isArray(questions) ? questions : []
  /** @type {string[]} */
  const tags = []
  list.forEach((q, i) => {
    if (!q || isOfficialPyqPlaceholder(q) || q.adminApproved === true) return
    const missing = validateMathpixQuestion(q).issues.some((issue) => issue.code === 'missing_column')
    if (!missing) return
    const index = typeof indexOf === 'function' ? indexOf(q, i) : i
    tags.push(reviewQuestionTag(q, index))
  })
  if (!tags.length) return ''
  const verb = tags.length === 1 ? 'is' : 'are'
  return `Do not approve: ${joinQuestionTags(tags)} ${verb} a match-the-column question missing a list. Re-parse stored OCR.`
}

/**
 * Card index in the stored review list (the Go to Q number is this + 1).
 * @param {object[] | undefined} stored
 * @param {object} q
 * @param {number} healedIndex
 */
export function storedReviewIndex(stored, q, healedIndex) {
  const id = String(q?.id ?? '')
  if (id && Array.isArray(stored)) {
    const found = stored.findIndex((row) => String(row?.id ?? '') === id)
    if (found >= 0) return found
  }
  return healedIndex
}

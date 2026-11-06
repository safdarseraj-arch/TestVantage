/**
 * Dedicated Mathpix clean layer - runs BEFORE any model rewrite.
 *
 * Order (shared with Official PYQ / any-paper):
 * 1. Keep raw Mathpix
 * 2. Parse section instructions first (type map + passage ranges)
 * 3. Rule split on printed Q.n
 * 4. Clean each card (keep the card's own passage if it is in the range)
 * 5. Attach a passage only when the printed number is in that range
 * 6. Heal from THIS question OCR span only (figures stay in-span)
 * 7. Validate / flag - never invent options, columns, figures, or math
 *
 * Do not:
 * - Strip "choose the correct option" from a match stem
 * - Pull every figure into a shared [[FIG_n]] list (that steals drawings)
 * - Ask an LLM to split the raw page
 */

import {
  closedChemReactionDisplays,
  finishedMathReviewView,
  hasUnclosedDisplayMath,
  latexExtractionIncomplete,
  splitGluedChemDisplayEquations,
} from './healTruncatedLatex.js'
import { mathDrawFailure } from './mathDrawCheck.js'
import { htmlReactionsToMath } from './officialPyqPaperFacts.js'
import {
  looksLikeMatchingListStem,
  matchOptionsFoldedIntoLists,
  parseMatchingListForDisplay,
} from './parseMatchingListDisplay.js'
import { restoreMissingOptionGridGraphs, stripEmptyFigureShells, stripEmptyImageMarkdown } from './mathpixMedia.js'
import { stripImageWatermarkOcr } from './stripImageWatermarkOcr.js'
import { stripUploadUiOcr } from './stripUploadUiOcr.js'
import { rejoinSplitMathEnvironments, unescapeAccidentalDoubleBackslash } from './wrapBareLatexRuns.js'
import { peelPrintedAnswerFromStem } from './answerProvenance.js'
import { healVisibleTableCommands, stripDollarsInsideLatexEnvs } from './latexTabularDisplay.js'
import {
  matrixBodyIsLetterSoup,
  normalizeMatrixEnvironments,
} from './hybridLatexSanitize.js'
import {
  canonicalizeBeginMatrixEnv,
  ensureMatrixStemDelimiters,
  stripInternalStemMarkers,
} from './repairMatrixStem.js'
/**
 * Drop book / exam chrome that is never a question stem.
 * Conservative line filters — keep anything that looks like math or a real Q.
 * @param {string} text
 */
export function stripNonQuestionNoise(text) {
  const raw = String(text ?? '')
  if (!raw.trim()) return ''
  const keepMath = (line) =>
    /[=+$]|\\frac|\\begin|\\includegraphics|\(\s*[A-D]\s*\)|\(\s*[PQRS]\s*\)|\\item\s*\[\s*Q|^\s*Q\s*\.?\s*\d/i.test(
      line,
    )

  return raw
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      if (!t) return true
      if (keepMath(t)) return true
      if (/^(?:Chapter|Unit|Exercise|Example|Practice\s+Set)\s+\d+[A-Za-z]?[\s.:-]*/i.test(t) && t.length < 80) {
        return false
      }
      if (/^(?:Page\s+\d+|P\.?\s*\d+\s*(?:of|\/)\s*\d+|\[?\s*\d+\s*\]?\s*$)/i.test(t)) return false
      if (
        /^(?:SPACE\s+FOR\s+ROUGH\s+WORK|ROUGH\s+WORK|DO\s+NOT\s+OPEN|INSTRUCTIONS?\s+(?:TO|FOR)\s+CANDIDATES|GENERAL\s+INSTRUCTIONS|IMPORTANT\s+INSTRUCTIONS|CODE\s*[:=]|PAPER\s*CODE|QUESTION\s+PAPER\s+CODE|Duration\s*:|Maximum\s+Marks\s*:\s*\d+\s*$|Read\s+the\s+following\s+instructions|Candidates\s+must|Use\s+(?:of\s+)?(?:calculator|log)\s+is\s+not)/i.test(
          t,
        )
      ) {
        return false
      }
      if (/^(?:JEE\s*\(?\s*Advanced\)?\s*\d{4}|IIT\s*JEE|National\s+Testing\s+Agency)\s*$/i.test(t)) {
        return false
      }
      return true
    })
    .join('\n')
}

/**
 * Watermark stripper removes bare https URLs — park Mathpix figures first.
 * @param {string} text
 * @param {(s: string) => string} fn
 */
function withProtectedMathpixFigures(text, fn) {
  const slots = []
  const park = (m) => {
    const i = slots.length
    // \& inside a Mathpix URL is an escaped ampersand, not a cell break.
    slots.push(String(m).replace(/\\&/g, '&'))
    return `<<TV_FIG_${i}>>`
  }
  const parked = String(text ?? '')
    .replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/gi, park)
    .replace(/!\[[^\]]*\]\(\s*https?:\/\/cdn\.mathpix\.com\/[^)]+\)/gi, park)
  let out = fn(parked)
  out = out.replace(/<<TV_FIG_(\d+)>>/g, (_, n) => slots[Number(n)] ?? '')
  return out
}

/**
 * Strip page chrome, watermarks, upload UI bleed, and book noise.
 * Keep math, figures, and match wording.
 * @param {unknown} raw
 */
export function preCleanMathpixOcr(raw) {
  let t = String(raw ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\uFFFD+/g, '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/---\s*page\s*---/gi, '\n')
    .replace(/^[ \t]*Page\s+\d+(?:\s+of\s+\d+)?[ \t]*$/gim, '')

  t = withProtectedMathpixFigures(t, (s) => {
    let x = stripImageWatermarkOcr(s)
    x = stripUploadUiOcr(x)
    x = stripNonQuestionNoise(x)
    return x
  })

  return t
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function filledOptions(q) {
  return (Array.isArray(q?.options) ? q.options : []).filter((o) => String(o ?? '').trim()).length
}

/** Drop ``` fences so leftover OCR code is not shown as a code block. */
export function stripMathpixCodeFences(text) {
  return String(text ?? '')
    .replace(/```(?:latex|tex|math|markdown)?[ \t]*\r?\n?/gi, '')
    .replace(/~~~(?:latex|tex|math)?[ \t]*\r?\n?/gi, '')
}

/** Replacement chars, zero-width marks, and internal row-break tokens. Real math stays. */
export function stripOcrJunkSymbols(text) {
  return stripInternalStemMarkers(String(text ?? ''))
    .replace(/\uFEFF/g, '')
    .replace(/\uFFFD+/g, '')
    .replace(/[\u200B-\u200D\u2060\u00AD]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

/** True when offset sits inside $...$ or $$...$$. */
function offsetIsInsideMath(str, offset) {
  const before = String(str ?? '').slice(0, offset)
  let i = 0
  let inline = false
  let display = false
  while (i < before.length) {
    if (before[i] === '\\') {
      i += 2
      continue
    }
    if (before.startsWith('$$', i)) {
      display = !display
      i += 2
      continue
    }
    if (before[i] === '$') {
      inline = !inline
      i += 1
      continue
    }
    i += 1
  }
  return inline || display
}

/** Wrap a bare matrix, cases, or array so it renders. Skip letter-soup and math already in $. */
function wrapBareMatrixEnvs(text) {
  return String(text ?? '').replace(
    /\\begin\{(bmatrix|pmatrix|vmatrix|matrix|cases|array|aligned)\}([\s\S]*?)\\end\{\1\}/g,
    (block, env, body, offset, str) => {
      if (
        (env === 'bmatrix' || env === 'pmatrix' || env === 'vmatrix' || env === 'matrix') &&
        matrixBodyIsLetterSoup(body)
      ) {
        return block
      }
      if (offsetIsInsideMath(str, offset)) return block
      const after = str.slice(offset + block.length, offset + block.length + 4)
      if (/^\s*\$/.test(after)) return block
      return `$$${block}$$`
    },
  )
}

/**
 * Shared card clean for Official PYQ and later uploads.
 * Strips code fences and junk symbols, repairs matrix rows, keeps real math.
 * Does not invent missing text.
 * @param {unknown} text
 */
/** Scanner notes stay on cleanNotes. They are not question text. */
function stripScannerNotesFromQuestionText(text) {
  return String(text ?? '')
    .replace(/[^\n]*(?:Not inventing|missing List-[I]{1,2}|Extraction incomplete|Math looks cut off|Raw LaTeX is still showing)[^\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const LIST_ROW_IMAGE_RE =
  /\\includegraphics(?:\[[^\]]*\])?\{(https:\/\/cdn\.mathpix\.com\/cropped\/[^}]+)\}|!\[[^\]]*\]\(\s*(https:\/\/cdn\.mathpix\.com\/cropped\/[^)\s]+)\)/g

/** Wide reaction-scheme crops. Tube diagrams are taller than they are wide. */
const LIST_ROW_LABEL_BAND = 48

function cropBoxOf(url) {
  try {
    const u = new URL(String(url).replace(/\\&/g, '&').replace(/[})]+$/, ''))
    const x = Number(u.searchParams.get('top_left_x'))
    const y = Number(u.searchParams.get('top_left_y'))
    const w = Number(u.searchParams.get('width'))
    const h = Number(u.searchParams.get('height'))
    if (![x, y, w, h].every((n) => Number.isFinite(n)) || h <= 0) return null
    return { x, y, w, h, page: u.pathname, trimmed: u.searchParams.get('tv_row') === '1' }
  } catch {
    return null
  }
}

function shiftCropBelowRowLabel(url) {
  const clean = String(url).replace(/\\&/g, '&').replace(/[})]+$/, '')
  const box = cropBoxOf(clean)
  if (!box || box.trimmed) return clean
  if (box.w / box.h < 2.2 || box.h < 160 || box.h > 340) return clean
  if (box.h - LIST_ROW_LABEL_BAND < 120) return clean
  const u = new URL(clean)
  u.searchParams.set('top_left_y', String(box.y + LIST_ROW_LABEL_BAND))
  u.searchParams.set('height', String(box.h - LIST_ROW_LABEL_BAND))
  u.searchParams.set('tv_row', '1')
  return u.toString()
}

/**
 * List-I row figures from Mathpix often include "(P)" in the bitmap, and the
 * card prints "(P)" again. Shift those wide scheme crops down past the label.
 * A later crop that sits inside the same row is the same structure, so drop it.
 * Narrow figures (sound tubes) and List-II are left alone.
 */
export function dropBakedMatchListRowLabels(text) {
  const s = String(text ?? '')
  const re = /List-I\b/gi
  let header = -1
  for (const m of s.matchAll(re)) {
    const after = s.slice(m.index + m[0].length, m.index + m[0].length + 48)
    if (/^\s*(?:with|contains)\b/i.test(after) || /^\s+and\b/i.test(after)) continue
    header = m.index
    break
  }
  if (header < 0) return s
  const iiAt = s.slice(header + 6).search(/List-II\b/i)
  if (iiAt < 0) return s
  const end = header + 6 + iiAt
  let mid = s.slice(header, end)
  mid = mid.replace(/\(\s*([PQRS])\s*\)(\s*)\(\s*\1\s*\)/gi, '($1)$2')
  const matches = [...mid.matchAll(LIST_ROW_IMAGE_RE)]
  if (!matches.length) return s.slice(0, header) + mid + s.slice(end)
  const dropAt = new Set()
  const kept = []
  for (const m of matches) {
    const box = cropBoxOf(m[1] || m[2])
    if (!box) continue
    const overlap = kept.find(
      (k) =>
        k.page === box.page &&
        box.y >= k.y + 30 &&
        box.y < k.y + k.h - 8 &&
        Math.abs(box.x - k.x) < 140,
    )
    if (overlap) {
      dropAt.add(m.index)
      continue
    }
    kept.push(box)
  }
  let rebuilt = ''
  let cursor = 0
  for (const m of matches) {
    rebuilt += mid.slice(cursor, m.index)
    cursor = m.index + m[0].length
    if (dropAt.has(m.index)) continue
    const url = m[1] || m[2]
    rebuilt += m[0].replace(url, shiftCropBelowRowLabel(url))
  }
  rebuilt += mid.slice(cursor)
  return s.slice(0, header) + rebuilt + s.slice(end)
}

/** A Given line glued the exponent onto j-hat and dropped the ms unit already in that text. */
export function givenLineDroppedUnit(text) {
  return /\\hat\{\s*(?:\\jmath|j)\s*\}\s*\^\{-2\}/.test(String(text ?? ''))
}

export function restoreDroppedMsOnGivenLine(text) {
  const raw = String(text ?? '')
  if (!givenLineDroppedUnit(raw)) return raw
  if (!/\\mathrm\{\s*~?\s*ms\s*\}|\\mathrm\{m\}\\mathrm\{s\}/i.test(raw)) return raw
  return raw.replace(
    /\\hat\{\s*(?:\\jmath|j)\s*\}\s*\^\{-2\}/g,
    '\\hat{\\jmath} \\mathrm{~ms}^{-2}',
  )
}

/**
 * The bracketed [Given: ...] line from this question's scan, when the card dropped it.
 * Empty when the card already has that line, or the scan window has none.
 * @param {unknown} stem
 * @param {unknown} ocrWindow
 */
export function missingBracketedGivenLine(stem, ocrWindow) {
  if (/\[\s*Given\s*:/i.test(String(stem ?? ''))) return ''
  const window = String(ocrWindow ?? '')
  if (!window) return ''
  const head = String(stem ?? '')
    .split('$')[0]
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48)
  let region = window
  if (head.length >= 12) {
    const at = window.toLowerCase().indexOf(head.toLowerCase())
    if (at < 0) return ''
    region = window.slice(at)
  }
  const cut = region.search(/\n\s*(?:\\item\s*\[\s*Q\.?\s*\]\s*\$?\s*\d|Q\.\s*\d+)/)
  if (cut > 40) region = region.slice(0, cut)
  const match = region.match(/\[\s*Given\s*:[\s\S]*?\]/)
  if (!match) return ''
  return match[0].replace(/\s*\n\s*/g, ' ').trim()
}

/** Copy that [Given: ...] line onto the stem. Does not invent values. */
export function restoreMissingGivenLine(stem, ocrWindow) {
  const given = missingBracketedGivenLine(stem, ocrWindow)
  if (!given) return String(stem ?? '')
  return `${String(stem ?? '').trimEnd()}\n\n${given}`
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The scan closed a display with $$ and then wrote $x \in \mathbb{R}$.
 * A single $ in the card leaves \mathbb outside math. Copy the scan's close.
 * @param {unknown} stem
 * @param {unknown} ocrWindow
 */
export function restoreDisplayCloseBeforeInline(stem, ocrWindow) {
  const src = String(ocrWindow ?? '')
  let text = String(stem ?? '')
  if (!src || !text) return text
  const pair = /\$\$\s*(\$[^$\n]{1,80}\$)/g
  let match
  while ((match = pair.exec(src))) {
    const span = match[1].replace(/\s+/g, ' ').trim()
    const body = span.slice(1, -1).trim()
    if (!/\\[a-zA-Z]/.test(body)) continue
    const flex = body.split(/\s+/).map(escapeRegExp).join('\\s+')
    const broken = new RegExp(`,\\$\\s*${flex}\\s*\\$`)
    if (!broken.test(text)) continue
    text = text.replace(broken, () => `,$$ ${span}`)
  }
  if (/\$\$[A-Za-z]+\([^)]*\)=\$\\left/.test(text) && /\$\$[A-Za-z]+\([^)]*\)=\\left/.test(src)) {
    text = text.replace(/(\$\$[A-Za-z]+\([^)]*\)=)\$(\\left)/g, '$1$2')
  }
  return text
}

/**
 * The scan's A–D option table is whole. A card table after List-II that
 * never reaches (A), or that ends on $$, is the cut-off piece. Copy the scan.
 * @param {string} stem
 * @param {string} ocrWindow
 */
function optionTableAt(text) {
  return String(text ?? '').search(/\\begin\{tabular\}(?:\[[^\]]*\])?\{[^}]*\}\s*\\hline\s*\(A\)/)
}

function numberedListMarks(text) {
  return String(text ?? '').match(/\(\s*[1-5]\s*\)/g) || []
}

/** A reagent table inside List-II is the list, not the A–D answer table. */
function isListContentTable(tableHead) {
  return (
    /\\hline[^\n]{0,80}\(i\)/i.test(tableHead) ||
    /Benzoic acid|Nitrobenzene|Aniline|\\mathrm\{PCl\}|\\mathrm\{NH\}/i.test(tableHead)
  )
}

function restoreCutOffOptionTable(stem, ocrWindow) {
  const src = String(ocrWindow ?? '')
  const text = String(stem ?? '')
  const found = src.match(
    /\\begin\{tabular\}(?:\[[^\]]*\])?\{[^}]*\}\s*\\hline\s*\(A\)[\s\S]*?\\end\{tabular\}/,
  )
  if (!found) return text
  const full = found[0]
  if (text.includes(full)) return text
  const listAt = text.search(/List-II\b/i)
  if (listAt < 0) return text
  let from = listAt
  while (from < text.length) {
    const marker = text.indexOf('\\begin{tabular}', from)
    if (marker < 0) return text
    const tableHead = text.slice(marker, marker + 500)
    if (isListContentTable(tableHead)) {
      const end = text.indexOf('\\end{tabular}', marker)
      from = end >= 0 ? end + '\\end{tabular}'.length : marker + 15
      continue
    }
    const tail = text.slice(marker)
    const complete =
      /\\hline\s*\(A\)/.test(tail) && /\\end\{tabular\}/.test(tail) && !/\$\$\s*$/.test(tail.trim())
    if (complete) return text
    return text.slice(0, marker) + full
  }
  return text
}

/**
 * The scan still has List-II rows (2)–(5). A cleanup copied the A–D table
 * over those rows. Put the scan's list back. Do not invent a row.
 * @param {string} stem
 * @param {string} ocrWindow
 */
function restoreListTwoSwallowedByOptionTable(stem, ocrWindow) {
  const src = String(ocrWindow ?? '')
  const text = String(stem ?? '')
  const srcList = src.search(/(?:^|[\n\r])\s*List-II\b/i)
  if (srcList < 0) return text
  const srcTail = src.slice(srcList)
  const srcOpt = optionTableAt(srcTail)
  if (srcOpt < 40) return text
  const ocrList = srcTail.slice(0, srcOpt).trim()
  if (ocrList.length > 8000) return text
  const ocrMarks = new Set(numberedListMarks(ocrList).map((mark) => mark.replace(/\s+/g, '')))
  if (ocrMarks.size < 2) return text
  const cardListAt = text.search(/List-II\b/i)
  if (cardListAt < 0) return text
  const cardTail = text.slice(cardListAt)
  const cardOpt = optionTableAt(cardTail)
  if (cardOpt < 0) return text
  const cardMarks = new Set(numberedListMarks(cardTail.slice(0, cardOpt)).map((mark) => mark.replace(/\s+/g, '')))
  const missing = [...ocrMarks].some((mark) => !cardMarks.has(mark))
  if (!missing) return text
  return `${text.slice(0, cardListAt)}${ocrList}\n\n${cardTail.slice(cardOpt)}`
}

/**
 * Copy a closed math span from the scan when the card split it.
 * A balanced fraction and a rendered symbol are not a cut-off.
 * Does not invent a span the scan does not contain.
 * @param {unknown} stem
 * @param {unknown} ocrWindow
 */
export function restoreScanMathBreaks(stem, ocrWindow) {
  const src = String(ocrWindow ?? '')
  let text = String(stem ?? '')
  if (!src || !text) return text
  text = text.replace(/\\end\{tabular\}\$\$(\s*)([A-Z][^$\n]{8,80})/g, (full, space, prose, offset, whole) => {
    const needle = prose.replace(/\s+/g, ' ').trim().slice(0, 24)
    if (!needle || !src.includes(needle)) return full
    const at = src.indexOf('\\end{tabular}')
    if (at < 0) return full
    const after = src.slice(at, at + 40)
    if (/\\end\{tabular\}\s*\$\$/.test(after)) return full
    const next = `\\end{tabular}${space}${prose}`
    const candidate = String(whole).slice(0, offset) + next + String(whole).slice(offset + full.length)
    if (!hasUnclosedDisplayMath(whole) && hasUnclosedDisplayMath(candidate)) return full
    return next
  })
  text = text.replace(
    /\$\$([A-Za-z](?:_\{[^}]+\})?\([^)]*\)=)\$\$(\\[a-zA-Z]+)/g,
    (full, head, cmd) => (src.includes(head + cmd) ? `$$${head}${cmd}` : full),
  )
  text = text.replace(
    /\$\$\s*([A-Za-z](?:_\{[^}]+\})?)\s*\$\$\\in\s*\\mathbb\{R\}\$\$/g,
    (full, name) => {
      const span = `$${name} \\in \\mathbb{R}$`
      if (!src.includes(span)) return full
      const keptClose = new RegExp(
        `\\$\\$\\s*\\$${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\\\in\\s*\\\\mathbb\\{R\\}\\$`,
      )
      // The $$ before the name closes the display in the scan. Keep it.
      if (keptClose.test(src)) return `$$ ${span}`
      return span
    },
  )
  text = text.replace(/\$(\d+)\s+\$([^$\n]{1,80})\$\$/g, (full, num, body) => {
    const span = `$${num} ${String(body).trim()}$`
    return src.includes(span) ? span : full
  })
  text = restoreCutOffOptionTable(text, src)
  text = restoreListTwoSwallowedByOptionTable(text, src)
  text = text.replace(/\$\$([^$\n]{1,80})\$\$/g, (full, body) => {
    const inline = `$${String(body).replace(/\s+/g, ' ').trim()}$`
    if (!/\\[a-zA-Z]/.test(inline)) return full
    if (src.includes(inline) && !src.includes(full)) return inline
    return full
  })
  text = text.replace(/\$\$([A-Za-z](?:_\{[^}]+\})?)\$/g, (full, name) => {
    const span = `$${name}$`
    if (src.includes(span) && !src.includes(full)) return span
    return full
  })
  const fracRow = src.match(/\$\+\\frac\{[^$]{1,500}\$/)
  if (fracRow && /\$\+\$+\\frac/.test(text)) {
    const row = fracRow[0]
    text = text.replace(/\$\+\$+\\frac[\s\S]{0,500}?\$+/, () => row)
  }
  text = restoreReagentItemLabels(text, src)
  return text
}

function plainScannedListItem(block) {
  return String(block ?? '')
    .replace(/\\begin\{itemize\}/g, '')
    .replace(/\\end\{itemize\}/g, '')
    .replace(/\\item\[(\([^)]+\))\]/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Items (4) and (5) of this match list keep the reagent lines but dropped
 * (i) (ii) (iii). Those labels are in the scan. Copy them. Do not add a reagent.
 * @param {string} stem
 * @param {string} ocrWindow
 */
function restoreReagentItemLabels(stem, ocrWindow) {
  const text = String(stem ?? '')
  const src = String(ocrWindow ?? '')
  if (!/Cannizzaro reaction/.test(text) || !/\\item\[\(4\)\]/.test(src)) return text
  const block4 = src.match(/\\item\[\(4\)\]([\s\S]*?)\\item\[\(5\)\]/)
  const block5 = src.match(/\\item\[\(5\)\]([\s\S]*?)(?:\\begin\{tabular\}|Answer:)/)
  if (!block4 || !block5) return text
  let next = text
  const four = plainScannedListItem(block4[1])
  const five = plainScannedListItem(block5[1])
  if (/\(4\)/.test(next) && !/\(4\)[\s\S]{0,160}\(i\)/.test(next) && /Tollen/.test(four) && /Tollen/.test(next)) {
    next = next.replace(/\(4\)[\s\S]*?(?=\(5\))/, `(4)\n${four}\n\n`)
  }
  if (/\(5\)/.test(next) && !/\(5\)[\s\S]{0,160}\(i\)/.test(next) && /Aniline/.test(five) && /Aniline/.test(next)) {
    next = next.replace(/\(5\)[\s\S]*$/, `(5)\n${five}\n`)
  }
  return next
}

function ocrSeparatesListLetter(ocrWindow, letter) {
  const src = String(ocrWindow ?? '')
  if (!src || new RegExp(`\\)\\(${letter}\\)`).test(src)) return false
  const body = letter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return (
    new RegExp(`\\n\\s*\\(${body}\\)`).test(src) ||
    new RegExp(`\\n\\s*\\$\\\\mathrm\\{\\s*${body}\\s*\\}`).test(src) ||
    new RegExp(`\\n\\s*\\$\\(\\\\mathrm\\{\\s*${body}\\s*\\}\\)`).test(src)
  )
}

/** A match row glued ")(R)" while the scan puts that letter on its own line. */
export function gluedMatchLettersRemain(options, ocrWindow) {
  return (Array.isArray(options) ? options : []).some((opt) => {
    const hits = String(opt ?? '').match(/\)\(([PQRS])\)/g) || []
    return hits.some((hit) => ocrSeparatesListLetter(ocrWindow, hit.slice(2, 3)))
  })
}

/**
 * Put back the space before (Q)/(R)/(S)/(P) when the scan has that letter on its own line.
 * @param {unknown} options
 * @param {unknown} ocrWindow
 */
export function restoreGluedMatchOptionSpacing(options, ocrWindow) {
  const opts = (Array.isArray(options) ? options : []).map((opt) => String(opt ?? ''))
  let changed = false
  const next = opts.map((opt) =>
    opt.replace(/\)\(([PQRS])\)/g, (full, letter) => {
      if (!ocrSeparatesListLetter(ocrWindow, letter)) return full
      changed = true
      return `) (${letter})`
    }),
  )
  return changed ? next : opts
}

/**
 * Option B's fraction is closed in the scan. A leftover $$ after it is raw code.
 * The words stay. Nothing is added.
 * @param {unknown} options
 * @param {unknown} ocrWindow
 */
export function restoreClosedOptionFraction(options, ocrWindow) {
  const src = String(ocrWindow ?? '')
  const frac = '$\\frac{\\sigma_{0}}{\\epsilon_{0}}$'
  if (!src.includes(frac)) return options
  const end = src.indexOf(frac)
  const period = src.slice(end + frac.length, end + frac.length + 6).trimStart().startsWith('.') ? '.' : ''
  return (Array.isArray(options) ? options : []).map((opt) => {
    const text = String(opt ?? '')
    const at = text.indexOf(frac)
    if (at < 0) return text
    const tail = text.slice(at + frac.length)
    if (!/\$/.test(tail)) return text
    return `${text.slice(0, at + frac.length)}${period}`
  })
}

/** A single symbol wrapped in $$ is inline math, not a cut-off display. */
export function inlineSingleSymbolDisplayMath(text) {
  return String(text ?? '').replace(
    /\$\$(\s*\\[a-zA-Z]+(?:\s*(?:\^\{[^{}]+\}|_[^{}\s]+))?\s*)\$\$/g,
    (_, body) => `$${String(body).trim()}$`,
  )
}

export function cleanMathpixCardText(text) {
  let t = htmlReactionsToMath(String(text ?? ''))
  t = splitGluedChemDisplayEquations(t)
  t = inlineSingleSymbolDisplayMath(t)
  t = restoreDroppedMsOnGivenLine(t)
  t = t.replace(/\$\$\s*(?=\\includegraphics\b)/g, (full, offset, whole) => {
    const opensBefore = (String(whole).slice(0, offset).match(/\$\$/g) || []).length
    return opensBefore % 2 === 1 ? full : ''
  })
  t = healVisibleTableCommands(
    stripEmptyFigureShells(
      stripEmptyImageMarkdown(stripScannerNotesFromQuestionText(stripOcrJunkSymbols(t))),
    ),
  )
  t = t.replace(/^\s*(\d+)\s*\\\\\s*$/g, '$1')
  t = stripMathpixCodeFences(t)
  t = unescapeAccidentalDoubleBackslash(t)
  t = canonicalizeBeginMatrixEnv(t)
  t = normalizeMatrixEnvironments(t)
  t = stripDollarsInsideLatexEnvs(t)
  t = ensureMatrixStemDelimiters(t)
  t = wrapBareMatrixEnvs(t)
  t = rejoinSplitMathEnvironments(t)
  // An option cut just before the next list item keeps a dangling \item[ at its end.
  t = t.replace(/\s*\\item\s*(?:\[\s*\]?)?\s*$/, '')
  return peelPrintedAnswerFromStem(dropBakedMatchListRowLabels(t))
}

/**
 * Flag leftover problems. Never invents a fix.
 * @param {object} q
 */
export function validateMathpixQuestion(q) {
  if (!q || q.placeholder === true) {
    return { status: 'ok', issues: [] }
  }
  const text = String(q.text ?? q.stem ?? '')
  const issues = []
  const pieces = [text, String(q.passageText ?? ''), ...(Array.isArray(q.options) ? q.options : [])]
  const joined = pieces.join('\n')
  if (/Raw LaTeX is still showing|Not inventing|Math looks cut off|Extraction incomplete|missing List-[I]{1,2}/i.test(joined)) {
    issues.push({ code: 'latex_noise', note: 'Raw LaTeX is still showing as code.' })
  }
  for (const part of pieces) {
    const draw = mathDrawFailure(part)
    if (!draw) continue
    issues.push({
      code: draw === 'draw failure' || draw === 'leftover TeX' ? 'incomplete_math' : 'latex_noise',
      note: draw === 'draw failure' ? 'This math did not draw.' : draw,
    })
    break
  }

  if (looksLikeMatchingListStem(text)) {
    const parsed = parseMatchingListForDisplay(text, q.options)
    if ((parsed?.listI?.length ?? 0) < 2) {
      issues.push({
        code: 'missing_column',
        note: 'Match-the-column is missing List-I. Not inventing rows.',
      })
    } else if ((parsed?.listII?.length ?? 0) < 2) {
      issues.push({
        code: 'missing_column',
        note: 'Match-the-column is missing List-II. Not inventing rows.',
      })
    }
    const opts = filledOptions(q)
    const folded = matchOptionsFoldedIntoLists(text, q.options)
    if (opts < 2 && !folded) {
      issues.push({
        code: 'missing_options',
        note: 'A-D mapping choices are missing. Not inventing them.',
      })
    }
  }

  return { status: issues[0]?.code || 'ok', issues }
}

/**
 * @param {unknown[]} questions
 */
export function annotateMathpixCleanStatus(questions) {
  return (Array.isArray(questions) ? questions : []).map((q) => {
    if (!q || typeof q !== 'object') return q
    const text = cleanMathpixCardText(q.text ?? q.stem ?? '')
    const options = Array.isArray(q.options)
      ? restoreMissingOptionGridGraphs(q.options.map((o) => cleanMathpixCardText(o)))
      : q.options
    const next = { ...q, text, options }
    const check = validateMathpixQuestion(next)
    if (check.status === 'ok') {
      delete next.cleanStatus
      delete next.cleanNotes
      return next
    }
    return {
      ...next,
      cleanStatus: check.status,
      cleanNotes: check.issues.map((x) => x.note).join(' '),
    }
  })
}
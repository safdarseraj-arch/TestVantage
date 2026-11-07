/**
 * Permanent backup splitter for Mathpix LaTeX / MMD papers.
 * Mathpix returns a PAGE (or whole paper), not a question.
 * Gemini must split; if it returns one blob, this recovers real questions.
 */

import { parseQuestionText } from './parseQuestionText.js'
import { restoreDroppedMathpixMatchPieces } from './restoreDroppedMathpixMatchPieces.js'
import { wrapBareLatexRuns } from './wrapBareLatexRuns.js'
import { extractMathpixImageUrls, hasMathpixMedia, restoreMissingOptionGridGraphs, stripMathpixFigureChrome } from './mathpixMedia.js'
import { dropStemRepeatOptions, optionLooksLikeStemRepeat } from './optionStemLeak.js'
import { mergeAdjacentOptionTails, applyUploadQualityGuards } from './extendTruncatedStem.js'
import { restoreStructureLabels } from './structureLabels.js'
import { mixedSmilesFigureOptions } from './labelledFigureOptions.js'
import {
  flattenTabularMatchLists,
  looksLikeMatchingListStem,
  normalizeMatchAnswerKey,
  rewriteLatexItemLabels,
} from './parseMatchingListDisplay.js'
import { detectAnswerFromPaper } from './answerProvenance.js'
import { annotateMathpixCleanStatus, cleanMathpixCardText, preCleanMathpixOcr } from './mathpixCleanPipeline.js'
import { stripLeakedOptionsFromStem } from './stripLeakedOptionsFromStem.js'
import {
  attachOfficialPyqPassages,
  looksLikeOfficialPyqPassageOnly,
  looksLikePyqParagraphHeader,
  parsePyqParagraphQuestionNums,
} from './passage.js'
import {
  looksLikeNumericalFillBlank,
  parsePaperSectionMap,
  sectionTypeForPrintedNumber,
} from './parsePaperSectionMap.js'
import { stripTrailingPyqSectionHeader } from './bulkExtractClean.js'
import { shapeOfficialPyqDrafts } from './officialPyqPaperFacts.js'
import { stripAwardedToAllNotes, stripPrintedAnswerBoxes } from './printedAnswerKey.js'
import { applyMatrixGridQuestions } from './matrixGridPyq.js'

function guessQuestionType(text, optionsFound) {
  if ((optionsFound ?? 0) >= 2) return 'single_correct'
  if (looksLikeNumericalFillBlank(text)) return 'numerical'
  if (/\binteger\b/i.test(text) || /\b(?:0\s*to\s*9|0-9)\b/i.test(text)) return 'integer'
  if (/\bnumerical\b/i.test(text) || /\bdecimal\b/i.test(text)) return 'numerical'
  return 'single_correct'
}

/** Fresh /g regexes each call — module-level /g keeps lastIndex and misses later papers. */
function itemQOutsideRe() {
  return /\\item\s*\[\s*Q\s*\.?\s*\]\s*(\d{1,3})\b/gi
}
function itemQInsideRe() {
  return /\\item\s*\[\s*Q\s*\.?\s*(\d{1,3})\s*\]/gi
}
function qDotLineRe() {
  return /(?:^|\n)\s*Q\s*\.?\s*(\d{1,3})\b/gi
}

/**
 * "END OF PART I : PHYSICS" / "PART II : CHEMISTRY" / "END OF THE QUESTION PAPER" between
 * subjects (2016 layout). A bare PART line must name its subject so "Part (i)" never cuts.
 */
const PART_BOUNDARY_SRC = String.raw`\\section\*?\{\s*(?:END\s+OF\s+(?:PART\b|THE\s+QUESTION\s+PAPER)|PART\s*[-\u2013\u2014]?\s*(?:IV|I{1,3}|[1-4])\b)|(?:^|\n)[ \t]*END\s+OF\s+(?:PART\s*[-\u2013\u2014]?\s*(?:IV|I{1,3}|[1-4])\b|THE\s+QUESTION\s+PAPER)|(?:^|\n)[ \t]*PART\s*[-\u2013\u2014]?\s*(?:IV|I{1,3}|[1-4])\s*[:\-\u2013\u2014]?\s*(?:PHYSICS|CHEMISTRY|MATHEMATICS|BIOLOGY)[ \t]*(?=\n|$)`

function sectionStartRe() {
  return new RegExp(String.raw`\\section\*?\{?\s*SECTION\b|(?:^|\n)\s*SECTION\s+\d+\s*\(|${PART_BOUNDARY_SRC}`, 'gi')
}

function paragraphStartRe() {
  return /(?:^|\n)\s*(?:\\section\*?\{[^}]*PARAGRAPH|PARAGRAPH\s*[“"'"]?[IVXL\d]|Paragraph\s+for\s+(?:Questions?|Q\.?)\s*\d|(?:Passage|Comprehension)\s*:)|(?:\\section\*?\{\s*)?Question\s+Stem\s+for\s+Question\s+Nos?\.?\s*\d{1,3}|(?:\\section\*?\{\s*)?Answer\s+Q\.?\s*\d{1,3}(?:\s*,\s*Q\.?\s*\d{1,3})*\s+and\s+Q\.?\s*\d{1,3}\s+by\s+appropriately\s+matching/gi
}

const SECTION_CUT_RE = new RegExp(
  String.raw`\\end\{itemize\}\s*(?=\\section\*?\{[^}]*SECTION|\\section\*?\{?\s*SECTION|\\begin\{itemize\}\s*\\item\[-\]|SECTION\s+\d+)|\\section\*?\{[^}]*SECTION|\\section\*?\{?\s*SECTION|(?:^|\n)\s*SECTION\s+\d+\s*\([^)]*Maximum Marks|(?:^|\n)\s*(?:PHYSICS|CHEMISTRY|MATHEMATICS|BIOLOGY)\s*(?:\n|\\section)|\bThis section contains\s+(?:TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|\d+)|${PART_BOUNDARY_SRC}`,
  'i',
)

const NEXT_LET_PI_RE =
  /(?:\$\$\s*)?(?:\\begin\{aligned\}[\s\S]{0,160})?(?:\\text\s*\{\s*)?Let(?:\s*\}|\s+)(?:\$\\frac\{\\pi\}|\\frac\{\\pi\}|\$\\pi)/i

const ALIGNED_LET_RE =
  /(?:\$\$\s*)?\\begin\{aligned\}[\s\S]{0,240}?(?:\\text\s*\{\s*Let\s*\}|\bLet\s+(?:\$|\\frac))/i

const CLOSER_THEN_OPENER_RE =
  /\b(?:is|equals|find)\s+(?=Let\s+(?:\$|\\)|If(?!\s+and\s+only\s+if)\s+\$|Consider\s+|Which\s+of\s+the|Suppose\s+|\$\$\s*\\begin\{aligned\}|\\begin\{aligned\}|\\text\s*\{\s*Let)/i

/** Next paper item — never either “if” in “if and only if” (that is option text). */
/**
 * "as a function of" / "of a function" is mid-sentence, not a new stem.
 * "A function f" at a question start still counts.
 */
const NEXT_ITEM_OPENER_RE =
  /\b(?:Let|(?<!and\s+only\s+)If(?!\s+and\s+only\s+if)|Which|Consider|Suppose|Match\s+(?:the|each)|For\s+the|How\s+many|What\s+is|The\s+value|An\s+integer|(?<!\b(?:as|of)\s)A\s+(?:particle|function|student|light ray|thin uniform|source\s*\()|Four identical|One mole of|The circuit shown|Q\s*\.?\s*\d)\b/i

/**
 * First NEXT_ITEM_OPENER_RE match that starts with a capital letter. A new paper item
 * never opens mid-sentence: "(D) For case I, if the joint is 5 cm…" is still option D.
 * @param {string} text
 */
function searchItemOpener(text) {
  const re = new RegExp(NEXT_ITEM_OPENER_RE.source, 'gi')
  let m
  while ((m = re.exec(String(text ?? ''))) !== null) {
    if (/[A-Z]/.test(m[0][0])) return m.index
    if (!m[0]) re.lastIndex += 1
  }
  return -1
}

/** New physics/chem stem glued after a finished match item (no Q. N marker). */
const NEXT_FULL_STEM_RE =
  /(?:^|\n)\s*(?=Four identical\b|A light ray is incident\b|A thin uniform rod\b|A source\s*\(\s*S\s*\)|One mole of a\b|The circuit shown in the figure\b|A parallel plate\b|Two identical thin\b)/i

/**
 * Strip replacement characters and un-smash `\mathbf{R}is`.
 * @param {unknown} raw
 */
export function sanitizeMathpixOcrText(raw) {
  return restoreGluedQuestionNumbers(
    preCleanMathpixOcr(
      stripPrintedAnswerBoxes(String(raw ?? ''))
        // A \begin{table} left before the next group's caption sticks to the last option.
        .replace(/\\(?:begin|end)\{table\}|\\captionsetup\{[^{}]*\}/g, '')
        // A page's running head "\section*{PHYSICS}" otherwise sticks to the last option of the page before.
        .replace(/^[ \t]*\\section\*?\{\s*(PHYSICS|CHEMISTRY|MATHEMATICS|BIOLOGY)\s*\}[ \t]*$/gm, '$1')
        .replace(/^\uFEFF/, '')
        .replace(/\uFFFD+/g, '')
        .replace(/\u0000/g, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/(\\[A-Za-z]+(?:\s*\{[^{}]*\})+)([A-Za-z])/g, '$1 $2')
        .replace(/[ \t]+\n/g, '\n')
        .trim(),
    ),
  )
}

/**
 * The scan glues the next question number to the stem: `\item[Q.] $8 \mathrm{H}_2S$`
 * (Q.8 inside the formula) or `Q. 1250 mL` (Q.12 then "50 mL"). The number that
 * follows the previous marker is split back out; other numbers are left alone.
 * @param {string} text
 */
export function restoreGluedQuestionNumbers(text) {
  let prev = 0
  return String(text ?? '').replace(
    /(\\item\s*\[\s*Q\s*\.?\s*(?:(\d{1,3})\s*)?\]\s*|(?:^|\n)[ \t]*Q\s*\.\s*)(\$[ \t]*)?(\d{1,5})?/g,
    (whole, marker, inside, dollar, digits, offset, str) => {
      if (inside) {
        prev = Number(inside)
        return whole
      }
      if (!digits) return whole
      const want = String(prev + 1)
      const next = String(str)
        .slice(offset + whole.length)
        .match(/\\item\s*\[\s*Q\s*\.?\s*(\d{1,3})?\s*\]\s*\$?(\d{1,3})?\b|\n[ \t]*Q\s*\.\s*(\d{1,3})\b/)
      const nextN = Number(next?.[1] ?? next?.[2] ?? next?.[3])
      // A bare "Q. $51|…" line (2017 P2) only counts when the next marker is 52.
      if (dollar && !/^\\item/.test(marker) && !(Number(digits) === prev + 1 && nextN === prev + 2)) return whole
      if (Number(digits) === prev + 1 && !(dollar && nextN === prev + 1)) {
        prev += 1
        return dollar ? `${marker}${digits} $` : whole
      }
      if (prev > 0 && nextN === prev + 2 && digits.length > want.length && digits.startsWith(want)) {
        prev += 1
        return `${marker}${want} ${dollar ?? ''}${digits.slice(want.length)}`
      }
      if (!dollar) prev = Number(digits)
      return whole
    },
  )
}

/**
 * Turn Mathpix `\\item[Q.]` markers into `Q. N` so existing bulk splitters work.
 * @param {unknown} raw
 */
/** Mathpix sets a question's first line as a heading: "\section*{Q. 15 The compound $\mathbf{Y}$ is}". */
function unwrapQuestionHeadings(text) {
  const open = /\\section\*?\{\s*(?=Q\s*\.?\s*\d{1,3}\b)/g
  let out = ''
  let from = 0
  let m
  while ((m = open.exec(text)) !== null) {
    let depth = 1
    let j = m.index + m[0].length
    for (; j < text.length && depth > 0; j += 1) {
      if (text[j] === '{' && text[j - 1] !== '\\') depth += 1
      else if (text[j] === '}' && text[j - 1] !== '\\') depth -= 1
    }
    if (depth !== 0) continue
    out += `${text.slice(from, m.index)}\n${text.slice(m.index + m[0].length, j - 1)}`
    from = j
    open.lastIndex = j
  }
  return out + text.slice(from)
}

export function normalizeMathpixQuestionMarkers(raw) {
  return unwrapQuestionHeadings(sanitizeMathpixOcrText(raw))
    .replace(itemQInsideRe(), '\n\nQ. $1 ')
    .replace(itemQOutsideRe(), '\n\nQ. $1 ')
}

function collectMarkerStarts(text) {
  const starts = []
  const seen = new Set()
  const push = (index) => {
    if (index < 0 || seen.has(index)) return
    seen.add(index)
    starts.push(index)
  }
  const scan = (re) => {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text)) !== null) {
      const at = m.index + (m[0].startsWith('\n') ? 1 : 0)
      push(text[at] === '\n' ? at + 1 : at)
    }
  }
  scan(itemQOutsideRe())
  scan(itemQInsideRe())
  scan(qDotLineRe())
  starts.sort((a, b) => a - b)
  return starts
}

function collectSectionStarts(text) {
  const starts = []
  const re = sectionStartRe()
  re.lastIndex = 0
  let m
  while ((m = re.exec(text)) !== null) {
    const at = m.index + (m[0].startsWith('\n') ? 1 : 0)
    starts.push(text[at] === '\n' ? at + 1 : at)
  }
  return starts
}

function collectParagraphStarts(text) {
  const starts = []
  const seen = new Set()
  const re = paragraphStartRe()
  re.lastIndex = 0
  let m
  while ((m = re.exec(text)) !== null) {
    const at = m.index + (m[0].startsWith('\n') ? 1 : 0)
    const i = text[at] === '\n' ? at + 1 : at
    if (seen.has(i)) continue
    seen.add(i)
    starts.push(i)
  }
  return starts
}

/** @param {unknown} raw */
export function countMathpixQuestionMarkers(raw) {
  return collectMarkerStarts(restoreGluedQuestionNumbers(stripAwardedToAllNotes(raw))).length
}

/** "[A] text" in the A slot: the card already draws the letter. "(A) only" is the option's own words. */
export function stripOwnOptionLabel(opt, index) {
  const s = String(opt ?? '')
  const letter = 'ABCD'[index]
  if (!letter) return s
  const m = s.match(/^\s*(?:\[\s*([A-D])\s*\]|\(\s*([A-D])\s*\)(?=\s)|([A-D])\s*[.:)](?=\s))\s*/)
  if (!m || (m[1] || m[2] || m[3]) !== letter) return s
  const rest = s.slice(m[0].length)
  if (!rest.trim() || /^(?:only|and|or|both|,|&|→|-|\\rightarrow)/i.test(rest)) return s
  return rest
}

function stripKeyLeak(opt) {
  return String(opt ?? '')
    .replace(/\(\s*key\s*\)/gi, '')
    .replace(/^\s*&+\s*/g, '')
    .replace(/\s*&+\s*$/g, '')
    .replace(/\$\$\s*\\?\s*\\hline\s*\$*/gi, ' ')
    .replace(/\\\$\s*\\+\s*\\hline[\s\S]*$/gi, '')
    .replace(/\\hline\s*(?:\\end\{tabular\})?[\s\S]*$/gi, '')
    .replace(/\\end\{tabular\}[\s\S]*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Cut SECTION / itemize instruction dumps off a stem. Those stay as instructions.
 * @param {unknown} raw
 * @returns {{ stem: string, instructionText: string }}
 */
export function stripSectionAndItemizeFromStem(raw) {
  const t = String(raw ?? '')
  const at = t.search(SECTION_CUT_RE)
  if (at > 24) {
    return { stem: t.slice(0, at).trim(), instructionText: t.slice(at).trim() }
  }
  return {
    stem: t
      .replace(/\s*\\begin\{itemize\}\s*(?:\\item\s*\[[^\]]*\]\s*)?$/i, '')
      .trim(),
    instructionText: '',
  }
}

/** Leftover Mathpix list commands must not show as red KaTeX errors. Keep (P)/(A) labels. */
export function stripVisibleItemizeCommands(raw) {
  return rewriteLatexItemLabels(raw)
    .replace(/---\s*page\s*---/gi, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .trim()
}

/**
 * Mathpix MSQ options often arrive as \\begin{itemize}\\item[ ... \\item[] ...
 * Turn that into a clean stem + A–D options. Ignore \\item[Q.] and SECTION lists.
 * @param {unknown} raw
 * @returns {{ stem: string, options: string[] } | null}
 */
export function extractSmilesOptionChunks(raw) {
  return [...String(raw ?? '').matchAll(/<smiles>\s*([\s\S]*?)\s*<\/smiles>/gi)]
    .map((m) => String(m[1] ?? '').trim())
    .filter(Boolean)
}

/**
 * Drop option-table row breaks (\\ \hline) without eating \\ inside a matrix or gathered block.
 * @param {unknown} cell
 */
function cleanTabularOptionCell(cell) {
  const slots = []
  const parked = String(cell ?? '').replace(
    /\\begin\{(array|gathered|aligned|align\*?|cases|bmatrix|pmatrix|vmatrix|matrix|tabular)\}[\s\S]*?\\end\{\1\}/gi,
    (block) => {
      const i = slots.length
      slots.push(block)
      return `\uE000${i}\uE001`
    },
  )
  let out = parked
    .replace(/\\hline/gi, ' ')
    .replace(/\\\\/g, ' ')
    .replace(/&\s*$/g, '')
    .replace(/^\s*&+\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  out = out.replace(/\uE000(\d+)\uE001/g, (_, n) => slots[Number(n)] ?? '')
  out = normalizeMatchAnswerKey(out)
  return out.replace(/[ \t]{2,}/g, ' ').trim()
}

/**
 * Mathpix often emits A–D choices as a two-column tabular: (A) & text \\ \hline (B) & …
 * Peel those into real options; leave true List-I/II tabulars alone.
 * @param {unknown} raw
 * @returns {{ stem: string, options: string[] } | null}
 */
export function extractLatexTabularMcq(raw) {
  const t = String(raw ?? '')
  const beginAt = t.search(/\\begin\{tabular\}/i)
  if (beginAt < 0) return null
  // Skip when the tabular itself is List-I/II (match columns), not A–D choices.
  if (/List-I|List-II|Column\s*I\b/i.test(t.slice(beginAt, beginAt + 220))) {
    return null
  }
  const beginM = t.slice(beginAt).match(/\\begin\{tabular\}(?:\[[^\]]*\])?(?:\{[^}]*\})?/i)
  if (!beginM) return null
  const bodyStart = beginAt + beginM[0].length
  const rest = t.slice(bodyStart)
  let endRel = rest.search(/\\end\{tabular\}/i)
  if (endRel < 0) endRel = rest.length
  const body = rest.slice(0, endRel)
  const letterHits = [
    ...body.matchAll(
      /(?:\\hline\s*)?\(\s*([A-D])\s*\)\s*&([\s\S]*?)(?=(?:\\hline\s*)?\(\s*[A-D]\s*\)\s*&|\\end\{tabular\}|$)/gi,
    ),
  ]
  if (letterHits.length < 2) return null
  if (/\(\s*[PQRS]\s*\)/i.test(body) && letterHits.length < 3) return null
  const options = letterHits
    .slice(0, 4)
    .map((m) => cleanTabularOptionCell(m[2]))
    .filter((o) => o.length >= 1)
  if (options.length < 2) return null
  // Prefer mapping-style options when this is a match card; reject if bodies look like List rows.
  if (options.filter((o) => /P\s*(?:→|\\rightarrow|->)/i.test(o)).length >= 2) {
    /* match A–D mappings — keep */
  } else if (options.some((o) => /^\(\s*[PQRS1-5]\s*\)/i.test(o) || /<smiles>/i.test(o))) {
    return null
  }
  const stem = stripVisibleItemizeCommands(
    stripSectionAndItemizeFromStem(t.slice(0, beginAt)).stem,
  )
  if (stem.length < 12) return null
  return { stem, options: restoreMissingOptionGridGraphs(options) }
}

/**
 * Numbered reagent steps under a reaction-sequence stem are the question,
 * not A–D choices. A real (A)–(D) table in the same block is left for the
 * tabular peel. Does not invent a missing step.
 * @param {string} raw
 * @returns {string | null}
 */
function foldNumberedReactionSequence(raw) {
  const t = String(raw ?? '')
  if (!/reaction\s+sequence/i.test(t) || !/major\s+products/i.test(t)) return null
  if (/\\begin\{tabular\}[\s\S]{0,1200}\(\s*A\s*\)\s*&/i.test(t)) return null
  const hasArrow = /\\(?:xrightarrow|rightarrow|longrightarrow)|→/.test(t)
  const hasBlank = /_{2,}|(?:\\_){2,}|\\_{2,}/.test(t)
  if (!hasArrow && !hasBlank) return null
  const beginAt = t.search(/\\begin\{itemize\}/i)
  if (beginAt < 0) return null
  const afterBegin = t.slice(beginAt)
  const endRel = afterBegin.search(/\\end\{itemize\}/i)
  if (endRel < 0) return null
  const open = afterBegin.match(/\\begin\{itemize\}/i)
  const listBody = afterBegin.slice(open ? open[0].length : 0, endRel)
  if (/\\item\s*\[\s*\(?\s*[A-D]\s*\)?\s*\]/i.test(listBody)) return null
  const steps = []
  const itemRe = /\\item\s*\[\s*(\d+)\s*[.)]\s*\]\s*([\s\S]*?)(?=\\item\s*\[|$)/gi
  let m
  while ((m = itemRe.exec(listBody)) !== null) {
    const body = String(m[2] ?? '').replace(/\\begin\{itemize\}/gi, '').trim()
    if (body) steps.push(`${m[1]}. ${body}`)
  }
  if (steps.length < 2) return null
  let after = afterBegin.slice(endRel).replace(/^\\end\{itemize\}/i, '')
  after = after.replace(/\\(?:begin|end)\{itemize\}/gi, '\n')
  const stem = `${t.slice(0, beginAt).trim()}\n${steps.join('\n')}\n${after.trim()}`
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return stem
}

/** Steps already written as "1. KCN" after the first peel. Do not peel them again. */
function stemAlreadyHasNumberedReactionSteps(raw) {
  const t = String(raw ?? '')
  if (!/reaction\s+sequence/i.test(t) || !/major\s+products/i.test(t)) return false
  if (/\\begin\{tabular\}[\s\S]{0,1200}\(\s*A\s*\)\s*&/i.test(t)) return false
  const steps = t.match(/(?:^|\n)\s*(?:\(\s*)?\d{1,2}\s*[.)]\s+\S/g) || []
  if (steps.length < 2) return false
  const hasArrow = /\\(?:xrightarrow|rightarrow|longrightarrow)|→/.test(t)
  const hasBlank = /_{2,}|(?:\\_){2,}|\\_{2,}|_{4,}|____/.test(t)
  return hasArrow || hasBlank
}

/** Options that are the numbered steps, or the numerical ask glued onto the last step. */
function optionsArePeeledReactionSteps(options, stem) {
  const filled = (Array.isArray(options) ? options : [])
    .map((o) => String(o ?? '').trim())
    .filter(Boolean)
  if (!filled.length) return true
  if (filled.some((o) => /completely reacts|in grams is|500 mol/i.test(o))) return true
  const stepLines = [...String(stem ?? '').replace(/\$+/g, '').matchAll(/(?:^|\n)\s*(?:\(\s*)?\d{1,2}\s*[.)]\s+([^\n]+)/g)].map(
    (row) => row[1].replace(/\s+/g, ' ').trim(),
  )
  if (!stepLines.length) return false
  return filled.every((o) => {
    const bare = o.replace(/\$+/g, '').replace(/\s+/g, ' ').trim()
    return stepLines.some((line) => line.includes(bare) || bare.includes(line))
  })
}

/** A table inside one \item option (P = … | R = … | U = …) becomes one line, so the option is not cut at \hline. */
function inlineOptionTabulars(opt) {
  let s = String(opt ?? '')
  const inner =
    /\\begin\{tabular\}(?:\s*\[[^\]]*\])?(?:\s*\{[^{}]*\})?((?:(?!\\begin\{tabular\})[\s\S])*?)\\end\{tabular\}/i
  for (let n = 0; n < 6 && inner.test(s); n += 1) {
    s = s.replace(inner, (_, body) => {
      const rows = splitTabularRows(body).map((row) =>
        row.split('&').map((c) => c.replace(/\\hline/gi, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean),
      )
      return ` ${rows.map((cells) => cells.join('; ')).filter(Boolean).join(' ')} `
    })
  }
  return s.replace(/[ \t]{2,}/g, ' ').trim()
}

function splitTabularRows(body) {
  return String(body ?? '').split(/\\\\(?![a-zA-Z])/)
}

export function extractLatexItemizeMcq(raw) {
  const t = String(raw ?? '').replace(/\\item\s*\[\s*Q[^\]]*\]\s*\d{0,3}\s*/gi, '')
  if (/\\item\s*\[\s*-\s*\]/.test(t) && /this section contains|maximum marks/i.test(t)) {
    return null
  }
  const tabularMcq = extractLatexTabularMcq(t)
  if (tabularMcq) return tabularMcq
  const folded = foldNumberedReactionSequence(t)
  if (folded) {
    const cut = stripSectionAndItemizeFromStem(folded)
    return {
      stem: stripVisibleItemizeCommands(cut.stem),
      options: [],
      reactionStepsInStem: true,
    }
  }
  const beginAt = t.search(/\\begin\{itemize\}/i)
  const hasItem = /\\item\s*\[/.test(t) || /\\item\b/.test(t)
  if (beginAt < 0 && !hasItem) return null
  if (beginAt < 0 && (t.match(/\\item\b/gi) || []).length < 2) return null

  const head = beginAt >= 0 ? t.slice(0, beginAt) : t.replace(/\\item[\s\S]*$/i, '')
  const tail = beginAt >= 0 ? t.slice(beginAt) : t
  const parts = tail
    .replace(/\\begin\{itemize\}/gi, '')
    .replace(/\\end\{itemize\}/gi, '')
    .split(/\\item\s*(?:\[[^\]]*\]\s*)?/i)
    .map((p) =>
      p
        .replace(/^\s*\]\s*/, '')
        .replace(/^\s*[A-D]\s*[\.\:\)]\s*\]?\s*/i, '')
        .trim(),
    )
    .filter((p) => p.length >= 1 && !looksLikeMarkingSchemeOption(p) && !/^\\?(?:section)/i.test(p))

  if (parts.length < 2) return null
  if (/PARAGRAPH/i.test(t) && /two questions based on/i.test(t)) return null
  const romanItem = (tail.match(/\\item\s*\[\s*\(?\s*(?:i{1,3}|iv|v|vi)\s*\)?\s*[\.\]]/gi) || []).length
  const romanParts = parts.filter((p) =>
    /^(?:i{1,3}|iv|v|vi)[\.\):]/i.test(p) || /exactly \d+ elements/i.test(p),
  ).length
  if (romanItem >= 2 || romanParts >= 2) return null
  const labeledListRows = parts.filter((p) => /^\(\s*[PQRS]\s*\)/i.test(p) || /Titrate\s*:/i.test(p)).length
  const itemListLabels = (tail.match(/\\item\s*\[\s*\(?\s*[PQRS]\s*\)?\s*\]/gi) || []).length
  if (labeledListRows >= 2 || itemListLabels >= 2) return null
  const cut = stripSectionAndItemizeFromStem(head)
  const stem = stripVisibleItemizeCommands(cut.stem)
  if (stem.length < 12) return null
  return {
    stem,
    options: parts.slice(0, 4).map(inlineOptionTabulars).map(stripVisibleItemizeCommands).map(stripOwnOptionLabel),
  }
}

function startOfSecondStem(text, letIndex) {
  const before = String(text ?? '').slice(0, letIndex)
  const beginAt = before.toLowerCase().lastIndexOf('\\begin{aligned}')
  if (beginAt >= 0 && !/\\end\{aligned\}/i.test(before.slice(beginAt))) {
    const dollar = before.lastIndexOf('$$', beginAt)
    if (dollar >= 0 && beginAt - dollar <= 8) return dollar
    return beginAt
  }
  return letIndex
}

function looksLikeCasesContinuation(before, after) {
  const head = String(before ?? '')
  const tail = String(after ?? '')
  if (/\\begin\{cases\}|\\end\{cases\}/.test(head) && /^\s*If\b/i.test(tail)) {
    if (/differentiab|continuous|then\s+the\s+value|then\s+\|/i.test(tail.slice(0, 180))) {
      return true
    }
  }
  if (/\$\$\s*$/.test(head.trim()) && /^\s*If\s+\$?f\s*\(/i.test(tail)) return true
  return false
}

function looksLikeAlsoLetOrAndLet(head, next) {
  const h = String(head ?? '')
  const n = String(next ?? '').trim()
  if (/^also\s+let\b/i.test(n) || /^and\s+let\b/i.test(n)) return true
  if (/\b(?:and|also)\s+$/i.test(h) && /^let\b/i.test(n)) return true
  return false
}

function looksLikeMatchRowLet(head, next) {
  const h = String(head ?? '')
  const n = String(next ?? '').trim()
  if (/^\(\s*[PQRS]\s*\)\s/.test(n) && /\b(?:Let|If)\b/i.test(n.slice(0, 48))) return true
  if (/\(\s*[PQRS]\s*\)\s*$/i.test(h) && /^(?:Let|If)\b/i.test(n)) return true
  if (
    /match\s+(?:the\s+)?(?:quantities|entries)|(?:List|Column)\s*[-–]?\s*I\b/i.test(h) &&
    /^(?:Let|If)\b/i.test(n) &&
    /\(\s*[QRS]\s*\)/.test(n) &&
    !/^\s*(?:Q\s*\.?\s*\d|\d{1,2}[\.\)])/i.test(n)
  ) {
    return true
  }
  if (
    /(?:List|Column)\s*[-–]?\s*I\b/i.test(h) &&
    /\(\s*[PQRS]\s*\)/.test(h) &&
    /^(?:Let|If)\b/i.test(n) &&
    !/^\s*(?:Q\s*\.?\s*\d|\d{1,2}[\.\)])/i.test(n)
  ) {
    return true
  }
  return false
}

function samePrintedQuestionNumber(head, next) {
  const a = String(head ?? '').match(/(?:\\item\s*\[\s*Q[^\]]*\]\s*|Q\s*\.?\s*)(\d{1,3})\b/i)
  const b = String(next ?? '').match(/^\s*(?:\\item\s*\[\s*Q[^\]]*\]\s*|Q\s*\.?\s*)(\d{1,3})\b/i)
  if (!a || !b) return false
  return Number(a[1]) === Number(b[1])
}

/** Let/If inside a JEE Adv paragraph is setup, not a new paper item. */
function looksLikeInsidePyqParagraph(head, next) {
  const h = String(head ?? '')
  const n = String(next ?? '').trim()
  if (!looksLikePyqParagraphHeader(h) && !/Paragraph\s+for\s+(?:Questions?|Q\.?)\s*\d/i.test(h)) {
    return false
  }
  const nums = parsePyqParagraphQuestionNums(h)
  const nextNum = n.match(/^(?:\\item\s*\[\s*Q[^\]]*\]\s*|Q\s*\.?\s*)(\d{1,3})\b/i)
  if (nextNum && nums.includes(Number(nextNum[1]))) return false
  if (/^(?:\\item\s*\[\s*Q|Q\s*\.?\s*\d{1,3}\b|\d{1,2}[\.\)]\s+)/i.test(n)) return false
  return true
}

/**
 * Match stem ends at "choose the correct option" but List-I rows were not OCR'd yet —
 * a following "If $n=2$…" is still that match item (often a dropped (P) row), not a new Q.
 */
function looksLikeOrphanMatchListTail(head, next) {
  const h = String(head ?? '')
  const n = String(next ?? '').trim()
  if (!/Match\s+(?:the|each)\b/i.test(h) && !/(?:List|Column)\s*[-–]?\s*I\b/i.test(h)) {
    return false
  }
  if (/\(\s*[PQRS]\s*\)/.test(h) || /\\item\s*\[\s*\(?[PQRS]\s*\)?\s*\]/i.test(h)) {
    return false
  }
  if (/^\s*(?:Q\s*\.?\s*\d|\d{1,2}[\.\)])/i.test(n)) return false
  if (NEXT_FULL_STEM_RE.test(`\n${n}`)) return false
  return /^(?:\(\s*[PQRS]\s*\)|\\item\s*\[\s*\(?[PQRS]\s*\)?\s*\]|If\s+\$|If\s+n\s*=)/i.test(n)
}

/** Option cells inside an open tabular are not the next question. */
function looksLikeInsideTabularOption(head, next) {
  const h = String(head ?? '')
  const n = String(next ?? '')
  const begins = (h.match(/\\begin\{tabular\}/gi) || []).length
  const ends = (h.match(/\\end\{tabular\}/gi) || []).length
  if (begins > ends) return true
  if (/\\hline\s*$/i.test(h.trim()) && /^\s*(?:If|Let|The|For)\b/.test(n.trim())) return true
  if (/\\end\{tabular\}/i.test(n) && /\\hline|\\begin\{tabular\}/i.test(h)) return true
  return false
}

/** `\item[(D)] If …` is the option itself, not the next paper item. */
function looksLikeItemizedOptionBody(head) {
  return /\\item\s*\[\s*\(\s*[A-D]\s*\)\s*\]\s*$/i.test(String(head ?? '').trimEnd())
}

/** True when a Let/If cut would tear ONE question into two cards. */
function shouldRefuseSplit(head, next) {
  return (
    looksLikeCasesContinuation(head, next) ||
    looksLikeInsideTabularOption(head, next) ||
    looksLikeItemizedOptionBody(head) ||
    /\band\s+$/i.test(String(head ?? '')) ||
    looksLikeAlsoLetOrAndLet(head, next) ||
    looksLikeMatchRowLet(head, next) ||
    looksLikeOrphanMatchListTail(head, next) ||
    samePrintedQuestionNumber(head, next) ||
    looksLikeInsidePyqParagraph(head, next) ||
    looksLikeStemBeforeItsOptions(head, next) ||
    looksLikeSetupBeforeItsQuestion(head, next)
  )
}

const FIGURE_LINK_RE = /!\[[^\]]*\]\([^)]*\)|\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/g

/** "The figure below is the plot of … [figure]" then "What is the value …" — one question. */
function looksLikeSetupBeforeItsQuestion(head, next) {
  const prose = String(head ?? '').replace(FIGURE_LINK_RE, ' ').replace(/^\s*Q\s*\.?\s*\d{1,3}\s*/i, '').trim()
  if (!prose || /\?/.test(prose) || OPTION_A_RE.test(prose)) return false
  if (!/\b(?:figure|graph|plot|diagram|scheme)\s+(?:below|shown)|\b(?:shown|given)\s+below\b/i.test(prose)) return false
  if (/\b(?:find|calculate|determine|what|which|how|is equal to|choose|select|evaluate|value of)\b/i.test(prose)) return false
  return /^\s*(?:What|Which|How|Find|Calculate|Determine)\b/.test(String(next ?? ''))
}

const OPTION_A_RE = /\(\s*A\s*\)|\\item\s*\[\s*\(?\s*A\s*\)?\s*\]/i

/** "Choose the correct option(s) … [figure] Consider Q, R and S …" — A–D still to come, same question. */
function looksLikeStemBeforeItsOptions(head, next) {
  const h = String(head ?? '')
  if (!/\b(?:choose the correct option|which of the following)/i.test(h) || OPTION_A_RE.test(h)) return false
  const n = String(next ?? '')
  const optAt = n.search(OPTION_A_RE)
  if (optAt < 0 || optAt > 400) return false
  const qAt = n.slice(1).search(/\n\s*Q\s*\.?\s*\d{1,3}\b|\\item\s*\[\s*Q\s*\.?\s*(?:\d{1,3}\s*\]|\]\s*\$?\s*\d)/i)
  return qAt < 0 || optAt <= qAt + 1
}

function firstStemLooksFinished(head) {
  const t = String(head ?? '').trim()
  if (t.length < 20) return false
  if (/\?\s*$/.test(t) && t.length >= 20) return true
  if (t.length < 36) return false
  if (/\(\s*A\s*\)[\s\S]{8,1200}\(\s*B\s*\)/i.test(t)) return true
  if (/\(\s*A\s*\)[\s\S]{8,800}\(\s*D\s*\)/i.test(t)) return true
  if (t.length >= 36 && /\b(?:is|equals|find)\s*$/i.test(t)) return true
  if (/\bis equal to\s*(?:_{2,}|_{1,})?\s*$/i.test(t)) return true
  if (/\b(?:is|equals|find)\s+(?:\$\$|\\begin\{aligned\}|\\text\s*\{)/i.test(t)) return true
  const beforeDisplay = t.replace(/\s*(?:\$\$|\\begin\{aligned\})[\s\S]*$/i, '').trim()
  if (beforeDisplay.length >= 36 && /\b(?:is|equals|find)\s*$/i.test(beforeDisplay)) return true
  if (t.length >= 80 && /\bprobability\b/i.test(t) && /\bstudent\b/i.test(t)) return true
  const prose = t.replace(/!\[[^\]]*\]\([^)]*\)|\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/g, ' ').trim()
  if (prose.length >= 80 && /choose the correct option/i.test(prose)) return true
  if (t.length >= 80 && /\bis equal to\b/i.test(t) && /\b(?:figure|Case)\b/i.test(t)) return true
  return false
}

/**
 * Index where a second paper item was glued onto this stem, or -1.
 * Never splits piecewise "If f(x) is differentiable" after a cases block.
 * @param {unknown} raw
 */
export function findGluedNextQuestionStart(raw) {
  const t = String(raw ?? '')
  if (t.length < 48) return -1

  const midPara = t.slice(40).search(/\n\s*(?:\\section\*?\{[^}]*PARAGRAPH|PARAGRAPH\s*[“"'"]?[IVXL\d]|Paragraph\s+for\s+(?:Questions?|Q\.?)\s*\d|(?:Passage|Comprehension)\s*:)|(?:\\section\*?\{\s*)?Question\s+Stem\s+for\s+Question\s+Nos?\.?\s*\d{1,3}|(?:\\section\*?\{\s*)?Answer\s+Q\.?\s*\d{1,3}(?:\s*,\s*Q\.?\s*\d{1,3})*\s+and\s+Q\.?\s*\d{1,3}\s+by\s+appropriately\s+matching/i)
  if (midPara >= 0) {
    const abs = 40 + midPara
    const head = t.slice(0, abs)
    const next = t.slice(abs)
    if (head.trim().length >= 24 && !shouldRefuseSplit(head, next)) return abs
  }

  const midItem = t.slice(40).search(/\\item\s*\[\s*Q\s*\.?\s*(?:\d{1,3}\s*\]|\]\s*\$?\s*\d)/i)
  if (midItem >= 0) {
    const abs = 40 + midItem
    if (!shouldRefuseSplit(t.slice(0, abs), t.slice(abs))) return abs
  }

  const midQ = t.slice(40).search(/\n\s*Q\s*\.?\s*\d{1,3}\b/)
  if (midQ >= 0) {
    const abs = 40 + midQ
    const head = t.slice(0, abs)
    const next = t.slice(abs)
    if (!shouldRefuseSplit(head, next)) return abs
  }

  const midFull = t.slice(60).search(NEXT_FULL_STEM_RE)
  if (midFull >= 0) {
    let abs = 60 + midFull
    while (abs < t.length && /\s/.test(t[abs])) abs += 1
    const head = t.slice(0, abs)
    const next = t.slice(abs)
    if (
      abs >= 80 &&
      next.trim().length >= 60 &&
      (firstStemLooksFinished(head) ||
        /choose the correct option/i.test(head) ||
        /\bas shown in (?:the )?(?:figure|P-T|P-V|Case)/i.test(head)) &&
      !shouldRefuseSplit(head, next)
    ) {
      return abs
    }
  }

  const midNum = t.slice(60).search(
    /\n\s*\d{1,2}[\.\)]\s+(?:Let|(?<!and\s+only\s+)If(?!\s+and\s+only\s+if)|Which|Consider|Suppose|For the|How many|The value|An integer|A student|A function|Match)\b/,
  )
  if (midNum >= 0) {
    const abs = 60 + midNum
    const head = t.slice(0, abs)
    const next = t.slice(abs)
    if (firstStemLooksFinished(head) && !shouldRefuseSplit(head, next)) {
      return startOfSecondStem(t, abs)
    }
  }

  const afterD = t.search(
    /\(\s*D\s*\)[\s\S]{0,500}?(?=\s(?:Let|(?<!and\s+only\s+)If(?!\s+and\s+only\s+if)|Which|Consider|Suppose|Match|For\s+the|How\s+many|What\s+is|The\s+value|An\s+integer|(?<!\b(?:as|of)\s)A\s+(?:particle|function|student)|Q\s*\.?\s*\d)\b)/i,
  )
  if (afterD >= 0) {
    const tail = t.slice(afterD)
    const dEnd = tail.search(/\(\s*D\s*\)/)
    const restFrom = dEnd >= 0 ? dEnd + 3 : 0
    const rest = tail.slice(restFrom)
    let opener = searchItemOpener(rest)
    const bodyStart = rest.search(/\S/)
    if (opener >= 0 && opener <= bodyStart) {
      // "(D) If the surface of the bubble…" — the opener is option D's own first word.
      const lineEnd = rest.indexOf('\n', bodyStart)
      const later = lineEnd >= 0 ? searchItemOpener(rest.slice(lineEnd)) : -1
      opener = later >= 0 ? lineEnd + later : -1
    }
    if (opener >= 0) {
      const abs = afterD + restFrom + opener
      const head = t.slice(0, abs)
      const next = t.slice(abs)
      if (abs > 40 && !shouldRefuseSplit(head, next)) {
        return startOfSecondStem(t, abs)
      }
    }
  }

  // Options already peeled: "…true?\nFor the reaction…" still needs a split.
  // Do not open on bare "If $" — that is often a Match List-I row after OCR dropped (P).
  const midOpener = t.search(
    /\n(?=(?:For the|Which of|Consider|Suppose|Match\s+(?:the|each)|Let\s+\$)\b)/i,
  )
  if (midOpener >= 12) {
    const head = t.slice(0, midOpener)
    const next = t.slice(midOpener + 1)
    if (
      firstStemLooksFinished(head) &&
      next.trim().length >= 20 &&
      !shouldRefuseSplit(head, next)
    ) {
      return midOpener + 1
    }
  }

  const closer = t.search(CLOSER_THEN_OPENER_RE)
  if (closer >= 20) {
    const afterWord = searchItemOpener(t.slice(closer))
    if (afterWord >= 0) {
      const abs = closer + afterWord
      const head = t.slice(0, abs)
      const next = t.slice(abs)
      if (firstStemLooksFinished(head) && !shouldRefuseSplit(head, next)) {
        return startOfSecondStem(t, abs)
      }
    }
  }

  const slice = t.slice(80)
  const m = slice.match(NEXT_LET_PI_RE) || slice.match(ALIGNED_LET_RE)
  if (m && m.index != null) {
    const abs = 80 + m.index
    const head = t.slice(0, abs)
    const next = t.slice(abs)
    if (firstStemLooksFinished(head) && !shouldRefuseSplit(head, next)) {
      return startOfSecondStem(t, abs)
    }
  }

  return -1
}

function pullQuestionStemsFromDump(dump) {
  const t = String(dump ?? '').trim()
  if (t.length < 24) return { stems: [], instructionText: t }
  const starts = collectMarkerStarts(t)
  if (starts.length) {
    const stems = []
    for (let i = 0; i < starts.length; i++) {
      const chunk = t.slice(starts[i], starts[i + 1]).trim()
      if (keepMathpixQuestionBlock(chunk)) stems.push(chunk)
    }
    const instr = starts[0] > 12 ? t.slice(0, starts[0]).trim() : ''
    return { stems, instructionText: instr }
  }
  if (!/this section contains|maximum marks|\\section|SECTION\s+\d+/i.test(t.slice(0, 500))) {
    return { stems: [], instructionText: t }
  }
  const opener = t.search(/\b(?:Let|If|Which|Consider|Suppose)\s+(?:\$|\\|[A-Z])/)
  if (opener >= 20) {
    const rest = t.slice(opener).trim()
    if (rest.length >= 24 && !looksLikeInstructionOnly(rest)) {
      return { stems: [rest], instructionText: t.slice(0, opener).trim() }
    }
  }
  return { stems: [], instructionText: t }
}

function splitStemChain(stem) {
  const stems = []
  let rest = String(stem ?? '').trim()
  let extraInstr = ''
  let guard = 0
  while (rest && guard++ < 8) {
    const at = findGluedNextQuestionStart(rest)
    if (at < 24) {
      stems.push(rest)
      break
    }
    const head = rest.slice(0, at).trim()
    rest = rest.slice(at).trim()
    if (head.length >= 24) stems.push(head)
    const more = stripSectionAndItemizeFromStem(rest)
    rest = more.stem
    if (more.instructionText) {
      extraInstr = [extraInstr, more.instructionText].filter(Boolean).join('\n\n')
    }
  }
  return { stems: stems.filter((s) => s.length >= 12), instructionText: extraInstr }
}

/**
 * @param {unknown} raw
 * @returns {{ stems: string[], instructionText: string }}
 */
export function splitGluedPaperItemText(raw) {
  const first = stripSectionAndItemizeFromStem(raw)
  const chain = splitStemChain(first.stem)
  const pulled = pullQuestionStemsFromDump(first.instructionText)
  const pulledChains = pulled.stems.flatMap((s) => splitStemChain(s).stems)
  const stems = [...chain.stems, ...pulledChains]
  const instr = [chain.instructionText, pulled.instructionText].filter(Boolean).join('\n\n')
  return { stems: stems.filter((s) => s.length >= 12), instructionText: instr }
}

/** Marking-scheme / answer-key rows are not A–D options. */
export function looksLikeMarkingSchemeOption(opt) {
  const t = stripKeyLeak(opt)
  if (!t) return false
  if (/\bwill get\s*[+\-]?\d+\s*marks?\b/i.test(t)) return true
  if (/\b(?:full marks|zero marks|negative marks|unanswered)\b/i.test(t) && /\bmark/i.test(t)) {
    return true
  }
  if (/\bchoosing ONLY\b/i.test(t)) return true
  return false
}

function looksLikePrintedAnswerKeyOption(opt) {
  const t = stripKeyLeak(opt)
  return (
    /\(\s*P\s*\)\s*[→\->\\]/.test(t) &&
    !/\\frac|\\sqrt|\\pi/.test(t) &&
    t.length < 160
  )
}

function keepMathpixQuestionBlock(stem) {
  const t = String(stem ?? '').trim()
  if (t.length < 8) return false
  if (looksLikeOfficialPyqPassageOnly(t)) return true
  const numbered = extractMathpixQuestionNumber(t)
  // Orphan option / itemize tails (e.g. "for the composite string.\n\end{itemize}")
  if (!numbered) {
    if (/^\\end\{itemize\}/i.test(t)) return false
    if (t.length < 160 && /\\end\{itemize\}\s*$/i.test(t) && !/\(\s*[A-D]\s*\)/i.test(t)) {
      return false
    }
    if (
      t.length < 120 &&
      /^(?:for the |with (?:a |an )?|and |including |respectively)\b/i.test(t) &&
      !/\b(?:Let|If|Which|Consider|Suppose|Match|(?<!\b(?:as|of)\s)A\s+(?:particle|function|student))\b/i.test(t)
    ) {
      return false
    }
  }
  if (!looksLikeInstructionOnly(t)) return t.length >= 12 || Boolean(numbered)
  if (!numbered) return false
  const body = stripMathpixQuestionMarker(t)
  if (body.length >= 24) return true
  return /\b(?:Let|If|Which|Consider|Suppose|Match|(?<!\b(?:as|of)\s)A\s+(?:particle|function|student))\b/i.test(body)
}

function looksLikeInstructionOnly(text) {
  const t = String(text ?? '').trim()
  if (!t) return true
  if (
    /match\s+each\s+entry|(?:List|Column)\s*[-–]?\s*I(?!I)\b|\\begin\{tabular\}/i.test(t) &&
    !/\bthis section contains\b/i.test(t)
  ) {
    return false
  }
  if (/^\\?(?:end\{itemize\}|section\*?|begin\{itemize\})/i.test(t)) return true
  if (/^\s*SECTION\s+\d+/i.test(t) && /this section contains|maximum marks/i.test(t)) return true
  if (
    /\bthis section contains\b/i.test(t) &&
    t.length < 400 &&
    !/\b(?:Let|If|Consider)\b/.test(t.slice(0, 80))
  ) {
    return true
  }
  return false
}

/**
 * If selectable options are marking-scheme junk, recover (A)–(D) from the stem.
 * @param {string} stem
 * @param {unknown[]} [options]
 */
function labelledLineOptions(raw) {
  const t = String(raw ?? '')
  const marks = [...t.matchAll(/(?:^|\n)[ \t]*(?:\\item\s*)?\(\s*([A-D])\s*\)[ \t]*/g)]
  if (marks.length !== 4 || marks.map((m) => m[1]).join('') !== 'ABCD') return null
  const options = marks.map((m, k) => {
    const lines = t
      .slice(m.index + m[0].length, k < 3 ? marks[k + 1].index : undefined)
      .replace(/\\end\{itemize\}[\s\S]*$/, '')
      .split('\n')
    const keep = [lines[0]]
    for (const line of lines.slice(1)) {
      if (!/^\s*(?:<smiles>|!\[|\\includegraphics)/i.test(line)) break
      keep.push(line)
    }
    return keep.join('\n').trim()
  })
  if (options.filter(Boolean).length < 3) return null
  return { stem: stripVisibleItemizeCommands(t.slice(0, marks[0].index).trim()), options }
}

function peelSmilesAsOptions(raw) {
  const t = String(raw ?? '')
  if (
    looksLikeMatchingListStem(t) ||
    (/match\s+(?:the|each)\b/i.test(t) && /(?:List|Column)\s*[-–]?\s*I/i.test(t))
  ) {
    return null
  }
  // Printed "(A) P and Q" … "(D) R and S" lines are the options; the SMILES are the stem's structures.
  const labelled = /<smiles>/i.test(t) ? labelledLineOptions(t) : null
  if (labelled) return labelled
  const chunks = extractSmilesOptionChunks(t)
  if (chunks.length < 2) return null
  // One stem structure + four choices is five. Six or more unlabelled structures are a
  // list the question counts ("the number of aromatic compounds is"); peeling would drop the middle ones.
  if (chunks.length >= 6) return null
  const mixed = chunks.length < 4 ? mixedSmilesFigureOptions(t) : null
  if (mixed) return { stem: stripVisibleItemizeCommands(mixed.stem), options: mixed.options }
  const optionChunks = chunks.length >= 5 ? chunks.slice(-4) : chunks.slice(0, 4)
  const first = chunks[0]
  const keepFirst =
    chunks.length >= 5 && !optionChunks.some((c) => c === first) ? first : null
  let nextStem = t.replace(/<smiles>\s*[\s\S]*?\s*<\/smiles>/gi, '\n')
  if (keepFirst) nextStem = `<smiles>${keepFirst}</smiles>\n${nextStem}`
  nextStem = nextStem
    .replace(/(?:^|\n)\s*\(\s*[A-D]\s*\)\s*(?=(?:\n\s*\(\s*[A-D]\s*\)|\s*$))/gi, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return {
    stem: stripVisibleItemizeCommands(nextStem),
    options: optionChunks.map((s) => `<smiles>${s}</smiles>`),
  }
}

export function recoverOptionsFromStem(stem, options) {
  const opts = dropStemRepeatOptions(
    Array.isArray(options) ? options.map((o) => String(o ?? '')) : [],
    stem,
  )
  if (stemAlreadyHasNumberedReactionSteps(stem)) {
    const cut = stripSectionAndItemizeFromStem(stem)
    return {
      options: optionsArePeeledReactionSteps(opts, cut.stem) ? ['', '', '', ''] : opts,
      stem: cut.stem,
      instructionText: cut.instructionText,
      reactionStepsInStem: true,
    }
  }
  const fromStem = extractLatexItemizeMcq(stem)
  if (fromStem?.reactionStepsInStem) {
    const cut = stripSectionAndItemizeFromStem(fromStem.stem)
    const clear = optionsArePeeledReactionSteps(opts, cut.stem)
    return {
      options: clear ? ['', '', '', ''] : opts,
      stem: cut.stem,
      instructionText: cut.instructionText,
      reactionStepsInStem: true,
    }
  }
  const joined = [stem, ...opts].filter(Boolean).join('\n')
  const itemize = extractLatexItemizeMcq(joined) || fromStem
  if (itemize?.reactionStepsInStem) {
    const cut = stripSectionAndItemizeFromStem(itemize.stem)
    return {
      options: optionsArePeeledReactionSteps(opts, cut.stem) ? ['', '', '', ''] : opts,
      stem: cut.stem,
      instructionText: cut.instructionText,
      reactionStepsInStem: true,
    }
  }
  if (itemize && itemize.options.length >= 2) {
    const cut = stripSectionAndItemizeFromStem(itemize.stem)
    return {
      options: dropStemRepeatOptions(itemize.options.slice(0, 4).map(stripKeyLeak), cut.stem),
      stem: cut.stem,
      instructionText: cut.instructionText,
    }
  }
  const realOpts = opts.filter((o) => String(o).trim() && !looksLikeMarkingSchemeOption(o))
  const optionsOwnSmiles =
    realOpts.length >= 3 && (!/<smiles>/i.test(stem) || !realOpts.some((o) => /<smiles>/i.test(o)))
  const smiles = optionsOwnSmiles ? null : peelSmilesAsOptions(joined) || peelSmilesAsOptions(stem)
  if (
    smiles &&
    smiles.options.length >= 2 &&
    !looksLikeMatchingListStem(stem) &&
    !looksLikeMatchingListStem(joined)
  ) {
    return {
      options: smiles.options.slice(0, 4),
      stem: smiles.stem,
      instructionText: '',
    }
  }
  const blob = opts.find((o) => /\\item\b/.test(o) && (o.match(/\\item\b/gi) || []).length >= 1)
  if (blob) {
    const fromBlob = extractLatexItemizeMcq(`${stem}\n\\begin{itemize}\n${blob}`)
    if (fromBlob && fromBlob.options.length >= 2) {
      const cut = stripSectionAndItemizeFromStem(fromBlob.stem)
      return {
        options: dropStemRepeatOptions(fromBlob.options.slice(0, 4).map(stripKeyLeak), cut.stem),
        stem: cut.stem,
        instructionText: cut.instructionText,
      }
    }
  }
  const finish = (stemText, optionList, instructionText = '') => ({
    options: (optionList || []).map(stripKeyLeak).slice(0, 4).map(stripOwnOptionLabel),
    stem: stripTrailingPyqSectionHeader(stripVisibleItemizeCommands(stemText)),
    instructionText,
  })
  const markBad = opts.filter((o) => looksLikeMarkingSchemeOption(o)).length
  const mapBad = opts.filter((o) => looksLikePrintedAnswerKeyOption(o)).length
  const filled = opts.filter((o) => String(o).trim()).length
  const leaky = (Array.isArray(options) ? options : []).filter((o) =>
    optionLooksLikeStemRepeat(o, stem),
  ).length
  const shouldRecover = markBad >= 2 || (markBad >= 1 && mapBad >= 1) || leaky >= 1
  if (!shouldRecover && filled >= 2 && markBad === 0) {
    return finish(stem, opts)
  }
  const parsed = parseQuestionText(stem)
  const recovered = dropStemRepeatOptions(
    (parsed.options || []).map((o) => String(o ?? '').trim()),
    parsed.text || stem,
  )
  const good = recovered.filter((o) => o && !looksLikeMarkingSchemeOption(o))
  if (good.length >= 2) {
    const cut = stripSectionAndItemizeFromStem(parsed.text || stem)
    return finish(cut.stem, recovered, cut.instructionText)
  }
  // Drop marking-scheme junk boxes; keep the stem clean for NVQ / integer cards.
  const cleanedOpts = opts.map(stripKeyLeak).map((o) => (looksLikeMarkingSchemeOption(o) ? '' : o))
  return finish(stem, cleanedOpts)
}

/**
 * One stored card → one or more paper items. Shared by Official PYQ and bank drafts.
 * @param {unknown[]} questions
 */
export function healPaperItemCards(questions) {
  const list = Array.isArray(questions) ? questions : []
  const out = []
  for (const q of list) {
    if (!q || typeof q !== 'object') continue
    const raw = String(q.text ?? q.stem ?? '')
    const { stems, instructionText } = splitGluedPaperItemText(raw)
    const pieces = stems.length ? stems : raw.trim() ? [raw.trim()] : []
    for (let i = 0; i < pieces.length; i++) {
      const rec = recoverOptionsFromStem(pieces[i], i === pieces.length - 1 ? q.options : [])
      const text = stripTrailingPyqSectionHeader(stripVisibleItemizeCommands(rec.stem))
      const options = (rec.options || [])
        .map(stripKeyLeak)
        .map(stripVisibleItemizeCommands)
        .map((o) => (String(o ?? '').trim() ? stripTrailingPyqSectionHeader(o) : o))
      while (options.length < 4) options.push('')
      const filledOpts = options.filter((o) => String(o).trim()).length
      if (looksLikeInstructionOnly(text)) continue
      if (text.length < 8) continue
      if (
        text.length < 12 &&
        filledOpts < 2 &&
        q.questionNumber == null &&
        q.printedNumber == null
      ) {
        continue
      }
      out.push({
        ...q,
        text,
        options: options.slice(0, 4),
        instructions:
          [q.instructions, instructionText, rec.instructionText].filter(Boolean).join('\n\n') ||
          q.instructions,
        questionNumber:
          pieces.length > 1 && q.questionNumber != null
            ? Number(q.questionNumber) + i
            : q.questionNumber,
        correctIndex: i === pieces.length - 1 ? q.correctIndex : undefined,
      })
    }
  }
  return attachOfficialPyqPassages(mergeAdjacentOptionTails(out))
}

/** True when OCR is Mathpix LaTeX/MMD, not a broken PDF text layer. */
export function looksLikeMathpixLatexPaper(raw) {
  const t = String(raw ?? '')
  const itemQ = /\\item\s*\[\s*Q/i.test(t)
  if (itemQ && countMathpixQuestionMarkers(t) >= 2) return true
  if (itemQ && /\\begin\{/.test(t)) return true
  const latexBits = (t.match(/\\(?:frac|int|lim|begin|mathrm|mathbf)\b/g) || []).length
  return itemQ && latexBits >= 6
}

/**
 * Gemini returned the whole paper (or almost nothing) instead of real questions.
 * @param {number} structuredCount
 * @param {unknown} raw
 */
export function geminiStructureFailedSplit(structuredCount, raw) {
  const n = Number(structuredCount) || 0
  const markers = countMathpixQuestionMarkers(raw)
  if (markers >= 2 && n <= 1) return true
  if (markers >= 8 && n < Math.min(8, Math.floor(markers * 0.35))) return true
  if (markers >= 45 && n <= 44) return true
  if (markers >= 40 && n >= 2 && n < Math.floor(markers * 0.88)) return true
  return false
}

/**
 * @param {unknown} raw
 * @returns {{ instructionText: string, blocks: string[] }}
 */
export function splitMathpixQuestionBlocks(raw) {
  const text = normalizeMathpixQuestionMarkers(raw)
  if (!text) return { instructionText: '', blocks: [] }

  const qStarts = collectMarkerStarts(text)
  const secStarts = collectSectionStarts(text)
  const paraStarts = collectParagraphStarts(text)
  const cuts = [
    ...qStarts.map((i) => ({ i, kind: 'q' })),
    ...secStarts.map((i) => ({ i, kind: 'sec' })),
    ...paraStarts.map((i) => ({ i, kind: 'para' })),
  ].sort((a, b) => a.i - b.i)

  if (qStarts.length < 2) {
    const glued = splitGluedPaperItemText(text)
    if (glued.stems.length >= 2) {
      return { instructionText: glued.instructionText, blocks: glued.stems }
    }
    return { instructionText: qStarts[0] > 12 ? text.slice(0, qStarts[0]).trim() : '', blocks: [] }
  }

  const instructionParts = []
  if (qStarts[0] > 12) instructionParts.push(text.slice(0, qStarts[0]).trim())
  const blocks = []
  for (let i = 0; i < cuts.length; i++) {
    const chunk = text.slice(cuts[i].i, cuts[i + 1]?.i).trim()
    if (chunk.length < 8) continue
    if (chunk.length < 12 && cuts[i].kind !== 'q') continue
    if (cuts[i].kind === 'sec') {
      instructionParts.push(chunk)
      continue
    }
    if (cuts[i].kind === 'para') {
      if (keepMathpixQuestionBlock(chunk)) blocks.push(chunk)
      continue
    }
    const glued = splitGluedPaperItemText(chunk)
    if (glued.instructionText) instructionParts.push(glued.instructionText)
    for (const stem of glued.stems.length ? glued.stems : [chunk]) {
      if (keepMathpixQuestionBlock(stem)) blocks.push(stem)
    }
  }
  return {
    instructionText: instructionParts.filter(Boolean).join('\n\n'),
    blocks: blocks.length >= 2 ? blocks : [],
  }
}

/** @param {string} block */
export function extractMathpixQuestionNumber(block) {
  const t = String(block ?? '')
  const m =
    t.match(/\\item\s*\[\s*Q\s*\.?\s*\]\s*(\d{1,3})\b/i) ||
    t.match(/\\item\s*\[\s*Q\s*\.?\s*(\d{1,3})\s*\]/i) ||
    t.match(/^\s*Q\s*\.?\s*(\d{1,3})\b/i)
  const n = m ? Number(m[1]) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** @param {string} block */
export function stripMathpixQuestionMarker(block) {
  return String(block ?? '')
    .replace(/^\\item\s*\[\s*Q[^\]]*\]\s*\d{0,3}\s*/i, '')
    .replace(/^\s*Q\s*\.?\s*\d{1,3}[\.\)\:\-\s]*/i, '')
    .trim()
}

/**
 * Backup drafts when Gemini returns one blob. Answers stay unknown (no invented key).
 * @param {unknown} raw
 * @param {{ paperMeta?: Record<string, unknown>, instructionText?: string }} [opts]
 */
function wrapCardMath(text) {
  const t = String(text ?? '').trim()
  if (!t) return t
  if (!/\\[A-Za-z]/.test(t) && !/&\s*[^\n]+\\\\\s*&/.test(t)) return t
  return wrapBareLatexRuns(t)
}

function cardRichness(q) {
  const opts = (Array.isArray(q?.options) ? q.options : []).filter((o) => String(o).trim()).length
  return String(q?.text ?? '').length + opts * 200
}

function stemFingerprint(text) {
  return String(text ?? '')
    .replace(/\$+/g, '')
    .replace(/\\[A-Za-z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96)
    .toLowerCase()
}

function printedPaperNumber(q) {
  const n = Number(q?.printedNumber ?? q?.questionNumber)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * JEE Advanced reprints Q.1–Q.17 in Math, Physics, and Chemistry.
 * Keep paper order. Never collapse the whole paper to 17 cards.
 * Only drop a true consecutive duplicate (same printed number + same stem).
 * Bank slot / stored questionNumber is the sequential index (1–51).
 */
export function dedupePaperItemsByNumber(questions) {
  const list = Array.isArray(questions) ? questions : []
  const out = []
  for (const q of list) {
    if (!q || typeof q !== 'object') continue
    const prev = out[out.length - 1]
    const sameNum = prev && printedPaperNumber(prev) > 0 && printedPaperNumber(prev) === printedPaperNumber(q)
    const sameStem = prev && stemFingerprint(prev.text) === stemFingerprint(q.text)
    if (sameNum && sameStem) {
      if (cardRichness(q) > cardRichness(prev)) out[out.length - 1] = q
      continue
    }
    out.push(q)
  }
  return out.map((q, i) => {
    const printed = printedPaperNumber(q) || i + 1
    return {
      ...q,
      printedNumber: printed,
      questionNumber: i + 1,
      pyqSlot: i + 1,
    }
  })
}

/** Keep a stem figure. Leave A–D graphs on the options. */
function appendStemFiguresOutsideOptions(stem, body, options) {
  const base = String(stem ?? '').trim()
  const optionUrls = new Set(extractMathpixImageUrls((options || []).join('\n')))
  const already = new Set(extractMathpixImageUrls(base))
  const extra = extractMathpixImageUrls(stripMathpixFigureChrome(body)).filter(
    (u) => u && !optionUrls.has(u) && !already.has(u),
  )
  if (!extra.length) return base
  return `${base}\n${extra.map((u) => `\\includegraphics{${u}}`).join('\n')}`.trim()
}

function optionIsListStructureFragment(opt, stem) {
  const s = String(opt ?? '')
  if (/<\/?smiles>/i.test(s)) return true
  const bare = s.replace(/<\/?smiles>/gi, '').trim()
  if (bare.length < 6) return false
  if (/P\s*(?:\\rightarrow|→|->)/i.test(bare) && /Q\s*(?:\\rightarrow|→|->)/i.test(bare)) return false
  return [...String(stem ?? '').matchAll(/<smiles>\s*([\s\S]*?)\s*<\/smiles>/gi)].some((m) => {
    const body = String(m[1] ?? '')
    return body.includes(bare) || bare.includes(body)
  })
}

/** A List-I / List-II table becomes labelled rows before the card clean strips cell math. */
function flattenListTabular(body) {
  const at = body.search(/\\begin\{tabular\}/i)
  if (at < 0 || !/(?:List|Column)\s*[-–]?\s*I/i.test(body.slice(at, at + 220))) return body
  return flattenTabularMatchLists(body)
}

/** OCR sometimes reads one list row twice in a row: (R) 4 kJ (R) 4 kJ. Keep one. */
function dropRepeatedListRows(text) {
  const chunks = String(text ?? '').split(/(?=\n[ \t]*\(\s*(?:[PQRST1-5]|I{1,3}|IV)\s*\))/)
  const flat = (s) => s.replace(/\s+/g, ' ').trim()
  return chunks.filter((c, i) => i === 0 || flat(c) !== flat(chunks[i - 1])).join('')
}

/**
 * Match cards: lift only the \item[(A)]–\item[(D)] mapping rows (I → R, …) out of
 * the block. Both lists stay on the stem even when List-II is printed after A–D.
 * @returns {{ body: string, options: string[] } | null}
 */
function peelMatchMappingOptions(body) {
  const src = String(body ?? '')
  const re =
    /\\item\s*\[\s*\(?\s*([A-D])\s*\)?\s*\]([\s\S]*?)(?=\\item\s*\[|\\end\{itemize\}|\n\s*(?:\\section\*?\{\s*)?(?:List|LIST|Column)\s*[-–]?\s*I|\n\s*\n|$)/g
  let hits = [...src.matchAll(re)].filter((m) => /→|\\rightarrow|->/.test(m[2]))
  if (!/^ABCD$|^ABC$/.test(hits.map((m) => m[1].toUpperCase()).join(''))) {
    // Plain lines "(A) P→2, Q→3, R→2, S→2" after the two lists.
    hits = [...src.matchAll(/(?:^|\n)[ \t]*\(\s*([A-D])\s*\)[ \t]*([^\n]+)/g)].filter((m) =>
      /→|\\rightarrow|->/.test(m[2]),
    )
  }
  const letters = hits.map((m) => m[1].toUpperCase()).join('')
  if (!/^ABCD$|^ABC$/.test(letters)) return null
  let rest = src
  for (const m of [...hits].reverse()) {
    rest = rest.slice(0, m.index) + rest.slice(m.index + m[0].length)
  }
  const options = hits.map((m) => m[2].replace(/\s+/g, ' ').trim())
  while (options.length < 4) options.push('')
  return { body: rest, options }
}

function blockToMathpixDraft(block, i, attached, paper) {
  const num = extractMathpixQuestionNumber(block) || i + 1
  const body = stripMathpixQuestionMarker(block)
  const isMatch = looksLikeMatchingListStem(body)
  const rec = recoverOptionsFromStem(body, [])
  const parsed = parseQuestionText(rec.stem || body)
  let text = stripVisibleItemizeCommands(rec.stem || parsed.text || body)
  if (isMatch && !rec.reactionStepsInStem) {
    text = dropRepeatedListRows(stripMathpixFigureChrome(flattenListTabular(body)))
  } else if (!rec.reactionStepsInStem && (hasMathpixMedia(body) || hasMathpixMedia(text))) {
    // Option graphs stay on A–D. Do not paste that table back onto the stem.
    text = appendStemFiguresOutsideOptions(text, body, rec.options || [])
  }
  let options = rec.reactionStepsInStem
    ? rec.options || ['', '', '', '']
    : (rec.options || []).filter((o) => String(o).trim()).length >= 2
      ? rec.options
      : parsed.options
  options = (options || []).map(stripKeyLeak).map(stripVisibleItemizeCommands)
  const mapped = isMatch && !rec.reactionStepsInStem ? peelMatchMappingOptions(body) : null
  if (mapped) {
    text = dropRepeatedListRows(stripMathpixFigureChrome(flattenListTabular(mapped.body))) || body
    options = mapped.options
  } else if (isMatch && !rec.reactionStepsInStem) {
    text = dropRepeatedListRows(stripMathpixFigureChrome(flattenListTabular(body))) || body
    const tab = extractLatexTabularMcq(body)
    if (tab?.options?.length >= 2) {
      // The A–D table in THIS block stays on this question. Do not drop it
      // because the lists are SMILES, and do not look into the next question.
      options = tab.options.map(stripKeyLeak).map(stripVisibleItemizeCommands)
      text = text.replace(/\\begin\{tabular\}[\s\S]*$/i, '').trim() || text
    } else {
      // SMILES list rows are not A–D choices. A real P→ mapping in the same
      // block is kept. The next question's table is not in this block.
      options = (options || []).map((o) => {
        const s = String(o ?? '')
        if (/^\s*&/.test(s) || optionIsListStructureFragment(s, body)) return ''
        if (/P\s*(?:\\rightarrow|→|->)/i.test(s) && /Q\s*(?:\\rightarrow|→|->)/i.test(s)) return s
        return s
      })
      if ((options || []).every((o) => !String(o).trim() || optionIsListStructureFragment(o, body))) {
        options = ['', '', '', '']
      }
    }
  }
  while (options.length < 4) options.push('')
  const printed = detectAnswerFromPaper(text)
  text = cleanMathpixCardText(text)
  options = options.map((o) => cleanMathpixCardText(o))
  text = wrapCardMath(text)
  options = options.map((o) => wrapCardMath(o))
  text = stripLeakedOptionsFromStem(text, options)
  if (hasMathpixMedia(body) || hasMathpixMedia(text) || extractMathpixQuestionNumber(block) || isMatch) {
    if (text.length < 8) text = stripMathpixFigureChrome(body) || body
  } else if (text.length < 12 || looksLikeInstructionOnly(text)) {
    return null
  }
  return {
    text,
    options: options.slice(0, 4),
    questionType: isMatch
      ? 'matrix_match'
      : guessQuestionType(text, options.filter((o) => String(o).trim()).length),
    questionNumber: num,
    bankStatus: 'draft',
    ...(printed.answerSource === 'from_paper'
      ? {
          correctIndex: printed.correctIndex,
          correctIndices: printed.correctIndices,
          correctInteger: printed.correctInteger,
          correctNumerical: printed.correctNumerical,
          answerSource: 'from_paper',
          ...(printed.solution
            ? { solution: printed.solution, solutionSource: printed.solutionSource || 'from_paper' }
            : {}),
        }
      : { answerSource: 'unknown' }),
    instructions: attached || undefined,
    ocrEngine: 'mathpix',
    examPatternId: paper.exam || paper.examPatternId || undefined,
    pyqYear: paper.year || paper.pyqYear || undefined,
    paperLabel: paper.paperLabel || undefined,
    chapter: paper.chapter || 'General',
  }
}

const MATCH_PARAGRAPH_RE =
  /(?:\\section\*?\{\s*)?Answer\s+Q\.?\s*(\d{1,3})(?:\s*,\s*Q\.?\s*\d{1,3})*\s+and\s+Q\.?\s*(\d{1,3})\s+by\s+appropriately\s+matching[^\n]*/gi
const MATCH_INSTRUCTION_CARD_RE =
  /^\s*Answer\s+Q\.?\s*(\d{1,3})(?:\s*,\s*Q\.?\s*\d{1,3})*\s+and\s+Q\.?\s*(\d{1,3})\s+by\s+appropriately\s+matching/i

/**
 * "Answer Q. 15 and Q. 16 by appropriately matching the lists based on the
 * information given in the paragraph" blocks (JEE Advanced 2019+), in page order.
 * @param {unknown} raw
 * @returns {Array<{ from: number, to: number, passageText: string }>}
 */
export function matchListParagraphsFromOcr(raw) {
  const t = String(raw ?? '')
  const out = []
  for (const m of t.matchAll(MATCH_PARAGRAPH_RE)) {
    const from = Number(m[1])
    const to = Number(m[2])
    if (!(from > 0 && to > from && to - from <= 2)) continue
    const start = (m.index ?? 0) + m[0].length
    const after = t.slice(start, start + 6000)
    const end = after.search(
      new RegExp(`(?:^|\\n)\\s*(?:\\\\item\\s*\\[\\s*Q[^\\]]*\\]\\s*|Q\\s*\\.?\\s*)${from}\\b`),
    )
    if (end < 20) continue
    // 2017 prints the table inside \begin{table} with a caption; only the tabular is the passage.
    const unwrapped = after
      .slice(0, end)
      .replace(/^\s*\}/, '')
      .replace(/\\(?:begin|end)\{table\}|\\captionsetup\{[^{}]*\}|\\caption\{\s*Space for rough work\s*\}/g, '')
      .replace(/(?:\\section\*?\{\s*)?Space for rough work\s*\}?/gi, '')
    const body = cleanMathpixCardText(stripVisibleItemizeCommands(unwrapped))
    if (body.length < 40) continue
    const instruction = m[0].replace(/^\\section\*?\{\s*/, '').replace(/\}\s*$/, '').trim()
    out.push({ from, to, passageText: `${instruction}\n\n${body}` })
  }
  return out
}

/**
 * Printed numbers restart in each subject, so "Q.17" alone matches three
 * paragraphs. The k-th "Answer Q.17 and Q.18" block belongs to the k-th subject
 * section that has a Q.17; its two cards get that paragraph, and a card holding
 * only the instruction + paragraph is dropped.
 * @param {unknown[]} questions
 * @param {unknown} raw
 */
export function attachMatchListParagraphs(questions, raw) {
  const list = Array.isArray(questions) ? questions : []
  const groups = matchListParagraphsFromOcr(raw)
  if (!groups.length) return list
  const isInstructionCard = (q) => MATCH_INSTRUCTION_CARD_RE.test(String(q?.text ?? ''))
  const printed = (q) => Number(q?.printedNumber ?? q?.questionNumber) || 0
  const sectionOf = new Map()
  let section = 0
  let prevPn = 0
  let prevSubject = ''
  for (const q of list) {
    if (!q || typeof q !== 'object' || isInstructionCard(q)) continue
    const pn = printed(q)
    const subject = String(q.subject || '')
    if ((pn && prevPn && pn < prevPn - 3) || (subject && prevSubject && subject !== prevSubject)) section += 1
    if (pn) prevPn = pn
    if (subject) prevSubject = subject
    sectionOf.set(q, section)
  }
  /** @type {Map<string, string>} */
  const passageFor = new Map()
  const applied = new Set()
  const byPair = new Map()
  for (const g of groups) {
    const key = `${g.from}-${g.to}`
    if (!byPair.has(key)) byPair.set(key, [])
    byPair.get(key).push(g)
  }
  for (const [key, rows] of byPair) {
    const { from } = rows[0]
    const sections = []
    for (const [q, s] of sectionOf) {
      if (printed(q) === from && !sections.includes(s)) sections.push(s)
    }
    if (sections.length !== rows.length) continue
    rows.forEach((g, k) => passageFor.set(`${sections[k]}:${key}`, g.passageText))
    applied.add(key)
  }
  if (!applied.size) return list
  const out = []
  for (const q of list) {
    if (isInstructionCard(q)) {
      const m = String(q.text).match(MATCH_INSTRUCTION_CARD_RE)
      if (m && applied.has(`${Number(m[1])}-${Number(m[2])}`)) continue
      out.push(q)
      continue
    }
    const s = sectionOf.get(q)
    const pn = printed(q)
    const pair = [...applied].find((key) => {
      const [a, b] = key.split('-').map(Number)
      return pn >= a && pn <= b
    })
    const passageText = pair != null ? passageFor.get(`${s}:${pair}`) : undefined
    if (!passageText) {
      out.push(q)
      continue
    }
    const group = `pyq-match-${s + 1}-${pair}`
    out.push({
      ...q,
      passageText,
      passageGroup: group,
      passageId: group,
      passageRole: 'comprehension_child',
      passageSource: 'ocr-header',
    })
  }
  return out
}

const REPEATED_PARAGRAPH_RE =
  /(?:\\section\*?\{\s*)?PARAGRAPH\s*["“”']\s*([A-Z0-9]{1,4})\s*["“”']\s*\}?([\s\S]{20,4000}?)(?:\(\s*There\s+are\s+(?:two|three|four|\d)\s+questions\s+based\s+on\s+PARAGRAPH[^)]*\)\s*)?(?:\\begin\{itemize\}\s*)?(?:\\item\s*\[\s*Q\s*\.?\s*\]\s*|\\item\s*\[\s*Q\s*\.?\s*(?=\d)|(?:\\section\*?\{\s*|\n\s*)Q\s*\.?\s*)(\d{1,3})\b/gi
const PARAGRAPH_BODY_HAS_Q_RE = /\\item\s*\[\s*Q|(?:^|\n|\\section\*?\{)\s*Q\s*\.?\s*\d{1,3}\b/i

/**
 * JEE Advanced 2018 prints the paragraph again above each of its questions:
 * PARAGRAPH "X" <body> (There are two questions based on PARAGRAPH "X", the
 * question given below is one of them) Q.15 ... Each copy belongs to the card
 * right after it. Only paragraphs printed at least twice are used, so a paper
 * that prints a paragraph once keeps its normal passage handling. Cards are
 * matched in page order because printed numbers restart in each subject.
 * @param {unknown[]} questions
 * @param {unknown} raw
 */
export function attachRepeatedParagraphHeaders(questions, raw) {
  const list = Array.isArray(questions) ? questions : []
  const fold = (m) => `${m[1].toUpperCase()}|${m[2].replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 80)}`
  const all = [...String(raw ?? '').matchAll(REPEATED_PARAGRAPH_RE)].filter(
    (m) => !PARAGRAPH_BODY_HAS_Q_RE.test(m[2]),
  )
  const seen = new Map()
  for (const m of all) seen.set(fold(m), (seen.get(fold(m)) || 0) + 1)
  const hits = all.filter((m) => seen.get(fold(m)) >= 2)
  if (!hits.length) return list
  const printed = (q) => Number(q?.printedNumber ?? q?.questionNumber) || 0
  const out = list.slice()
  let section = 0
  const sectionAt = []
  for (let i = 0; i < out.length; i++) {
    const prev = printed(out[i - 1])
    if (i && printed(out[i]) && prev && printed(out[i]) < prev - 3) section += 1
    sectionAt.push(section)
  }
  const head = (text) => String(text ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 60)
  const owners = new Set()
  const ownedHeads = new Set()
  let cursor = 0
  for (const m of hits) {
    const n = Number(m[3])
    const at = out.findIndex((q, i) => i >= cursor && printed(q) === n)
    if (at < 0) continue
    cursor = at + 1
    const body = cleanMathpixCardText(stripVisibleItemizeCommands(m[2]))
    if (body.length < 30) continue
    const group = `pyq-para-${sectionAt[at] + 1}-${m[1].toUpperCase()}`
    out[at] = {
      ...out[at],
      passageText: body,
      passageGroup: group,
      passageId: group,
      passageRole: 'comprehension_child',
      passageSource: 'ocr-header',
    }
    owners.add(at)
    ownedHeads.add(head(body))
  }
  return out.map((q, i) => {
    if (owners.has(i) || !q?.passageText || !ownedHeads.has(head(q.passageText))) return q
    const next = { ...q }
    for (const key of ['passageText', 'passageGroup', 'passageId', 'passageRole', 'passageSource']) delete next[key]
    return next
  })
}

/** Q.14, [slot number 37], Q.16 — the card in the gap is Q.15. */
export function fillPrintedNumberGaps(questions) {
  const list = Array.isArray(questions) ? questions : []
  const printed = (q) => Number(q?.printedNumber) || 0
  return list.map((q, i) => {
    const before = printed(list[i - 1])
    const after = printed(list[i + 1])
    if (!before || after !== before + 2 || printed(q) === before + 1) return q
    return { ...q, printedNumber: before + 1 }
  })
}

export function mathpixSplitToBankDrafts(raw, opts = {}) {
  const sectionMap = opts.sectionMap && Array.isArray(opts.sectionMap.ranges)
    ? opts.sectionMap
    : parsePaperSectionMap(raw)
  const { blocks, instructionText } = splitMathpixQuestionBlocks(raw)
  const paper = opts.paperMeta && typeof opts.paperMeta === 'object' ? opts.paperMeta : {}
  const attached = String(opts.instructionText || instructionText || '').trim()
  const drafts = []
  for (let i = 0; i < blocks.length; i++) {
    const row = blockToMathpixDraft(blocks[i], i, attached, paper)
    if (row) drafts.push(row)
  }
  const shaped = shapeOfficialPyqDrafts(
    dedupePaperItemsByNumber(attachOfficialPyqPassages(drafts, raw, sectionMap)),
    raw,
  )
  return {
    drafts: annotateMathpixCleanStatus(
      attachRepeatedParagraphHeaders(
        fillPrintedNumberGaps(
          attachMatchListParagraphs(
            applyUploadQualityGuards(shaped.questions, raw, sectionMap).map(restoreStructureLabels),
            raw,
          ),
        ),
        raw,
      ),
    ),
    instructionText: attached,
    sectionMap,
    facts: shaped.facts,
  }
}

/**
 * Stored Mathpix OCR is the paper. Do not merge Gemini cards on top (that duplicates).
 * Process order (all papers):
 * 1. Keep raw Mathpix.
 * 2. Parse section instructions → type map + passageRanges.
 * 3. Split on printed Q.n (never split one Q / merge two).
 * 4. Clean each card; keep a passage only if the card is in that range.
 * 5. Attach a passage only when the printed number is in the child range.
 * 6. Wrap bare array/cases/frac on the shared sanitizer.
 * 7. Attach includegraphics only from this card's OCR span.
 * @param {unknown} raw
 * @param {{ paperMeta?: Record<string, unknown>, sectionMap?: { ranges?: unknown[], passageRanges?: unknown[] } }} [opts]
 */
export function paperItemsFromMathpixOcr(raw, opts = {}) {
  const text = restoreDroppedMathpixMatchPieces(raw)
  const sectionMap = opts.sectionMap && Array.isArray(opts.sectionMap.ranges)
    ? opts.sectionMap
    : parsePaperSectionMap(text)
  const { drafts } = mathpixSplitToBankDrafts(text, { ...opts, sectionMap })
  return applyMatrixGridQuestions(dedupePaperItemsByNumber(drafts), text)
}

/**
 * Stored cards are the wrong shape for this OCR (heal-only will keep the damage).
 * @param {unknown[]} questions
 * @param {unknown} ocrText
 */
export function officialPyqCardsNeedMathpixRebuild(questions, ocrText) {
  const list = Array.isArray(questions) ? questions : []
  if (list.length < 8) return false
  const text = String(ocrText ?? '')
  const markers = countMathpixQuestionMarkers(text)
  if (!looksLikeMathpixLatexPaper(text) || markers < 8) return false
  const sectionMap = parsePaperSectionMap(text)

  let dupPrinted = 0
  let wipedScq = 0
  let junkStem = 0
  let splitDebris = 0
  for (let i = 0; i < list.length; i += 1) {
    const q = list[i]
    if (!q || q.placeholder === true) continue
    const stemRaw = String(q.text ?? q.stem ?? '')
    const stem = stemRaw.replace(/\s+/g, ' ').trim()
    const opts = (Array.isArray(q.options) ? q.options : []).filter((o) => String(o ?? '').trim())
    const pn = Number(q.printedNumber ?? q.questionNumber)
    const prev = list[i - 1]
    const prevPn = Number(prev?.printedNumber ?? prev?.questionNumber)
    const prose = stemRaw
      .replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/gi, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .trim()
    if (/^[a-z]/.test(prose) && prose.length >= 8 && prose.length < 420) splitDebris += 1
    if (/\\end\{tabular\}/i.test(stemRaw) && !/\\begin\{tabular\}/i.test(stemRaw)) splitDebris += 1
    if (
      Number.isFinite(pn) &&
      Number.isFinite(prevPn) &&
      prevPn > 0 &&
      pn > prevPn + 1 &&
      pn < 40
    ) {
      splitDebris += 1
    }
    if (
      Number.isFinite(pn) &&
      pn > 0 &&
      pn === prevPn &&
      stemFingerprint(stem) !== stemFingerprint(prev?.text)
    ) {
      dupPrinted += 1
    }
    const type = String(q.questionType ?? q.type ?? '')
    const blank = /_{2,}|\\_\\_|\\fillin\b|\\underline\{\s*\}/.test(stemRaw)
    const mapped = sectionTypeForPrintedNumber(sectionMap, pn)
    if (
      /numerical|integer/i.test(type) &&
      opts.length < 2 &&
      stem.length >= 80 &&
      !blank &&
      /\b(?:are|is equal to)\s*$/i.test(stem)
    ) {
      wipedScq += 1
    }
    if (
      mapped &&
      /single_correct|multiple_correct/.test(mapped) &&
      opts.length < 2 &&
      !blank &&
      stem.length >= 40
    ) {
      wipedScq += 1
    }
    if (
      stem.length < 100 &&
      /^(?:for the |with (?:a |an )?)/i.test(stem) &&
      /\\end\{itemize\}/i.test(stemRaw)
    ) {
      junkStem += 1
    }
  }
  if (dupPrinted >= 2) return true
  if (junkStem >= 1 && markers >= list.length - 1) return true
  if (wipedScq >= 1 && markers >= Math.min(40, list.length)) return true
  if (splitDebris >= 1) return true
  return false
}

/** Rebuild from OCR when Mathpix markers cover the paper. */
export function shouldRebuildFromMathpixOcr(ocrText, existingCount = 0, expected = 0) {
  const text = String(ocrText ?? '')
  const markers = countMathpixQuestionMarkers(text)
  if (!looksLikeMathpixLatexPaper(text) || markers < 8) return false
  if (expected >= 40 && markers < 40) return false
  if (existingCount >= 30 && markers < Math.floor(existingCount * 0.85)) return false
  // Stored cards well above the OCR marker count are padded extras (51 or 56 when the paper has 48).
  // Two leftover cards (53 vs 51) stay for glue; do not re-split the whole OCR.
  if (
    markers >= 30 &&
    existingCount > markers &&
    existingCount - markers >= 3 &&
    existingCount - markers <= 12
  ) {
    return true
  }
  // Full sitting already stored — leftover glue only. Re-splitting OCR freezes Official PYQ.
  if (expected >= 40 && existingCount >= expected - 3 && existingCount <= expected + 6) {
    // One question short vs OCR markers → re-split to recover (50 stored, 51 in OCR).
    if (existingCount < expected && markers >= expected) return true
    if (existingCount < expected && markers > existingCount) return true
    // OCR has more markers than stored cards even when inferOcr matched stored count.
    if (markers > existingCount && markers - existingCount <= 2) return true
    return false
  }
  if (!expected && existingCount >= 48 && existingCount <= 60 && markers >= 40) {
    return false
  }
  return true
}

/** OCR field only — never concatenate existing card stems (that duplicates). */
export function pendingPaperMathpixOcr(paper) {
  const dedicated = sanitizeMathpixOcrText(paper?.preparedText)
  if (countMathpixQuestionMarkers(dedicated) >= 2) return dedicated
  const notes = String(paper?.notes ?? '')
  const mark = '--- prepared-ocr ---'
  const at = notes.toLowerCase().indexOf(mark)
  if (at >= 0) {
    const tail = sanitizeMathpixOcrText(notes.slice(at + mark.length))
    if (countMathpixQuestionMarkers(tail) >= 2) return tail
  }
  return dedicated
}

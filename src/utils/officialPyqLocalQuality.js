/**
 * Local quality check for Official PYQ pending papers.
 * Uses the same display heal and the same raw-code / cut-off checks as review.
 * Does not approve, publish, or invent missing text.
 */

import { cutPrintedSolutionTail, peelPrintedAnswerFromStem, readPrintedAnswerAndSolution } from './answerProvenance.js'
import { closedChemReactionDisplays } from './healTruncatedLatex.js'
import { healUploadQuestionCard, ocrQuestionBodyForCard, storedMatchOptionsAreCutOff } from './extendTruncatedStem.js'
import { OPTION_SOLUTION_TAIL_RE, paperItemsFromMathpixOcr } from './mathpixQuestionSplit.js'
import { healUploadQuestionCard as healPreviewCard, applyStoredOcrCardFixes, storedCardMissesOcrFix } from './uploadQualityGuards.js'
import { isOfficialPyqPlaceholder } from './officialPyqMissingSlots.js'
import {
  getOfficialPyqPendingOcrText,
  getOfficialPyqPendingPaper,
  listOfficialPyqPendingSummaries,
  updateOfficialPyqPendingPaper,
} from './officialPyqPendingStore.js'
import { peelOfficialPyqCardForDisplay } from './passage.js'
import { sanitizeStemForDisplay, stemLooksIncompleteOnDisplay } from './sanitizeStemForDisplay.js'
import { extractMathpixImageUrls } from './mathpixMedia.js'
import { visibleLatexSourceHits } from './visibleLatexSource.js'
import { givenLineDroppedUnit, inlineSingleSymbolDisplayMath, restoreDroppedMsOnGivenLine } from './mathpixCleanPipeline.js'
import { officialPyqContentReviewMessages, officialPyqMissingListMessage } from './officialPyqReviewFlags.js'
import { reviewOfficialPyqCards } from './officialPyqUnifiedCheck.js'
import { adminFactsDisagreeWithScan, enforceAdminFactsOnQuestions, factsForPaper } from './officialPyqAdminFacts.js'
import { officialPyqStructureDamage } from './officialPyqCardStructure.js'
import {
  SCRAP_OPTION_RE,
  restoreLabelledFigureOptions,
  stemRepeatsOptionPictures,
  trimOptionLetterTail,
} from './labelledFigureOptions.js'
import { isMatrixGridCard } from './matrixGridPyq.js'
import { solutionIsOnlyPrintedKeyLine, stripAnswerBoxTables } from './printedAnswerKey.js'
import { prepareTextForMathTextDisplay } from './prepareMathForRender.js'
import { reExtractOfficialPyqPendingPaperLocal } from './officialPyqLocalReparse.js'
import { numericalAlternativesOf } from './answerAlternatives.js'
import { buildPaperFacts } from './officialPyqPaperFacts.js'
import { ocrIsHindiOnly, stripHindiOcr } from './stripHindiOcr.js'
import { dropStaleOfficialPyqCompares, officialPyqCurrentCompare } from './officialPyqCompareFreshness.js'
import { codeOptionsAsPairs, tidyMatchListCard, withoutRepeatedListTwoText } from './matchListTidy.js'
import { parseMatchingListForDisplay } from './parseMatchingListDisplay.js'
import {
  chapterIsNotAName,
  figureFromAnotherQuestion,
  listRowsFromAnotherQuestion,
  optionLinesFromAnotherQuestion,
  stemWithoutOptionPictures,
  withoutForeignListRows,
} from './officialPyqStemLeaks.js'
import {
  choicesLeftInStem,
  gluedOptionsSplit,
  stemWithCapitalisedStart,
  scanLossReason,
  stemWithFigureCaptionCase,
  stemWithJoinedFigurePieces,
  stemWithoutGraphAxisLeftovers,
  textWithOriginalFigureCrops,
  stemWithoutOwnOptionLines,
  stemWithoutScanPlaceholders,
  stemWithoutHeadingBraces,
  withGluedWordsSplit,
  withSpaceAfterComma,
  stemWithoutPrintedNumber,
  stemWithoutRepeatedPictures,
  withAnswerBlankWord,
} from './officialPyqCardTidy.js'
import { officialPyqDrawnCutOff, officialPyqDrawnProblems } from './officialPyqDrawnCheck.js'
import { officialPyqMatchListLayoutProblems, withoutHeadingOnRowLabel } from './matchListLayoutCheck.js'
import { dropOptionFigureRepeatingStem } from './optionRepeatsStemFigure.js'
import { officialPyqScanStructureReason } from './officialPyqScanStructures.js'

const RUNNING_HEAD_TAIL_RE = /\s+(?:PHYSICS|CHEMISTRY|MATHEMATICS|BIOLOGY)\s*$/
const LIST_TAIL_RE = /\s*\\(?:begin|end)\{(?:itemize|enumerate)\}[\s\S]*$/
const BARE_FRACTION_RE = /^\s*(-?\d{1,4})\s*\/\s*(\d{1,4})\s*$/
const TRAILING_LINE_BREAK_RE = /(?:\s*\\\\)+\s*$/
/** Page furniture the scan glued to the last option or line: "Space for rough work", an empty \author{ }. */
const PAGE_FURNITURE_TAIL_RE = /(?:\s*(?:\$\s*\\(?:author|title|date)\{[^}]*\}\s*\$|\\(?:author|title|date)\{[^}]*\}|Space\s+for\s+rough\s+work))+\s*$/i
const PAGE_FURNITURE_LINE_RE = /^[ \t]*Space\s+for\s+rough\s+work[ \t]*$/gim
/** "PART-2 CHEMISTRY" / "SECTION -1 (Only One Option Correct Type)": the next part's heading, never question words. */
const PAPER_HEADING_LINE_RE =
  /^[ \t]*(?:\\section\*?\{\s*)?(?:(?:PART|SECTION)\s*[-–]?\s*(?:\d|[IVX]+)\b[^\n]*|END OF THE QUESTION PAPER\.?\}?)[ \t]*$/gm

const MATHPIX_FIGURE_RE =
  /\\includegraphics(?:\[[^\]]*\])?\{https:\/\/cdn\.mathpix\.com\/cropped\/[^}]*?-(\d{2,3})\.jpg\?height=(\d+)&width=(\d+)&top_left_y=(\d+)&top_left_x=(\d+)[^}]*\}|!\[[^\]]*\]\(https:\/\/cdn\.mathpix\.com\/cropped\/[^)]*?-(\d{2,3})\.jpg\?height=(\d+)&width=(\d+)&top_left_y=(\d+)&top_left_x=(\d+)[^)]*\)/g
const PAGE_CROP_RE = /\/api\/official-pyq\/original\/crops\/[^}\s)?]*\?page=(\d+)&x0=([\d.]+)&y0=([\d.]+)&x1=([\d.]+)&y1=([\d.]+)/g
/** Mathpix renders a paper page about 2066 × 2922 px; crops of the original PDF use page fractions. */
const MATHPIX_PAGE_W = 2066
const MATHPIX_PAGE_H = 2922

/**
 * A scan picture saved next to a crop of the same spot on the original page shows the figure twice
 * (2025 P2 Q19). The crop is the cleaner copy, so the scan picture goes.
 * @param {string} text
 */
function withoutDuplicateFigures(text) {
  const crops = [...String(text).matchAll(PAGE_CROP_RE)].map((m) => ({
    page: Number(m[1]),
    x0: Number(m[2]),
    y0: Number(m[3]),
    x1: Number(m[4]),
    y1: Number(m[5]),
  }))
  if (!crops.length) return text
  const out = String(text).replace(MATHPIX_FIGURE_RE, (token, ...g) => {
    const [page, h, w, top, left] = (g[0] != null ? g.slice(0, 5) : g.slice(5, 10)).map(Number)
    const cx = (left + w / 2) / MATHPIX_PAGE_W
    const cy = (top + h / 2) / MATHPIX_PAGE_H
    const area = (w * h) / (MATHPIX_PAGE_W * MATHPIX_PAGE_H)
    const covered = crops.some((c) => {
      const cropArea = (c.x1 - c.x0) * (c.y1 - c.y0)
      return c.page === page && cx >= c.x0 && cx <= c.x1 && cy >= c.y0 && cy <= c.y1 && area / cropArea > 0.35 && area / cropArea < 2.5
    })
    return covered ? '' : token
  })
  return out === text ? text : out.replace(/\n{3,}/g, '\n\n').trim()
}

const FIGURE_TOKEN = String.raw`\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}`

/** Single `$` delimiters, skipping `$$…$$` blocks and escaped `\$`. */
function singleDollarPositions(text) {
  const at = []
  for (const m of String(text).matchAll(/\$\$[\s\S]*?\$\$|\\\$|\$/g)) if (m[0] === '$') at.push(m.index)
  return at
}

/**
 * A picture wrapped into the blank's math: "is $\_\_\_\_\n\includegraphics{…}$", or after an
 * earlier half-fix "is $\_\_\_\_\n$\includegraphics{…}$" (2025 P2 Q27). The picture is not math.
 * @param {string} text
 */
function withoutFiguresInMath(text) {
  let out = String(text)
  if (singleDollarPositions(out).length % 2 === 1) {
    out = out.replace(new RegExp(String.raw`(\S)[ \t]*\n\$(${FIGURE_TOKEN})\$`, 'g'), '$1$\n$2')
  }
  const at = singleDollarPositions(out)
  let rebuilt = ''
  let last = 0
  for (let k = 0; k + 1 < at.length; k += 2) {
    const inner = out.slice(at[k] + 1, at[k + 1])
    if (!new RegExp(FIGURE_TOKEN).test(inner)) continue
    const pieces = inner
      .split(new RegExp(`(${FIGURE_TOKEN})`))
      .map((piece) => piece.trim())
      .filter(Boolean)
      .map((piece) => (new RegExp(`^${FIGURE_TOKEN}$`).test(piece) ? piece : `$${piece}$`))
    rebuilt += out.slice(last, at[k]) + pieces.join('\n')
    last = at[k + 1] + 1
  }
  return last ? rebuilt + out.slice(last) : out
}

/**
 * Page leftovers saved on a card: the answer-letter / empty answer-box table under a page,
 * the next page's running head ("PHYSICS") or list tags glued to the last option,
 * or a last option left as "7/3" while its siblings were typeset as fractions.
 * @template {Record<string, any>} T
 * @param {T} q
 * @returns {T}
 */
function withoutPageLeftovers(q) {
  let next = q
  for (const key of ['text', 'passageText']) {
    const raw = q?.[key]
    if (typeof raw !== 'string') continue
    let cleaned = withoutFiguresInMath(withoutDuplicateFigures(raw)).replace(PAGE_FURNITURE_TAIL_RE, '')
    const unfurnished = cleaned.replace(PAGE_FURNITURE_LINE_RE, '').replace(PAPER_HEADING_LINE_RE, '')
    if (unfurnished !== cleaned) cleaned = unfurnished.replace(/\n{3,}/g, '\n\n').trim()
    if (/\\begin\{tabular\}/.test(cleaned)) cleaned = stripAnswerBoxTables(cleaned).replace(/\n{3,}/g, '\n\n').trim()
    if (cleaned && cleaned !== raw && cleaned !== raw.trim()) next = { ...next, [key]: cleaned }
  }
  if (Array.isArray(q?.options)) {
    const options = q.options.map((opt) => {
      const s = String(opt ?? '')
      const cleaned = trimOptionLetterTail(s)
        .replace(LIST_TAIL_RE, '')
        .replace(RUNNING_HEAD_TAIL_RE, '')
        .replace(PAGE_FURNITURE_TAIL_RE, '')
        .replace(PAPER_HEADING_LINE_RE, '')
        .replace(TRAILING_LINE_BREAK_RE, '')
      const frac = cleaned.match(BARE_FRACTION_RE)
      if (frac) return `$\\frac{${frac[1]}}{${frac[2]}}$`
      return cleaned.trim() ? cleaned : s
    })
    if (options.some((opt, i) => opt !== String(q.options[i] ?? ''))) next = { ...next, options }
  }
  return next
}

/** A saved text option that the screen clean-up turns into nothing — students would see no option. */
function optionBlankOnScreen(q) {
  const options = Array.isArray(q?.options) ? q.options : []
  const images = Array.isArray(q?.optionImages) ? q.optionImages : []
  return options.some((opt, i) => {
    const s = String(opt ?? '').trim()
    if (!s || images[i] || /\\includegraphics|!\[[^\]]*\]\(|<smiles>/i.test(s)) return false
    try {
      return !String(prepareTextForMathTextDisplay(s) ?? '').trim()
    } catch {
      return false
    }
  })
}

/**
 * The preview shows the saved card, so saved junk fails even when the cleaned view looks right:
 * a "," / "and" option, an option cut off after "and", page leftovers, an option that shows
 * blank, or the option pictures repeated in the stem.
 */
function hasScrapOption(q) {
  const options = Array.isArray(q?.options) ? q.options : []
  return (
    options.some((opt) => String(opt ?? '').trim() && SCRAP_OPTION_RE.test(String(opt))) ||
    withoutPageLeftovers(q) !== q ||
    optionBlankOnScreen(q) ||
    Boolean(stemRepeatsOptionPictures(q)) ||
    officialPyqDrawnCutOff(q).length > 0
  )
}

export const LOCAL_QUALITY_REVISION = 41
const MAX_QUALITY_PASSES = 4
const SAME_CHECK = 'banner-v4'
const RECHECK_ONCE = new Set([
  'opyq-1788581709443-7e3iujw',
  'opyq-1790052685142-omn46m0',
  'opyq-1791275733435-im15vmg',
  'opyq-1791275953834-rjvwr9i',
  'opyq-1791275032248-aynozfl',
])

function qualityIsCurrent(paper) {
  const quality = paper?.localQuality
  if (!quality || quality.revision !== LOCAL_QUALITY_REVISION) return false
  if (RECHECK_ONCE.has(paper.id) && quality.sameCheck !== SAME_CHECK) return false
  return true
}

const CHECKER_NOTE =
  /Raw LaTeX is still showing|Not inventing|Math looks cut off|Extraction incomplete|missing List-I{1,2}/i

const ANSWER_IN_STEM =
  /(?:^|\n)\s*(?:(?:Official\s+)?(?:Ans(?:wer)?s?\.?|Key)|Correct\s+(?:option|answer))\s*[:.\-=]\s*(?:is\s+)?(?!\s*the\b)\S/i

/**
 * @param {object | null | undefined} quality
 */
export function localQualityListMark(quality) {
  if (!quality || quality.revision !== LOCAL_QUALITY_REVISION) return ''
  if (quality.passed) return 'Quality checked by local AI — passed'
  const lines = Array.isArray(quality.lines) ? quality.lines.filter(Boolean) : []
  if (lines.length) return `Quality checked by local AI — not passed. ${lines.join(' ')}`
  const nums = Array.isArray(quality.failedGoTo) ? quality.failedGoTo : []
  const shown = nums.slice(0, 24).join(', ')
  const more = nums.length > 24 ? ` and ${nums.length - 24} more` : ''
  return `Quality checked by local AI — not passed${shown ? ` · Go to Q ${shown}${more}` : ''}`
}

function proseWords(text) {
  return String(text ?? '')
    .replace(/<smiles\b[\s\S]*?<\/smiles>/gi, ' ')
    .replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/(?:https?:\/\/|\/api\/)[^\s)}"']+/gi, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/<\/?[a-zA-Z][^<>]*>/g, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 3)
}

function stemMissingFromOcr(text, ocr) {
  const sourceWords = new Set(proseWords(ocr).map((word) => word.toLowerCase()))
  if (sourceWords.size < 30) return false
  const words = proseWords(text).slice(0, 8)
  if (words.length < 8) return false
  const found = words.filter((word) => sourceWords.has(word.toLowerCase())).length
  return found < 4
}

let freshSplit = { ocr: '', items: /** @type {any[]} */ ([]) }

/** The stored scan split again with today's splitter, one paper at a time. */
function freshCardsFromOcr(ocr) {
  if (freshSplit.ocr !== ocr) {
    let items = []
    try {
      items = paperItemsFromMathpixOcr(ocr)
    } catch {
      items = []
    }
    freshSplit = { ocr, items: Array.isArray(items) ? items : [] }
  }
  return freshSplit.items
}

function wordRun(text) {
  return ` ${proseWords(text).join(' ').toLowerCase()} `
}

/**
 * The count the paper is held to when the stored card count is off: a question lost by an
 * older split (2025 P2 Q5, no "Q. 5" label), or one question cut in two / instructions kept
 * as a card. Same facts the count line uses: confirmed admin facts, else the scan's own.
 * 0 when the count is right or no facts are known.
 */
function countOffFacts(paper, ocr) {
  if (!ocr) return 0
  const facts = factsForPaper(paper) || buildPaperFacts(ocr)
  const expected = facts?.known ? Number(facts.expectedQuestionCount) || 0 : 0
  const stored = (Array.isArray(paper?.questions) ? paper.questions : []).filter((q) => q && !isOfficialPyqPlaceholder(q))
  return expected && stored.length !== expected ? expected : 0
}

/**
 * The facts count when a pending paper must be rebuilt from the scan: the count is off, or the
 * count is right and a card is another card's duplicate, carries another question's text or
 * a stray printed number (an older split shifted the questions). 0 otherwise.
 */
function rebuildTarget(paper, ocr) {
  const off = countOffFacts(paper, ocr)
  if (off || !ocr) return off
  const facts = factsForPaper(paper) || buildPaperFacts(ocr)
  const expected = facts?.known ? Number(facts.expectedQuestionCount) || 0 : 0
  if (!expected) return 0
  return officialPyqStructureDamage(paper?.questions, ocr).size ? expected : 0
}

/** A rebuild that missed the facts count is not retried until the cards, facts or scan change. */
const countRepairTried = new Set()

const HINDI_ONLY_LINE = 'The scan is in Hindi only. Upload the English paper. Do not approve.'

function withHindiOnlyFlag(result, ocr) {
  if (!ocrIsHindiOnly(ocr)) return result
  return { ...result, passed: false, lines: [HINDI_ONLY_LINE, ...result.lines.filter((l) => l !== HINDI_ONLY_LINE)] }
}

/** Same card in a fresh split: same card count and the stem opens with the same words. */
function freshCardFor(questions, index, ocr) {
  const items = freshCardsFromOcr(ocr)
  if (!items.length || items.length !== questions.length) return null
  const fresh = items[index]
  const opening = proseWords(fresh?.text).slice(0, 4)
  if (opening.length < 3) return null
  const run = wordRun(questions[index]?.text)
  if (run.includes(` ${opening.join(' ').toLowerCase()} `)) return fresh
  // A math-heavy stem has few words before its lists ("Let $f_1$… be defined by / List I"):
  // the same printed number and the same first three words still name the same question.
  const printed = Number(fresh?.printedNumber)
  if (!(printed > 0) || printed !== Number(questions[index]?.printedNumber)) return null
  return run.startsWith(` ${opening.slice(0, 3).join(' ').toLowerCase()} `) ? fresh : null
}

/**
 * Closing question lines of the fresh card that the stored card lacks, in order
 * ("Then the value of $r$ is \_\_\_\_." — 2025 P2 Q10, Q11). Words must appear in order:
 * the setup often reuses the same words, so loose words would hide the loss.
 */
function lostClosingLines(card, fresh) {
  const have = wordRun(`${card?.passageText ?? ''} ${card?.text ?? ''} ${(card?.options || []).join(' ')}`)
  const lines = String(fresh?.text ?? '').split('\n')
  const lost = []
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].trim() && !lines[i].replace(PAGE_FURNITURE_TAIL_RE, '').trim()) continue
    const words = proseWords(lines[i])
    if (words.length < 2) {
      if (lost.length || !lines[i].trim()) continue
      return []
    }
    /** An earlier fresh line found on the card anchors the loss to the end; a reworded one-line stem has no anchor. */
    if (have.includes(` ${words.join(' ').toLowerCase()} `)) return lost
    lost.unshift(lines[i])
  }
  return []
}

function stemLostOcrQuestion(q, fresh) {
  if (!fresh || q?.adminEdited === true || q?.adminApproved === true || isMatrixGridCard(q)) return false
  return lostClosingLines(q, fresh).length > 0
}

/** A question never opens in lower case; the scan dropped its first letter or number. */
const STEM_START_RE = /^(\s*)([a-z]{2,10})(?=\s+[a-z$(\\])/
const LOWER_CASE_OPENINGS = new Set([
  'cis',
  'trans',
  'tert',
  'sec',
  'iso',
  'meso',
  'ortho',
  'meta',
  'para',
  'let',
  'if',
  'for',
  'in',
  'the',
  'an',
  'find',
  'then',
  'which',
  'what',
  'consider',
  'given',
  'suppose',
  'assume',
])
/** Only words whose lost capital is certain; anything else is flagged for the PDF comparison. */
const LOST_FIRST_LETTER = new Map([
  ['he', 'The'],
  ['hen', 'Then'],
  ['his', 'This'],
  ['hese', 'These'],
  ['here', 'There'],
  ['hich', 'Which'],
  ['hat', 'What'],
  ['et', 'Let'],
  ['onsider', 'Consider'],
  ['ind', 'Find'],
  ['iven', 'Given'],
  ['ssume', 'Assume'],
  ['uppose', 'Suppose'],
  ['mong', 'Among'],
  ['ach', 'Each'],
])

function stemStartCutOff(text) {
  const m = String(text ?? '').match(STEM_START_RE)
  return m && !LOWER_CASE_OPENINGS.has(m[2]) ? m[2] : ''
}

/** "he reactivity of compound Z" → "The reactivity of compound Z" (2014 P1 Q22). */
function withRestoredStemStart(text) {
  const s = String(text ?? '')
  const m = s.match(STEM_START_RE)
  const word = m ? LOST_FIRST_LETTER.get(m[2]) : ''
  return word ? `${m[1]}${word}${s.slice(m[0].length)}` : s
}

const PROSE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9'’,.;:?!()-]*$/
const KEY_OR_HEAD_RUN = /^(?:(?:Answer|Ans|Key)\s*[:.\-=]?\s*\(?[A-D0-9]|(?:PHYSICS|CHEMISTRY|MATHEMATICS|BIOLOGY|SECTION|PART)\b|Q\s*\.?\s*\d)/
const LOST_WORDS_ANCHOR = 3

/**
 * The card text with words put back that the fresh split of the scan has between two runs of
 * the card's own words ("he gives the correct Assume" for "… correct answer. Assume" — 2024 P1 Q2;
 * "mol of Hg" for "2 mol of Hg" — 2022 P1). '' when nothing plain-worded was lost. Other
 * differences are heals and are skipped, never copied.
 */
function textWithLostWords(card, fresh) {
  if (!fresh || card?.adminEdited === true || card?.adminApproved === true || isMatrixGridCard(card)) return ''
  const have = String(card?.text ?? '')
  const tokens = [...have.matchAll(/\S+/g)]
  const a = tokens.map((m) => m[0])
  const b = String(fresh?.text ?? '').split(/\s+/).filter(Boolean)
  if (a.length < 8 || b.length < 8) return ''
  const same = (ai, bj, n) => {
    for (let k = 0; k < n; k += 1) if (a[ai + k] !== b[bj + k]) return false
    return true
  }
  /** @type {Array<[number, string[]]>} */
  const inserts = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1
      j += 1
      continue
    }
    const n = Math.min(LOST_WORDS_ANCHOR, a.length - i)
    let skip = 0
    for (let k = 1; k <= 6 && j + k + n <= b.length; k += 1) {
      if (same(i, j + k, n)) {
        skip = k
        break
      }
    }
    if (skip && n >= Math.min(LOST_WORDS_ANCHOR, a.length)) {
      const run = b.slice(j, j + skip)
      const opening = i === 0 && !stemStartCutOff(have)
      if (!opening && run.every((t) => PROSE_TOKEN.test(t)) && !KEY_OR_HEAD_RUN.test(run.join(' '))) inserts.push([i, run])
      j += skip
      continue
    }
    let synced = false
    for (let di = 0; di <= 40 && !synced && i + di + LOST_WORDS_ANCHOR <= a.length; di += 1) {
      for (let dj = 0; dj <= 40 && j + dj + LOST_WORDS_ANCHOR <= b.length; dj += 1) {
        if ((di || dj) && same(i + di, j + dj, LOST_WORDS_ANCHOR)) {
          i += di
          j += dj
          synced = true
          break
        }
      }
    }
    if (!synced) break
  }
  if (!inserts.length || inserts.length > 3 || inserts.reduce((n, [, run]) => n + run.length, 0) > 12) return ''
  let out = have
  for (const [at, run] of [...inserts].reverse()) {
    const pos = tokens[at].index ?? 0
    out = `${out.slice(0, pos)}${run.join(' ')} ${out.slice(pos)}`
  }
  return out
}

const FIGURE_IN_TEXT_RE = /\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}|!\[[^\]]*\]\([^)]*\)/
const ORIGINAL_CROP_IN_TEXT_RE = /\/api\/official-pyq\/original\/crops\//

/** Prose of a stem without pictures, math marks or spacing, to tell the same question. */
function stemProse(text) {
  return String(text ?? '')
    .replace(new RegExp(FIGURE_IN_TEXT_RE.source, 'g'), ' ')
    .replace(/<smiles\b[\s\S]*?<\/smiles>/gi, ' ')
    .replace(/\\mathrm\{([^{}]*)\}/g, '$1')
    .replace(/[\s$~{}\\]+/g, '')
    .toLowerCase()
}

/**
 * The card text with the scan pictures put back that the fresh split of the scan shows in this
 * question and the card lost ("In the given circuit …" without its circuit — 2012 P2 Q4). '' when
 * none. Pictures the card replaced with crops of the original page, or that repeat its option
 * crops, stay out.
 */
function stemMissingScanFigures(card, fresh) {
  if (!fresh || card?.adminEdited === true || card?.adminApproved === true || isMatrixGridCard(card)) return ''
  const have = String(card?.text ?? '')
  if (ORIGINAL_CROP_IN_TEXT_RE.test(have)) return ''
  const parts = [have, card?.passageText, ...(Array.isArray(card?.options) ? card.options : [])].map((p) => String(p ?? ''))
  const scanText = String(fresh?.text ?? '')
  const mine = stemProse(have)
  const theirs = stemProse(scanText)
  if (mine.length < 30 || theirs.length < 30) return ''
  const probe = Math.min(60, mine.length, theirs.length)
  if (mine.slice(0, probe) !== theirs.slice(0, probe)) return ''
  const owned = new Set(parts.flatMap((p) => extractMathpixImageUrls(p)))
  const missing = [...scanText.matchAll(new RegExp(FIGURE_IN_TEXT_RE.source, 'g'))]
    .map((m) => m[0])
    .filter((token) => {
      const urls = extractMathpixImageUrls(token)
      return urls.length > 0 && urls.every((url) => !owned.has(url))
    })
  if (!missing.length) return ''
  const restored = `${have.trim()}\n${missing.join('\n')}`
  const kept = extractMathpixImageUrls(dropOptionFigureRepeatingStem({ ...card, text: restored }).text)
  const added = missing.filter((token) => extractMathpixImageUrls(token).every((url) => kept.includes(url)))
  return added.length ? `${have.trim()}\n${added.join('\n')}` : ''
}

function passageKey(q) {
  return String(q?.passageId || q?.passageGroup || '').trim()
}

/**
 * Each question under a paragraph carries its own copy of it. A copy that lost the paragraph's
 * figure (2023 P2 Q14, 2024 P2 Q14 and Q16) takes the copy of a sibling with the same words.
 * @returns {Map<number, string>} card index → the sibling's passage with the figure
 */
function passagesMissingSiblingFigure(questions) {
  /** @type {Map<string, number[]>} */
  const groups = new Map()
  questions.forEach((q, i) => {
    const key = passageKey(q)
    if (!key || !String(q?.passageText ?? '').trim()) return
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)?.push(i)
  })
  const out = new Map()
  for (const idx of groups.values()) {
    const withFigure = idx.find((i) => FIGURE_IN_TEXT_RE.test(String(questions[i].passageText)))
    if (withFigure == null) continue
    const best = String(questions[withFigure].passageText)
    for (const i of idx) {
      const q = questions[i]
      const own = [q.passageText, q.text, ...(Array.isArray(q.options) ? q.options : [])].join('\n')
      if (FIGURE_IN_TEXT_RE.test(own) || String(q.questionImage ?? '').trim()) continue
      if (wordRun(q.passageText) === wordRun(best)) out.set(i, best)
    }
  }
  return out
}

const ANSWER_CLAIMS = { from_paper: 'answer from the paper', manual: 'answer typed by hand', ai_generated: 'AI answer', hybrid_ai: 'AI answer' }

/** The card is labelled with an answer source and has no answer, so the fill step skips it and students see none. */
function answerLabelWithoutAnswer(q) {
  if (!Object.prototype.hasOwnProperty.call(ANSWER_CLAIMS, String(q?.answerSource ?? ''))) return false
  if (answerKeyOf(q).has || numericalAlternativesOf(q).length) return false
  const grid = q?.matrixAnswerKey
  if (grid && typeof grid === 'object' && Object.values(grid).some((row) => (Array.isArray(row) ? row.length : row != null && row !== ''))) {
    return false
  }
  return true
}

/**
 * The scan prints keys for this paper but none for this question, and the card still says its answer came
 * from the paper: it was carried over from an older split (2013 P2 Q60 kept the "ANSWER : A" printed for Q59).
 */
function answerClaimsUnprintedKey(q, fresh, items = []) {
  if (!fresh || q?.answerSource !== 'from_paper' || q?.answerFromOriginalPage === true || isMatrixGridCard(q)) return false
  if (fresh.answerSource === 'from_paper' || answerKeyOf(fresh).has) return false
  if (!items.some((item) => item?.answerSource === 'from_paper' && answerKeyOf(item).has)) return false
  const saved = answerKeyOf(q)
  const pageKey = String(q?.originalCompare?.printedAnswer ?? '').trim() || q?.pageAnswerKey
  if (saved.letters && sameAsPageKey(saved.letters, pageKey)) return false
  return saved.has
}

/**
 * Compare read this letter key on the original page (2025 P1 Q31: the scan lost "A", the page
 * prints it). The page's key does not change when the card's text is edited.
 * @param {number[]} letters
 * @param {unknown} printed
 */
function sameAsPageKey(letters, printed) {
  const page = [...String(printed ?? '').toUpperCase().replace(/[^A-D]/g, '')].sort().join('')
  return Boolean(page) && letters.map((i) => 'ABCD'[i] ?? '?').join('') === page
}

const PRINTED_KEY_SHARE = 0.5

/**
 * No answer on the card, while the scan reads printed keys for most of the paper: the scan lost this
 * one (an "ANSWER : A" at the foot of a page — 2013 P1 Q2, Q8, Q12–15). Compare reads it from the
 * original page; once Compare saw no key printed there, the card is left for Hybrid AI.
 */
function printedKeyMissing(q, fresh, items = []) {
  if (!q || isMatrixGridCard(q) || answerKeyOf(q).has || numericalAlternativesOf(q).length) return false
  if (fresh && answerKeyOf(fresh).has) return false
  const keyed = items.filter((item) => item?.answerSource === 'from_paper' && answerKeyOf(item).has).length
  if (keyed < 5 || keyed < items.length * PRINTED_KEY_SHARE) return false
  return officialPyqCurrentCompare(q)?.printedAnswer !== ''
}

/** 1-based numbers of the cards whose printed answer the scan lost (see printedKeyMissing). @param {any} paper */
export function officialPyqPrintedKeyMissingGoTo(paper) {
  const questions = Array.isArray(paper?.questions) ? paper.questions : []
  const ocr = stripHindiOcr(getOfficialPyqPendingOcrText(paper?.id) || paper?.preparedText)
  const items = freshCardsFromOcr(ocr)
  const out = []
  questions.forEach((q, i) => {
    if (!q || isOfficialPyqPlaceholder(q) || q.adminApproved === true) return
    if (printedKeyMissing(q, freshCardFor(questions, i, ocr), items)) out.push(i + 1)
  })
  return out
}

const HAND_SOLUTION_SOURCES = new Set(['manual', 'admin_edit'])
const SOLUTION_CUE_RE = /\\therefore|\b(?:Hence|Therefore|Thus|we get|we have)\b/
const LONG_OPTION_CHARS = 350

function solutionIsHandWritten(q) {
  return q?.adminEdited === true || HAND_SOLUTION_SOURCES.has(String(q?.solutionSource ?? ''))
}

const squashSpace = (text) => String(text ?? '').replace(/\s+/g, ' ').trim()

/** "… Ans. (B) Sol. …" saved inside the stem: the question part and the printed answer / solution. */
function printedSolutionInStem(q) {
  if (q?.adminEdited === true || isMatrixGridCard(q)) return null
  const cut = cutPrintedSolutionTail(q?.text)
  if (!cut?.head.trim()) return null
  const read = readPrintedAnswerAndSolution(cut.tail)
  return read.solution || read.answer?.answerSource === 'from_paper' ? { head: cut.head, ...read } : null
}

function optionsWithoutSolutionText(q) {
  if (q?.adminEdited === true || !Array.isArray(q?.options)) return null
  let changed = false
  const options = q.options.map((opt) => {
    const text = String(opt ?? '')
    const cut = text.replace(OPTION_SOLUTION_TAIL_RE, '').trimEnd()
    if (cut === text.trimEnd() || !cut.trim()) return opt
    changed = true
    return cut
  })
  return changed ? options : null
}

function optionReadsLikeSolution(q) {
  return (Array.isArray(q?.options) ? q.options : []).some((opt) => {
    const text = String(opt ?? '')
    return text.length > LONG_OPTION_CHARS && SOLUTION_CUE_RE.test(text)
  })
}

function printedSolutionWasChanged(q, fresh) {
  if (!fresh || fresh.solutionSource !== 'from_paper' || !String(fresh.solution ?? '').trim()) return false
  if (solutionIsHandWritten(q) || q?.adminApproved === true) return false
  return squashSpace(q?.solution) !== squashSpace(fresh.solution)
}

function keyLineSavedAsSolution(q) {
  return !solutionIsHandWritten(q) && solutionIsOnlyPrintedKeyLine(q?.solution)
}

/** Printed answer / solution text in the wrong place, or a printed solution that was replaced. */
function printedSolutionReason(q, fresh) {
  if (keyLineSavedAsSolution(q)) return 'The saved solution is only the printed answer line; it is cleared so Hybrid AI can write a solution'
  if (printedSolutionInStem(q)) return 'Printed answer or solution text is inside the question; it is moved to the solution'
  if (optionsWithoutSolutionText(q)) return 'An option holds printed answer or solution text; it is removed from the option'
  if (printedSolutionWasChanged(q, fresh)) return 'The solution printed on the paper was changed; it is put back'
  if (optionReadsLikeSolution(q)) return 'An option is very long and reads like a solution. Check the options against the paper'
  return ''
}

function withPrintedSolutionRepaired(q, fresh) {
  let next = q
  if (keyLineSavedAsSolution(next)) {
    const { solution: _solution, solutionSource: _source, ...rest } = next
    next = rest
  }
  const inStem = printedSolutionInStem(next)
  if (inStem) {
    next = { ...next, text: inStem.head }
    if (inStem.solution && !solutionIsHandWritten(next) && next.solutionSource !== 'from_paper') {
      next = { ...next, solution: inStem.solution, solutionSource: 'from_paper' }
    }
    if (inStem.answer?.answerSource === 'from_paper' && !answerKeyOf(next).has) next = withPrintedKey(next, inStem.answer)
  }
  const options = optionsWithoutSolutionText(next)
  if (options) next = { ...next, options }
  if (printedSolutionWasChanged(next, fresh)) next = { ...next, solution: fresh.solution, solutionSource: 'from_paper' }
  return next
}

/** Hybrid AI answered differently from the printed key; the printed answer stays, the admin is told. */
/** Confirmed facts stamp every card's type, so a type the scan contradicts fails the paper. */
function withAdminFactsScanNote(result, paper, ocr) {
  const lines = adminFactsDisagreeWithScan(paper?.adminFacts, ocr)
  if (!lines.length) return result
  return { ...result, passed: false, lines: [...result.lines, ...lines] }
}

function withAnswerDisagreementNote(result, questions) {
  const nums = questions
    .map((q, i) => (q && !isOfficialPyqPlaceholder(q) && q.hybridAnswerDisagrees ? i + 1 : 0))
    .filter(Boolean)
  if (!nums.length) return result
  const line = `Go to Q ${nums.join(', ')}. Hybrid AI got a different answer from the printed key; the printed answer is kept. Please check.`
  return { ...result, lines: [...result.lines, line] }
}

function stemLeakReason(q, fresh, items) {
  const foreign = listRowsFromAnotherQuestion(q, fresh, items)
  if (foreign) {
    const n = Number(items[foreign.source]?.printedNumber) || foreign.source + 1
    return `List rows of printed question ${n} are inside this card; the scan's lists are put back`
  }
  if (stemWithoutOptionPictures(q, fresh)) return 'The option pictures are repeated inside the question text; they are removed'
  const choices = optionLinesFromAnotherQuestion(q, fresh, items)
  if (choices) {
    const n = Number(items[choices.source]?.printedNumber) || choices.source + 1
    return `The options of printed question ${n} are inside this card's text; they are removed`
  }
  const figure = figureFromAnotherQuestion(q, fresh, items)
  if (figure) {
    const n = Number(items[figure.source]?.printedNumber) || figure.source + 1
    return `The picture of printed question ${n} is on this card; the scan's own picture is put back`
  }
  return matchListReason(q, fresh, items)
}

/** "4/4" for a card whose lists read as four and four rows; '' when no lists are read. */
function listShape(q) {
  const parsed = parseMatchingListForDisplay(q?.text, q?.options)
  return parsed ? `${parsed.listI?.length ?? 0}/${parsed.listII?.length ?? 0}` : ''
}

const fullLists = (shape) => /^(?:[2-9])\/(?:[2-9])$/.test(shape)

const rowKey = (text) =>
  String(text ?? '')
    .replace(/\\(?:left|right|mathrm|mathbf|text|textbf)\b/g, '')
    .replace(/[\s${}~]/g, '')
    .toLowerCase()

/**
 * Two or more list rows the scan prints under other questions, while the scan's own card reads
 * as two full lists (2014 P2 Q60 showed Q57's List-I and Q1's option pictures). A different
 * row count alone is no proof: the fresh split of an older scan is often the worse one.
 */
function listsDifferFromScan(q, fresh, items) {
  if (!fresh || !Array.isArray(items) || !/(?:List|Column)\s*[-–]?\s*I/i.test(String(fresh.text ?? ''))) return false
  if (!fullLists(listShape(fresh))) return false
  const parsed = parseMatchingListForDisplay(q?.text, q?.options)
  const own = rowKey([fresh.text, ...(fresh.options || [])].join(' '))
  const others = items
    .filter((other) => other && other !== fresh)
    .map((other) => rowKey([other.text, ...(other.options || [])].join(' ')))
  const foreign = [...(parsed?.listI || []), ...(parsed?.listII || [])].filter((row) => {
    const body = rowKey(row.text)
    return body.length >= 6 && !own.includes(body) && others.some((text) => text.includes(body))
  })
  return foreign.length >= 2
}

/** Answer codes without P–S, list rows read wrong, or lists unlike the scan's (2014 P2 Q37–Q40, Q57–Q60). */
function matchListReason(q, fresh, items) {
  if (codeOptionsAsPairs(q?.options, q?.text)) {
    return 'The answer codes are shown without P, Q, R, S; they are written as P-1, Q-2, …'
  }
  const tidy = tidyMatchListCard(q)
  if (tidy !== q && fullLists(listShape(tidy)) && listShape(tidy) !== listShape(q)) {
    return 'The list rows are not read right (row labels or List headings); they are put right'
  }
  if (withoutRepeatedListTwoText(q?.text) !== String(q?.text ?? '')) return 'List-II is printed twice on this card; the copy is removed'
  if (listsDifferFromScan(q, fresh, items)) return "List rows of other questions are on this card; the scan's lists are put back"
  if (withoutHeadingOnRowLabel(q?.text) !== String(q?.text ?? '')) return 'A List heading is printed inside a list row; it is removed'
  if (scanListsWhenLayoutBroken(q, fresh)) return "The List-I / List-II rows are broken on this card; the scan's lists are put back"
  return ''
}

/** Tidied lists and written-out codes; the scan's lists on a card nobody edited when it shows other questions' rows. */
function withMatchListsRepaired(q, fresh, items) {
  let next = q
  if (codeOptionsAsPairs(next.options, next.text)) next = tidyMatchListCard(next)
  const tidy = tidyMatchListCard(next)
  if (tidy !== next && fullLists(listShape(tidy)) && listShape(tidy) !== listShape(next)) next = tidy
  const once = withoutRepeatedListTwoText(next.text)
  if (once !== String(next.text ?? '')) next = { ...next, text: once }
  if (next.adminEdited !== true && listsDifferFromScan(next, fresh, items)) {
    next = { ...next, text: String(fresh.text ?? '') }
    const pairs = codeOptionsAsPairs(next.options, next.text)
    if (pairs) next = { ...next, options: pairs }
  }
  const unheaded = withoutHeadingOnRowLabel(next.text)
  if (unheaded !== String(next.text ?? '')) next = { ...next, text: unheaded }
  const scanLists = scanListsWhenLayoutBroken(next, fresh)
  if (scanLists) next = scanLists
  return next
}

/**
 * The scan's lists on a card nobody edited whose List-I / List-II layout is broken (rows emptied,
 * a row lost) while the scan's own card lays out cleanly (2024 P1 Q50). null otherwise.
 */
function scanListsWhenLayoutBroken(q, fresh) {
  if (!fresh || q?.adminEdited === true || !/(?:List|Column)\s*[-–]?\s*I/i.test(String(fresh.text ?? ''))) return null
  if (!officialPyqMatchListLayoutProblems(q).length) return null
  const text = withoutHeadingOnRowLabel(fresh.text)
  const pairs = codeOptionsAsPairs(q.options, text)
  const candidate = { ...q, text, ...(pairs ? { options: pairs } : {}) }
  return officialPyqMatchListLayoutProblems(candidate).length ? null : candidate
}

/** Lowest-priority damage: shown only when nothing else is wrong with the card. */
function chapterReason(q) {
  return chapterIsNotAName(q) ? 'The chapter field holds question text, not a chapter name; it is reset' : ''
}

/** The scan's own text replaces foreign list rows on a card nobody edited; an edited card only loses the foreign rows. */
function withStemLeaksRepaired(q, fresh, items) {
  let next = q
  const foreign = listRowsFromAnotherQuestion(next, fresh, items)
  if (foreign) {
    const text = next.adminEdited === true ? withoutForeignListRows(next.text, foreign.lines) : String(fresh.text ?? '')
    if (text) next = { ...next, text }
  }
  const stem = stemWithoutOptionPictures(next, fresh)
  if (stem) next = { ...next, text: stem }
  const choices = optionLinesFromAnotherQuestion(next, fresh, items)
  if (choices) next = { ...next, text: withoutForeignListRows(next.text, choices.lines) }
  const figure = figureFromAnotherQuestion(next, fresh, items)
  if (figure) next = { ...next, text: String(next.text).split(figure.url).join(figure.replacement) }
  next = withMatchListsRepaired(next, fresh, items)
  if (chapterIsNotAName(next)) next = { ...next, chapter: 'General' }
  return next
}

/** Scan leftovers the scan itself settles: its marker in front of the text, the options repeated in the stem, two options in one box. */
function scanTidyReason(q, ocr) {
  if (stemWithoutPrintedNumber(q, ocr)) return 'The card text starts with its printed question number'
  if (choicesLeftInStem(q)) {
    return 'The answer choices are inside the question text and the option boxes hold its drawings; they are put back'
  }
  if (stemWithoutOwnOptionLines(q)) return 'The options are repeated inside the question text; they are removed'
  if (gluedOptionsSplit(q)) return 'Two options are glued together in one box; they are split into two'
  if (stemWithoutRepeatedPictures(q?.text)) return 'A picture is shown twice on this card; the extra copy is removed'
  if (stemWithFigureCaptionCase(q?.text)) {
    return 'A figure caption reads like an option letter, (A) for Figure (a); it is corrected'
  }
  if (stemWithoutScanPlaceholders(q?.text) || stemWithoutScanPlaceholders(q?.passageText)) {
    return 'The scan’s “[Figure]” placeholder is on the card; it is removed'
  }
  if (stemWithoutHeadingBraces(q?.text) || stemWithoutHeadingBraces(q?.passageText)) {
    return 'A piece of a page heading (“{” or “{SECTION II :”) is left at the end of the question; it is removed'
  }
  if (stemWithJoinedFigurePieces(q?.text) || stemWithJoinedFigurePieces(q?.passageText)) {
    return 'A drawing is shown in pieces with its words as loose text between them; it is shown as one picture'
  }
  if (stemWithoutGraphAxisLeftovers(q?.text) || stemWithoutGraphAxisLeftovers(q?.passageText)) {
    return 'A graph’s axis label or a stray letter is loose text between the list rows; it is removed'
  }
  if (withEnglishSpacing(q, ocr) !== q) return 'Words are glued together (“whichpasses”, “,as”); the spaces are put back'
  return ''
}

/** The card with the scan's lost spaces put back in its text, passage and options (the same card when none). */
function withEnglishSpacing(q, ocr) {
  const fix = (s) => {
    const spaced = withSpaceAfterComma(s) || String(s ?? '')
    return withGluedWordsSplit(spaced, ocr) || spaced
  }
  let next = q
  for (const key of ['text', 'passageText']) {
    if (typeof q?.[key] !== 'string') continue
    const fixed = fix(q[key])
    if (fixed !== q[key]) next = { ...next, [key]: fixed }
  }
  if (Array.isArray(q?.options)) {
    const options = q.options.map((opt) => (typeof opt === 'string' ? fix(opt) : opt))
    if (options.some((opt, i) => opt !== q.options[i])) next = { ...next, options }
  }
  return next
}

/** The same drawing check as the alert list, so a card cannot pass while it shows raw code. */
function drawnReason(q) {
  const problem = officialPyqDrawnProblems(q)[0]
  if (problem) return `On screen, ${problem}`
  return listLayoutDropsPicture(q) ? 'On screen, a picture on the card is not drawn by the List-I / List-II layout' : ''
}

/** The review page draws match cards as two lists; every picture on the card must still show (2014 P2 Q17, Q19). */
function listLayoutDropsPicture(q) {
  const text = sanitizeStemForDisplay(String(q?.text ?? ''), q?.options)
  const pictures = extractMathpixImageUrls(text)
  if (!pictures.length) return false
  const parsed = parseMatchingListForDisplay(text, q?.options)
  if (!parsed?.listI?.length) return false
  const drawn = new Set(
    [parsed.intro, parsed.outro, ...parsed.listI.map((row) => row?.text), ...(parsed.listII || []).map((row) => row?.text)]
      .flatMap((t) => extractMathpixImageUrls(String(t ?? ''))),
  )
  return pictures.some((url) => !drawn.has(url))
}

function cardDamageReason(q, fresh, passageLostFigure, solutionRules = true, items = [], ocr = '') {
  if (answerLabelWithoutAnswer(q)) {
    return `The card is marked “${ANSWER_CLAIMS[q.answerSource]}”, and no answer is saved`
  }
  if (answerClaimsUnprintedKey(q, fresh, items)) {
    return 'The answer is marked “answer from the paper”, and the paper prints no answer for this question — check it and type the answer'
  }
  const printed = solutionRules ? printedSolutionReason(q, fresh) : ''
  if (printed) return printed
  if (isMatrixGridCard(q)) return drawnReason(q)
  const leak = stemLeakReason(q, fresh, items)
  if (leak) return leak
  const tidy = scanTidyReason(q, ocr)
  if (tidy) return tidy
  const cut = stemStartCutOff(q?.text) || stemStartCutOff(q?.passageText)
  if (cut) return `The first word looks cut off (“${cut}”)`
  if (passageLostFigure) return 'The paragraph lost its figure; the other question under it has the figure'
  if (textWithLostWords(q, fresh)) return 'Words printed in the scan are missing from the card'
  if (stemMissingScanFigures(q, fresh)) return 'The scan prints a figure for this question that the card lost; it is put back'
  if (optionsCutShortOfScan(q, fresh)) return 'An option is cut short; the scan prints more of it, which is put back'
  return (originalConfirmsWording(q) ? '' : scanLossReason(q)) || drawnReason(q)
}

/** Named after every other problem: one reason shows per card, and a missing key is fixed without touching the wording. */
function keyMissingReason(q, fresh, items) {
  return printedKeyMissing(q, fresh, items) ? 'No answer is saved, but this paper prints its answers; Auto-fix reads it from the original page' : ''
}

/** Compare read the original page for this exact wording and found the same words (2014 P2 Q57 prints no “= 1”). */
function originalConfirmsWording(q) {
  const compare = officialPyqCurrentCompare(q)
  return compare?.textMatches === true || compare?.verdict === 'matches'
}

/** Structure codes are flagged only while the paper waits for review; approved papers keep their alerts as they were. */
function structureCodeRules(paper) {
  return String(paper?.status ?? '') === 'pending_review'
}

/**
 * Card damage the scan or a sibling card settles: index → reason. A card the admin approved
 * as shown is left alone.
 */
function cardDamageReasons(questions, ocr, solutionRules = true, structureCodes = false) {
  const siblings = passagesMissingSiblingFigure(questions)
  const structure = officialPyqStructureDamage(questions, ocr)
  const items = freshCardsFromOcr(ocr)
  const out = new Map()
  questions.forEach((q, i) => {
    if (!q || isOfficialPyqPlaceholder(q) || q.adminApproved === true) return
    const fresh = freshCardFor(questions, i, ocr)
    const reason =
      cardDamageReason(q, fresh, siblings.has(i), solutionRules, items, ocr) ||
      structure.get(i) ||
      (structureCodes ? officialPyqScanStructureReason(q) : '') ||
      chapterReason(q) ||
      keyMissingReason(q, fresh, items)
    if (reason) out.set(i, reason)
  })
  return out
}

/**
 * Damage reason for one card of the paper ('' when none). A check of that card alone cannot see
 * its sibling passages or the fresh split of the scan.
 * @param {any} paper with preparedText
 * @param {number} index 0-based card index
 */
export function officialPyqCardDamageReason(paper, index) {
  const questions = Array.isArray(paper?.questions) ? paper.questions : []
  const q = questions[index]
  if (!q || isOfficialPyqPlaceholder(q) || q.adminApproved === true) return ''
  const ocr = stripHindiOcr(paper?.preparedText)
  const fresh = freshCardFor(questions, index, ocr)
  const items = freshCardsFromOcr(ocr)
  return (
    cardDamageReason(q, fresh, passagesMissingSiblingFigure(questions).has(index), paper?.status !== 'published', items, ocr) ||
    (structureCodeRules(paper) ? officialPyqScanStructureReason(q) : '') ||
    chapterReason(q) ||
    keyMissingReason(q, fresh, items)
  )
}

function withDamageRepaired(q, fresh, siblingPassage, items = [], ocr = '') {
  let next = q
  if (answerLabelWithoutAnswer(next)) {
    const { answerConfidence: _confidence, ...rest } = next
    next = { ...rest, answerSource: 'unknown' }
  }
  next = withPrintedSolutionRepaired(next, fresh)
  if (isMatrixGridCard(next)) return next
  next = withStemLeaksRepaired(next, fresh, items)
  const unnumbered = stemWithoutPrintedNumber(next, ocr)
  if (unnumbered) next = { ...next, text: unnumbered }
  const swapped = choicesLeftInStem(next)
  if (swapped) next = { ...next, ...swapped }
  const withoutOptions = stemWithoutOwnOptionLines(next)
  if (withoutOptions) next = { ...next, text: withoutOptions }
  const split = gluedOptionsSplit(next)
  if (split) next = { ...next, options: split }
  const once = stemWithoutRepeatedPictures(next.text)
  if (once) next = { ...next, text: once }
  next = dropOptionFigureRepeatingStem(next)
  const captioned = stemWithFigureCaptionCase(next.text)
  if (captioned) next = { ...next, text: captioned }
  const crops = officialPyqCurrentCompare(next)?.suggestedFigures?.text
  const fromPage = textWithOriginalFigureCrops(next.text, crops)
  if (fromPage) next = { ...next, text: fromPage }
  for (const key of ['text', 'passageText']) {
    const unplaced = stemWithoutScanPlaceholders(next[key])
    if (unplaced) next = { ...next, [key]: unplaced }
    const unheaded = stemWithoutHeadingBraces(next[key])
    if (unheaded) next = { ...next, [key]: unheaded }
    const whole = stemWithJoinedFigurePieces(next[key])
    if (whole) next = { ...next, [key]: whole }
    const unlabelled = stemWithoutGraphAxisLeftovers(next[key])
    if (unlabelled) next = { ...next, [key]: unlabelled }
  }
  next = withEnglishSpacing(next, ocr)
  const found = textWithLostWords(next, fresh)
  if (found) next = { ...next, text: found }
  const pictured = stemMissingScanFigures(next, fresh)
  if (pictured) next = { ...next, text: pictured }
  const fuller = optionsCutShortOfScan(next, fresh)
  if (fuller) next = { ...next, options: fuller }
  for (const key of ['text', 'passageText']) {
    if (typeof next[key] !== 'string') continue
    let restored = withRestoredStemStart(next[key])
    if (restored === next[key] && stemStartCutOff(restored)) restored = stemWithCapitalisedStart(restored, ocr) || restored
    if (restored !== next[key]) next = { ...next, [key]: restored }
  }
  if (siblingPassage && !FIGURE_IN_TEXT_RE.test(String(next.passageText ?? ''))) next = { ...next, passageText: siblingPassage }
  return next
}

const optionKey = (text) => String(text ?? '').replace(/\s+/g, ' ').trim()

/**
 * Options the fresh split of the scan reads longer, the saved one being the start of it
 * ("$F e$" for "$F e$ (III)" — 2013 P1 Q26; options cut at "and" — 2013 P2 Q31). null when none.
 */
function optionsCutShortOfScan(card, fresh) {
  if (!fresh || card?.adminEdited === true || card?.adminApproved === true || isMatrixGridCard(card)) return null
  const have = Array.isArray(card?.options) ? card.options : []
  /** "… the atom Space for rough work" is page text the saved card rightly dropped (2016 P2 Q27). */
  const scan = withoutPageLeftovers({ options: Array.isArray(fresh?.options) ? fresh.options : [] }).options
  if (have.length < 2 || have.length !== scan.length) return null
  let changed = false
  const options = have.map((opt, i) => {
    const mine = optionKey(opt)
    const full = optionKey(scan[i])
    if (!mine || full.length <= mine.length || !full.startsWith(mine)) return opt
    const tail = full.slice(mine.length).trim()
    if (tail.length > 60 || KEY_OR_HEAD_RUN.test(tail)) return opt
    if (/\([A-D]\)|!\[|\\(?:includegraphics|item|section|begin|end)\b|\b(?:Answer|Ans|Sol)\b/i.test(tail)) return opt
    /** A tail on its own line is page text after the option, not the option's end. */
    if (String(scan[i]).trim().includes('\n') && !String(opt).trim().includes('\n')) return opt
    changed = true
    return String(scan[i])
  })
  return changed ? options : null
}

/** Scan damage repaired on a card an admin edited: a cut first word or a paragraph figure is never an admin choice. */
function scanDamageRepaired(before, after) {
  if (stemStartCutOff(before?.text) && !stemStartCutOff(after?.text)) return true
  if (stemStartCutOff(before?.passageText) && !stemStartCutOff(after?.passageText)) return true
  return (
    !FIGURE_IN_TEXT_RE.test(String(before?.passageText ?? '')) &&
    FIGURE_IN_TEXT_RE.test(String(after?.passageText ?? '')) &&
    wordRun(before?.passageText) === wordRun(after?.passageText)
  )
}

/** The scan-based fix would still change this saved card (labels I–IV under drawings — 2019 P1 Q22). */
function storedCardLacksOcrFix(q, ocr) {
  if (q?.adminEdited === true || q?.adminApproved === true || isMatrixGridCard(q)) return false
  return cardSignature(applyStoredOcrCardFixes(q, ocr)) !== cardSignature(q)
}

const ANSWER_FIELDS = [
  'correctIndex',
  'correctIndices',
  'correctInteger',
  'correctNumerical',
  'numericalTolerance',
  'numericalAlternatives',
  'correctIndicesAlternatives',
  'bonusMarksToAll',
  'zeroMarksToAll',
]

function answerKeyOf(q) {
  if (q?.bonusMarksToAll === true) return { letters: null, number: null, tol: null, alternatives: [], bonus: true, has: true }
  if (q?.zeroMarksToAll === true) return { letters: null, number: null, tol: null, alternatives: [], dropped: true, has: true }
  const letters = Array.isArray(q?.correctIndices) && q.correctIndices.length
    ? [...q.correctIndices].map(Number).sort((a, b) => a - b)
    : q?.correctIndex != null && q.correctIndex !== ''
      ? [Number(q.correctIndex)]
      : null
  const value = q?.correctInteger ?? q?.correctNumerical
  const number = value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null
  const tol = q?.numericalTolerance != null && q.numericalTolerance !== '' ? Number(q.numericalTolerance) : null
  const alternatives = numericalAlternativesOf(q).map((c) => [Number(c.value), c.tolerance != null ? Number(c.tolerance) : null])
  return { letters, number, tol, alternatives, bonus: false, has: Boolean(letters || number != null) }
}

/**
 * The saved answer is not the one printed for this question (2025 P2: every option card saved
 * as "A", every range answer missing). An answer the admin typed is never overridden.
 */
function answerDiffersFromPrintedKey(q, fresh) {
  if (!fresh || fresh.answerSource !== 'from_paper') return false
  if (q?.answerSource === 'admin_edit' || q?.adminApproved === true || isMatrixGridCard(q)) return false
  const printed = answerKeyOf(fresh)
  if (!printed.has) return false
  const saved = answerKeyOf(q)
  const sig = (k) => JSON.stringify([k.letters, k.number, k.tol, k.alternatives, k.bonus, k.dropped])
  return sig(saved) !== sig(printed)
}

function withPrintedKey(q, fresh) {
  const next = { ...q, answerSource: 'from_paper' }
  for (const field of ANSWER_FIELDS) {
    if (fresh[field] != null && fresh[field] !== '') next[field] = fresh[field]
    else delete next[field]
  }
  return next
}

function withClosingLinesRestored(q, fresh) {
  const lost = lostClosingLines(q, fresh)
  return lost.length ? { ...q, text: `${String(q?.text ?? '').trimEnd()}\n${lost.join('\n')}` } : q
}

function inventedProse(text, ocr) {
  const sourceWords = new Set(proseWords(ocr).map((word) => word.toLowerCase()))
  if (sourceWords.size < 30) return false
  return proseWords(text).some((word) => word.length > 5 && !sourceWords.has(word.toLowerCase()))
}

function stripCheckerSentences(text) {
  return String(text ?? '')
    .replace(
      /(?:^|\n)\s*(?:Raw LaTeX is still showing as code\.?|Math looks cut off\.?|Extraction incomplete\.?|Not inventing[^\n]*|missing List-I{1,2}[^\n]*)/gi,
      '\n',
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function cardFailsLocalQuality(card, ocr) {
  const text = String(card?.text ?? '')
  const passage = String(card?.passageText ?? '')
  const options = Array.isArray(card?.options) ? card.options.map((o) => String(o ?? '')) : []
  const parts = [text, passage, ...options]
  if (parts.some((part) => CHECKER_NOTE.test(part))) return true
  if (parts.some((part) => part.replace(PAPER_HEADING_LINE_RE, '') !== part)) return true
  const drawn =
    closedChemReactionDisplays(text) || closedChemReactionDisplays(passage)
  if (!drawn) {
    if (stemLooksIncompleteOnDisplay(text, options) || stemLooksIncompleteOnDisplay(passage)) return true
    if (parts.some((part) => visibleLatexSourceHits(part).length > 0)) return true
  }
  if (ANSWER_IN_STEM.test(text) && peelPrintedAnswerFromStem(text) !== text) return true
  if (/\(\s*P\s*\)\s*\(\s*P\s*\)/.test(text)) return true
  if (/Chemical structure\./.test(text)) return true
  if (storedMatchOptionsAreCutOff(options)) return true
  if (storedCardMissesOcrFix(card, ocr)) return true
  if (givenLineDroppedUnit(text) || givenLineDroppedUnit(passage)) return true
  if (stemMissingFromOcr(text, ocr)) return true
  return false
}

/** A grid card has no options and keeps its lists in matrixRows / matrixCols, not in the stem. */
function gridCardFailsLocalQuality(card) {
  const parts = [card?.text, ...(card?.matrixRows || []), ...(card?.matrixCols || [])].map((p) => String(p ?? ''))
  if (parts.some((part) => CHECKER_NOTE.test(part))) return true
  if (parts.some((part) => visibleLatexSourceHits(part).length > 0)) return true
  return stemLooksIncompleteOnDisplay(String(card?.text ?? ''), [])
}

/** The per-card display checks and the unified check both count; neither result is dropped. */
function mergeQualityResults(localFailed, review, damage = new Map()) {
  const extra = localFailed.filter((n) => !review.failedGoTo.includes(n))
  const failedGoTo = [...new Set([...review.failedGoTo, ...localFailed])].sort((a, b) => a - b)
  /** @type {Map<string, number[]>} */
  const byReason = new Map()
  for (const [index, reason] of damage) {
    if (!byReason.has(reason)) byReason.set(reason, [])
    byReason.get(reason)?.push(index + 1)
  }
  const named = new Set([...damage.keys()].map((i) => i + 1))
  const plain = extra.filter((n) => !named.has(n))
  const lines = [
    ...review.messages,
    ...[...byReason].map(([reason, nums]) => `Go to Q ${nums.sort((a, b) => a - b).join(', ')}. ${reason}.`),
    ...(plain.length ? [`Go to Q ${plain.join(', ')}. The local display check found a problem on this card.`] : []),
  ]
  return { passed: review.passed && extra.length === 0 && damage.size === 0, failedGoTo, lines }
}

/**
 * @param {object} paper
 */
export function localOfficialPyqQualityCheck(paper) {
  const questions = Array.isArray(paper?.questions) ? paper.questions : []
  const ocr = stripHindiOcr(paper?.preparedText)
  /** @type {number[]} */
  const failedGoTo = []
  const damage = cardDamageReasons(questions, ocr, paper?.status !== 'published', structureCodeRules(paper))
  questions.forEach((q, index) => {
    if (!q || isOfficialPyqPlaceholder(q)) return
    if (q.adminApproved === true) {
      if (!isMatrixGridCard(q) && hasScrapOption(q)) failedGoTo.push(index + 1)
      return
    }
    if (damage.has(index)) {
      failedGoTo.push(index + 1)
      return
    }
    if (isMatrixGridCard(q)) {
      if (gridCardFailsLocalQuality(q)) failedGoTo.push(index + 1)
      return
    }
    const rawBits = [q?.text, q?.passageText, ...(Array.isArray(q?.options) ? q.options : [])]
    const fresh = freshCardFor(questions, index, ocr)
    if (
      rawBits.some((part) => CHECKER_NOTE.test(String(part ?? ''))) ||
      hasScrapOption(q) ||
      stemLostOcrQuestion(q, fresh) ||
      answerDiffersFromPrintedKey(q, fresh) ||
      storedCardLacksOcrFix(q, ocr)
    ) {
      failedGoTo.push(index + 1)
      return
    }
    let healed = q
    try {
      healed = healPreviewCard(q, ocr)
    } catch {
      healed = q
    }
    if (givenLineDroppedUnit(healed?.text) || givenLineDroppedUnit(healed?.passageText)) {
      failedGoTo.push(index + 1)
      return
    }
    let shown = healed
    try {
      shown = peelOfficialPyqCardForDisplay(healed, ocr)
    } catch {
      shown = healed
    }
    if (
      officialPyqContentReviewMessages([shown], undefined, ocr).length ||
      officialPyqMissingListMessage([shown]) ||
      cardFailsLocalQuality(shown, ocr)
    ) {
      failedGoTo.push(index + 1)
    }
  })
  const review = reviewOfficialPyqCards(
    questions.map((q, index) => {
      try {
        return peelOfficialPyqCardForDisplay(healPreviewCard(q, ocr), ocr)
      } catch {
        return q
      }
    }),
    ocr,
    factsForPaper(paper),
    { cardsOnly: paper?.officialPyq === false },
  )
  return {
    ...withAdminFactsScanNote(
      withAnswerDisagreementNote(withHindiOnlyFlag(mergeQualityResults(failedGoTo, review, damage), ocr), questions),
      paper,
      ocr,
    ),
    revision: LOCAL_QUALITY_REVISION,
    checkedAt: Date.now(),
    by: 'local',
    questionCount: questions.length,
    sameCheck: SAME_CHECK,
  }
}

function cardSignature(q) {
  return JSON.stringify({
    text: q?.text ?? '',
    passageText: q?.passageText ?? '',
    options: q?.options ?? [],
  })
}

function repairFailingCard(q, ocr) {
  if (q?.adminEdited === true || isMatrixGridCard(q)) return q
  let next = { ...applyStoredOcrCardFixes(q, ocr) }
  const peeled = peelPrintedAnswerFromStem(stripCheckerSentences(String(q?.text ?? '')))
  if (peeled !== String(q?.text ?? '')) next.text = peeled
  const passage = stripCheckerSentences(String(q?.passageText ?? ''))
  if (q?.passageText && passage !== String(q.passageText)) next.passageText = passage
  try {
    const shown = peelOfficialPyqCardForDisplay(healUploadQuestionCard(next, ocr), ocr)
    const options =
      Array.isArray(shown?.options) &&
      (!Array.isArray(q?.options) || shown.options.length >= q.options.length)
        ? shown.options
        : next.options
    const text = String(shown?.text ?? next.text ?? '')
    if (
      shown &&
      !cardFailsLocalQuality({ ...shown, text, options }, ocr) &&
      !inventedProse(text, ocr) &&
      !inventedProse(options?.join(' ') ?? '', ocr)
    ) {
      next = {
        ...next,
        text,
        options,
        passageText: shown.passageText ?? next.passageText,
      }
    }
  } catch {
    /* keep the peeled card */
  }
  const body = ocrQuestionBodyForCard(next.text ?? q?.text, ocr)
  if (body && body !== String(next.text ?? '')) {
    const storedOpts = Array.isArray(q?.options) ? q.options.map((opt) => String(opt ?? '')) : []
    const optionsBroken =
      storedMatchOptionsAreCutOff(storedOpts) ||
      storedOpts.some((opt) => /\\\\\s*$/.test(opt) || visibleLatexSourceHits(opt).length > 0)
    const keyRows = []
    const keyTable = body.match(/\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/gi) || []
    for (const tab of keyTable) {
      if (!/\(\s*A\s*\)/.test(tab)) continue
      for (const line of tab.split(/\\hline/)) {
        const letter = line.match(/\(\s*([A-D])\s*\)/)
        if (!letter) continue
        const rest = line
          .replace(/\(\s*[A-D]\s*\)\s*&?/, '')
          .replace(/\\\\/g, ' ')
          .replace(/&/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (rest) keyRows.push(rest)
      }
      if (keyRows.length >= 2) break
      keyRows.length = 0
    }
    const useRows = optionsBroken && keyRows.length >= storedOpts.filter((opt) => opt.trim()).length
    const stemBody = body
      .replace(/\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/gi, (tab) =>
        /\(\s*A\s*\)/.test(tab) && keyRows.length >= 2 ? '' : tab,
      )
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    try {
      const trial = peelOfficialPyqCardForDisplay(
        healUploadQuestionCard(
          {
            ...next,
            text: stemBody,
            options: useRows ? keyRows.slice(0, 4) : storedOpts,
          },
          ocr,
        ),
        ocr,
      )
      const trialOpts = Array.isArray(trial?.options) ? trial.options.map((opt) => String(opt ?? '')) : []
      const filled = (opts) => opts.filter((opt) => String(opt ?? '').trim()).length
      let text = String(trial?.text ?? '')
      if (filled(trialOpts) >= 2) {
        text = text
          .replace(/\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/gi, (tab) =>
            /\(\s*A\s*\)/.test(tab) && /\(\s*[PQRS]\s*\)/.test(tab) ? '' : tab,
          )
          .replace(/\n{3,}/g, '\n\n')
          .trim()
      }
      if (
        trial &&
        filled(trialOpts) >= filled(storedOpts) &&
        !cardFailsLocalQuality({ ...trial, text, options: trialOpts }, ocr) &&
        !inventedProse(text, ocr) &&
        !inventedProse(trialOpts.join(' '), ocr)
      ) {
        next = {
          ...next,
          text,
          options: trialOpts,
          passageText: trial.passageText ?? next.passageText,
        }
      }
    } catch {
      /* keep the card; the scan slice did not display cleanly */
    }
  }
  return cardSignature(next) === cardSignature(q) ? q : next
}

function cleanCard(q, ocr) {
  try {
    return peelOfficialPyqCardForDisplay(healPreviewCard(q, ocr), ocr)
  } catch {
    return q
  }
}

function adoptKnownFixes(q, shown, ocr) {
  if (isMatrixGridCard(q)) return q
  let next = q
  const unwrapped = String(q?.text ?? '').replace(/\$\$\s*(?=\\includegraphics\b)/g, '')
  if (unwrapped !== String(q?.text ?? '')) next = { ...next, text: unwrapped }
  const text = withAnswerBlankWord(inlineSingleSymbolDisplayMath(restoreDroppedMsOnGivenLine(String(next.text ?? ''))))
  const passage = withAnswerBlankWord(inlineSingleSymbolDisplayMath(restoreDroppedMsOnGivenLine(String(next.passageText ?? ''))))
  if (text !== String(next.text ?? '')) next = { ...next, text }
  if (next.passageText != null && passage !== String(next.passageText)) {
    next = { ...next, passageText: passage }
  }
  if (
    storedMatchOptionsAreCutOff(q?.options) &&
    Array.isArray(shown?.options) &&
    shown.options.filter((opt) => String(opt ?? '').trim()).length >= 2 &&
    !storedMatchOptionsAreCutOff(shown.options) &&
    !inventedProse(shown.options.join('\n'), ocr)
  ) {
    next = { ...next, options: shown.options.map((opt) => String(opt ?? '')) }
  }
  next = withoutPageLeftovers(next)
  const figured = restoreLabelledFigureOptions(next, ocr)
  const fixed = applyStoredOcrCardFixes(figured, ocr)
  return fixed === next ? next : fixed
}

/**
 * Fixes that are never a judgement call, so they also apply to a card the admin approved:
 * page leftovers, a bare "7/3" option, and option pictures repeated in the stem.
 */
function adoptLeftoverFixes(q) {
  if (isMatrixGridCard(q)) return q
  let next = withoutPageLeftovers(q)
  const stem = stemRepeatsOptionPictures(next)
  if (stem) next = { ...next, text: stem }
  return dropOptionFigureRepeatingStem(next)
}

/**
 * Check, repair what the stored OCR can support, and check again.
 * One clean per card. Later passes touch only cards that failed. Stops at 4
 * passes, or as soon as a pass finds nothing left to fix.
 * @param {object} paper
 */
export function repairOfficialPyqUntilQuality(paper) {
  const ocr = stripHindiOcr(paper?.preparedText)
  const stored = Array.isArray(paper?.questions) ? paper.questions : []
  /** Cards saved before a passage-cut fix still lack their shared passage; the facts put it back. */
  const withFacts = enforceAdminFactsOnQuestions(stored, paper?.adminFacts, ocr)
  const questions = withFacts.map((q) => ({ ...q }))
  /** @type {Array<object | null>} */
  const shown = questions.map(() => null)
  const cleaned = new Set()
  let questionsChanged =
    withFacts !== stored &&
    withFacts.some(
      (q, i) =>
        String(q?.passageText ?? '') !== String(stored[i]?.passageText ?? '') ||
        Number(q?.printedNumber) !== Number(stored[i]?.printedNumber),
    )

  function prepare(index) {
    if (cleaned.has(index)) return shown[index]
    const fresh = freshCardFor(questions, index, ocr)
    if (stemLostOcrQuestion(questions[index], fresh)) {
      questions[index] = withClosingLinesRestored(questions[index], fresh)
      questionsChanged = true
    }
    if (answerDiffersFromPrintedKey(questions[index], fresh)) {
      questions[index] = withPrintedKey(questions[index], fresh)
      questionsChanged = true
    }
    if (questions[index]?.adminApproved !== true) {
      const mended = withDamageRepaired(
        questions[index],
        fresh,
        passagesMissingSiblingFigure(questions).get(index),
        freshCardsFromOcr(ocr),
        ocr,
      )
      if (mended !== questions[index]) {
        questions[index] = mended
        questionsChanged = true
      }
    }
    const view = cleanCard(questions[index], ocr)
    const adopted =
      questions[index]?.adminApproved === true ? adoptLeftoverFixes(questions[index]) : adoptKnownFixes(questions[index], view, ocr)
    if (adopted !== questions[index]) {
      questions[index] = adopted
      questionsChanged = true
      shown[index] = cleanCard(adopted, ocr)
    } else {
      shown[index] = view
    }
    cleaned.add(index)
    return shown[index]
  }

  /** Go-to numbers flagged only for drawn structure codes: the PDF comparison fixes those, a scan text rebuild only adds page leftovers (2012 P2 Q26 "{"). */
  const codeOnly = new Set()

  function failedNow() {
    /** @type {number[]} */
    const failed = []
    questions.forEach((_, index) => prepare(index))
    const damage = cardDamageReasons(questions, ocr, true, false)
    questions.forEach((q, index) => {
      if (!q || isOfficialPyqPlaceholder(q)) return
      if (q.adminApproved === true) {
        if (isMatrixGridCard(q)) return
        if (hasScrapOption(questions[index])) failed.push(index + 1)
        return
      }
      if (damage.has(index)) {
        failed.push(index + 1)
        return
      }
      if (isMatrixGridCard(q)) {
        if (gridCardFailsLocalQuality(q)) failed.push(index + 1)
        return
      }
      const rawBits = [q?.text, q?.passageText, ...(Array.isArray(q?.options) ? q.options : [])]
      if (rawBits.some((part) => CHECKER_NOTE.test(String(part ?? '')))) {
        failed.push(index + 1)
        return
      }
      const shown = prepare(index)
      const current = questions[index]
      if (
        givenLineDroppedUnit(current?.text) ||
        givenLineDroppedUnit(current?.passageText) ||
        storedMatchOptionsAreCutOff(current?.options) ||
        storedCardMissesOcrFix(current, ocr) ||
        hasScrapOption(current) ||
        stemLostOcrQuestion(current, freshCardFor(questions, index, ocr)) ||
        answerDiffersFromPrintedKey(current, freshCardFor(questions, index, ocr)) ||
        storedCardLacksOcrFix(current, ocr) ||
        officialPyqContentReviewMessages([shown]).length ||
        officialPyqMissingListMessage([shown]) ||
        cardFailsLocalQuality(shown, ocr)
      ) {
        failed.push(index + 1)
      }
    })
    codeOnly.clear()
    if (structureCodeRules(paper)) {
      const flagged = new Set(failed)
      questions.forEach((q, index) => {
        if (!q || isOfficialPyqPlaceholder(q) || flagged.has(index + 1) || !officialPyqScanStructureReason(q)) return
        failed.push(index + 1)
        codeOnly.add(index + 1)
      })
      failed.sort((a, b) => a - b)
    }
    return failed
  }

  let failedGoTo = failedNow()
  for (let pass = 0; pass < MAX_QUALITY_PASSES && failedGoTo.length; pass += 1) {
    let changed = false
    for (const go of failedGoTo) {
      const index = go - 1
      if (questions[index]?.adminApproved === true || codeOnly.has(go)) continue
      const repaired = repairFailingCard(questions[index], ocr)
      if (repaired !== questions[index]) {
        questions[index] = repaired
        cleaned.delete(index)
        changed = true
        questionsChanged = true
      }
    }
    if (!changed) break
    failedGoTo = failedNow()
  }
  const review = reviewOfficialPyqCards(
    questions.map((q, index) => prepare(index) || q),
    ocr,
    factsForPaper(paper),
    { cardsOnly: paper?.officialPyq === false },
  )
  return {
    paper: { ...paper, questions },
    quality: {
      ...withAdminFactsScanNote(
        withAnswerDisagreementNote(
          withHindiOnlyFlag(mergeQualityResults(failedGoTo, review, cardDamageReasons(questions, ocr, true, structureCodeRules(paper))), ocr),
          questions,
        ),
        paper,
        ocr,
      ),
      revision: LOCAL_QUALITY_REVISION,
      checkedAt: Date.now(),
      by: 'local',
      questionCount: questions.length,
      sameCheck: SAME_CHECK,
    },
    questionsChanged,
  }
}

/**
 * Run the same local check the red banner uses, then save the list mark.
 * Stored OCR only. Does not publish or change status.
 * Pending: every auto-fix is saved, and a card count off the facts is rebuilt from the stored
 * OCR only when a rebuild lands exactly on the facts count. Approved: only cards that failed
 * the check change; a wrong count is flagged, never restructured.
 * Published: checked and flagged only; students' questions are never rewritten here.
 * Auto-fix stops at 4 passes, or as soon as a pass finds nothing to fix.
 * @param {object | null | undefined} paper
 */
export function persistOfficialPyqQualityRun(paper) {
  if (!paper?.id) return null
  let full = getOfficialPyqPendingPaper(paper.id) || paper
  let ocr = getOfficialPyqPendingOcrText(paper.id) || String(full?.preparedText ?? '')
  const status = String(full?.status ?? '')
  const countOff = status === 'pending_review' ? countOffFacts(full, stripHindiOcr(ocr)) : 0
  const requireCount = status === 'pending_review' ? rebuildTarget(full, stripHindiOcr(ocr)) : 0
  const attempt = `${full.id}|${requireCount}|${full.questions?.length ?? 0}|${ocr.length}`
  if (requireCount && !countRepairTried.has(attempt)) {
    let rebuilt = false
    try {
      if (reExtractOfficialPyqPendingPaperLocal(full, { requireCount })?.ok) {
        rebuilt = true
        full = getOfficialPyqPendingPaper(paper.id) || full
        ocr = getOfficialPyqPendingOcrText(paper.id) || String(full?.preparedText ?? '') || ocr
      }
    } catch {
      /* keep the stored cards; the count line still blocks approval */
    }
    // Only a miss is remembered: the same broken cards uploaded again must be rebuilt again.
    // A rebuild for duplicate / leaked cards (count already right) runs once per card set.
    if (!rebuilt || !countOff) countRepairTried.add(attempt)
  }
  if (status === 'published') {
    let quality
    try {
      quality = localOfficialPyqQualityCheck({ ...full, preparedText: ocr || full?.preparedText })
    } catch {
      return full
    }
    const saved = updateOfficialPyqPendingPaper(full.id, { localQuality: quality })
    return saved ? { ...saved, questionsChanged: false } : null
  }
  let repaired
  try {
    repaired = repairOfficialPyqUntilQuality({ ...full, preparedText: ocr || full?.preparedText })
  } catch {
    const quality = {
      passed: false,
      failedGoTo: [],
      revision: LOCAL_QUALITY_REVISION,
      checkedAt: Date.now(),
      by: 'local',
      questionCount: Array.isArray(full?.questions) ? full.questions.length : 0,
      sameCheck: SAME_CHECK,
    }
    return updateOfficialPyqPendingPaper(full.id, { localQuality: quality })
  }
  const stored = Array.isArray(full?.questions) ? full.questions : []
  /** @type {Record<string, any>} */
  const updates = { localQuality: repaired.quality }
  let questionsChanged = false
  if (repaired.questionsChanged && Array.isArray(repaired.paper?.questions)) {
    let next = repaired.paper.questions
    if (status === 'approved') {
      const before = localOfficialPyqQualityCheck({ ...full, preparedText: ocr || full?.preparedText })
      const failing = new Set(before.failedGoTo.map((n) => n - 1))
      next = next.map((q, i) => (failing.has(i) ? q : stored[i] ?? q))
      updates.allowPublishedQuestionWrite = true
    }
    if (next.length !== stored.length || next.some((q, i) => JSON.stringify(q) !== JSON.stringify(stored[i]))) {
      updates.questions = next
      /** Leftover fixes, scan damage and the printed answer also reach cards the admin edited — junk and a wrong key are never an admin choice. */
      updates.releaseAdminEditIndexes = next
        .map((q, i) => {
          if (!stored[i]) return -1
          if (hasScrapOption(stored[i]) && !hasScrapOption(q)) return i
          if (scanDamageRepaired(stored[i], q)) return i
          if (dropOptionFigureRepeatingStem(stored[i]) !== stored[i] && dropOptionFigureRepeatingStem(q) === q) return i
          const source = ocr || String(full?.preparedText ?? '')
          const fresh = freshCardFor(stored, i, source)
          const items = freshCardsFromOcr(source)
          if (stemLeakReason(stored[i], fresh, items) && !stemLeakReason(q, fresh, items)) return i
          if (scanTidyReason(stored[i], source) && !scanTidyReason(q, source)) return i
          if (drawnReason(stored[i]) && !drawnReason(q)) return i
          if (chapterReason(stored[i]) && !chapterReason(q)) return i
          return answerDiffersFromPrintedKey(stored[i], fresh) && !answerDiffersFromPrintedKey(q, fresh) ? i : -1
        })
        .filter((i) => i >= 0)
      questionsChanged = true
    }
  }
  let saved = updateOfficialPyqPendingPaper(full.id, updates)
  // The store keeps edited cards, so the saved list can differ from the repaired one;
  // the mark must describe the cards that were saved.
  if (saved && updates.questions) {
    try {
      const quality = localOfficialPyqQualityCheck({ ...saved, preparedText: ocr || saved.preparedText })
      if (JSON.stringify(quality.failedGoTo) !== JSON.stringify(repaired.quality?.failedGoTo) || quality.passed !== repaired.quality?.passed) {
        saved = updateOfficialPyqPendingPaper(full.id, { localQuality: quality }) || saved
      }
    } catch {
      /* keep the repair's mark */
    }
  }
  if (saved && status === 'pending_review' && Array.isArray(saved.questions)) {
    const cleaned = dropStaleOfficialPyqCompares(saved.questions, saved.localQuality?.failedGoTo)
    if (cleaned !== saved.questions) {
      saved = updateOfficialPyqPendingPaper(full.id, { questions: cleaned }) || saved
      questionsChanged = true
    }
  }
  return saved ? { ...saved, questionsChanged } : null
}

/**
 * The facts count when a pending paper's card count is off it (questions missing or split),
 * else 0. Stored OCR only.
 * @param {any} paper
 */
export function officialPyqCountRepairNeeded(paper) {
  if (!paper?.id || String(paper.status ?? '') !== 'pending_review') return 0
  const full = getOfficialPyqPendingPaper(paper.id) || paper
  const ocr = getOfficialPyqPendingOcrText(paper.id) || String(full?.preparedText ?? '')
  return rebuildTarget(full, stripHindiOcr(ocr))
}

/**
 * Check the next paper (pending first, then approved and published) that does not yet
 * have this revision, so a new check rule also reaches papers approved before it existed.
 * Returns 'more' when another paper is still waiting, 'done' when finished.
 */
const qualitySaveSkipped = new Set()
const RECHECK_STATUSES = ['pending_review', 'approved', 'published']

function papersWaitingForCheck() {
  return RECHECK_STATUSES.flatMap((status) => listOfficialPyqPendingSummaries(status)).filter(
    (paper) => paper?.id && !qualitySaveSkipped.has(paper.id) && !qualityIsCurrent(paper),
  )
}

export function checkNextPendingPaper() {
  const next = papersWaitingForCheck()[0]
  if (!next?.id) return { status: 'done', paperId: '', changed: false }
  const saved = persistOfficialPyqQualityRun(next)
  if (!saved || !qualityIsCurrent(saved)) qualitySaveSkipped.add(next.id)
  const waiting = papersWaitingForCheck().length > 0
  return {
    status: waiting ? 'more' : 'done',
    paperId: next.id,
    changed: Boolean(saved?.questionsChanged),
  }
}

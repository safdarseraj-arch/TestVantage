/**
 * Local quality check for Official PYQ pending papers.
 * Uses the same display heal and the same raw-code / cut-off checks as review.
 * Does not approve, publish, or invent missing text.
 */

import { peelPrintedAnswerFromStem } from './answerProvenance.js'
import { closedChemReactionDisplays } from './healTruncatedLatex.js'
import { healUploadQuestionCard, ocrQuestionBodyForCard, storedMatchOptionsAreCutOff } from './extendTruncatedStem.js'
import { paperItemsFromMathpixOcr } from './mathpixQuestionSplit.js'
import { healUploadQuestionCard as healPreviewCard, applyStoredOcrCardFixes, storedCardMissesOcrFix } from './uploadQualityGuards.js'
import { isOfficialPyqPlaceholder } from './officialPyqMissingSlots.js'
import {
  getOfficialPyqPendingOcrText,
  getOfficialPyqPendingPaper,
  listOfficialPyqPendingSummaries,
  updateOfficialPyqPendingPaper,
} from './officialPyqPendingStore.js'
import { peelOfficialPyqCardForDisplay } from './passage.js'
import { stemLooksIncompleteOnDisplay } from './sanitizeStemForDisplay.js'
import { visibleLatexSourceHits } from './visibleLatexSource.js'
import { givenLineDroppedUnit, inlineSingleSymbolDisplayMath, restoreDroppedMsOnGivenLine } from './mathpixCleanPipeline.js'
import { officialPyqContentReviewMessages, officialPyqMissingListMessage } from './officialPyqReviewFlags.js'
import { reviewOfficialPyqCards } from './officialPyqUnifiedCheck.js'
import { enforceAdminFactsOnQuestions, factsForPaper } from './officialPyqAdminFacts.js'
import {
  SCRAP_OPTION_RE,
  restoreLabelledFigureOptions,
  stemRepeatsOptionPictures,
  trimOptionLetterTail,
} from './labelledFigureOptions.js'
import { isMatrixGridCard } from './matrixGridPyq.js'
import { stripAnswerBoxTables } from './printedAnswerKey.js'
import { prepareTextForMathTextDisplay } from './prepareMathForRender.js'
import { reExtractOfficialPyqPendingPaperLocal } from './officialPyqLocalReparse.js'
import { numericalAlternativesOf } from './answerAlternatives.js'
import { buildPaperFacts } from './officialPyqPaperFacts.js'
import { ocrIsHindiOnly, stripHindiOcr } from './stripHindiOcr.js'
import { dropStaleOfficialPyqCompares } from './officialPyqCompareFreshness.js'

const RUNNING_HEAD_TAIL_RE = /\s+(?:PHYSICS|CHEMISTRY|MATHEMATICS|BIOLOGY)\s*$/
const LIST_TAIL_RE = /\s*\\(?:begin|end)\{(?:itemize|enumerate)\}[\s\S]*$/
const BARE_FRACTION_RE = /^\s*(-?\d{1,4})\s*\/\s*(\d{1,4})\s*$/
const TRAILING_LINE_BREAK_RE = /(?:\s*\\\\)+\s*$/

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
    let cleaned = withoutFiguresInMath(withoutDuplicateFigures(raw))
    if (/\\begin\{tabular\}/.test(cleaned)) cleaned = stripAnswerBoxTables(cleaned).replace(/\n{3,}/g, '\n\n').trim()
    if (cleaned && cleaned !== raw && cleaned !== raw.trim()) next = { ...next, [key]: cleaned }
  }
  if (Array.isArray(q?.options)) {
    const options = q.options.map((opt) => {
      const s = String(opt ?? '')
      const cleaned = trimOptionLetterTail(s)
        .replace(LIST_TAIL_RE, '')
        .replace(RUNNING_HEAD_TAIL_RE, '')
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
 * a "," / "and" option, page leftovers, an option that shows blank, or the option pictures
 * repeated in the stem.
 */
function hasScrapOption(q) {
  const options = Array.isArray(q?.options) ? q.options : []
  return (
    options.some((opt) => String(opt ?? '').trim() && SCRAP_OPTION_RE.test(String(opt))) ||
    withoutPageLeftovers(q) !== q ||
    optionBlankOnScreen(q) ||
    Boolean(stemRepeatsOptionPictures(q))
  )
}

export const LOCAL_QUALITY_REVISION = 17
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
  return wordRun(questions[index]?.text).includes(` ${opening.join(' ').toLowerCase()} `) ? fresh : null
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
  'bonusMarksToAll',
]

function answerKeyOf(q) {
  if (q?.bonusMarksToAll === true) return { letters: null, number: null, tol: null, alternatives: [], bonus: true, has: true }
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
  const sig = (k) => JSON.stringify([k.letters, k.number, k.tol, k.alternatives, k.bonus])
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
function mergeQualityResults(localFailed, review) {
  const extra = localFailed.filter((n) => !review.failedGoTo.includes(n))
  const failedGoTo = [...new Set([...review.failedGoTo, ...localFailed])].sort((a, b) => a - b)
  const lines = extra.length
    ? [...review.messages, `Go to Q ${extra.join(', ')}. The local display check found a problem on this card.`]
    : review.messages
  return { passed: review.passed && extra.length === 0, failedGoTo, lines }
}

/**
 * @param {object} paper
 */
export function localOfficialPyqQualityCheck(paper) {
  const questions = Array.isArray(paper?.questions) ? paper.questions : []
  const ocr = stripHindiOcr(paper?.preparedText)
  /** @type {number[]} */
  const failedGoTo = []
  questions.forEach((q, index) => {
    if (!q || isOfficialPyqPlaceholder(q)) return
    if (q.adminApproved === true) {
      if (!isMatrixGridCard(q) && hasScrapOption(q)) failedGoTo.push(index + 1)
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
    ...withHindiOnlyFlag(mergeQualityResults(failedGoTo, review), ocr),
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
  const text = inlineSingleSymbolDisplayMath(restoreDroppedMsOnGivenLine(String(next.text ?? '')))
  const passage = inlineSingleSymbolDisplayMath(restoreDroppedMsOnGivenLine(String(next.passageText ?? '')))
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
  return next
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

  function failedNow() {
    /** @type {number[]} */
    const failed = []
    questions.forEach((q, index) => {
      if (!q || isOfficialPyqPlaceholder(q)) return
      if (q.adminApproved === true) {
        if (isMatrixGridCard(q)) return
        prepare(index)
        if (hasScrapOption(questions[index])) failed.push(index + 1)
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
    return failed
  }

  let failedGoTo = failedNow()
  for (let pass = 0; pass < MAX_QUALITY_PASSES && failedGoTo.length; pass += 1) {
    let changed = false
    for (const go of failedGoTo) {
      const index = go - 1
      if (questions[index]?.adminApproved === true) continue
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
      ...withHindiOnlyFlag(mergeQualityResults(failedGoTo, review), ocr),
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
  const requireCount = status === 'pending_review' ? countOffFacts(full, stripHindiOcr(ocr)) : 0
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
    if (!rebuilt) countRepairTried.add(attempt)
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
      /** Leftover fixes and the printed answer also reach cards the admin edited — junk and a wrong key are never an admin choice. */
      updates.releaseAdminEditIndexes = next
        .map((q, i) => {
          if (!stored[i]) return -1
          if (hasScrapOption(stored[i]) && !hasScrapOption(q)) return i
          const fresh = freshCardFor(stored, i, ocr || String(full?.preparedText ?? ''))
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
  return countOffFacts(full, stripHindiOcr(ocr))
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

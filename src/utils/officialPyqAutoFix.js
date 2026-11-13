/**
 * Auto-fix for a PENDING Official PYQ paper: each flagged question is compared
 * with the original page (the same per-question Compare, gemini-3.7-flash on the
 * FastAPI side) and a correction that passes the local checks is saved with the
 * same Undo-able save as "Fix it now". Admin-edited cards are listed, not changed.
 * Each card is tried once per version, so a reload does not spend Gemini again.
 */

import { getOfficialPyqPendingPaper, getOfficialPyqPendingOcrText, updateOfficialPyqPendingPaper } from './officialPyqPendingStore.js'
import {
  applyOfficialPyqCardDraft,
  formatOfficialPyqAnswerKey,
  officialPyqCardForAdmin,
  officialPyqCompareHasSuggestion,
  officialPyqDraftFigureProblem,
  officialPyqDraftFromCard,
  officialPyqDraftFromSuggestion,
  officialPyqPrintedAnswerPatch,
  recheckOfficialPyqCardQuality,
  saveOfficialPyqCardEdit,
} from './officialPyqCardEdit.js'
import {
  compareOfficialPyqCardRemote,
  officialPyqFlaggedGoTo,
  officialPyqPrintedNumber,
  saveOfficialPyqCompareResult,
} from './officialPyqOriginalCompare.js'
import { officialPyqDrawnProblems } from './officialPyqDrawnCheck.js'
import { officialPyqCurrentCompare } from './officialPyqCompareFreshness.js'
import { isOfficialPyqPlaceholder } from './officialPyqMissingSlots.js'
import { reviewOfficialPyqCards } from './officialPyqUnifiedCheck.js'
import {
  officialPyqCountRepairNeeded,
  officialPyqPrintedKeyMissingGoTo,
  persistOfficialPyqQualityRun,
} from './officialPyqLocalQuality.js'

export const OFFICIAL_PYQ_AUTO_FIX_SOURCE = 'auto_compare'
/** Runs that may retry a card after a timeout or network failure. */
export const OFFICIAL_PYQ_AUTO_FIX_ERROR_RETRIES = 2
/** Gemini calls one run may spend on a paper. */
export const OFFICIAL_PYQ_AUTO_FIX_MAX = 30
/** Tries at the answer printed on the page for a card still missing it; the scan often drops an "ANSWER : C" line (2012 P2 Q9). */
export const OFFICIAL_PYQ_AUTO_FIX_KEY_TRIES = 2

const MCQ_TYPES = /single_correct|multiple_correct|matrix_match/

/** @param {any} card */
export function officialPyqAutoFixSignature(card) {
  const raw = JSON.stringify([card?.text ?? '', card?.passageText ?? '', card?.options ?? []])
  let h = 0
  for (let i = 0; i < raw.length; i += 1) h = (Math.imul(h, 31) + raw.charCodeAt(i)) | 0
  return `${raw.length}:${(h >>> 0).toString(36)}`
}

const drawnProblems = officialPyqDrawnProblems

/**
 * Go-to numbers (1-based) that show an alert: the local quality flag, or raw code /
 * a broken picture line on the drawn card.
 * @param {any} paper
 */
export function officialPyqAlertGoTo(paper) {
  const questions = Array.isArray(paper?.questions) ? paper.questions : []
  const out = new Set(officialPyqFlaggedGoTo(paper))
  questions.forEach((q, i) => {
    if (!q || isOfficialPyqPlaceholder(q) || q.adminApproved === true) return
    if (drawnProblems(q).length) out.add(i + 1)
  })
  return [...out].sort((a, b) => a - b)
}

/** @param {any} card @param {string} ocr */
function cardReasons(card, ocr) {
  try {
    return reviewOfficialPyqCards([card], ocr, null, { cardsOnly: true }).messages.map((m) =>
      String(m).replace(/^Go to Q [\d,\s]+\.\s*/, ''),
    )
  } catch {
    return []
  }
}

/**
 * Why a Compare correction must not be saved automatically, or '' when it is safe.
 * @param {any} card the card as the admin sees it
 * @param {{ text: string, passageText: string, options: string[] }} draft
 * @param {{ ocr?: string, printedNumber?: number }} [ctx]
 */
export function officialPyqAutoFixRejectReason(card, draft, ctx = {}) {
  const figure = officialPyqDraftFigureProblem(draft)
  if (figure) return figure
  const next = applyOfficialPyqCardDraft(card, draft)
  if (!String(next.text ?? '').trim()) return 'the corrected question text is empty'
  const shown = drawnProblems(next)
  if (shown.length) return shown[0]
  const n = Number(ctx.printedNumber)
  const printed = String(next.text).match(/^\s*Q\s*\.?\s*(\d{1,3})\b/)
  if (printed && Number.isFinite(n) && Number(printed[1]) !== n) return `the correction is for Q${printed[1]}, not Q${n}`
  const opts = (Array.isArray(next.options) ? next.options : []).map((o) => String(o ?? '').trim()).filter(Boolean)
  const type = String(next.questionType ?? '')
  if (MCQ_TYPES.test(type)) {
    if (opts.length < 2) return 'the correction leaves an option box empty'
    if (new Set(opts.map((o) => o.replace(/\s+/g, ''))).size < opts.length) return 'two options in the correction are the same'
  } else if (/^(?:integer|numerical)$/.test(type) && opts.length) {
    return 'the correction adds options to a number-answer question'
  }
  const before = new Set(cardReasons(card, ctx.ocr ?? ''))
  const added = cardReasons(next, ctx.ocr ?? '').filter((r) => !before.has(r))
  if (added.length) return `the correction raises a new alert (${added[0]})`
  return ''
}

/** Edited by a person, not by an earlier auto-fix. @param {any} card */
export function officialPyqCardHumanEdited(card) {
  return card?.adminEdited === true && card?.editSource !== OFFICIAL_PYQ_AUTO_FIX_SOURCE
}

/**
 * Go-to numbers the next run would send: alert cards not edited by a person and
 * not already tried in this version.
 * @param {any} paper
 */
export function officialPyqAutoFixTodo(paper) {
  const questions = Array.isArray(paper?.questions) ? paper.questions : []
  const keyOnly = answerOnlyGoTo(paper)
  return officialPyqAlertGoTo(paper).filter((goTo) => {
    const card = questions[goTo - 1]
    if (!card || isOfficialPyqPlaceholder(card)) return false
    if (keyOnly.has(goTo) && storedKeyPatch(card)) return true
    if (storedNewerCorrection(card)) return true
    if (alreadyTried(card, keyOnly.has(goTo))) return false
    return !officialPyqCardHumanEdited(card) || keyOnly.has(goTo)
  })
}

/** The key an earlier Compare read on the original page, when it can now go on the card. @param {any} card */
function storedKeyPatch(card) {
  const compared = officialPyqCurrentCompare(card)
  return compared ? officialPyqPrintedAnswerPatch(card, compared) : null
}

/**
 * A Compare report on this version of the card, newer than its last Auto-fix try, with a correction
 * still to apply: "Compare with original paper" answered after Auto-fix runs timed out (2012 P2 Q26).
 * It is applied without asking Gemini again. @param {any} card
 */
function storedNewerCorrection(card) {
  if (officialPyqCardHumanEdited(card)) return null
  const compared = officialPyqCurrentCompare(card)
  if (!compared || String(compared.verdict) !== 'differs') return null
  if (!(Number(compared.checkedAt) > (Number(card?.autoFix?.at) || 0))) return null
  return officialPyqCompareHasSuggestion(compared) ? compared : null
}

/** A person's wording is never rewritten, but the answer printed on the page may still be filled in. */
function answerOnlyGoTo(paper) {
  try {
    return new Set(officialPyqPrintedKeyMissingGoTo(paper))
  } catch {
    return new Set()
  }
}

/**
 * A card still flagged for its missing key is tried again until Compare has looked for the printed
 * key {@link OFFICIAL_PYQ_AUTO_FIX_KEY_TRIES} times: a try that fixed only the wording or pictures,
 * or saw no key on the page, leaves the key unread.
 * @param {any} card @param {boolean} [keyMissing]
 */
function alreadyTried(card, keyMissing = false) {
  const tried = Array.isArray(card?.autoFix?.tried) ? card.autoFix.tried : []
  if (!tried.includes(officialPyqAutoFixSignature(card))) return false
  if (!keyMissing) return true
  return (Number(card.autoFix.keyTries) || 0) >= OFFICIAL_PYQ_AUTO_FIX_KEY_TRIES
}

/**
 * Remember the attempt on the card, outside the edit history: after Undo the card is
 * back to a version already tried, so the next run does not fix it again.
 * @param {string[]} signatures versions of the card this attempt covered
 */
function markAttempt(paperId, index, signatures, info) {
  const paper = getOfficialPyqPendingPaper(paperId)
  const questions = Array.isArray(paper?.questions) ? paper.questions.slice() : null
  if (!questions?.[index]) return
  const prior = Array.isArray(questions[index].autoFix?.tried) ? questions[index].autoFix.tried : []
  const tried = [...new Set([...signatures, ...prior])].slice(0, 8)
  questions[index] = { ...questions[index], autoFix: { ...info, tried, at: Date.now() } }
  updateOfficialPyqPendingPaper(paperId, { questions })
}
/**
 * @param {string} paperId
 * @param {{
 *   signal?: AbortSignal,
 *   onProgress?: (done: number, total: number, label: string) => void,
 *   max?: number,
 *   compare?: typeof compareOfficialPyqCardRemote,
 * }} [opts]
 */
export async function autoFixFlaggedOfficialPyqCards(paperId, opts = {}) {
  const { signal, onProgress, max = OFFICIAL_PYQ_AUTO_FIX_MAX, compare = compareOfficialPyqCardRemote } = opts
  let paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { ok: false, error: 'Paper not found.' }
  if (String(paper.status) !== 'pending_review') {
    return { ok: false, error: 'Auto-fix runs only on a pending paper. Published questions stay locked.' }
  }
  /** @type {{ from: number, to: number, expected: number } | null} */
  let rebuilt = null
  const expected = officialPyqCountRepairNeeded(paper)
  if (expected) {
    // Missing or split questions shift every later card, so Compare would judge the wrong question.
    const from = paper.questions?.length ?? 0
    onProgress?.(0, 1, `Auto-fix · Rebuilding the question list from the scan (${from} of ${expected})`)
    try {
      persistOfficialPyqQualityRun(paper)
    } catch {
      /* the count line stays on the paper */
    }
    paper = getOfficialPyqPendingPaper(paperId) || paper
    rebuilt = { from, to: paper.questions?.length ?? 0, expected }
  }
  const ocr = getOfficialPyqPendingOcrText(paperId) || String(paper.preparedText ?? '')
  const out = {
    ok: true,
    rebuilt,
    fixed: /** @type {number[]} */ ([]),
    stillFlagged: /** @type {number[]} */ ([]),
    needsAdmin: /** @type {{ goTo: number, reason: string }[]} */ ([]),
    skippedAdminEdited: /** @type {number[]} */ ([]),
    skippedTried: /** @type {number[]} */ ([]),
    notTried: /** @type {number[]} */ ([]),
  }
  const todo = []
  const keyOnly = answerOnlyGoTo(paper)
  for (const goTo of officialPyqAlertGoTo(paper)) {
    const card = paper.questions[goTo - 1]
    if (!card || isOfficialPyqPlaceholder(card)) continue
    if (officialPyqCardHumanEdited(card) && !keyOnly.has(goTo)) out.skippedAdminEdited.push(goTo)
    else if (
      alreadyTried(card, keyOnly.has(goTo)) &&
      !(keyOnly.has(goTo) && storedKeyPatch(card)) &&
      !storedNewerCorrection(card)
    ) {
      out.skippedTried.push(goTo)
    }
    else todo.push(goTo)
  }
  const run = todo.slice(0, Math.max(0, max))
  out.notTried = todo.slice(run.length)
  for (let i = 0; i < run.length; i += 1) {
    if (signal?.aborted) return { ...out, ok: false, aborted: true, error: 'Stopped.' }
    const goTo = run[i]
    const index = goTo - 1
    onProgress?.(i, run.length, `Auto-fix · Question ${i + 1} of ${run.length} (Q ${goTo})`)
    const card = getOfficialPyqPendingPaper(paperId)?.questions?.[index]
    if (!card) continue
    const signature = officialPyqAutoFixSignature(card)
    const keyOnStore = keyOnly.has(goTo) && storedKeyPatch(card)
    const stored = keyOnStore ? null : storedNewerCorrection(card)
    let result
    let compared
    if (keyOnStore || stored) {
      compared = stored || officialPyqCurrentCompare(card)
      result = { verdict: String(compared?.verdict ?? 'differs'), differences: compared?.differences, pages: compared?.pages }
    } else {
      try {
        result = await compare(paperId, index, card, { signal })
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return { ...out, ok: false, aborted: true, error: 'Stopped.' }
        if (err?.code) return { ...out, ok: false, error: err.message || 'Compare stopped.' }
        result = { verdict: 'error', error: err instanceof Error ? err.message : 'Compare failed.' }
      }
      compared = saveOfficialPyqCompareResult(paperId, index, result, card)?.questions?.[index]?.originalCompare
    }
    const verdict = String(result?.verdict ?? 'error')
    const keyInfo = keyOnly.has(goTo)
      ? {
          keyRead: String(compared?.printedAnswer ?? '').trim() !== '',
          keyTries: (Number(card.autoFix?.keyTries) || 0) + 1,
        }
      : {}
    const note = (reason) => {
      out.needsAdmin.push({ goTo, reason })
      markAttempt(paperId, index, [signature], { outcome: 'needs_admin', reason, ...keyInfo })
    }
    if (verdict === 'error') {
      // A timeout or network failure does not use up the card's one try, up to OFFICIAL_PYQ_AUTO_FIX_ERROR_RETRIES runs.
      const errors = (Number(card.autoFix?.errors) || 0) + 1
      if (errors < OFFICIAL_PYQ_AUTO_FIX_ERROR_RETRIES) {
        out.needsAdmin.push({ goTo, reason: `Compare failed: ${result?.error || 'no answer'} It will be tried again next run.` })
        markAttempt(paperId, index, [], { outcome: 'error', errors, reason: String(result?.error || '') })
      } else {
        note(`Compare failed ${errors} times: ${result?.error || 'no answer'}`)
      }
      continue
    }
    const answer = compared ? officialPyqPrintedAnswerPatch(card, compared) : null
    const human = officialPyqCardHumanEdited(card)
    if (!compared || (!answer && (human || verdict === 'matches' || !officialPyqCompareHasSuggestion(compared)))) {
      const lost =
        result?.notFound === true ||
        (Array.isArray(result?.differences) && result.differences.some((d) => d?.kind === 'extra_card'))
      if (!lost && keyOnly.has(goTo) && compared?.printedAnswer === '') {
        markAttempt(paperId, index, [signature], { outcome: 'no_printed_key', ...keyInfo })
        const rechecked = recheckOfficialPyqCardQuality(paperId, index)
        if ((rechecked?.localQuality?.failedGoTo || []).map(Number).includes(goTo)) out.stillFlagged.push(goTo)
        continue
      }
      note(
        lost
          ? `Compare could not find this question on the original page it looked at (page ${(result?.pages || []).join(', ') || '?'}); check the card's question number`
          : 'Compare found no correction, but the alert is still there',
      )
      continue
    }
    let draft
    if (human || keyOnStore) {
      draft = { ...officialPyqDraftFromCard(card), answerKey: formatOfficialPyqAnswerKey(answer), answerFromPage: true }
    } else {
      const shown = officialPyqCardForAdmin(paperId, card)
      draft = officialPyqDraftFromSuggestion(shown, compared)
      const reject = officialPyqAutoFixRejectReason(shown, draft, { ocr, printedNumber: officialPyqPrintedNumber(card, index) })
      if (reject) {
        note(`Correction not used: ${reject}`)
        continue
      }
    }
    const res = saveOfficialPyqCardEdit(paperId, index, human ? draft : { ...draft, source: OFFICIAL_PYQ_AUTO_FIX_SOURCE })
    if (!res.ok) {
      note(`Correction not saved: ${res.error}`)
      continue
    }
    const fresh = getOfficialPyqPendingPaper(paperId)?.questions?.[index]
    markAttempt(paperId, index, [officialPyqAutoFixSignature(fresh), signature], { outcome: 'fixed', source: OFFICIAL_PYQ_AUTO_FIX_SOURCE, ...keyInfo })
    const passed = !(res.paper?.localQuality?.failedGoTo || []).map(Number).includes(goTo)
    if (passed) out.fixed.push(goTo)
    else out.stillFlagged.push(goTo)
  }
  onProgress?.(run.length, run.length, 'Done')
  return out
}

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
  officialPyqCardForAdmin,
  officialPyqCompareHasSuggestion,
  officialPyqDraftFigureProblem,
  officialPyqDraftFromSuggestion,
  saveOfficialPyqCardEdit,
} from './officialPyqCardEdit.js'
import {
  compareOfficialPyqCardRemote,
  officialPyqDrawnRawCode,
  officialPyqDrawnText,
  officialPyqFlaggedGoTo,
  officialPyqPrintedNumber,
  saveOfficialPyqCompareResult,
} from './officialPyqOriginalCompare.js'
import { isOfficialPyqPlaceholder } from './officialPyqMissingSlots.js'
import { mathDrawFailure } from './mathDrawCheck.js'
import { reviewOfficialPyqCards } from './officialPyqUnifiedCheck.js'

export const OFFICIAL_PYQ_AUTO_FIX_SOURCE = 'auto_compare'
/** Gemini calls one run may spend on a paper. */
export const OFFICIAL_PYQ_AUTO_FIX_MAX = 8

const MCQ_TYPES = /single_correct|multiple_correct|matrix_match/

/** @param {any} card */
export function officialPyqAutoFixSignature(card) {
  const raw = JSON.stringify([card?.text ?? '', card?.passageText ?? '', card?.options ?? []])
  let h = 0
  for (let i = 0; i < raw.length; i += 1) h = (Math.imul(h, 31) + raw.charCodeAt(i)) | 0
  return `${raw.length}:${(h >>> 0).toString(36)}`
}

/** @param {any} card */
function drawnProblems(card) {
  const parts = [card?.passageText, card?.text, ...(Array.isArray(card?.options) ? card.options : [])].map((p) =>
    String(p ?? ''),
  )
  const out = []
  for (const part of parts) {
    const fail = mathDrawFailure(part)
    if (fail) {
      out.push(`the math does not draw (${fail})`)
      break
    }
  }
  out.push(...officialPyqDrawnRawCode(parts.map((p) => officialPyqDrawnText(p)).join('\n')))
  return out
}

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

/** @param {any} card */
function alreadyTried(card) {
  const tried = Array.isArray(card?.autoFix?.tried) ? card.autoFix.tried : []
  return tried.includes(officialPyqAutoFixSignature(card))
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
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { ok: false, error: 'Paper not found.' }
  if (String(paper.status) !== 'pending_review') {
    return { ok: false, error: 'Auto-fix runs only on a pending paper. Published questions stay locked.' }
  }
  const ocr = getOfficialPyqPendingOcrText(paperId) || String(paper.preparedText ?? '')
  const out = {
    ok: true,
    fixed: /** @type {number[]} */ ([]),
    stillFlagged: /** @type {number[]} */ ([]),
    needsAdmin: /** @type {{ goTo: number, reason: string }[]} */ ([]),
    skippedAdminEdited: /** @type {number[]} */ ([]),
    skippedTried: /** @type {number[]} */ ([]),
    notTried: /** @type {number[]} */ ([]),
  }
  const todo = []
  for (const goTo of officialPyqAlertGoTo(paper)) {
    const card = paper.questions[goTo - 1]
    if (!card || isOfficialPyqPlaceholder(card)) continue
    if (card.adminEdited === true) out.skippedAdminEdited.push(goTo)
    else if (alreadyTried(card)) out.skippedTried.push(goTo)
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
    let result
    try {
      result = await compare(paperId, index, card, { signal })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return { ...out, ok: false, aborted: true, error: 'Stopped.' }
      if (err?.code) return { ...out, ok: false, error: err.message || 'Compare stopped.' }
      result = { verdict: 'error', error: err instanceof Error ? err.message : 'Compare failed.' }
    }
    const saved = saveOfficialPyqCompareResult(paperId, index, result)
    const compared = saved?.questions?.[index]?.originalCompare
    const verdict = String(result?.verdict ?? 'error')
    const note = (reason) => {
      out.needsAdmin.push({ goTo, reason })
      markAttempt(paperId, index, [signature], { outcome: 'needs_admin', reason })
    }
    if (verdict === 'error') {
      note(`Compare failed: ${result?.error || 'no answer'}`)
      continue
    }
    if (verdict === 'matches' || !compared || !officialPyqCompareHasSuggestion(compared)) {
      note('Compare found no correction, but the alert is still there')
      continue
    }
    const shown = officialPyqCardForAdmin(paperId, card)
    const draft = officialPyqDraftFromSuggestion(shown, compared)
    const reject = officialPyqAutoFixRejectReason(shown, draft, { ocr, printedNumber: officialPyqPrintedNumber(card, index) })
    if (reject) {
      note(`Correction not used: ${reject}`)
      continue
    }
    const res = saveOfficialPyqCardEdit(paperId, index, { ...draft, source: OFFICIAL_PYQ_AUTO_FIX_SOURCE })
    if (!res.ok) {
      note(`Correction not saved: ${res.error}`)
      continue
    }
    const fresh = getOfficialPyqPendingPaper(paperId)?.questions?.[index]
    markAttempt(paperId, index, [officialPyqAutoFixSignature(fresh), signature], { outcome: 'fixed', source: OFFICIAL_PYQ_AUTO_FIX_SOURCE })
    const passed = !(res.paper?.localQuality?.failedGoTo || []).map(Number).includes(goTo)
    if (passed) out.fixed.push(goTo)
    else out.stillFlagged.push(goTo)
  }
  onProgress?.(run.length, run.length, 'Done')
  return out
}

/**
 * What runs right after the admin confirms a paper's facts.
 * Pending: the free rebuild from the stored OCR first, then the paid per-question Compare
 * auto-fix only for cards still flagged — and only when Compare is available and the admin
 * agreed (confirmPaid). Approved: re-checked, only flagged cards change. Published: re-checked
 * and flagged, never rewritten.
 */

import { autoFixFlaggedOfficialPyqCards, officialPyqAutoFixTodo } from './officialPyqAutoFix.js'
import { officialPyqCountRepairNeeded, persistOfficialPyqQualityRun } from './officialPyqLocalQuality.js'
import { getOfficialPyqPendingPaper } from './officialPyqPendingStore.js'

/** Fired by the Paper facts form after a real confirm; detail: { paperId, before, handled }. */
export const OFFICIAL_PYQ_FACTS_CONFIRMED_EVENT = 'testvantage:official-pyq-facts-confirmed'

/**
 * @param {string} paperId
 * @param {{
 *   before?: number,
 *   canCompare?: boolean,
 *   confirmPaid?: (todo: number[]) => boolean | Promise<boolean>,
 *   signal?: AbortSignal,
 *   onProgress?: (done: number, total: number, label: string) => void,
 *   max?: number,
 *   compare?: any,
 * }} [opts] before: card count before the confirm; without confirmPaid nothing is sent to Gemini.
 */
export async function autoFixAfterOfficialPyqFactsConfirmed(paperId, opts = {}) {
  const { before, canCompare = false, confirmPaid, ...autoFixOpts } = opts
  let paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { ok: false, error: 'Paper not found.' }
  const status = String(paper.status ?? '')
  if (status !== 'pending_review') {
    const checked = persistOfficialPyqQualityRun(paper)
    return {
      ok: true,
      mode: status === 'published' ? 'flag_only' : 'flagged_only',
      paid: false,
      failedGoTo: Array.isArray(checked?.localQuality?.failedGoTo) ? checked.localQuality.failedGoTo : [],
    }
  }
  const from = before != null && Number.isFinite(Number(before)) ? Number(before) : paper.questions?.length ?? 0
  const expected = officialPyqCountRepairNeeded(paper)
  if (expected) {
    autoFixOpts.onProgress?.(0, 1, `Auto-fix · Rebuilding the question list from the scan (${paper.questions?.length ?? 0} of ${expected})`)
    try {
      persistOfficialPyqQualityRun(paper)
    } catch {
      /* the count line stays on the paper */
    }
    paper = getOfficialPyqPendingPaper(paperId) || paper
  }
  const to = paper.questions?.length ?? 0
  const rebuilt = expected || from !== to ? { from, to, expected: expected || Number(paper.expectedQuestionCount) || to } : null
  const todo = officialPyqAutoFixTodo(paper)
  const result = {
    ok: true,
    mode: 'auto_fix',
    paid: false,
    rebuilt,
    todo,
    waiting: '',
    fixed: /** @type {number[]} */ ([]),
    stillFlagged: /** @type {number[]} */ ([]),
    needsAdmin: /** @type {{ goTo: number, reason: string }[]} */ ([]),
    skippedAdminEdited: /** @type {number[]} */ ([]),
    skippedTried: /** @type {number[]} */ ([]),
    notTried: /** @type {number[]} */ ([]),
  }
  if (!todo.length) return result
  if (!canCompare) return { ...result, waiting: 'compare_unavailable' }
  if (!confirmPaid || !(await confirmPaid(todo))) return { ...result, waiting: 'declined' }
  const out = await autoFixFlaggedOfficialPyqCards(paperId, autoFixOpts)
  return { ...result, ...out, mode: 'auto_fix', paid: true, todo, rebuilt: rebuilt || out.rebuilt || null }
}

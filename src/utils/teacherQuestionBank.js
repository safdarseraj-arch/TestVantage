/**
 * Teacher private bank vs main bank — ownership, soft-delete, silent publish.
 *
 * Storage stays one shared bank. Teachers without ACCESS_MAIN_QUESTION_BANK only
 * see rows they own that are still in their private bank. Silent publish makes a
 * question available in papers/practice without a noisy student announcement.
 */

import { getCurrentUploadOperator } from './questionUploadMeta.js'
import {
  isQuestionPublished,
  effectiveBankStatus,
} from './questionUploadFilter.js'
import {
  loadQuestionBank,
  saveQuestionBank,
  removeUploadedQuestions,
  publishUploadedQuestion,
  publishUploadedQuestions,
} from './questionBank.js'
import { appendQuestionHistory } from './questionBankHistory.js'
import { PERMS, sessionHasPermission } from './permissions.js'

/**
 * @param {import('../data/tests').Question | null | undefined} q
 * @param {string} teacherId
 */
export function questionOwnedByTeacher(q, teacherId) {
  const want = String(teacherId ?? '').trim()
  if (!want || !q) return false
  const id = String(q.uploadedById ?? '').trim()
  return !!id && id === want
}

/**
 * Still listed in the teacher's private organise bank.
 * @param {import('../data/tests').Question | null | undefined} q
 * @param {string} teacherId
 */
export function isInTeacherPrivateBank(q, teacherId) {
  if (!questionOwnedByTeacher(q, teacherId)) return false
  return q?.removedFromTeacherBank !== true
}

/**
 * Admin, or teacher granted main-bank access.
 * @param {{ role?: string, permissions?: string[] } | null | undefined} session
 */
export function canAccessMainQuestionBank(session) {
  return sessionHasPermission(session, PERMS.ACCESS_MAIN_QUESTION_BANK)
}

/**
 * @param {import('../data/tests').Question[]} questions
 * @param {{
 *   session?: { role?: string, userId?: string, permissions?: string[] } | null
 *   forceMine?: boolean
 *   includeRemovedFromMine?: boolean
 * }} [opts]
 */
export function filterQuestionsForTeacherScope(questions, opts = {}) {
  const list = questions ?? []
  const session = opts.session ?? null
  const role = session?.role
  const teacherId = String(session?.userId ?? '').trim()

  if (role === 'admin' && !opts.forceMine) return list
  if (canAccessMainQuestionBank(session) && !opts.forceMine) return list

  if (!teacherId) return []

  return list.filter((q) => {
    // Legacy / guest uploads (no owner or "local") stay visible so the bank
    // does not look wiped after signing in as a teacher.
    const owner = String(q?.uploadedById ?? '').trim()
    if (!owner || owner === 'local') return q?.removedFromTeacherBank !== true
    if (!questionOwnedByTeacher(q, teacherId)) return false
    if (opts.includeRemovedFromMine) return true
    return q?.removedFromTeacherBank !== true
  })
}

/**
 * Default create-paper pool: teacher's own published questions still in their bank.
 * With main-bank access, callers may pass `scope: 'main'` for the full published set.
 * @param {import('../data/tests').Question[]} publishedQuestions
 * @param {{
 *   session?: { role?: string, userId?: string, permissions?: string[] } | null
 *   scope?: 'mine' | 'main'
 * }} [opts]
 */
export function filterQuestionsForCreatePaper(publishedQuestions, opts = {}) {
  const list = publishedQuestions ?? []
  const session = opts.session ?? null
  const scope = opts.scope ?? 'mine'
  const teacherId = String(session?.userId ?? '').trim()

  if (session?.role === 'admin' && scope === 'main') return list
  if (scope === 'main' && canAccessMainQuestionBank(session)) return list

  if (!teacherId) {
    if (session?.role === 'admin') return list
    return []
  }

  return list.filter(
    (q) => questionOwnedByTeacher(q, teacherId) && q?.removedFromTeacherBank !== true,
  )
}

/** @param {import('../data/tests').Question | null | undefined} q */
export function isSilentPublished(q) {
  return isQuestionPublished(q) && q?.silentPublish === true
}

/**
 * Soft-remove from teacher private bank, or hard-delete if still draft (never published).
 * Published (incl. silent) rows stay in the main bank.
 * @param {string} id
 * @param {{ teacherId?: string, operator?: import('./questionUploadMeta.js').UploadOperator }} [opts]
 * @returns {{ ok: boolean, mode?: 'soft' | 'hard', entry?: import('../data/tests').Question | null, error?: string }}
 */
export function removeQuestionFromTeacherBank(id, opts = {}) {
  const bank = loadQuestionBank()
  const idx = bank.questions.findIndex((q) => String(q.id) === String(id))
  if (idx === -1) return { ok: false, error: 'Question not found.' }

  const q = bank.questions[idx]
  const teacherId = String(opts.teacherId ?? '').trim()
  if (teacherId && !questionOwnedByTeacher(q, teacherId)) {
    return { ok: false, error: 'You can only remove questions from your own bank.' }
  }

  if (effectiveBankStatus(q) === 'published' || q.publishedAt) {
    const op = opts.operator ?? getCurrentUploadOperator()
    let next = {
      ...q,
      removedFromTeacherBank: true,
      updatedAt: Date.now(),
    }
    next = appendQuestionHistory(next, {
      byId: op.id,
      byName: op.name,
      byRole: op.role,
      action: 'updated',
      summary: 'Removed from teacher private bank (kept in main bank)',
    })
    bank.questions[idx] = next
    saveQuestionBank(bank)
    return { ok: true, mode: 'soft', entry: next }
  }

  const removed = removeUploadedQuestions([id])
  if (removed.blockedEmpty) {
    return { ok: false, error: 'Could not delete — that would empty the whole bank.' }
  }
  if (!removed.removedIds.length) {
    return { ok: false, error: 'Question not found.' }
  }
  return { ok: true, mode: 'hard', entry: null }
}

/**
 * Publish into the main bank without student-facing announcement noise.
 * @param {string} id
 * @returns {import('../data/tests').Question | null}
 */
export function publishQuestionSilently(id, opts = {}) {
  return publishUploadedQuestion(id, { ...opts, silent: true })
}

/**
 * @param {string[]} ids
 */
export function publishQuestionsSilently(ids) {
  return publishUploadedQuestions(ids, { silent: true })
}

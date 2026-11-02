/**
 * Save admin-confirmed paper facts on a pending paper, re-shape its cards with
 * them, and re-run the local quality check. Never touches a published paper.
 */

import { ADMIN_FACTS_VERSION, applyAdminFactsToQuestions, validateAdminFacts } from './officialPyqAdminFacts.js'
import { persistOfficialPyqQualityRun } from './officialPyqLocalQuality.js'
import {
  getOfficialPyqPendingOcrText,
  getOfficialPyqPendingPaper,
  updateOfficialPyqPendingPaper,
} from './officialPyqPendingStore.js'

/**
 * @param {string} paperId
 * @param {any} draft
 */
export function confirmOfficialPyqPaperFacts(paperId, draft) {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { ok: false, errors: ['Paper not found.'] }
  if (String(paper.status) === 'approved') {
    return { ok: false, errors: ['This paper is published. Its facts and questions are locked.'] }
  }
  const { errors } = validateAdminFacts(draft)
  if (errors.length) return { ok: false, errors }
  const { readFromPaper: _read, readNotes: _notes, ...kept } = draft || {}
  const admin = { ...kept, version: ADMIN_FACTS_VERSION, confirmedAt: Date.now(), confirmedBy: 'admin' }
  const ocr = getOfficialPyqPendingOcrText(paperId) || String(paper.preparedText ?? '')
  const before = Array.isArray(paper.questions) ? paper.questions.length : 0
  const { questions, facts } = applyAdminFactsToQuestions(paper.questions, admin, ocr)
  if (!facts) return { ok: false, errors: ['The paper facts could not be read. Check the form.'] }
  const saved = updateOfficialPyqPendingPaper(paperId, {
    adminFacts: admin,
    paperFacts: facts,
    expectedQuestionCount: facts.expectedQuestionCount,
    questions,
    localQuality: undefined,
  })
  if (!saved) return { ok: false, errors: ['Could not save the paper facts.'] }
  const checked = persistOfficialPyqQualityRun(saved)
  return {
    ok: true,
    errors: [],
    before,
    after: questions.length,
    expected: facts.expectedQuestionCount,
    quality: checked?.localQuality ?? null,
  }
}

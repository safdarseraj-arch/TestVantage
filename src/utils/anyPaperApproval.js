/**
 * Any-paper Approve and Publish. Same Local AI heal as Official PYQ.
 * Publishes to the Question Bank only -- never student Official PYQ.
 */

import { assignClassifiedQuestionId } from './classifiedQuestionId.js'
import { normalizeNamedPaperTitle } from './bankMathpixUpload.js'
import { healOfficialPyqPaperQuestions } from './extendTruncatedStem.js'
import { localOfficialPyqQualityCheck } from './officialPyqLocalQuality.js'
import { ALREADY_PUBLISHED_MESSAGE, writeQuestionBankSnapshot } from './officialPyqPublishOnce.js'
import { officialPyqContentReviewMessages } from './officialPyqReviewFlags.js'
import { peelOfficialPyqCardForDisplay } from './passage.js'
import { healUploadQuestionCard } from './uploadQualityGuards.js'
import { addBulkUploadedQuestions, loadQuestionBank, publishUploadedQuestions } from './questionBank.js'
import {
  countFilledAnyPaperQuestions,
  getAnyPaperPending,
  updateAnyPaperPending,
} from './anyPaperPendingStore.js'

function anyPaperSittingPublishedInBank(paper) {
  const name = normalizeNamedPaperTitle(paper?.paperName).toLowerCase()
  if (!name) return false
  const rows = loadQuestionBank()?.questions ?? []
  return rows.some((q) => {
    if (!q || q.officialPyq === true) return false
    if (String(q.bankSource || '') !== 'any_paper') return false
    return normalizeNamedPaperTitle(q.paperName).toLowerCase() === name
  })
}

/**
 * Same red-banner check Official PYQ uses. Never sets passed while a card fails.
 * @param {object} paper
 * @param {object[]} questions
 */
function reviewAnyPaperCards(paper, questions) {
  const list = Array.isArray(questions) ? questions : []
  const body = { ...paper, questions: list }
  let quality
  try {
    quality = localOfficialPyqQualityCheck(body)
  } catch {
    quality = null
  }
  const ocr = String(paper?.preparedText ?? '')
  const shown = list.map((q) => {
    try {
      return peelOfficialPyqCardForDisplay(healUploadQuestionCard(q, ocr), ocr)
    } catch {
      return q
    }
  })
  const content = officialPyqContentReviewMessages(shown)
  const failed = Array.isArray(quality?.failedGoTo) ? quality.failedGoTo : []
  const passed =
    Boolean(quality) &&
    quality.passed === true &&
    failed.length === 0 &&
    content.length === 0 &&
    list.length > 0
  const stored = quality
    ? { ...quality, passed, failedGoTo: failed }
    : {
        passed: false,
        failedGoTo: failed,
        questionCount: list.length,
        by: 'local',
      }
  /** @type {string[]} */
  const errors = []
  if (!passed) {
    const nums = failed.slice(0, 24).join(', ')
    errors.push(
      quality
        ? `Quality checked by local AI — not passed.${nums ? ` Go to Q ${nums}.` : ''} Do not approve.`
        : 'Quality check by local AI has not passed.',
    )
  }
  errors.push(...content)
  return { passed, quality: stored, errors }
}

export function validateAnyPaperForApprove(paper) {
  const errors = []
  if (!paper) {
    return { ok: false, errors: ['Select a paper first.'] }
  }
  if (paper.status === 'approved' || anyPaperSittingPublishedInBank(paper)) {
    return { ok: false, errors: [ALREADY_PUBLISHED_MESSAGE] }
  }
  if (!String(paper.paperName || '').trim()) {
    errors.push('Paper name is required.')
  }
  const filled = countFilledAnyPaperQuestions(paper.questions)
  if (!filled) {
    errors.push('Add at least one question before approving. Review the cards first.')
  } else {
    const failed = Array.isArray(paper.localQuality?.failedGoTo) ? paper.localQuality.failedGoTo : []
    if (!paper.localQuality || paper.localQuality.passed !== true || failed.length) {
      const nums = failed.slice(0, 24).join(', ')
      errors.push(
        paper.localQuality?.passed === false
          ? `Quality checked by local AI — not passed.${nums ? ` Go to Q ${nums}.` : ''} Do not approve.`
          : 'Quality check by local AI has not passed.',
      )
    }
  }
  return { ok: errors.length === 0, errors }
}

/**
 * Send a published named paper back to review. Does not publish.
 * @param {string} paperId
 */
export function unapproveAnyPaper(paperId) {
  const paper = getAnyPaperPending(paperId)
  if (!paper) return { ok: false, error: 'Paper not found.' }
  const name = normalizeNamedPaperTitle(paper.paperName).toLowerCase()
  const bank = loadQuestionBank()
  const before = bank?.questions ?? []
  const next = before.filter((q) => {
    if (!q || q.officialPyq === true) return true
    if (String(q.bankSource || '') !== 'any_paper') return true
    return normalizeNamedPaperTitle(q.paperName).toLowerCase() !== name
  })
  const bankRemoved = before.length - next.length
  if (bankRemoved > 0) writeQuestionBankSnapshot(bank, next)
  if (paper.status === 'pending_review' && bankRemoved === 0) {
    return { ok: true, paper, bankRemoved: 0 }
  }
  const updated = updateAnyPaperPending(paper.id, {
    status: 'pending_review',
    reviewedAt: undefined,
  })
  return { ok: Boolean(updated), paper: updated, bankRemoved }
}

function pendingToBankRow(paper, q, index, peers) {
  const now = Date.now()
  const draft = {
    text: String(q.text ?? '').trim(),
    options: Array.isArray(q.options) ? q.options.map((o) => String(o ?? '')) : [],
    correctIndex: q.correctIndex,
    correctIndices: q.correctIndices,
    correctInteger: q.correctInteger,
    correctNumerical: q.correctNumerical,
    solution: q.solution,
    subject: String(q.subject || 'physics'),
    chapter: String(q.chapter || 'General'),
    section: q.section || q.unit || 'General',
    questionType: q.questionType || 'single',
    paperName: paper.paperName,
    paperLabel: paper.paperName,
    source: paper.paperName,
    officialPyq: false,
    imported: false,
    bankSource: 'any_paper',
    answerSource: q.answerSource || 'unknown',
    solutionSource: q.solutionSource,
    provenance: q.provenance || paper.paperName,
    bankStatus: 'draft',
    savedAt: now,
    passageText: String(q.passageText ?? '').trim() || undefined,
    passageGroup: q.passageGroup || undefined,
    passageId: q.passageId || undefined,
    passageRole: q.passageRole || undefined,
    questionImage: q.questionImage,
  }
  const assigned = assignClassifiedQuestionId(draft, peers, { excludeIds: [] })
  return { ...draft, ...assigned, id: assigned.id || `uq-anyp-${paper.id}-${index}-${now}` }
}

export function approveAnyPaper(paperId, opts = {}) {
  const paper = getAnyPaperPending(paperId)
  const gate = validateAnyPaperForApprove(paper)
  if (!gate.ok || !paper) {
    return { ok: false, errors: gate.errors, bankCount: 0 }
  }
  opts.onProgress?.(20, 'Cleaning question cards...')
  const storedReview = reviewAnyPaperCards(paper, paper.questions)
  const healed = healOfficialPyqPaperQuestions(paper).filter((q) => String(q?.text ?? '').trim())
  const healedReview = healed.length ? reviewAnyPaperCards(paper, healed) : storedReview
  const passed = storedReview.passed && healedReview.passed && healed.length > 0
  const quality = storedReview.passed
    ? { ...healedReview.quality, passed: passed === true && healedReview.quality.passed === true }
    : storedReview.quality
  updateAnyPaperPending(paper.id, { localQuality: quality })
  if (!passed) {
    const errors = [...new Set([...storedReview.errors, ...healedReview.errors])]
    return {
      ok: false,
      errors: errors.length ? errors : ['No usable questions to publish.'],
      bankCount: 0,
    }
  }
  opts.onProgress?.(70, `Numbering ${healed.length} question(s)...`)
  const peers = [...(loadQuestionBank().questions ?? [])]
  const rows = healed.map((q, i) => {
    const row = pendingToBankRow(paper, q, i, peers)
    peers.push(row)
    return row
  })
  opts.onProgress?.(90, 'Saving to the Question Bank...')
  const added = addBulkUploadedQuestions(rows)
  const ids = added.map((r) => r.id)
  publishUploadedQuestions(ids)
  updateAnyPaperPending(paper.id, {
    status: 'approved',
    reviewedAt: Date.now(),
    questions: healed,
    localQuality: quality,
  })
  opts.onProgress?.(100, 'Published')
  return { ok: true, errors: [], bankCount: ids.length, bankIds: ids }
}

export async function approveAnyPaperAsync(paperId, opts = {}) {
  const yieldFn = opts.yieldFn || (() => Promise.resolve())
  await yieldFn()
  return approveAnyPaper(paperId, opts)
}

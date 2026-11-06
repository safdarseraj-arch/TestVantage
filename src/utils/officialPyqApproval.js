/**
 * Official PYQ approval state machine:
 *   pending_review → approved  (publish to student PYQ + Question Bank)
 *   pending_review → rejected  (stay out of PYQ / bank)
 *   approved → pending_review  (unpublish: pull from student PYQ + bank)
 *
 * Never invents official papers. AI solutions stay labelled separately.
 */

import { answerSourceBadgeLabel } from './answerProvenance.js'
import { persistOfficialPyqQualityRun } from './officialPyqLocalQuality.js'
import { enforceAdminFactsOnQuestions } from './officialPyqAdminFacts.js'
import {
  looksLikeAnswerKeyMappingBlob,
  looksLikePyqSectionInstructionStem,
} from './bulkExtractClean.js'
import { looksLikeOfficialPyqPassageOnly } from './passage.js'
import {
  officialPyqContentReviewMessages,
  officialPyqMissingListMessage,
  storedReviewIndex,
} from './officialPyqReviewFlags.js'
import { hasMathpixMedia } from './mathpixMedia.js'
import {
  extendOfficialPyqHealCard,
  finalizeOfficialPyqHealCards,
  healOfficialPyqPaperQuestions,
  healUploadQuestionCard,
  matchQuestionMissingListI,
  officialPyqPaperSourceText,
  prepareOfficialPyqHealContext,
} from './extendTruncatedStem.js'
import { enrichMatchListsFromOcr } from './restoreMatchListsOcr.js'
import { addImportedPyqs, loadImportedPyqs, saveImportedPyqs } from './pyqStore.js'
import {
  ALREADY_PUBLISHED_MESSAGE,
  officialPyqPublishSittingKey,
  officialPyqPublishSittingKeyFromPaper,
  officialPyqSittingHasPublishedQuestions,
  removeOlderDuplicateOfficialPyqPublishes,
  writeQuestionBankSnapshot,
} from './officialPyqPublishOnce.js'
import {
  addBulkUploadedQuestions,
  loadQuestionBank,
  publishUploadedQuestions,
} from './questionBank.js'
import { assignClassifiedQuestionId } from './classifiedQuestionId.js'
import { officialPyqReplicaChildId } from './officialPyqReplica.js'
import { pyqId, stripFounderIdSuffixes } from './questionId.js'
import {
  addOfficialPyqPendingPaper,
  getOfficialPyqPendingPaper,
  getOfficialPyqPendingOcrText,
  removeOfficialPyqPendingPaper,
  removeOfficialPyqPendingSitting,
  updateOfficialPyqPendingPaper,
} from './officialPyqPendingStore.js'
import {
  expectedPyqPaperQuestionTarget,
  formatOfficialPyqExtractSummary,
  formatOfficialPyqStoredNotes,
  officialPyqStoredOcrText,
  pyqExtractLowCountThreshold,
  questionsFromOfficialPyqExtract,
} from './pyqGeminiExtract.js'
import { sanitizeMathpixOcrText } from './mathpixQuestionSplit.js'
import { raceStepTimeout } from './ocrTimeout.js'
import { getOfficialPyqExamLabel } from '../data/officialPyqSources.js'
import {
  healAndPersistOfficialPyqPaper,
  officialPyqStoredOcrTextLocal,
  reExtractOfficialPyqPendingPaperLocal,
} from './officialPyqLocalReparse.js'
import {
  assignUniqueOfficialPyqNumbers,
  isOfficialPyqPlaceholder,
  listOfficialPyqMissingSlots,
  officialPyqExpectedTotal,
} from './officialPyqMissingSlots.js'

/** Cards the admin approved one by one are published exactly as saved, never re-healed. */
function keepApprovedOfficialPyqCards(paper, healed) {
  const approved = new Map(
    (Array.isArray(paper?.questions) ? paper.questions : [])
      .filter((q) => q?.adminApproved === true && String(q?.id ?? '').trim())
      .map((q) => [String(q.id), q]),
  )
  if (!approved.size) return healed
  return healed.map((q) => approved.get(String(q?.id ?? '')) || q)
}

function healOfficialPyqPaperQuestionsEnriched(paper, opts) {
  const source = officialPyqPaperSourceText(paper)
  return keepApprovedOfficialPyqCards(
    paper,
    healOfficialPyqPaperQuestions(paper, opts).map((q) =>
      enrichMatchListsFromOcr(healUploadQuestionCard(q, source), source),
    ),
  )
}

/** Keep in sync with GEMINI_REPARSE_TIMEOUT_MS in mathpixGeminiPipeline.js */
const GEMINI_REPARSE_TIMEOUT_MS = 90_000
const REPARSE_API_DOWN_HINT =
  'Start the API (port 3001): keep the bottom panel open, press F5 or Ctrl+Shift+B, then try Re-parse again.'

/** @typedef {import('./officialPyqPendingStore').OfficialPyqPendingPaper} OfficialPyqPendingPaper */
/** @typedef {import('./officialPyqPendingStore').OfficialPyqPendingQuestion} OfficialPyqPendingQuestion */

/**
 * @param {OfficialPyqPendingPaper} paper
 * @param {OfficialPyqPendingQuestion} q
 * @param {number} index
 */
export function pendingQuestionToPyqItem(paper, q, index) {
  const year = paper.year
  const examPatternId = paper.exam
  const paperId = paper.paperId
  const paperLabel = paper.paperLabel
  const answerSource = q.answerSource || 'unknown'
  const solutionSource = q.solutionSource || (q.solution ? 'unknown' : undefined)
  let solution = q.solution ? String(q.solution) : undefined
  if (solution && solutionSource === 'ai_generated' && !/AI solution/i.test(solution)) {
    solution = `**AI solution** (not from official key):\n\n${solution}`
  }

  return {
    id: String(q.id ?? `opyq-pub-${paper.id}-${index}`),
    text: String(q.text ?? '').trim(),
    options: Array.isArray(q.options) ? q.options.map((o) => String(o ?? '')) : [],
    correctIndex: q.correctIndex,
    correctIndices: q.correctIndices,
    correctInteger: q.correctInteger,
    correctNumerical: q.correctNumerical,
    solution,
    subject: String(q.subject || 'physics'),
    chapter: String(q.chapter || 'General'),
    questionType: q.questionType || 'single',
    pyqYear: year,
    examPatternId,
    paperId,
    paperLabel,
    pyqSession: paper.session,
    pyqDate: paper.pyqDate,
    pyqShift: paper.pyqShift,
    pyqSlot: q.pyqSlot != null ? Number(q.pyqSlot) : index + 1,
    imported: true,
    officialPyq: true,
    source: `Official PYQ · ${getOfficialPyqExamLabel(examPatternId)} ${year}`,
    sourceUrl: paper.sourceUrl,
    sourceLabel: paper.sourceLabel,
    answerSource,
    solutionSource,
    answerConfidence: q.answerConfidence,
    solutionConfidence: q.solutionConfidence,
    provenance: q.provenance || `${paper.sourceLabel}${paper.sourceUrl ? ` · ${paper.sourceUrl}` : ''}`,
    passageText: String(q.passageText ?? '').trim() || undefined,
    passageGroup: q.passageGroup || undefined,
    passageId: q.passageId || undefined,
    passageRole: q.passageRole || undefined,
    ...(q.parentQuestionId ? { parentQuestionId: String(q.parentQuestionId) } : {}),
    ...(q.replicaDifficultyOffset != null && q.replicaDifficultyOffset !== ''
      ? { replicaDifficultyOffset: Number(q.replicaDifficultyOffset) }
      : {}),
    ...(q.section || q.unit ? { section: String(q.section || q.unit) } : {}),
    ...(q.topic ? { topic: String(q.topic) } : {}),
    ...(q.toughnessLevel != null && q.toughnessLevel !== '' ? { toughnessLevel: q.toughnessLevel } : {}),
  }
}

/**
 * @param {OfficialPyqPendingPaper} paper
 * @param {ReturnType<typeof pendingQuestionToPyqItem>} pyq
 * @param {number} index
 */
export function pyqItemToBankQuestion(paper, pyq, index) {
  const now = Date.now()
  return {
    id: `uq-opyq-${paper.id}-${index}-${now}`,
    text: pyq.text,
    options: pyq.options,
    correctIndex: pyq.correctIndex,
    correctIndices: pyq.correctIndices,
    correctInteger: pyq.correctInteger,
    correctNumerical: pyq.correctNumerical,
    solution: pyq.solution,
    subject: pyq.subject,
    chapter: pyq.chapter,
    questionType: pyq.questionType || 'single',
    examIds: [paper.exam],
    examPatternId: paper.exam,
    pyqYear: paper.year,
    paperId: paper.paperId,
    paperLabel: paper.paperLabel,
    pyqSession: paper.session,
    pyqDate: paper.pyqDate || pyq.pyqDate,
    pyqShift: paper.pyqShift ?? pyq.pyqShift,
    pyqSlot: pyq.pyqSlot,
    source: pyq.source,
    tags: ['PYQ', 'official', paper.exam, String(paper.year)],
    officialPyq: true,
    imported: true,
    bankSource: 'official_pyq',
    ...(pyq.parentQuestionId ? { parentQuestionId: String(pyq.parentQuestionId) } : {}),
    ...(pyq.replicaDifficultyOffset != null && pyq.replicaDifficultyOffset !== ''
      ? { replicaDifficultyOffset: Number(pyq.replicaDifficultyOffset) }
      : {}),
    ...(pyq.section ? { section: String(pyq.section) } : {}),
    ...(pyq.topic ? { topic: String(pyq.topic) } : {}),
    ...(pyq.toughnessLevel != null && pyq.toughnessLevel !== ''
      ? { toughnessLevel: pyq.toughnessLevel }
      : {}),
    sub_bank_type: 'pyq',
    answerSource: pyq.answerSource,
    solutionSource: pyq.solutionSource,
    provenance: pyq.provenance,
    bankStatus: 'draft',
    savedAt: now,
    passageText: pyq.passageText || undefined,
    passageGroup: pyq.passageGroup || undefined,
    passageId: pyq.passageId || undefined,
    passageRole: pyq.passageRole || undefined,
  }
}

/** First child keeps the passage; later children point at it. Preview still has passageText on each. */
export function linkOfficialPyqBankPassages(rows) {
  const list = Array.isArray(rows) ? rows : []
  const firstByGroup = new Map()
  return list.map((row) => {
    if (!row || typeof row !== 'object') return row
    const g = row.passageGroup
    const pt = String(row.passageText ?? '').trim()
    if (!g || !pt) {
      const { passageGroup, ...rest } = row
      return rest
    }
    if (!firstByGroup.has(g)) {
      firstByGroup.set(g, row.id)
      const { passageGroup, ...rest } = row
      return { ...rest, passageText: pt, passageRole: rest.passageRole || 'comprehension_child' }
    }
    const { passageText, passageGroup, ...rest } = row
    return {
      ...rest,
      passageId: firstByGroup.get(g),
      passageRole: rest.passageRole || 'comprehension_child',
    }
  })
}

/**
 * Mint a classified core then append exam letter + year (founder PYQ id).
 * @param {ReturnType<typeof pyqItemToBankQuestion>} row
 * @param {OfficialPyqPendingPaper} paper
 * @param {import('../data/tests').Question[]} peers
 */
export function assignOfficialPyqSaveId(row, paper, peers = []) {
  const forId = {
    ...row,
    section: row.section || row.unit || 'General',
    chapter: row.chapter || 'General',
  }
  const assigned = assignClassifiedQuestionId(forId, peers, {
    excludeIds: [String(row.id ?? '')],
  })
  const core = stripFounderIdSuffixes(assigned.id)
  return pyqId(core, paper.exam || row.examPatternId, paper.year ?? row.pyqYear)
}

/**
 * Validate a paper can be approved.
 * @param {OfficialPyqPendingPaper | null | undefined} paper
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateOfficialPyqForApprove(paper) {
  const { ok, errors } = officialPyqApproveCheck(paper)
  return { ok, errors }
}

/**
 * Heal once, judge once, publish the very cards that were judged.
 *
 * Approve & Publish used to call the validate gate and then heal the paper a
 * second time, so a 51-card paper ran the whole heal + enrich chain twice on
 * the main thread and the page froze. The healed list travels with the result
 * instead.
 *
 * @param {OfficialPyqPendingPaper | null | undefined} paper
 * @returns {{ ok: boolean, errors: string[], healed: OfficialPyqPendingQuestion[] }}
 */
function officialPyqApproveCheck(paper, preHealed) {
  /** @type {string[]} */
  const errors = []
  if (!paper) {
    errors.push('Paper not found.')
    return { ok: false, errors, healed: [] }
  }
  /** @type {OfficialPyqPendingQuestion[]} */
  let healedOut = Array.isArray(paper.questions) ? paper.questions : []
  if (paper.status !== 'pending_review') {
    errors.push(
      paper.status === 'approved'
        ? ALREADY_PUBLISHED_MESSAGE
        : 'This paper was rejected. Import again if you still want it.',
    )
  }
  if (paper.aiReplicaPaper !== true && !paper.replicaParentPaperId && !paper.adminFacts?.confirmedAt) {
    errors.push('Paper facts are not confirmed. Open “Paper facts”, check every row, and press Confirm.')
  }
  if (!Array.isArray(paper.questions) || paper.questions.length === 0) {
    errors.push('Add at least one question before approving.')
  } else {
    const ocr = String(paper.preparedText ?? '').trim() || getOfficialPyqPendingOcrText(paper.id)
    const ready = ocr && ocr !== String(paper.preparedText ?? '').trim() ? { ...paper, preparedText: ocr } : paper
    let healed = Array.isArray(preHealed) && preHealed.length
      ? preHealed
      : Array.isArray(paper.questions)
        ? paper.questions
        : []
    if (!(Array.isArray(preHealed) && preHealed.length)) {
      try {
        const live = healOfficialPyqPaperQuestionsEnriched(ready)
        if (Array.isArray(live) && live.length) healed = live
      } catch {
        /* use stored cards */
      }
    }
    healed = enforceAdminFactsOnQuestions(assignUniqueOfficialPyqNumbers(healed), paper.adminFacts, ocr)
    healedOut = healed
    if (!healed.length) {
      errors.push(
        'No usable questions left after dropping paper instructions or the printed answer key. Re-parse or re-upload.',
      )
    }
    const empty = healed.filter((q) => !String(q?.text ?? '').trim())
    const reserved = empty.filter((q) => isOfficialPyqPlaceholder(q))
    const blank = empty.filter((q) => !isOfficialPyqPlaceholder(q))
    if (reserved.length) {
      errors.push(
        `${reserved.length} reserved slot(s) are empty — fill them later on this paper. Do not Approve.`,
      )
    }
    if (blank.length) errors.push(`${blank.length} question(s) have no text.`)
    const expected = officialPyqExpectedTotal(paper)
    const filled = healed.filter((q) => !isOfficialPyqPlaceholder(q) && String(q?.text ?? '').trim()).length
    const missing = listOfficialPyqMissingSlots(healed, expected)
    if (expected > 0 && filled < expected && missing.length) {
      errors.push(
        `Do not approve: ${filled} filled question(s), OCR/catalog shows ${expected}. Add missing questions later or re-parse.`,
      )
    }
    if (expected >= 40 && filled > expected + 1) {
      errors.push(
        `Do not approve: ${filled} card(s) vs ~${expected} expected. Extra fragments are not a full paper. Re-parse stored OCR.`,
      )
    }
    errors.push(
      ...officialPyqContentReviewMessages(healed, (q, i) =>
        storedReviewIndex(paper.questions, q, i),
      ),
    )
    const junk = healed.filter((q) => {
      const t = String(q?.text ?? '').trim()
      return (
        looksLikePyqSectionInstructionStem(t) ||
        looksLikeAnswerKeyMappingBlob(t) ||
        looksLikeOfficialPyqPassageOnly(t) ||
        /--- page ---/i.test(t)
      )
    })
    if (junk.length) {
      errors.push(
        `${junk.length} row(s) look like paper instructions or the printed answer key, not a question. Do not approve.`,
      )
    }
    const matchMissingListI = healed.filter((q) => matchQuestionMissingListI(q))
    if (matchMissingListI.length) {
      errors.push(
        `Do not approve: ${matchMissingListI.length} match-the-column question(s) are missing List-I. Re-parse stored OCR or upload again.`,
      )
    }
    const missingList = officialPyqMissingListMessage(healed, (q, i) =>
      storedReviewIndex(paper.questions, q, i),
    )
    if (missingList) errors.push(missingList)
    if (paper.exam === 'jee-advanced') {
      const min = pyqExtractLowCountThreshold('jee-advanced')
      const ocrExpected = expectedPyqPaperQuestionTarget(paper.exam, paper.session, paper.preparedText)
      if (filled < min) {
        errors.push(
          `Do not approve: found ${filled} question(s), need at least ${min} for a JEE Advanced paper (detected ~${ocrExpected} in OCR). Re-upload the official PDF or use Re-parse stored OCR.`,
        )
      }
    }
  }
  if (!paper.year || !paper.exam) {
    errors.push('Exam and year must be set.')
  }
  if (!String(paper.sourceLabel || '').trim()) {
    errors.push('Source label is required (e.g. Official NTA).')
  }
  return { ok: errors.length === 0, errors, healed: healedOut }
}

/**
 * Card N of T maps onto 2–90% so “question 17 of 51” reads 33%, not 19%.
 * @param {number} done 1-based card index
 * @param {number} total
 */
export function officialPyqHealProgressPercent(done, total) {
  const n = Math.max(1, Number(total) || 1)
  const i = Math.min(n, Math.max(0, Number(done) || 0))
  return Math.min(90, Math.max(2, Math.round((i / n) * 100)))
}

/**
 * Approve & publish, one stage at a time.
 *
 * A 90-card paper needs a second or two of heal + id minting + bank writes.
 * Splitting it into stages lets the async caller repaint between them, so the
 * page shows real progress instead of going white. Both the sync and async
 * entry points drive this same generator — there is only one implementation.
 *
 * @param {string} paperId
 * @param {{ skipBank?: boolean }} opts
 */
function* officialPyqApproveStages(paperId, opts) {
  const paper = getOfficialPyqPendingPaper(paperId)
  try {
    removeOlderDuplicateOfficialPyqPublishes()
  } catch {
    /* a second publish is still refused below */
  }
  if (paper && (paper.status === 'approved' || officialPyqSittingHasPublishedQuestions(paper))) {
    return {
      ok: false,
      errors: [ALREADY_PUBLISHED_MESSAGE],
      pyqCount: 0,
      bankCount: 0,
    }
  }
  yield { pct: 2, label: 'Checking and healing the paper…' }
  const ocr = paper ? getOfficialPyqPendingOcrText(paper.id) : ''
  const ready =
    paper && ocr && !String(paper.preparedText ?? '').trim()
      ? { ...paper, preparedText: ocr }
      : paper
  let preHealed
  if (ready?.aiReplicaPaper === true && Array.isArray(ready.questions) && ready.questions.length) {
    preHealed = ready.questions
  } else if (ready && Array.isArray(ready.questions) && ready.questions.length) {
    yield { pct: 2, label: 'Preparing question cards…' }
    const ctx = prepareOfficialPyqHealContext(ready)
    const source = ctx.source
    const n = ctx.cards.length || 1
    const extended = []
    for (let i = 0; i < ctx.cards.length; i += 1) {
      const pct = officialPyqHealProgressPercent(i + 1, n)
      yield {
        pct,
        label: `Checking and healing question ${i + 1} of ${ctx.cards.length}…`,
      }
      const ext = extendOfficialPyqHealCard(ctx.cards[i], source)
      extended.push(enrichMatchListsFromOcr(healUploadQuestionCard(ext, source), source))
    }
    preHealed = keepApprovedOfficialPyqCards(ready, finalizeOfficialPyqHealCards(extended, ctx, { skipGuards: true }))
  }
  const check = officialPyqApproveCheck(ready, preHealed)
  if (!check.ok || !paper) {
    return {
      ok: false,
      errors: check.errors,
      pyqCount: 0,
      bankCount: 0,
    }
  }

  yield { pct: 92, label: 'Preparing question cards…' }
  // Already healed and enriched by the gate above — publish those exact cards.
  const healedQs = check.healed
  const pyqItems = healedQs
    .map((q, i) => pendingQuestionToPyqItem(paper, q, i))
    .filter((q) => q.text)

  if (!pyqItems.length) {
    return { ok: false, errors: ['No usable questions to publish.'], pyqCount: 0, bankCount: 0 }
  }

  yield { pct: 94, label: `Numbering ${pyqItems.length} question(s)…` }
  const peers = [...(loadQuestionBank().questions ?? [])]
  const bankRows = linkOfficialPyqBankPassages(
    pyqItems.map((q, i) => {
      const row = pyqItemToBankQuestion(paper, q, i)
      const source = healedQs[i] || q
      const parentId = String(q.parentQuestionId || source.parentQuestionId || '').trim()
      if (paper.aiReplicaPaper === true || parentId) {
        row.parentQuestionId = parentId
        row.similarToId = parentId
        row.seedPyqId = parentId
        row.similarToPyq = true
        row.aiReplicaPaper = true
        row.officialPyq = false
        row.sub_bank_type = 'similar_pyq'
        row.bankSource = 'ai_replica_paper'
        q.aiReplicaPaper = true
        q.similarToPyq = true
        q.officialPyq = false
        q.sub_bank_type = 'similar_pyq'
        q.source = String(paper.paperLabel || q.source || '')
        const offset = source.replicaDifficultyOffset ?? paper.replicaDifficultyOffset
        if (offset != null && offset !== '' && Number.isFinite(Number(offset))) {
          row.replicaDifficultyOffset = Number(offset)
          q.replicaDifficultyOffset = Number(offset)
        }
        row.id = officialPyqReplicaChildId(row, peers)
      } else {
        row.id = assignOfficialPyqSaveId(row, paper, peers)
      }
      q.id = row.id
      if (parentId) q.parentQuestionId = parentId
      peers.push(row)
      return row
    }),
  )

  yield { pct: 96, label: 'Publishing to student PYQ…' }
  addImportedPyqs(pyqItems)

  let bankCount = 0
  /** @type {string[]} */
  const bankIds = []
  if (!opts.skipBank) {
    yield { pct: 98, label: 'Saving to the Question Bank…' }
    const added = addBulkUploadedQuestions(bankRows)
    bankIds.push(...added.map((r) => r.id))
    publishUploadedQuestions(bankIds)
    bankCount = bankIds.length
  }

  const replicaQuestions =
    paper.aiReplicaPaper === true
      ? (Array.isArray(paper.questions) ? paper.questions : []).map((q, i) => {
          const slot = q?.pyqSlot != null ? Number(q.pyqSlot) : i + 1
          const minted =
            pyqItems.find((item) => Number(item.pyqSlot) === slot) || pyqItems[i]
          if (!minted?.id) return q
          const next = { ...q, id: String(minted.id) }
          if (minted.parentQuestionId) next.parentQuestionId = String(minted.parentQuestionId)
          return next
        })
      : null

  updateOfficialPyqPendingPaper(paperId, {
    status: 'approved',
    reviewedAt: Date.now(),
    rejectReason: undefined,
    returnedFromPublished: false,
    ...(replicaQuestions ? { questions: replicaQuestions } : {}),
  })

  return {
    ok: true,
    errors: [],
    pyqCount: pyqItems.length,
    bankCount,
    bankIds,
    paperId,
  }
}

/**
 * Approve & publish: student PYQ store + main Question Bank (published).
 * @param {string} paperId
 * @param {{ skipBank?: boolean }} [opts]
 */
export function approveOfficialPyqPaper(paperId, opts = {}) {
  const stages = officialPyqApproveStages(paperId, opts)
  let step = stages.next()
  while (!step.done) step = stages.next()
  return step.value
}

/**
 * Same publish, with a repaint between stages so Approve & Publish reports what
 * it is doing instead of freezing the page on a big paper.
 * @param {string} paperId
 * @param {{
 *   skipBank?: boolean
 *   onProgress?: (pct: number, label: string) => void
 *   yieldFn?: () => Promise<void>
 * }} [opts]
 */
export async function approveOfficialPyqPaperAsync(paperId, opts = {}) {
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {}
  const yieldFn = typeof opts.yieldFn === 'function' ? opts.yieldFn : () => Promise.resolve()
  const stages = officialPyqApproveStages(paperId, opts)
  let step = stages.next()
  while (!step.done) {
    onProgress(step.value.pct, step.value.label)
    await yieldFn()
    step = stages.next()
  }
  onProgress(100, 'Done')
  return step.value
}

/**
 * Reject — stay out of student PYQ and Question Bank.
 * @param {string} paperId
 * @param {string} [reason]
 */
export function rejectOfficialPyqPaper(paperId, reason = '') {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) {
    return { ok: false, error: 'Paper not found.' }
  }
  if (paper.status !== 'pending_review') {
    return {
      ok: false,
      error:
        paper.status === 'approved'
          ? 'Already published — cannot reject from here.'
          : 'Already rejected.',
    }
  }
  const updated = updateOfficialPyqPendingPaper(paperId, {
    status: 'rejected',
    reviewedAt: Date.now(),
    rejectReason: String(reason || '').trim() || 'Rejected by reviewer',
  })
  if (!updated) {
    return { ok: false, error: 'Could not save rejection — try again or Remove from list.' }
  }
  return { ok: true }
}

/**
 * Put a rejected paper back in Pending approval. Does not invent questions.
 * Published papers use {@link unpublishOfficialPyqPaper} instead.
 * @param {string} paperId
 */
export function returnOfficialPyqPaperToPending(paperId) {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) {
    return { ok: false, error: 'Paper not found.' }
  }
  if (paper.status === 'approved') {
    return {
      ok: false,
      error: 'Already published — use Unpublish to move it back to Pending.',
    }
  }
  if (paper.status === 'pending_review') {
    return { ok: true, paper }
  }
  const updated = updateOfficialPyqPendingPaper(paperId, {
    status: 'pending_review',
    reviewedAt: undefined,
    rejectReason: '',
  })
  if (!updated) {
    return { ok: false, error: 'Could not move this paper back to Pending approval.' }
  }
  return { ok: true, paper: updated }
}

/**
 * Match student-PYQ / bank rows that came from this Official PYQ paper.
 * @param {OfficialPyqPendingPaper} paper
 * @param {{ id?: string, paperId?: string, officialPyq?: boolean, bankSource?: string }} q
 */
function rowBelongsToOfficialPyqPaper(paper, q) {
  if (!q || !paper) return false
  if (q.officialPyq !== true && q.bankSource !== 'official_pyq') return false
  const paperKey = String(paper.paperId || '').trim()
  const rowKey = String(q.paperId || '').trim()
  if (paperKey && rowKey && paperKey === rowKey) return true
  const pendingId = String(paper.id || '').trim()
  const rowId = String(q.id || '')
  if (pendingId && rowId.includes(pendingId)) return true
  const sitting = officialPyqPublishSittingKeyFromPaper(paper)
  return Boolean(sitting && officialPyqPublishSittingKey(q) === sitting)
}

/**
 * Unpublish: approved → pending_review. Removes this sitting from student PYQ
 * and deletes matching Official PYQ rows from the Question Bank (same reverse of
 * Approve & Publish). Does not invent questions. Does not Approve/Publish.
 * @param {string} paperId
 * @param {{ preparedText?: string, notes?: string, questions?: OfficialPyqPendingQuestion[] }} [restore]
 */
function browserMaySendPublishedPaperBack() {
  if (typeof window === 'undefined') return true
  try {
    const raw = sessionStorage.getItem('testvantage-session')
    const session = raw ? JSON.parse(raw) : null
    return session?.role === 'admin'
  } catch {
    return false
  }
}

export function unpublishOfficialPyqPaper(paperId, restore = {}) {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) {
    return { ok: false, error: 'Paper not found.' }
  }
  if (paper.status === 'approved' && !browserMaySendPublishedPaperBack()) {
    return {
      ok: false,
      error: 'Only an admin can send a published paper back for review.',
    }
  }
  if (paper.status === 'pending_review') {
    return { ok: true, paper, alreadyPending: true, pyqRemoved: 0, bankRemoved: 0 }
  }
  if (paper.status === 'rejected') {
    return returnOfficialPyqPaperToPending(paperId)
  }
  if (paper.status !== 'approved') {
    return { ok: false, error: `Cannot unpublish status "${paper.status}".` }
  }

  const beforePyq = loadImportedPyqs()
  const keepPyq = beforePyq.filter((q) => !rowBelongsToOfficialPyqPaper(paper, q))
  const pyqRemoved = beforePyq.length - keepPyq.length
  if (pyqRemoved > 0) saveImportedPyqs(keepPyq)

  const bank = loadQuestionBank()
  const bankBefore = bank.questions ?? []
  const bankNext = bankBefore.filter((q) => !rowBelongsToOfficialPyqPaper(paper, q))
  const bankRemoved = bankBefore.length - bankNext.length
  if (bankRemoved > 0) writeQuestionBankSnapshot(bank, bankNext)

  /** @type {Partial<OfficialPyqPendingPaper>} */
  const patch = {
    status: 'pending_review',
    reviewedAt: undefined,
    rejectReason: '',
    returnedFromPublished: true,
  }
  if (typeof restore.preparedText === 'string' && restore.preparedText.trim().length >= 80) {
    patch.preparedText = restore.preparedText
  }
  if (typeof restore.notes === 'string' && restore.notes.trim()) {
    patch.notes = restore.notes
  }
  if (Array.isArray(restore.questions) && restore.questions.length) {
    patch.questions = restore.questions
  }

  const updated = updateOfficialPyqPendingPaper(paperId, patch)
  if (!updated) {
    return {
      ok: false,
      error: 'Removed from student stores but could not move the paper to Pending.',
      pyqRemoved,
      bankRemoved,
    }
  }
  return { ok: true, paper: updated, pyqRemoved, bankRemoved }
}

/**
 * Remove a pending or rejected paper from the approval queue (not student PYQ / bank).
 * Published papers cannot be removed here.
 * @param {string} paperId
 */
export function dismissOfficialPyqPaper(paperId) {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) {
    return { ok: false, error: 'Paper not found.' }
  }
  if (paper.status === 'approved') {
    return {
      ok: false,
      error: 'Already published — it stays in student PYQ. Remove from PYQ Bank if needed.',
    }
  }
  const removed = removeOfficialPyqPendingPaper(paperId)
  if (!removed) {
    return { ok: false, error: 'Could not remove this paper — refresh and try again.' }
  }
  return { ok: true, paperLabel: paper.paperLabel }
}

/**
 * Remove every queue row for the same sitting (duplicate imports).
 * @param {Partial<import('./officialPyqPendingStore.js').OfficialPyqPendingPaper>} match
 */
export function dismissOfficialPyqSitting(match) {
  const result = removeOfficialPyqPendingSitting(match)
  if (!result.ok) {
    return { ok: false, error: result.error || 'Could not remove this sitting.' }
  }
  return { ok: true, removed: result.removed }
}

/**
 * Human-readable status for UI.
 * @param {string} status
 */
export function officialPyqStatusLabel(status) {
  switch (status) {
    case 'pending_review':
      return 'Pending approval'
    case 'approved':
      return 'Published PYQ'
    case 'rejected':
      return 'Rejected'
    default:
      return String(status || 'Unknown')
  }
}

export function officialPyqStemLooksMissingFigure(text) {
  const t = String(text ?? '')
  if (hasMathpixMedia(t)) return false
  return /\b(?:as shown in the figure|shown in (?:the )?figure|given below)\b/i.test(t)
}

/**
 * Short provenance line for a pending question.
 * @param {OfficialPyqPendingQuestion} q
 */
export function officialPyqQuestionProvenanceLabel(q) {
  if (officialPyqStemLooksMissingFigure(q?.text) && !String(q?.questionImage ?? '').trim()) {
    return 'Answer: Needs check · missing figure'
  }
  const ans = answerSourceBadgeLabel(/** @type {any} */ (q.answerSource))
  const sol = q.solutionSource ? answerSourceBadgeLabel(/** @type {any} */ (q.solutionSource)) : null
  if (sol && sol !== ans) return `Answer: ${ans} · Solution: ${sol}`
  return `Answer: ${ans}`
}

/**
 * Import normalised question list into a new pending paper (does not publish).
 * @param {{
 *   exam: 'jee-main' | 'jee-advanced' | 'neet'
 *   year: number
 *   session?: string
 *   paperLabel?: string
 *   paperId?: string
 *   sourceUrl?: string
 *   sourceLabel?: string
 *   sourceSlotId?: string
 *   notes?: string
 *   questions: OfficialPyqPendingQuestion[]
 * }} input
 */
export function importQuestionsToOfficialPyqPending(input) {
  const questions = (input.questions ?? []).filter((q) => String(q?.text ?? '').trim())
  if (!questions.length) {
    throw new Error('No questions found to import. Check the file or paste again.')
  }
  const ocr = String(input.preparedText || '')
  const expected =
    ocr.length >= 80
      ? expectedPyqPaperQuestionTarget(input.exam, input.session, ocr)
      : questions.length >= 40
        ? expectedPyqPaperQuestionTarget(input.exam, input.session, '')
        : undefined
  const saved = addOfficialPyqPendingPaper({
    exam: input.exam,
    year: input.year,
    session: input.session,
    pyqDate: input.pyqDate,
    pyqShift: input.pyqShift,
    paperLabel: input.paperLabel,
    paperId: input.paperId,
    sourceUrl: input.sourceUrl,
    sourceLabel: input.sourceLabel || 'Official source (uploaded PDF)',
    sourceSlotId: input.sourceSlotId,
    notes: input.notes,
    preparedText: input.preparedText,
    expectedQuestionCount: expected,
    questions: questions.map((q, i) => ({
      ...q,
      provenance:
        q.provenance ||
        `${input.sourceLabel || 'Official source'}${input.sourceUrl ? ` · ${input.sourceUrl}` : ''}`,
      pyqSlot: q.pyqSlot ?? i + 1,
    })),
    status: 'pending_review',
  })
  try {
    return persistOfficialPyqQualityRun(saved) || saved
  } catch {
    return saved
  }
}

/**
 * Write merged/healed questions back to the pending paper (53 fragment cards → 51).
 * Preview-only heal used to leave the stored count at 53.
 * @param {OfficialPyqPendingPaper | null | undefined} paper
 */
export function persistHealedOfficialPyqPaper(paper) {
  const result = healAndPersistOfficialPyqPaper(paper)
  return {
    ok: result.ok,
    changed: result.changed,
    count: result.count,
    previousCount: result.previousCount,
  }
}

/** Re-export for UI — instant Mathpix heal/split without Gemini. */
export { reExtractOfficialPyqPendingPaperLocal }

/**
 * Re-parse stored OCR from pending paper notes (fixes partial Gemini / SECTION garbage).
 * Pass extractOverride.questions when Gemini already structured the stored text.
 * @param {OfficialPyqPendingPaper | null | undefined} paper
 * @param {{ engine?: string, text?: string, questions?: unknown[] }} [extractOverride]
 */
export function reExtractOfficialPyqPendingPaper(paper, extractOverride) {
  if (!paper) {
    return { ok: false, error: 'Paper not found.', questions: [], count: 0 }
  }
  if (String(paper.status ?? '') === 'approved') {
    return {
      ok: false,
      error:
        'This paper is published. Unpublish it before re-parse or heal can change its questions.',
      questions: paper.questions ?? [],
      count: paper.questions?.length ?? 0,
      previousCount: paper.questions?.length ?? 0,
    }
  }
  const preparedText = sanitizeMathpixOcrText(
    extractOverride?.text || officialPyqStoredOcrText(paper),
  )
  if (!preparedText || preparedText.length < 80) {
    return {
      ok: false,
      error: 'No stored OCR text on this paper — upload the PDF again.',
      questions: [],
      count: 0,
    }
  }
  const existingQuestionCount = Array.isArray(paper.questions) ? paper.questions.length : 0
  const built = questionsFromOfficialPyqExtract(
    {
      engine: extractOverride?.engine || 'builtin',
      text: preparedText,
      questions: Array.isArray(extractOverride?.questions) ? extractOverride.questions : [],
    },
    {
      exam: paper.exam,
      year: paper.year,
      session: paper.session,
      pyqDate: paper.pyqDate,
      pyqShift: paper.pyqShift,
      paperLabel: paper.paperLabel,
      sourceLabel: paper.sourceLabel,
    },
    { existingQuestionCount },
  )
  let questions = (built.questions ?? []).map((q, i) => ({
    ...q,
    answerSource: q.answerSource || (q.correctIndex != null ? 'from_paper' : 'unknown'),
    solutionSource: q.solutionSource || (q.solution ? 'from_paper' : undefined),
    provenance:
      q.provenance ||
      `${paper.sourceLabel}${paper.sourceUrl ? ` · ${paper.sourceUrl}` : ''}`,
    pyqSlot: q.pyqSlot ?? i + 1,
  }))
  const minKeep =
    paper.exam === 'jee-advanced' ? 40 : pyqExtractLowCountThreshold(paper.exam)
  if (questions.length < minKeep && existingQuestionCount >= minKeep) {
    const healedOnly = healOfficialPyqPaperQuestionsEnriched(paper)
    if (healedOnly.length >= minKeep && healedOnly.length <= existingQuestionCount) {
      questions = healedOnly.map((q, i) => ({
        ...q,
        answerSource: q.answerSource || (q.correctIndex != null ? 'from_paper' : 'unknown'),
        solutionSource: q.solutionSource || (q.solution ? 'from_paper' : undefined),
        provenance:
          q.provenance ||
          `${paper.sourceLabel}${paper.sourceUrl ? ` · ${paper.sourceUrl}` : ''}`,
        pyqSlot: q.pyqSlot ?? i + 1,
      }))
    } else {
      return {
        ok: false,
        error: `Re-parse found only ${questions.length} question(s); keeping the existing ${existingQuestionCount} cards. Re-upload the official PDF if the stored OCR is incomplete.`,
        questions: paper.questions,
        count: existingQuestionCount,
        previousCount: existingQuestionCount,
      }
    }
  }
  if (!questions.length) {
    return {
      ok: false,
      error: built.rejected?.[0]
        ? `Re-parse rejected: ${built.rejected[0]}`
        : 'Re-parse found no questions in stored OCR.',
      questions: [],
      count: 0,
    }
  }
  const updated = updateOfficialPyqPendingPaper(paper.id, {
    questions,
    preparedText: preparedText,
  })
  if (!updated) {
    return { ok: false, error: 'Could not save re-parsed questions.', questions: [], count: 0 }
  }
  const summaryLine = built.summary ? formatOfficialPyqExtractSummary(built.summary) : ''
  if (summaryLine) {
    const importLine = String(paper.notes ?? '').match(/^Imported from [^\n]+/im)?.[0] ?? ''
    const fileName = importLine?.replace(/^Imported from\s+/i, '') || ''
    const notes = formatOfficialPyqStoredNotes({
      fileName,
      summaryLine,
      pdfText: paper.notes,
      visionText: preparedText,
    })
    updateOfficialPyqPendingPaper(paper.id, { notes, preparedText })
  }
  const saved = getOfficialPyqPendingPaper(paper.id)
  persistHealedOfficialPyqPaper(saved)
  const finalPaper = getOfficialPyqPendingPaper(paper.id)
  const finalQs = finalPaper?.questions ?? questions
  return {
    ok: true,
    questions: finalQs,
    count: finalQs.length,
    source: built.source,
    summary: built.summary,
    previousCount: paper.questions?.length ?? 0,
  }
}

/**
 * Re-parse: Gemini splits stored Mathpix text (no second Mathpix bill), then backup splitter.
 * Heals the existing pending row in place.
 * @param {OfficialPyqPendingPaper | null | undefined} paper
 * @param {{ signal?: AbortSignal, timeoutMs?: number, onProgress?: (pct: number, label: string) => void }} [io]
 */
export async function reExtractOfficialPyqPendingPaperWithGemini(paper, io = {}) {
  if (!paper) {
    return { ok: false, error: 'Paper not found.', questions: [], count: 0 }
  }
  const preparedText = officialPyqStoredOcrTextLocal(paper) || officialPyqStoredOcrText(paper)
  if (!preparedText || preparedText.length < 80) {
    return {
      ok: false,
      error: 'No stored OCR text on this paper — upload the PDF again.',
      questions: [],
      count: 0,
    }
  }
  const progress = io.onProgress || (() => {})
  const geminiBudget = Math.max(12_000, Number(io.timeoutMs) || GEMINI_REPARSE_TIMEOUT_MS)
  const paperMeta = {
    exam: paper.exam,
    year: paper.year,
    session: paper.session,
    paperLabel: paper.paperLabel,
  }
  const { localMathpixSplitGoodEnough } = await import('./pyqGeminiExtract.js')
  const { paperItemsFromMathpixOcr } = await import('./mathpixQuestionSplit.js')
  const localCanonical = paperItemsFromMathpixOcr(preparedText, { paperMeta })
  const healedLocal = healOfficialPyqPaperQuestionsEnriched({
    ...paper,
    questions: localCanonical,
    preparedText,
  })
  if (localMathpixSplitGoodEnough(healedLocal, preparedText, paper)) {
    progress(84, 'Healing question cards…')
    const result = reExtractOfficialPyqPendingPaper(paper, {
      engine: 'mathpix',
      text: preparedText,
      questions: [],
    })
    if (!result.ok) {
      progress(100, 'Done (local Mathpix)')
      return { ...result, geminiNote: '', usedGemini: false, apiDown: false }
    }
    progress(100, 'Done (local Mathpix)')
    const finalPaper = getOfficialPyqPendingPaper(paper.id)
    const finalCount = finalPaper?.questions?.length ?? result.count
    return {
      ...result,
      count: finalCount,
      questions: finalPaper?.questions ?? result.questions,
      geminiNote: `Local Mathpix split found ${result.count} clean question(s). Press Fill tags, answers & solutions (Hybrid AI) to fill them two at a time.`,
      usedGemini: false,
      apiDown: false,
    }
  }
  let geminiQuestions = []
  let geminiNote = ''
  let apiDown = false
  progress(18, 'Checking Gemini on port 3001…')
  try {
    const { structureOcrWithGeminiClient } = await import('./mathpixGeminiPipeline.js')
    progress(28, 'Gemini splitting stored OCR…')
    const structured = await structureOcrWithGeminiClient({
      text: preparedText,
      format: 'latex',
      officialPyq: true,
      paperMeta: {
        exam: paper.exam,
        year: paper.year,
        session: paper.session,
        paperLabel: paper.paperLabel,
      },
      signal: io.signal,
      timeoutMs: geminiBudget,
    })
    geminiQuestions = Array.isArray(structured.questions) ? structured.questions : []
    progress(72, 'Saving re-parsed questions…')
  } catch (err) {
    const code = err && typeof err === 'object' ? err.code : undefined
    const msg = err instanceof Error ? err.message : 'Gemini unavailable; used local Mathpix split.'
    if (
      code === 'VISION_NOT_CONFIGURED' ||
      code === 'VISION_STATUS_TIMEOUT' ||
      /port 3001|API server|GEMINI_API_KEY|not reachable/i.test(msg)
    ) {
      apiDown = true
      geminiNote = `${REPARSE_API_DOWN_HINT} Using local Mathpix split meanwhile.`
    } else if (code === 'GEMINI_STRUCTURE_TIMEOUT' || code === 'STEP_TIMEOUT') {
      geminiNote = `Gemini timed out after ${Math.round(geminiBudget / 1000)}s. Using local Mathpix split. ${REPARSE_API_DOWN_HINT}`
    } else {
      geminiNote = `${msg} Using local Mathpix split.`
    }
  }
  await Promise.resolve()
  progress(84, 'Healing question cards…')
  const result = reExtractOfficialPyqPendingPaper(paper, {
    engine: 'mathpix',
    text: preparedText,
    questions: geminiQuestions,
  })
  progress(100, 'Done')
  if (!result.ok) {
    return { ...result, geminiNote, apiDown }
  }
  return {
    ...result,
    geminiNote,
    usedGemini: geminiQuestions.length > 0,
    apiDown,
  }
}

/**
 * Re-parse with an overall deadline so a hung API cannot freeze the page silently.
 * @param {OfficialPyqPendingPaper | null | undefined} paper
 * @param {{ signal?: AbortSignal, timeoutMs?: number, onProgress?: (pct: number, label: string) => void }} [io]
 */
export async function reExtractOfficialPyqPendingPaperWithGeminiTimed(paper, io = {}) {
  const overallMs =
    Number(io.overallTimeoutMs) > 0 ? Number(io.overallTimeoutMs) : 120_000
  const work = reExtractOfficialPyqPendingPaperWithGemini(paper, io)
  return raceStepTimeout(
    work,
    overallMs,
    `Re-parse timed out after ${Math.round(overallMs / 1000)} seconds. ${REPARSE_API_DOWN_HINT}`,
    'REPARSE_OVERALL_TIMEOUT',
  )
}

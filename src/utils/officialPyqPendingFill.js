/**
 * Hybrid AI fill for Official PYQ cards: metatags, answer, and solution.
 * Its own step on an Approved paper, before Publish — upload stops at the local split.
 * Part by part — two questions at a time, one Gemini request per question —
 * and each finished part is saved before the next starts, so a timeout loses nothing.
 * The stem, options, and figures are never changed.
 */
import { fillOfficialPyqTags } from './hybridAiClient.js'
import { mapExamSlugToHybridLabel, mapSubjectSlugToHybridLabel } from './hybridMetadata.js'
import { HYBRID_FILL_PART_SIZE, fillPaperQuestionByQuestion } from './officialPyqReplica.js'
import { getOfficialPyqPendingPaper, officialPyqCardIsAdminEdited } from './officialPyqPendingStore.js'
import { applyOfficialPyqPublishedMeta } from './officialPyqPublishedMeta.js'
import { isOfficialPyqPlaceholder } from './officialPyqMissingSlots.js'

export const HYBRID_FILL_NEEDS_APPROVAL =
  'Hybrid AI fills tags, answers, and solutions only on an Approved paper. Approve it first; if it is published, Unpublish it first.'

/** Answers and solutions Hybrid AI must leave alone: printed on the paper or typed by an admin. */
const KEPT_SOURCES = new Set(['from_paper', 'manual'])

/** Stored answer as Hybrid AI reads it: letter(s) or the number. */
export function currentAnswerText(question) {
  if (Array.isArray(question?.correctIndices) && question.correctIndices.length) {
    return question.correctIndices.map((n) => String.fromCharCode(65 + Number(n))).join(',')
  }
  if (question?.correctNumerical != null && question.correctNumerical !== '') return String(question.correctNumerical)
  if (question?.correctInteger != null && question.correctInteger !== '') return String(question.correctInteger)
  if (question?.correctIndex != null && question.correctIndex !== '') {
    return String.fromCharCode(65 + Number(question.correctIndex))
  }
  return ''
}

/**
 * The /official-pyq/fill-tags body for one card.
 * @param {any} question @param {string} [paperExam]
 */
export function hybridFillRequestForQuestion(question, paperExam = '') {
  const examId = Array.isArray(question?.examIds) && question.examIds.length ? question.examIds[0] : paperExam
  return {
    question_text: String(question?.text ?? question?.stem ?? ''),
    options: (Array.isArray(question?.options) ? question.options : []).map((opt) => String(opt ?? '')),
    subject: question?.subject ? mapSubjectSlugToHybridLabel(question.subject, question.chapter || question.section) : '',
    unit: String(question?.section || question?.unit || ''),
    section: String(question?.section || question?.unit || ''),
    chapter: String(question?.chapter || ''),
    topic: question?.topic ? String(question.topic) : '',
    question_type: question?.questionType ? String(question.questionType) : '',
    exam: examId ? mapExamSlugToHybridLabel(examId) : '',
    toughness_level: question?.toughnessLevel != null ? String(question.toughnessLevel) : '',
    source: question?.source ? String(question.source) : '',
    answer: currentAnswerText(question),
    solution: String(question?.solution || ''),
  }
}

/** True when the card already has a real chapter (not "General"), an answer, and a solution. */
export function officialPyqCardIsFilled(q) {
  const chapter = String(q?.chapter || '').trim()
  return Boolean(chapter && !/^general$/i.test(chapter) && currentAnswerText(q) && String(q?.solution || '').trim())
}

function has(value) {
  return value != null && String(value).trim() !== ''
}

/**
 * Put one Hybrid AI patch on a card. The answer printed with the paper
 * and a hand-edited answer or solution win; subject and type set by the paper
 * facts stay. Only fills — never touches the stem, options, or figures.
 * @param {any} card @param {any} patch
 */
export function applyHybridPatchToCard(card, patch) {
  if (!card || !patch) return card
  const next = { ...card }
  if (!has(card.subject) && has(patch.subject)) next.subject = patch.subject
  if (!has(card.questionType) && has(patch.questionType)) next.questionType = patch.questionType
  for (const key of ['section', 'chapter', 'topic', 'toughnessLevel', 'source']) {
    if (has(patch[key])) next[key] = patch[key]
  }
  if (Array.isArray(patch.examIds) && patch.examIds.length) next.examIds = patch.examIds
  const handEdited = officialPyqCardIsAdminEdited(card)
  const answer = currentAnswerText(patch)
  if (!handEdited && !KEPT_SOURCES.has(card.answerSource) && answer && answer !== currentAnswerText(card)) {
    next.correctIndex = patch.correctIndex
    next.correctIndices = patch.correctIndices
    next.correctInteger = patch.correctInteger
    next.correctNumerical = patch.correctNumerical
    next.answerSource = 'hybrid_ai'
  }
  if (!handEdited && !KEPT_SOURCES.has(card.solutionSource) && has(patch.solution) && patch.solution !== card.solution) {
    next.solution = patch.solution
    next.solutionSource = 'hybrid_ai'
  }
  return next
}

/** Tags, answer, and solution of a card, shaped for the Approved-paper save. */
function publishedPatchFromCard(card) {
  return {
    questionId: card.id,
    expectText: String(card.text ?? card.stem ?? ''),
    subject: card.subject,
    section: card.section || card.unit,
    chapter: card.chapter,
    topic: card.topic,
    questionType: card.questionType,
    examIds: card.examIds,
    toughnessLevel: card.toughnessLevel,
    source: card.source,
    solution: card.solution,
    correctIndex: card.correctIndex,
    correctIndices: card.correctIndices,
    correctInteger: card.correctInteger,
    correctNumerical: card.correctNumerical,
    answerSource: card.answerSource,
    solutionSource: card.solutionSource,
  }
}

/**
 * Fill an Approved paper part by part and save after every part. The paper stays
 * Approved (students do not see it until Publish); the save goes through the
 * Approved-paper tag path, so the question wording cannot change.
 * @param {string} paperId
 * @param {{ redoAll?: boolean, signal?: AbortSignal, onProgress?: (info: { from: number, to: number, total: number, filled: number, needsLook: number[] }) => void, isFatal?: (err: Error) => boolean }} [opts]
 */
export async function fillOfficialPyqApprovedPaperPartByPart(paperId, opts = {}) {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper || paper.status !== 'approved') throw new Error(HYBRID_FILL_NEEDS_APPROVAL)
  const questions = Array.isArray(paper.questions) ? paper.questions : []
  const total = questions.length
  let filled = 0
  /** @type {number[]} */
  const needsLook = []
  const rows = await fillPaperQuestionByQuestion(
    questions,
    (question) => fillOfficialPyqTags(hybridFillRequestForQuestion(question, paper.exam)),
    {
      concurrency: HYBRID_FILL_PART_SIZE,
      signal: opts.signal,
      isFatal: opts.isFatal,
      skip: (q) => isOfficialPyqPlaceholder(q) || (!opts.redoAll && officialPyqCardIsFilled(q)),
      onProgress: (index) => {
        const from = index - (index % HYBRID_FILL_PART_SIZE) + 1
        opts.onProgress?.({ from, to: Math.min(from + HYBRID_FILL_PART_SIZE - 1, total), total, filled, needsLook })
      },
      onApplied: (row) => {
        if (row.skipped) return
        if (row.needsLook) needsLook.push(row.index + 1)
        if (!row.patch) return
        const latest = getOfficialPyqPendingPaper(paperId)
        if (latest?.status !== 'approved') throw new Error(HYBRID_FILL_NEEDS_APPROVAL)
        const card = latest.questions?.[row.index]
        if (!card || String(card.text ?? card.stem ?? '') !== row.patch.expectText) return
        // A solution that still reads like a hint or an essay is not saved.
        const patch = row.problem ? { ...row.patch, solution: card.solution } : row.patch
        const result = applyOfficialPyqPublishedMeta(paperId, row.index, publishedPatchFromCard(applyHybridPatchToCard(card, patch)))
        if (!result.ok) throw new Error(result.error || `Could not save question ${row.index + 1}.`)
        filled += 1
      },
    },
  )
  return {
    total,
    asked: rows.filter((row) => !row.skipped).length,
    filled,
    needsLook,
    stopped: Boolean(opts.signal?.aborted),
  }
}

/**
 * Hybrid AI fill for Official PYQ cards: metatags, answer, and solution.
 * Part by part — two questions at a time, one Gemini request per question —
 * and each finished part is saved before the next starts, so a timeout loses nothing.
 * The stem, options, and figures are never changed.
 */
import { fillOfficialPyqTags } from './hybridAiClient.js'
import { mapExamSlugToHybridLabel, mapSubjectSlugToHybridLabel } from './hybridMetadata.js'
import { HYBRID_FILL_PART_SIZE, fillPaperQuestionByQuestion } from './officialPyqReplica.js'
import { getOfficialPyqPendingPaper, updateOfficialPyqPendingPaper } from './officialPyqPendingStore.js'
import { isOfficialPyqPlaceholder } from './officialPyqMissingSlots.js'

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

/** True when the card already has its chapter, an answer, and a solution. */
export function officialPyqCardIsFilled(q) {
  return Boolean(String(q?.chapter || '').trim() && currentAnswerText(q) && String(q?.solution || '').trim())
}

function has(value) {
  return value != null && String(value).trim() !== ''
}

/**
 * Put one Hybrid AI patch on a pending card. The answer printed with the paper
 * and a hand-edited answer or solution win; subject and type set by the paper
 * facts stay. Only fills — never touches the stem, options, or figures.
 * @param {any} card @param {any} patch
 */
export function applyHybridPatchToPendingCard(card, patch) {
  if (!card || !patch) return card
  const next = { ...card }
  if (!has(card.subject) && has(patch.subject)) next.subject = patch.subject
  if (!has(card.questionType) && has(patch.questionType)) next.questionType = patch.questionType
  for (const key of ['section', 'chapter', 'topic', 'toughnessLevel', 'source']) {
    if (has(patch[key])) next[key] = patch[key]
  }
  if (Array.isArray(patch.examIds) && patch.examIds.length) next.examIds = patch.examIds
  const handEdited = card.adminEdited === true
  if (!handEdited && card.answerSource !== 'from_paper') {
    const answer = currentAnswerText(patch)
    if (answer) {
      next.correctIndex = patch.correctIndex
      next.correctIndices = patch.correctIndices
      next.correctInteger = patch.correctInteger
      next.correctNumerical = patch.correctNumerical
      next.answerSource = 'hybrid_ai'
    }
  }
  if (!handEdited && card.solutionSource !== 'from_paper' && has(patch.solution) && patch.solution !== card.solution) {
    next.solution = patch.solution
    next.solutionSource = 'hybrid_ai'
  }
  return next
}

/**
 * Fill a pending paper part by part and save after every part.
 * @param {string} paperId
 * @param {{ redoAll?: boolean, signal?: AbortSignal, onProgress?: (info: { from: number, to: number, total: number, filled: number, needsLook: number[] }) => void, isFatal?: (err: Error) => boolean }} [opts]
 */
export async function fillOfficialPyqPendingPaperPartByPart(paperId, opts = {}) {
  const paper = getOfficialPyqPendingPaper(paperId)
  const questions = Array.isArray(paper?.questions) ? paper.questions : []
  const total = questions.length
  let filled = 0
  /** @type {number[]} */
  const needsLook = []
  const rows = await fillPaperQuestionByQuestion(
    questions,
    (question) => fillOfficialPyqTags(hybridFillRequestForQuestion(question, paper?.exam)),
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
        const list = Array.isArray(latest?.questions) ? latest.questions.slice() : []
        const card = list[row.index]
        if (!card || String(card.text ?? card.stem ?? '') !== row.patch.expectText) return
        list[row.index] = applyHybridPatchToPendingCard(card, row.patch)
        if (updateOfficialPyqPendingPaper(paperId, { questions: list })) filled += 1
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

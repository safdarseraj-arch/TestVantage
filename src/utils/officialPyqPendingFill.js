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
import { gridColLabels, isMatrixGridCard } from './matrixGridPyq.js'
import { formatNumericChoice, numericalAlternativesOf } from './answerAlternatives.js'
import { solutionIsOnlyPrintedKeyLine } from './printedAnswerKey.js'

export const HYBRID_FILL_NEEDS_APPROVAL =
  'Hybrid AI fills tags, answers, and solutions only on an Approved paper. Approve it first; if it is published, Unpublish it first.'

/** Answers and solutions Hybrid AI must leave alone: printed on the paper or typed by an admin. */
const KEPT_SOURCES = new Set(['from_paper', 'manual'])

/** "A-R; B-P,S" for a grid card's key ('' when a row is blank). @param {any} question @param {unknown} [key] */
export function gridAnswerText(question, key = question?.matrixAnswerKey) {
  const rows = Array.isArray(question?.matrixRows) ? question.matrixRows.length : 0
  const labels = gridColLabels(question)
  const map = key && typeof key === 'object' ? /** @type {Record<string, unknown>} */ (key) : {}
  const parts = []
  for (let r = 0; r < rows; r += 1) {
    const cols = (Array.isArray(map[r]) ? map[r] : []).map(Number).filter(Number.isInteger)
    if (!cols.length) return ''
    parts.push(`${String.fromCharCode(65 + r)}-${[...new Set(cols)].sort((a, b) => a - b).map((c) => labels[c]).join(',')}`)
  }
  return parts.join('; ')
}

/** Stored answer as Hybrid AI reads it: letter(s), the number, or a grid "A-R; B-P,S". */
export function currentAnswerText(question) {
  if (question?.bonusMarksToAll === true) return 'Bonus (marks to all)'
  if (isMatrixGridCard(question)) return gridAnswerText(question)
  const alternatives = numericalAlternativesOf(question)
  if (alternatives.length && (question?.correctNumerical != null || question?.correctInteger != null)) {
    const main = { value: Number(question.correctNumerical ?? question.correctInteger), tolerance: question.numericalTolerance }
    return [main, ...alternatives].map(formatNumericChoice).join(' OR ')
  }
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

/** Stem plus both lists, so the model sees what each row and column says. @param {any} question */
function gridQuestionText(question) {
  const labels = gridColLabels(question)
  const rows = (question.matrixRows || []).map((r, i) => `(${String.fromCharCode(65 + i)}) ${String(r ?? '')}`)
  const cols = (question.matrixCols || []).map((c, j) => `(${labels[j]}) ${String(c ?? '')}`)
  return [
    String(question?.text ?? question?.stem ?? ''),
    'Column I:',
    ...rows,
    'Column II:',
    ...cols,
    'Each Column I row matches ONE OR MORE Column II entries.',
  ].join('\n')
}

/** The card's answer was printed on the paper or set by an admin, so Hybrid AI never answers it. @param {any} card */
export function officialPyqCardAnswerIsKept(card) {
  const kept = KEPT_SOURCES.has(card?.answerSource) || card?.answerSource === 'admin_edit' || officialPyqCardIsAdminEdited(card)
  return Boolean(kept && (card?.bonusMarksToAll === true || currentAnswerText(card)))
}

/** The card's solution was printed on the paper or typed by hand (a bare "Answer: …" key line is no solution). @param {any} card */
export function officialPyqCardSolutionIsKept(card) {
  const solution = String(card?.solution ?? '').trim()
  return Boolean(KEPT_SOURCES.has(card?.solutionSource) && solution && !solutionIsOnlyPrintedKeyLine(solution))
}

/**
 * Hybrid AI fills the metatags only: the paper printed this card's answer and solution, or the
 * admin set "Paper has printed answers and solutions" on the paper.
 * @param {any} card @param {any} [paper]
 */
export function officialPyqCardTagsOnly(card, paper) {
  if (paper?.printedAnswersAndSolutions === true) return true
  return officialPyqCardAnswerIsKept(card) && officialPyqCardSolutionIsKept(card)
}

/**
 * The /official-pyq/fill-tags body for one card. `tagsOnly` asks for metatags only: no answer and
 * no solution are sent or asked for.
 * @param {any} question @param {string} [paperExam] @param {{ tagsOnly?: boolean }} [opts]
 */
export function hybridFillRequestForQuestion(question, paperExam = '', opts = {}) {
  const examId = Array.isArray(question?.examIds) && question.examIds.length ? question.examIds[0] : paperExam
  const grid = isMatrixGridCard(question)
  if (opts.tagsOnly) {
    const { answer: _answer, solution: _solution, ...tags } = hybridFillRequestForQuestion(question, paperExam)
    return { ...tags, tags_only: true }
  }
  return {
    question_text: grid ? gridQuestionText(question) : String(question?.text ?? question?.stem ?? ''),
    options: grid ? [] : (Array.isArray(question?.options) ? question.options : []).map((opt) => String(opt ?? '')),
    subject: question?.subject ? mapSubjectSlugToHybridLabel(question.subject, question.chapter || question.section) : '',
    unit: String(question?.section || question?.unit || ''),
    section: String(question?.section || question?.unit || ''),
    chapter: String(question?.chapter || ''),
    topic: question?.topic ? String(question.topic) : '',
    question_type: grid ? 'matrix_match_grid' : question?.questionType ? String(question.questionType) : '',
    exam: examId ? mapExamSlugToHybridLabel(examId) : '',
    toughness_level: question?.toughnessLevel != null ? String(question.toughnessLevel) : '',
    source: question?.source ? String(question.source) : '',
    answer: currentAnswerText(question),
    solution: String(question?.solution || ''),
  }
}

/**
 * True when the card already has a real chapter (not "General"), an answer, and a solution.
 * On a paper marked "printed answers and solutions" a real chapter is enough: its answer is never AI-filled.
 * @param {any} q @param {any} [paper]
 */
export function officialPyqCardIsFilled(q, paper) {
  const chapter = String(q?.chapter || '').trim()
  if (!chapter || /^general$/i.test(chapter)) return false
  if (paper?.printedAnswersAndSolutions === true) return true
  return Boolean(currentAnswerText(q) && String(q?.solution || '').trim())
}

/** Hybrid AI's answer matches the stored one (a number inside the printed band counts). */
function answersAgree(card, aiAnswer) {
  const stored = currentAnswerText(card)
  if (!stored || !aiAnswer || stored === aiAnswer) return true
  const a = Number(aiAnswer)
  const b = Number(card?.correctNumerical ?? card?.correctInteger)
  if (Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a - b) <= (Number(card?.numericalTolerance) || 1e-9)
  return false
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
  if (isMatrixGridCard(card)) {
    const answer = patch.matrixAnswerKey ? gridAnswerText(card, patch.matrixAnswerKey) : ''
    if (!handEdited && !KEPT_SOURCES.has(card.answerSource) && answer && answer !== currentAnswerText(card)) {
      next.matrixAnswerKey = patch.matrixAnswerKey
      delete next.matrixAnswerAlternates
      next.answerSource = 'hybrid_ai'
    }
  }
  const answer = isMatrixGridCard(card) ? '' : currentAnswerText(patch)
  const printedBonus = card.bonusMarksToAll === true
  if (!handEdited && !printedBonus && !KEPT_SOURCES.has(card.answerSource) && answer && answer !== currentAnswerText(card)) {
    next.correctIndex = patch.correctIndex
    next.correctIndices = patch.correctIndices
    next.correctInteger = patch.correctInteger
    next.correctNumerical = patch.correctNumerical
    delete next.numericalTolerance
    delete next.numericalAlternatives
    delete next.correctIndicesAlternatives
    next.answerSource = 'hybrid_ai'
  }
  if (answer && !printedBonus && answer !== currentAnswerText(card) && (handEdited || KEPT_SOURCES.has(card.answerSource))) {
    // The kept answer stays; the quality check asks for a look.
    if (!answersAgree(card, answer)) next.hybridAnswerDisagrees = answer
  } else if (answer) {
    delete next.hybridAnswerDisagrees
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
    ...(isMatrixGridCard(card)
      ? { matrixAnswerKey: card.matrixAnswerKey, matrixAnswerAlternates: card.matrixAnswerAlternates }
      : {}),
    answerSource: card.answerSource,
    solutionSource: card.solutionSource,
    hybridAnswerDisagrees: card.hybridAnswerDisagrees,
  }
}

/** A tags-only reply never changes the answer or the solution. */
function tagsOnlyPatch(patch, card) {
  return {
    ...patch,
    solution: card.solution,
    correctIndex: card.correctIndex,
    correctIndices: card.correctIndices,
    correctInteger: card.correctInteger,
    correctNumerical: card.correctNumerical,
    matrixAnswerKey: undefined,
  }
}

/**
 * Fill an Approved paper part by part and save after every part. The paper stays
 * Approved (students do not see it until Publish); the save goes through the
 * Approved-paper tag path, so the question wording cannot change.
 * A card whose answer and solution are printed (or every card, when the paper is marked
 * "printed answers and solutions") gets metatags only. On such a paper a card with no printed
 * answer is listed in `noPrintedAnswer` instead of being answered by AI.
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
  /** @type {number[]} */
  const noPrintedAnswer =
    paper.printedAnswersAndSolutions === true
      ? questions
          .map((q, i) => (!isOfficialPyqPlaceholder(q) && String(q?.text ?? q?.stem ?? '').trim() && !officialPyqCardAnswerIsKept(q) ? i + 1 : 0))
          .filter(Boolean)
      : []
  const tagsOnly = (q) => officialPyqCardTagsOnly(q, paper)
  const rows = await fillPaperQuestionByQuestion(
    questions,
    (question) => fillOfficialPyqTags(hybridFillRequestForQuestion(question, paper.exam, { tagsOnly: tagsOnly(question) })),
    {
      concurrency: HYBRID_FILL_PART_SIZE,
      signal: opts.signal,
      isFatal: opts.isFatal,
      tagsOnly,
      skip: (q) => isOfficialPyqPlaceholder(q) || (!opts.redoAll && officialPyqCardIsFilled(q, paper)),
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
        const patch = row.tagsOnly
          ? tagsOnlyPatch(row.patch, card)
          : row.problem
            ? { ...row.patch, solution: card.solution }
            : row.patch
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
    tagsOnly: rows.filter((row) => row.tagsOnly).length,
    noPrintedAnswer,
    stopped: Boolean(opts.signal?.aborted),
  }
}

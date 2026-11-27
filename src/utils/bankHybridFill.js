/**
 * Question Bank "Fill with Hybrid AI": tags, answers, and solutions for Draft questions.
 * Upload only splits; this button fills later, two questions at a time, one Gemini request
 * per question, and saves each finished part before the next starts. The stem, options,
 * and figures never change. Answers and solutions printed on the paper or typed by hand stay.
 */
import { fillOfficialPyqTags } from './hybridAiClient.js'
import { HYBRID_FILL_PART_SIZE, fillPaperQuestionByQuestion, hybridFillUsage } from './officialPyqReplica.js'
import {
  applyHybridPatchToCard,
  currentAnswerText,
  hybridFillRequestForQuestion,
  officialPyqCardTagsOnly,
  officialPyqFillIncomplete,
  withRetryReason,
} from './officialPyqPendingFill.js'
import { peekUploadedQuestions, updateUploadedQuestion } from './questionBank.js'
import { effectiveBankStatus } from './questionUploadFilter.js'

const SAVED_KEYS = [
  'subject',
  'questionType',
  'section',
  'chapter',
  'topic',
  'toughnessLevel',
  'idealTimeSeconds',
  'source',
  'examIds',
  'correctIndex',
  'correctIndices',
  'correctInteger',
  'correctNumerical',
  'matrixAnswerKey',
  'answerSource',
  'solution',
  'solutionSource',
  'hybridAnswerDisagrees',
]

/** A Draft question that already has a real chapter, an answer, and a solution. @param {any} q */
export function bankDraftIsFilled(q) {
  const chapter = String(q?.chapter || '').trim()
  if (!chapter || /^general$/i.test(chapter)) return false
  return Boolean(currentAnswerText(q) && String(q?.solution || '').trim())
}

/** Draft questions the button would send: not published, with a stem, and (unless redoAll) not yet filled. */
export function bankDraftsToFill(questions, opts = {}) {
  return (Array.isArray(questions) ? questions : []).filter(
    (q) =>
      q &&
      effectiveBankStatus(q) === 'draft' &&
      q.placeholder !== true &&
      String(q.text ?? q.stem ?? '').trim() &&
      (opts.redoAll === true || !bankDraftIsFilled(q)),
  )
}

/**
 * A paragraph question with its paragraph: in the bank only the first child keeps it, later ones point at it.
 * @param {any} q @param {any[]} [bank]
 */
export function bankQuestionWithPassage(q, bank = []) {
  if (String(q?.passageText ?? '').trim() || !q?.passageId) return q
  const first = (Array.isArray(bank) ? bank : []).find((row) => String(row?.id) === String(q.passageId))
  const passageText = String(first?.passageText ?? '').trim()
  return passageText ? { ...q, passageText } : q
}

/** The fill request for one bank question; a paragraph question carries its paragraph. @param {any} q @param {any[]} [bank] */
export function bankHybridFillRequest(q, bank = []) {
  const tagsOnly = officialPyqCardTagsOnly(q)
  return hybridFillRequestForQuestion(bankQuestionWithPassage(q, bank), String(q?.examPatternId || ''), { tagsOnly })
}

function sameValue(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/** Only the fields Hybrid AI changed, with a numeric toughness. @param {any} card @param {any} next */
function changedFields(card, next) {
  const out = {}
  for (const key of SAVED_KEYS) {
    let value = next[key]
    if (key === 'toughnessLevel' && value != null && value !== '' && Number.isFinite(Number(value))) value = Number(value)
    if (!sameValue(value, card[key])) out[key] = value
  }
  return out
}

/**
 * Fill the given Draft questions part by part. A question published, deleted, or reworded
 * while the fill runs is skipped. A solution that still reads like a hint or an essay is not saved.
 * @param {string[]} ids
 * @param {{
 *   redoAll?: boolean,
 *   signal?: AbortSignal,
 *   isFatal?: (err: Error) => boolean,
 *   onProgress?: (info: { from: number, to: number, total: number, filled: number }) => void,
 *   fillOne?: (body: object) => Promise<object>,
 * }} [opts]
 */
export async function fillBankDraftsWithHybridAi(ids, opts = {}) {
  const wanted = new Set((Array.isArray(ids) ? ids : []).map(String))
  const questions = bankDraftsToFill(
    peekUploadedQuestions().filter((q) => wanted.has(String(q?.id))),
    { redoAll: opts.redoAll },
  )
  const ask = opts.fillOne || fillOfficialPyqTags
  const total = questions.length
  let filled = 0
  /** @type {string[]} */
  const needsLook = []
  /** @type {string[]} */
  const incomplete = []
  const bank = peekUploadedQuestions()
  const fillOne = (question, _index, _attempt, retryReason) =>
    ask(withRetryReason(bankHybridFillRequest(question, bank), retryReason))
  const rows = await fillPaperQuestionByQuestion(questions, fillOne, {
    concurrency: HYBRID_FILL_PART_SIZE,
    signal: opts.signal,
    isFatal: opts.isFatal,
    tagsOnly: (q) => officialPyqCardTagsOnly(q),
    incomplete: (q, filled) => officialPyqFillIncomplete(bankQuestionWithPassage(q, bank), filled),
    onProgress: (index) => {
      const from = index - (index % HYBRID_FILL_PART_SIZE) + 1
      opts.onProgress?.({ from, to: Math.min(from + HYBRID_FILL_PART_SIZE - 1, total), total, filled })
    },
    onApplied: (row) => {
      if (row.skipped) return
      const id = String(row.question?.id ?? '')
      if (row.incomplete) {
        incomplete.push(id)
        return
      }
      if (row.needsLook) needsLook.push(id)
      if (!row.patch) return
      const card = peekUploadedQuestions().find((q) => String(q?.id) === id)
      if (!card || effectiveBankStatus(card) !== 'draft') return
      if (String(card.text ?? card.stem ?? '') !== row.patch.expectText) return
      const patch = row.tagsOnly
        ? { ...row.patch, solution: card.solution, correctIndex: card.correctIndex, correctIndices: card.correctIndices, correctInteger: card.correctInteger, correctNumerical: card.correctNumerical, matrixAnswerKey: undefined }
        : row.problem
          ? { ...row.patch, solution: card.solution }
          : row.patch
      const updates = changedFields(card, applyHybridPatchToCard(card, patch))
      if (!Object.keys(updates).length) return
      if (!updateUploadedQuestion(id, updates, { silent: true })) throw new Error(`Could not save question ${id}.`)
      filled += 1
    },
  })
  const paused = rows.find((row) => row.outage)
  return {
    total,
    asked: rows.filter((row) => !row.skipped && !row.outage).length,
    filled,
    needsLook,
    incomplete,
    tagsOnly: rows.filter((row) => row.tagsOnly).length,
    paused: paused ? { reason: paused.outage, left: total - rows.filter((row) => !row.outage).length } : null,
    usage: hybridFillUsage(rows),
    stopped: Boolean(opts.signal?.aborted),
  }
}

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
import {
  getOfficialPyqPendingPaper,
  officialPyqCardIsAdminEdited,
  updateOfficialPyqPendingPaper,
} from './officialPyqPendingStore.js'
import { applyOfficialPyqPublishedMeta } from './officialPyqPublishedMeta.js'
import { isOfficialPyqPlaceholder } from './officialPyqMissingSlots.js'
import { gridColLabels, isMatrixGridCard } from './matrixGridPyq.js'
import {
  formatNumericChoice,
  letterAlternativesOf,
  numericAnswerMatches,
  numericalAlternativesOf,
} from './answerAlternatives.js'
import { solutionIsOnlyPrintedKeyLine } from './printedAnswerKey.js'
import { officialPyqPaperSourceName } from '../data/officialPyqSources.js'

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
 * no solution are sent or asked for. `source` is the paper's own name; Hybrid AI never guesses it.
 * @param {any} question @param {string} [paperExam] @param {{ tagsOnly?: boolean, source?: string }} [opts]
 */
export function hybridFillRequestForQuestion(question, paperExam = '', opts = {}) {
  const examId = Array.isArray(question?.examIds) && question.examIds.length ? question.examIds[0] : paperExam
  const grid = isMatrixGridCard(question)
  if (opts.tagsOnly) {
    const {
      answer: _answer,
      answer_is_official: _official,
      solution: _solution,
      ...tags
    } = hybridFillRequestForQuestion(question, paperExam, { source: opts.source })
    return { ...tags, tags_only: true }
  }
  const official = officialPyqCardAnswerIsKept(question) && question?.bonusMarksToAll !== true
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
    source: opts.source || (question?.source ? String(question.source) : ''),
    answer: official ? currentAnswerText(question) : '',
    answer_is_official: official,
    solution: solutionIsUsable(question) ? String(question.solution) : '',
  }
}

const AI_SOLUTION_SOURCES = new Set(['hybrid_ai', 'ai_generated'])

/** A real worked solution: not a "Quick eliminations" draft and not a bare printed key line. @param {any} q */
function solutionIsUsable(q) {
  const solution = String(q?.solution || '').trim()
  return Boolean(solution && q?.solutionSource !== 'draft' && !solutionIsOnlyPrintedKeyLine(solution))
}

/** "A,C" from "(A) and (C)" / "A, C"; '' when the text names no option letter. @param {string} text */
function lettersIn(text) {
  const bracketed = [...text.matchAll(/\(\s*([A-D])\s*\)/gi)].map((m) => m[1].toUpperCase())
  const bare = bracketed.length ? [] : [...text.matchAll(/(?<![A-Za-z])([A-D])(?![A-Za-z])/g)].map((m) => m[1])
  return [...new Set([...bracketed, ...bare])].sort().join(',')
}

/**
 * The answer a solution's last "Answer:" line reaches, written as `currentAnswerText` writes it:
 * "A", "A,C", "8", or a grid "A-P,R; B-Q". '' when the solution has no answer line.
 * @param {unknown} solution @param {any} question
 */
export function answerFromSolution(solution, question) {
  const lines = String(solution ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
  const line = lines.slice(-3).reverse().find((s) => /^[*_\s]*(?:final\s+)?answer[*_\s]*[:：]/i.test(s))
  if (!line) return ''
  const raw = line
    .replace(/^[*_\s]*(?:final\s+)?answer[*_\s]*[:：]/i, '')
    .replace(/\\(?:text|mathrm|mathbf)\{([^}]*)\}/g, '$1')
    .replace(/[$*]/g, '')
    .trim()
  if (isMatrixGridCard(question)) {
    const labels = gridColLabels(question).map(String)
    const rows = [...raw.matchAll(/\(?([A-D])\)?\s*(?:-|→|->|:|\\to|\\rightarrow)\s*([^;\n]+)/g)].map((m) => {
      const cols = m[2].split(/[,\s&]+/).map((t) => t.replace(/[()]/g, '')).filter((t) => labels.includes(t))
      return cols.length ? `${m[1]}-${[...new Set(cols)].sort((a, b) => labels.indexOf(a) - labels.indexOf(b)).join(',')}` : ''
    })
    return rows.filter(Boolean).sort().join('; ')
  }
  const hasOptions = Array.isArray(question?.options) && question.options.filter((o) => String(o ?? '').trim()).length >= 2
  return hasOptions ? lettersIn(raw) : numberIn(raw)
}

/** First number in an answer line; fractions and "× 10^k" are worked out. @param {string} raw */
function numberIn(raw) {
  const num = '(-?\\d+(?:\\.\\d+)?)'
  const t = raw
    .replace(/(?<=\d),(?=\d{3}\b)/g, '')
    .replace(new RegExp(`\\\\[dt]?frac\\{${num}\\}\\{${num}\\}`, 'g'), (_, a, b) => String(Number(a) / Number(b)))
    .replace(new RegExp(`${num}\\s*/\\s*${num}`, 'g'), (_, a, b) => String(Number(a) / Number(b)))
    .replace(new RegExp(`${num}\\s*(?:\\\\times|×|x)\\s*10\\^\\{?${num}\\}?`, 'g'), (_, a, e) => String(Number(a) * 10 ** Number(e)))
  const n = t.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/i)
  return n && Number.isFinite(Number(n[0])) ? String(Number(n[0])) : ''
}

/** The answer a solution reached is the card's answer (any printed alternative counts). @param {any} card @param {string} reached */
export function answerMatchesCard(card, reached) {
  if (!reached) return false
  if (card?.bonusMarksToAll === true) return true
  const stored = currentAnswerText(card)
  if (stored === reached) return true
  if (isMatrixGridCard(card)) return gridAnswerText(card).split('; ').sort().join('; ') === reached
  const n = Number(reached)
  if (/^-?\d+(?:\.\d+)?$/.test(reached) && (card?.correctNumerical != null || card?.correctInteger != null)) {
    return numericAnswerMatches(card, n)
  }
  const letters = reached.split(',').map((ch) => ch.charCodeAt(0) - 65).sort((a, b) => a - b).join(',')
  const sets = [
    Array.isArray(card?.correctIndices) && card.correctIndices.length ? card.correctIndices : [card?.correctIndex],
    ...letterAlternativesOf(card),
  ]
  return sets.some((set) => set.filter((i) => i != null && i !== '').map(Number).sort((a, b) => a - b).join(',') === letters)
}

/**
 * Why a Hybrid AI reply cannot be saved as this card's answer and solution: '' when it can.
 * The solution must end in an answer line, and that answer must be the official one when the paper has one.
 * @param {any} card @param {any} filled
 */
export function officialPyqFillAnswerProblem(card, filled) {
  const solution = String(filled?.step_by_step_solution ?? '').trim()
  if (!solution) return ''
  const reached = answerFromSolution(solution, card)
  if (!reached) return 'The solution does not end with its answer.'
  if (officialPyqCardAnswerIsKept(card) && !answerMatchesCard(card, reached)) {
    return `The solution reaches ${reached}, but the official answer is ${currentAnswerText(card)}.`
  }
  return ''
}

/** With no official answer, the answer is the one the solution reaches. @param {any} card @param {any} filled */
export function withAnswerFromSolution(card, filled) {
  if (!filled || filled.tags_only || officialPyqCardAnswerIsKept(card)) return filled
  const reached = answerFromSolution(filled.step_by_step_solution, card)
  return reached ? { ...filled, correct_answer: reached } : filled
}

/**
 * True when the card has its Main-bank tags (unit, a real chapter, topic, toughness) and, unless the paper
 * prints every answer and solution, an answer and a real worked solution. An AI solution that reaches a
 * different answer than the official one counts as missing.
 * @param {any} q @param {any} [paper]
 */
export function officialPyqCardIsFilled(q, paper) {
  const chapter = String(q?.chapter || '').trim()
  if (!chapter || /^general$/i.test(chapter)) return false
  if (!String(q?.section || q?.unit || '').trim() || !String(q?.topic || '').trim()) return false
  if (q?.toughnessLevel == null || q.toughnessLevel === '') return false
  if (paper?.printedAnswersAndSolutions === true) return true
  if (!solutionIsUsable(q) || !(currentAnswerText(q) || q?.bonusMarksToAll === true)) return false
  if (AI_SOLUTION_SOURCES.has(q?.solutionSource) && officialPyqCardAnswerIsKept(q)) {
    const reached = answerFromSolution(q.solution, q)
    if (reached && !answerMatchesCard(q, reached)) return false
  }
  return true
}

/**
 * Cards whose source is not the paper's own name get it ("JEE Advanced 2025 Paper 1").
 * @param {any} paper @returns {any[] | null} the corrected cards, or null when every card already has it
 */
export function officialPyqCardsWithPaperSource(paper) {
  const name = officialPyqPaperSourceName(paper)
  const questions = Array.isArray(paper?.questions) ? paper.questions : []
  if (!name || !questions.some((q) => q && String(q.source ?? '') !== name)) return null
  return questions.map((q) => (q && String(q.source ?? '') !== name ? { ...q, source: name } : q))
}

/** Save the paper's own name as every card's source. Published papers are left alone. @param {string} paperId */
export function saveOfficialPyqPaperSource(paperId) {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper || paper.status === 'published') return false
  const questions = officialPyqCardsWithPaperSource(paper)
  if (!questions) return false
  return Boolean(updateOfficialPyqPendingPaper(paperId, { questions, allowPublishedQuestionWrite: true }))
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
  const solutionKept = KEPT_SOURCES.has(card.solutionSource) && officialPyqCardSolutionIsKept(card)
  if (!handEdited && !solutionKept && has(patch.solution) && patch.solution !== card.solution) {
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
  const before = getOfficialPyqPendingPaper(paperId)
  if (!before || before.status !== 'approved') throw new Error(HYBRID_FILL_NEEDS_APPROVAL)
  saveOfficialPyqPaperSource(paperId)
  const paper = getOfficialPyqPendingPaper(paperId) || before
  const source = officialPyqPaperSourceName(paper)
  const questions = Array.isArray(paper.questions) ? paper.questions : []
  const total = questions.length
  let filled = 0
  /** @type {number[]} */
  const needsLook = []
  /** @type {number[]} */
  const notSaved = []
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
    async (question) =>
      withAnswerFromSolution(
        question,
        await fillOfficialPyqTags(hybridFillRequestForQuestion(question, paper.exam, { tagsOnly: tagsOnly(question), source })),
      ),
    {
      concurrency: HYBRID_FILL_PART_SIZE,
      signal: opts.signal,
      isFatal: opts.isFatal,
      tagsOnly,
      answerProblem: officialPyqFillAnswerProblem,
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
        if (!card || String(card.text ?? card.stem ?? '') !== row.patch.expectText) {
          notSaved.push(row.index + 1)
          return
        }
        // A solution that reads like a hint, has no answer line, or misses the official answer is not
        // saved, and neither is the answer that came with it; the tags still are.
        const patch = row.tagsOnly || row.problem ? tagsOnlyPatch(row.patch, card) : row.patch
        const result = applyOfficialPyqPublishedMeta(paperId, row.index, {
          ...publishedPatchFromCard(applyHybridPatchToCard(card, patch)),
          source: source || card.source,
        })
        if (!result.ok) {
          notSaved.push(row.index + 1)
          return
        }
        filled += 1
      },
    },
  )
  return {
    total,
    asked: rows.filter((row) => !row.skipped).length,
    filled,
    needsLook,
    notSaved,
    tagsOnly: rows.filter((row) => row.tagsOnly).length,
    noPrintedAnswer,
    stopped: Boolean(opts.signal?.aborted),
  }
}

/**
 * Map Gemini structure-ocr JSON into question-bank draft rows.
 * Used after Mathpix OCR. Does not call APIs.
 */

import { healPaperItemCards } from './mathpixQuestionSplit.js'
import { applyUploadQualityGuards } from './uploadQualityGuards.js'
import { solutionIsOnlyPrintedKeyLine } from './printedAnswerKey.js'

const TYPE_ALIASES = {
  single: 'single_correct',
  scq: 'single_correct',
  single_correct: 'single_correct',
  mcq: 'single_correct',
  true_false: 'true_false',
  tf: 'true_false',
  boolean: 'true_false',
  multiple: 'multiple_correct',
  multiple_correct: 'multiple_correct',
  msq: 'multiple_correct',
  matrix: 'matrix_match',
  matrix_match: 'matrix_match',
  matching: 'matrix_match',
  integer: 'integer',
  numerical: 'numerical',
  numeric: 'numerical',
  passage: 'passage',
  passage_scq: 'passage_scq',
  passage_integer: 'passage_integer',
}

const SUBJECTS = new Set(['physics', 'chemistry', 'mathematics', 'biology', 'botany', 'zoology'])

/** @param {unknown} raw */
export function normalizeQuestionType(raw) {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  return TYPE_ALIASES[key] || 'single_correct'
}

/** @param {unknown} raw */
export function normalizeSubject(raw) {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (SUBJECTS.has(key)) return key
  if (key === 'math' || key === 'maths') return 'mathematics'
  if (key === 'chem') return 'chemistry'
  if (key === 'phy') return 'physics'
  if (key === 'bio') return 'biology'
  return 'physics'
}

function optionList(raw) {
  if (Array.isArray(raw)) return raw.map((o) => String(o ?? ''))
  if (raw && typeof raw === 'object') {
    return ['A', 'B', 'C', 'D'].map((k) => String(raw[k] ?? raw[k.toLowerCase()] ?? ''))
  }
  return ['', '', '', '']
}

function clampToughness(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 5
  return Math.max(1, Math.min(10, Math.round(v)))
}

/**
 * @param {unknown} item
 * @param {{
 *   paperMeta?: Record<string, unknown>
 *   instructionText?: string
 *   index?: number
 * }} [opts]
 */
export function geminiStructuredItemToBankDraft(item, opts = {}) {
  if (!item || typeof item !== 'object') return null
  const q = /** @type {Record<string, any>} */ (item)
  const text = String(q.text ?? q.stem ?? '').trim()
  if (!text) return null
  const questionType = normalizeQuestionType(q.questionType || q.type)
  const options = optionList(q.options)
  while (options.length < 4) options.push('')
  const paper = opts.paperMeta && typeof opts.paperMeta === 'object' ? opts.paperMeta : {}
  const examId = String(q.examIds?.[0] || q.exam || paper.exam || paper.examPatternId || '').trim()
  const examIds = Array.isArray(q.examIds)
    ? q.examIds.map(String).filter(Boolean)
    : examId
      ? [examId]
      : []
  const marks = Number(q.marks ?? q.marking?.correct)
  const marking =
    q.marking && typeof q.marking === 'object'
      ? {
          correct: Number(q.marking.correct) || (Number.isFinite(marks) ? marks : 4),
          wrong: Number(q.marking.wrong) || 0,
          unattempted: Number(q.marking.unattempted) || 0,
        }
      : Number.isFinite(marks)
        ? { correct: marks, wrong: 0, unattempted: 0 }
        : undefined
  const attachedInstructions = String(q.instructions ?? q.sectionInstructions ?? '').trim()
  const paperInstructions = String(opts.instructionText ?? '').trim()
  const year = Number(q.pyqYear ?? q.year ?? paper.year ?? paper.pyqYear)
  if (opts.splitOnly === true) {
    const printed = q.answerKeyVisible === true || q.answerSource === 'from_paper'
    const solutionText = String(q.solution ?? '').trim()
    const printedSolution =
      (q.solutionSource === 'from_paper' || q.solutionPrinted === true) &&
      Boolean(solutionText) &&
      !solutionIsOnlyPrintedKeyLine(solutionText)
    const pick = (v) => (printed && v != null && Number.isFinite(Number(v)) ? Number(v) : undefined)
    const toughness = Number(paper.toughnessLevel)
    return {
      text,
      options: options.slice(0, Math.max(4, options.length)),
      questionType,
      subject: normalizeSubject(paper.subject || q.subject),
      section: String(paper.section || '').trim() || undefined,
      chapter: String(paper.chapter || '').trim() || 'General',
      topic: String(paper.topic || '').trim() || undefined,
      examIds: examIds.length ? examIds : undefined,
      examPatternId: examId || paper.examPatternId || undefined,
      pyqYear: Number.isFinite(year) && year > 1900 ? year : undefined,
      paperLabel: String(q.paperLabel || paper.paperLabel || '').trim() || undefined,
      paperId: String(q.paperId || paper.paperId || '').trim() || undefined,
      source: String(paper.sourceLabel || q.source || '').trim() || undefined,
      toughnessLevel: Number.isFinite(toughness) && toughness > 0 ? clampToughness(toughness) : undefined,
      marking,
      correctIndex: pick(q.correctIndex),
      correctIndices:
        printed && Array.isArray(q.correctIndices)
          ? q.correctIndices.map(Number).filter((n) => Number.isFinite(n))
          : undefined,
      correctInteger: pick(q.correctInteger),
      correctNumerical: pick(q.correctNumerical),
      solution: printedSolution ? solutionText : undefined,
      passageText: String(q.passageText ?? '').trim() || undefined,
      instructions: attachedInstructions || paperInstructions || undefined,
      questionNumber: Number(q.number ?? q.questionNumber ?? (opts.index ?? 0) + 1) || undefined,
      bankStatus: 'draft',
      answerSource: printed ? 'from_paper' : 'unknown',
      solutionSource: printedSolution ? 'from_paper' : undefined,
      ocrEngine: 'mathpix',
    }
  }
  return {
    text,
    options: options.slice(0, Math.max(4, options.length)),
    questionType,
    subject: normalizeSubject(q.subject || paper.subject),
    section: String(q.section || q.unit || paper.section || '').trim() || undefined,
    chapter: String(q.chapter || paper.chapter || 'General').trim() || 'General',
    topic: String(q.topic || '').trim() || undefined,
    examIds: examIds.length ? examIds : undefined,
    examPatternId: examId || paper.examPatternId || undefined,
    pyqYear: Number.isFinite(year) && year > 1900 ? year : undefined,
    paperLabel: String(q.paperLabel || paper.paperLabel || '').trim() || undefined,
    paperId: String(q.paperId || paper.paperId || '').trim() || undefined,
    source: String(q.source || paper.sourceLabel || '').trim() || undefined,
    toughnessLevel: clampToughness(q.toughnessLevel ?? q.toughness ?? q.difficulty),
    marking,
    correctIndex:
      q.correctIndex != null && Number.isFinite(Number(q.correctIndex))
        ? Number(q.correctIndex)
        : undefined,
    correctIndices: Array.isArray(q.correctIndices)
      ? q.correctIndices.map(Number).filter((n) => Number.isFinite(n))
      : undefined,
    correctInteger:
      q.correctInteger != null && Number.isFinite(Number(q.correctInteger))
        ? Number(q.correctInteger)
        : undefined,
    correctNumerical:
      q.correctNumerical != null && Number.isFinite(Number(q.correctNumerical))
        ? Number(q.correctNumerical)
        : undefined,
    solution: String(q.solution ?? '').trim() || undefined,
    passageText: String(q.passageText ?? '').trim() || undefined,
    instructions: attachedInstructions || paperInstructions || undefined,
    questionNumber: Number(q.number ?? q.questionNumber ?? (opts.index ?? 0) + 1) || undefined,
    bankStatus: 'draft',
    answerSource: q.answerKeyVisible ? 'from_paper' : q.correctIndex != null || q.correctInteger != null || q.correctNumerical != null ? 'ai_generated' : 'unknown',
    solutionSource: q.solution ? (q.answerKeyVisible ? 'from_paper' : 'ai_generated') : undefined,
    ocrEngine: 'mathpix',
  }
}

/**
 * @param {{ questions?: unknown[], instructions?: string }} parsed
 * @param {{ paperMeta?: Record<string, unknown> }} [opts]
 */
export function geminiStructureToBankDrafts(parsed, opts = {}) {
  const list = Array.isArray(parsed?.questions) ? parsed.questions : []
  const instructionText = String(parsed?.instructions ?? '').trim()
  const drafts = []
  for (let i = 0; i < list.length; i++) {
    const row = geminiStructuredItemToBankDraft(list[i], {
      paperMeta: opts.paperMeta,
      instructionText,
      index: i,
      splitOnly: opts.splitOnly === true,
    })
    if (row) drafts.push(row)
  }
  const healed = healPaperItemCards(drafts)
  const source = [instructionText, ...drafts.map((d) => String(d?.text ?? ''))].join('\n\n')
  const guarded = applyUploadQualityGuards(healed.length ? healed : drafts, source)
  return { drafts: guarded, instructionText }
}

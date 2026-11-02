import { normalizeQuestionStemText } from './normalizeMathText.js'
import { finalizeStemForBank } from './stemBankGuard.js'
import { normalizeFigureQuestionOnMigrate } from './figureQuestionImage.js'
import { stripWrongTextMcqOptionImages } from './graphOptionOcr.js'
import { parseQuestionText } from './parseQuestionText.js'
import { looksLikeDeterminantIntegerStem } from './repairDeterminantOcr.js'
import {
  countRealMcqOptions,
  countMcqAnswerSlots,
  looksLikeIntegerValueQuestion,
} from './stemDiagramDetect.js'
import {
  healMatrixQuestion,
  matrixColsNeedHeal,
  repairIncompleteRowD,
  trimRowColumnIIBleed,
} from './parseMatchColumnUpload.js'
import {
  hasGoodLimitGxStem,
  healLimitGxOptions,
  looksLikeLimitGxQuestion,
} from './repairLimitGxStemOcr.js'
import { healStoredMcqQuestion } from './healStoredMcq.js'

/** MCQ option text — never run full stem OCR polish on single-line LaTeX answers. */
function normalizeStoredMcqOption(o) {
  const s = String(o ?? '').trim()
  if (!s) return o
  if (
    !s.includes('\n') &&
    s.length <= 64 &&
    /^(?:\d+|An integer greater than(?:\s+\d+)?|a fraction|an irrational number)$/i.test(s)
  ) {
    return s
  }
  if (
    !s.includes('\n') &&
    s.length <= 24 &&
    (/^-?\d+$/.test(s) || /^\$[^$\n]+\$$/.test(s))
  ) {
    return s
  }
  if (
    !s.includes('\n') &&
    s.length <= 320 &&
    (/\\frac\{|\\left\(|\\sqrt|continuous\s+for\s+all|g\\left|g\s*\(/i.test(s) ||
      /^\$[^$\n]+\$$/.test(s))
  ) {
    return s
  }
  const normalized = normalizeQuestionStemText(s)
  return normalized.trim() ? normalized : s
}

/** MCQ saved without real A–D text, or determinant stem that should be integer type. */
function healMcqQuestionTypeAndOptions(q) {
  const next = { ...q }
  const text = String(next.text ?? '')
  const type = next.questionType ?? 'single_correct'
  const mcqTypes = ['single_correct', 'multiple_correct', 'passage_scq']
  if (!mcqTypes.includes(type)) return next

  const realOpts = countRealMcqOptions(text, next.options ?? [])
  const imageSlots = countMcqAnswerSlots(text, next.options ?? [], next.optionImages ?? [])
  const looksInteger =
    imageSlots < 2 &&
    realOpts < 2 &&
    (looksLikeDeterminantIntegerStem(text) ||
      looksLikeIntegerValueQuestion(text, next.options ?? []) ||
      (/\\begin\{vmatrix\}/i.test(text) && /\bvalue\s+of\s+[a-d]\b/i.test(text)))

  if (looksInteger) {
    return {
      ...next,
      questionType: 'integer',
      options: [],
      optionImages: undefined,
      correctIndex: undefined,
      correctIndices: undefined,
    }
  }

  if (realOpts >= 2 || imageSlots >= 2) return next

  const parsed = parseQuestionText(text)
  if (parsed.optionsFound >= 2 && countRealMcqOptions(parsed.text, parsed.options) >= 2) {
    return {
      ...next,
      text: finalizeStemForBank(parsed.text || text, parsed.options),
      options: parsed.options.map((o) => {
        const s = String(o ?? '').trim()
        return s ? normalizeStoredMcqOption(s) : o
      }),
    }
  }

  return next
}

/**
 * Re-apply stem-safe math repair when loading from localStorage (fixes old saves on resume).
 * @param {import('../data/tests').Question} q
 */
export function migrateStoredQuestionText(q) {
  if (!q || typeof q !== 'object') return q

  let next = { ...q }

  next = healMcqQuestionTypeAndOptions(next)
  next = healStoredMcqQuestion(next)

  if (looksLikeLimitGxQuestion(next.text) && hasGoodLimitGxStem(next.text)) {
    next.options = healLimitGxOptions(next.options ?? [])
  }

  // Normalize options first so leak-stripping can match their (math) tails against the stem.
  if (Array.isArray(next.options)) {
    next.options = next.options.map((o) => {
      const s = String(o ?? '').trim()
      return s ? normalizeStoredMcqOption(s) : o
    })
  }

  if (typeof next.text === 'string' && next.text.trim()) {
    next.text = finalizeStemForBank(next.text, next.options ?? [])
  }

  if (typeof next.passageText === 'string' && next.passageText.trim()) {
    next.passageText = finalizeStemForBank(next.passageText)
  }

  // Matrix-match: recover Column II before row trim strips (P)–(T) bleed, then normalize.
  if (Array.isArray(next.matrixRows)) {
    const rawRows = [...next.matrixRows]
    if (matrixColsNeedHeal(next.matrixCols)) {
      const preHeal = healMatrixQuestion({ ...next, matrixRows: rawRows })
      if (!matrixColsNeedHeal(preHeal.matrixCols)) {
        next.matrixCols = preHeal.matrixCols
        next.matrixColLabels = preHeal.matrixColLabels
      }
    }

    next.matrixRows = next.matrixRows.map((r, i) => {
      const s = String(r ?? '')
      if (!s.trim()) return r
      let fixed = trimRowColumnIIBleed(s)
      if (i === 3) fixed = repairIncompleteRowD(fixed)
      return finalizeStemForBank(fixed)
    })
  }
  if (Array.isArray(next.matrixCols)) {
    next.matrixCols = next.matrixCols.map((c) => {
      const s = String(c ?? '')
      if (!s.trim()) return c
      return finalizeStemForBank(s)
    })
  }
  if (Array.isArray(next.matrixRows)) {
    const postHeal = healMatrixQuestion(next)
    if (!matrixColsNeedHeal(postHeal.matrixCols)) {
      next.matrixCols = postHeal.matrixCols
      next.matrixColLabels = postHeal.matrixColLabels
    }
  }

  if (Array.isArray(next.subQuestions)) {
    next.subQuestions = next.subQuestions.map((sq) => {
      if (!sq || typeof sq !== 'object') return sq
      const sub = { ...sq }
      if (Array.isArray(sub.options)) {
        sub.options = sub.options.map((o) => {
          const s = String(o ?? '').trim()
          return s ? normalizeStoredMcqOption(s) : o
        })
      }
      if (sub.text?.trim()) {
        sub.text = finalizeStemForBank(sub.text, sub.options ?? [])
      }
      return sub
    })
  }

  return stripWrongTextMcqOptionImages(normalizeFigureQuestionOnMigrate(next))
}

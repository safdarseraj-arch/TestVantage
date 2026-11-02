/**
 * Single readiness gate for bank, exam papers, and analysis.
 * Block incomplete content before it reaches students.
 */

import { detectBrokenBankStem } from './stemBankGuard.js'
import { countRealMcqOptions, countMcqAnswerSlots, countFilledMcqOptionsForPublish } from './stemDiagramDetect.js'
import { matrixColsNeedHeal } from './parseMatchColumnUpload.js'
import { getAnswerableQuestions } from './passage.js'
import { matchQuestionMissingListI } from './uploadQualityGuards.js'
import { latexExtractionIncomplete } from './healTruncatedLatex.js'
import { stemLooksIncompleteOnDisplay } from './sanitizeStemForDisplay.js'
import { stemIsIncompleteMatrixOnly } from './hybridLatexSanitize.js'

/** @typedef {{ id: string, severity: 'error' | 'warn' | 'info', message: string }} ReadinessIssue */

/** @param {import('../data/tests').Question} q */
export function validateQuestionReadiness(q) {
  /** @type {ReadinessIssue[]} */
  const issues = []
  if (!q || typeof q !== 'object') {
    return { ok: false, issues: [{ id: 'missing', severity: 'error', message: 'Question data missing.' }] }
  }

  const type = q.questionType ?? 'single_correct'
  const stem = String(q.text ?? '').trim()
  const hasImage = Boolean(q.questionImage?.trim() || q.optionsImage || (q.optionImages ?? []).some(Boolean))

  if (!stem && !hasImage && !String(q.passageText ?? '').trim()) {
    issues.push({ id: 'empty-stem', severity: 'error', message: 'Question has no text or image.' })
  }

  if (stem) {
    const broken = detectBrokenBankStem(stem)
    if (broken.length) {
      issues.push({
        id: 'broken-stem',
        severity: 'error',
        message: `Stem LaTeX needs fix (${broken.slice(0, 2).join('; ')}).`,
      })
    }
    if (stemLooksIncompleteOnDisplay(stem) || latexExtractionIncomplete(q.passageText)) {
      issues.push({
        id: 'extraction-incomplete',
        severity: 'error',
        message: 'Extraction incomplete — do not publish until the stem math is complete.',
      })
    }
    if (stemIsIncompleteMatrixOnly(stem)) {
      issues.push({
        id: 'incomplete-ask',
        severity: 'error',
        message:
          "Question stem is only a matrix plus 'is equal to' with no real ask (determinant, find, or value).",
      })
    }
    if (matchQuestionMissingListI(q)) {
      issues.push({
        id: 'match-list-i',
        severity: 'error',
        message: 'Match-the-column is missing List-I. Restore from the original OCR before save or publish.',
      })
    }
  }

  if (type === 'true_false') {
    if (q.correctIndex == null || (q.correctIndex !== 0 && q.correctIndex !== 1)) {
      issues.push({
        id: 'tf-no-key',
        severity: 'warn',
        message: 'Mark TRUE or FALSE as the correct answer.',
      })
    }
  } else if (type === 'single_correct' || type === 'passage_scq') {
    const found = Math.max(
      countMcqAnswerSlots(stem, q.options ?? [], q.optionImages),
      countFilledMcqOptionsForPublish(q.options ?? [], q.optionImages),
    )
    if (found < 4) {
      issues.push({
        id: 'mcq-incomplete',
        severity: 'error',
        message: `Options ${found}/4 — all four choices (A–D) are required.`,
      })
    }
    if (found >= 4 && q.correctIndex == null && !q.optionImages?.some(Boolean)) {
      issues.push({
        id: 'mcq-no-key',
        severity: 'warn',
        message: 'Correct answer (A–D) is not marked.',
      })
    }
  }

  if (type === 'multiple_correct') {
    const found = countRealMcqOptions(stem, q.options ?? [])
    if (found < 2) {
      issues.push({
        id: 'msq-incomplete',
        severity: 'error',
        message: `MSQ needs at least 2 options (found ${found}).`,
      })
    } else if (found < 4) {
      issues.push({
        id: 'msq-partial',
        severity: 'warn',
        message: `MSQ has ${found}/4 options — complete A–D if possible.`,
      })
    }
  }

  if (type === 'matrix_match') {
    const filledRows = (q.matrixRows ?? []).filter((r) => String(r ?? '').replace(/\s/g, '').length > 8).length
    if (filledRows < 2) {
      issues.push({
        id: 'matrix-rows',
        severity: 'error',
        message: `Matrix Column I needs at least 2 rows (found ${filledRows}).`,
      })
    } else if (filledRows < 4) {
      issues.push({
        id: 'matrix-rows-partial',
        severity: 'warn',
        message: `Matrix Column I has ${filledRows}/4 rows.`,
      })
    }
    if (matrixColsNeedHeal(q.matrixCols)) {
      issues.push({
        id: 'matrix-cols',
        severity: 'error',
        message: 'Matrix Column II is incomplete — fill P–S in Question Bank.',
      })
    }
    const mode = q.matrixResponseMode ?? 'grid'
    if (mode === 'grid' && filledRows >= 2) {
      const key = q.matrixAnswerKey
      const hasKey = key && typeof key === 'object' && Object.keys(key).length > 0
      if (!hasKey) {
        issues.push({
          id: 'matrix-key',
          severity: 'warn',
          message: 'Matrix answer grid is not ticked.',
        })
      }
    }
  }

  if (type === 'integer' || type === 'passage_integer') {
    if (q.correctInteger == null && q.correctNumerical == null) {
      issues.push({
        id: 'integer-key',
        severity: 'warn',
        message: 'Correct integer answer is not set.',
      })
    }
  }

  if (type === 'numerical') {
    if (q.correctNumerical == null) {
      issues.push({
        id: 'numerical-key',
        severity: 'warn',
        message: 'Correct numerical answer is not set.',
      })
    }
  }

  return {
    ok: !issues.some((i) => i.severity === 'error'),
    issues,
  }
}

/** @param {{ issues: ReadinessIssue[] }} result */
export function readinessSaveBlockMessage(result) {
  const err = result.issues.find((i) => i.severity === 'error')
  return err?.message ?? 'Question is not ready to save.'
}

/**
 * @param {import('../data/tests').Question[]} questions
 */
export function validatePaperReadiness(questions) {
  const answerable = getAnswerableQuestions(questions ?? [])
  /** @type {{ index: number, id?: string, text: string, issues: ReadinessIssue[] }[]} */
  const problems = []

  answerable.forEach((q, i) => {
    const { ok, issues } = validateQuestionReadiness(q)
    if (!ok) {
      problems.push({
        index: i + 1,
        id: q.id,
        text: String(q.text ?? '').slice(0, 72),
        issues: issues.filter((x) => x.severity === 'error'),
      })
    }
  })

  return { ok: problems.length === 0, problems, total: answerable.length }
}

/**
 * Attempt quality tag (for analytics).
 * @param {import('../data/tests').PerQuestionResult} pq
 */
export function classifyAttemptQuality(pq) {
  if (!pq) return 'unattempted'
  if (pq.skipped || pq.userAnswer == null || pq.userAnswer === '') return 'unattempted'
  const sec = pq.timeSpentSec ?? 0
  if (pq.correct) {
    if (sec > 0 && sec < 8) return 'too-fast-correct'
    if (sec > 180) return 'overtime-correct'
    return 'perfect'
  }
  if (sec > 0 && sec < 6) return 'too-fast-incorrect'
  if (sec > 120) return 'overtime-incorrect'
  return 'incorrect'
}

/**
 * Smart Compose helpers — soft validation, local format/LaTeX polish,
 * and similarity warnings for Question Bank Compose (manual entry).
 * Cloud AI is optional; local paths never block Save.
 */

import { normalizeMathText } from './normalizeMathText.js'
import {
  findDuplicateQuestions,
  formatDuplicateAlarmMessage,
  questionPreviewLabel,
} from './detectDuplicateQuestion.js'
import { validateNumericalAnswer } from './numericalAnswer.js'
import { isPassageMetadataType } from '../data/questionTypes.js'

/** Keyboard shortcuts shown in Compose UI. */
export const COMPOSE_SHORTCUTS = [
  { keys: 'Ctrl+E', action: 'Open / close math & chemistry Symbols' },
  { keys: 'Ctrl+S', action: 'Save composed question' },
  { keys: 'Ctrl+V', action: 'Paste diagram into the diagram drop zone' },
  { keys: 'Tab', action: 'Move between stem, options, and solution' },
]

/**
 * Soft readiness checklist — friendly messages, no throws.
 * @param {{
 *   questionType?: string
 *   stem?: string
 *   options?: string[]
 *   optionImages?: (string|null|undefined)[]
 *   correctIndex?: number | null
 *   correctIndices?: number[]
 *   correctInteger?: string | number
 *   correctNumerical?: string | number
 *   matrixRows?: string[]
 *   matrixCols?: string[]
 *   matrixUseOptions?: boolean
 *   matrixGridKey?: Record<string, unknown>
 *   passageBundle?: { passageText?: string, subQuestions?: unknown[] } | null
 *   subject?: string
 *   examIds?: string[]
 * }} ctx
 * @returns {{ blockers: string[], warnings: string[], ready: boolean }}
 */
export function getComposeSoftIssues(ctx = {}) {
  /** @type {string[]} */
  const blockers = []
  /** @type {string[]} */
  const warnings = []
  const type = String(ctx.questionType ?? 'single_correct')
  const stem = String(ctx.stem ?? '').trim()
  const options = Array.isArray(ctx.options) ? ctx.options : []
  const optionImages = Array.isArray(ctx.optionImages) ? ctx.optionImages : []
  const filledOpts = options.filter((o) => String(o ?? '').trim()).length
  const filledImgs = optionImages.filter((img) => !!String(img ?? '').trim()).length

  if (ctx.passageBundle?.subQuestions?.length) {
    const pt = String(ctx.passageBundle.passageText ?? '').trim()
    if (pt.length < 20) blockers.push('Add the shared passage text (at least a short paragraph).')
    if (ctx.passageBundle.subQuestions.length < 2) {
      blockers.push('Passage sets need at least two sub-questions.')
    }
    return { blockers, warnings, ready: blockers.length === 0 }
  }

  if (isPassageMetadataType(type) && !ctx.passageBundle?.subQuestions?.length) {
    blockers.push(
      'Passage types need a passage set — click “Start passage set” below, or use Convert → Split passage.',
    )
  }

  if (!stem || stem.length < 8) {
    blockers.push('Add the question stem (the main question text).')
  } else if (stem.length < 20) {
    warnings.push('Stem looks short — add a little more detail if this is a full exam question.')
  }

  if (type === 'single_correct' || type === 'multiple_correct') {
    if (filledOpts + filledImgs < 2) {
      blockers.push('Fill at least two options (A–D), or attach option images.')
    } else if (filledOpts < 4 && filledImgs < 4) {
      warnings.push(
        `Options: ${Math.max(filledOpts, filledImgs)} of 4 filled — complete A–D when you can.`,
      )
    }
    if (type === 'single_correct') {
      if (ctx.correctIndex == null || ctx.correctIndex < 0) {
        blockers.push('Tick the correct option (A–D) before Save.')
      }
    } else if (!(ctx.correctIndices?.length > 0)) {
      blockers.push('Tick at least one correct option for MCQ (multi-correct).')
    }
  }

  if (type === 'true_false') {
    if (ctx.correctIndex == null || ctx.correctIndex < 0) {
      blockers.push('Tick TRUE or FALSE as the correct answer.')
    }
  }

  if (type === 'integer') {
    if (ctx.correctInteger === '' || ctx.correctInteger == null) {
      blockers.push('Enter the correct integer answer (0–9999).')
    } else {
      const n = parseInt(String(ctx.correctInteger), 10)
      if (Number.isNaN(n) || n < 0 || n > 9999) {
        blockers.push('Correct integer must be from 0 to 9999.')
      }
    }
  }

  if (type === 'numerical') {
    const check = validateNumericalAnswer(ctx.correctNumerical)
    if (!check.ok) {
      blockers.push(check.error || 'Enter a valid numerical answer.')
    }
  }

  if (type === 'matrix_match') {
    const rows = (ctx.matrixRows ?? []).filter((r) => String(r ?? '').trim()).length
    if (rows < 2) blockers.push('Enter at least two Column I rows (A–D).')
    const cols = (ctx.matrixCols ?? []).filter((c) => String(c ?? '').trim()).length
    if (cols < 4) warnings.push('Fill every Column II entry before publishing.')
    if (!ctx.matrixUseOptions) {
      const key = ctx.matrixGridKey ?? {}
      if (!Object.keys(key).length) {
        blockers.push('Tick the answer grid for each filled Column I row.')
      }
    } else if (ctx.correctIndex == null || ctx.correctIndex < 0) {
      blockers.push('Tick the correct option for this matrix-match (options mode).')
    }
  }

  if (!ctx.subject) warnings.push('Pick a subject so the bank stays searchable.')
  if (!(ctx.examIds?.length > 0)) {
    warnings.push('Tag JEE and/or NEET exams when you know them (tags stay for the next question).')
  }

  return { blockers, warnings, ready: blockers.length === 0 }
}

/**
 * Local “Improve / format stem” — tidy whitespace + math normalize.
 * @param {string} text
 */
export function localImproveStem(text) {
  const raw = String(text ?? '').replace(/\r\n/g, '\n')
  const collapsed = raw
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return normalizeMathText(collapsed)
}

/**
 * Local “Suggest LaTeX” — same normalize stack (unicode → LaTeX).
 * @param {string} text
 */
export function localSuggestLatex(text) {
  return normalizeMathText(String(text ?? '').trim())
}

/**
 * Local option polish — trim + math normalize each non-empty option.
 * @param {string[]} options
 */
export function localPolishOptions(options = []) {
  return options.map((o) => {
    const t = String(o ?? '').trim()
    if (!t) return ''
    return normalizeMathText(t)
  })
}

/**
 * Soft similarity warning (does not block Save by itself).
 * @param {string} stem
 * @param {import('../data/tests').Question[]} bank
 * @param {{ excludeId?: string }} [opts]
 */
export function findComposeSimilarStems(stem, bank, opts = {}) {
  const text = String(stem ?? '').trim()
  if (text.length < 24) return []
  return findDuplicateQuestions(
    { text, questionType: 'single_correct' },
    bank ?? [],
    { excludeId: opts.excludeId, minSimilarity: 0.82 },
  )
}

/**
 * @param {ReturnType<typeof findComposeSimilarStems>} matches
 */
export function formatComposeSimilarWarning(matches) {
  if (!matches?.length) return ''
  const top = matches[0]
  const label = questionPreviewLabel(top.question)
  const kind = top.match === 'exact' ? 'same wording' : 'similar stem'
  const more = matches.length > 1 ? ` (+${matches.length - 1} more)` : ''
  return `Possible duplicate (${kind}) already in your bank${more}: ${label}. Save keeps this copy as a draft so you can compare.`
}

export { formatDuplicateAlarmMessage }

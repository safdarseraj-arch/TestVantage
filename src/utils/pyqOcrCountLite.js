/**
 * Lightweight OCR question counts for Official PYQ local re-parse.
 * Avoids importing pyqGeminiExtract (heavy inferOcr / full split).
 */

import { countMathpixQuestionMarkers, sanitizeMathpixOcrText } from './mathpixQuestionSplit.js'

/** @param {'jee-main' | 'jee-advanced' | 'neet' | string} exam */
export function pyqCatalogQuestionTarget(exam) {
  if (exam === 'jee-advanced') return 51
  if (exam === 'jee-main') return 30
  if (exam === 'neet') return 180
  return 10
}

/**
 * Optional nudge when a stored count is one or two off a catalog size and there is no OCR.
 * A real marker count (for example 48 on JEE Advanced 2026 Paper 1) must stay as counted.
 * @param {string} exam
 * @param {unknown} count
 */
export function snapPyqExpectedToCatalog(exam, count) {
  const catalog = pyqCatalogQuestionTarget(exam)
  const n = Number(count) || 0
  const slack = exam === 'jee-advanced' ? 2 : exam === 'jee-main' ? 2 : exam === 'neet' ? 6 : 2
  if (n >= 8 && Math.abs(n - catalog) <= slack) return catalog
  return n > 0 ? n : catalog
}

/** Marker-based OCR count — fast, no full paper split. */
export function quickOcrQuestionCount(ocrText) {
  const text = sanitizeMathpixOcrText(ocrText)
  if (!text) return 0
  return countMathpixQuestionMarkers(text)
}

/**
 * Expected sitting size is the question markers actually in this OCR.
 * Catalog (51 / 30 / 180) is only the fallback when the OCR has no countable questions.
 */
export function expectedPyqTargetFromOcrLite(exam, ocrText) {
  const markers = quickOcrQuestionCount(ocrText)
  if (markers >= 8) return markers
  return pyqCatalogQuestionTarget(exam)
}

function liteTypeCounts(questions) {
  /** @type {Record<string, number>} */
  const out = {}
  for (const q of questions ?? []) {
    const id = String(q?.questionType ?? 'single_correct')
    out[id] = (out[id] || 0) + 1
  }
  return out
}

function liteTypeSummary(typeCounts) {
  const entries = Object.entries(typeCounts || {}).filter(([, n]) => n > 0)
  if (!entries.length) return '—'
  return entries.map(([id, n]) => `${n} ${id.replace(/_/g, ' ')}`).join(', ')
}

/**
 * Fast extraction summary for Official PYQ preview — marker counts only.
 * Does not import pyqGeminiExtract / inferOcr.
 * @param {{ ocrText?: string, questions?: unknown[], exam?: string, session?: string }} [input]
 */
export function buildLiteExtractionSummary(input = {}) {
  const ocrText = String(input.ocrText ?? '')
  const questions = Array.isArray(input.questions) ? input.questions : []
  const exam = String(input.exam ?? '')
  const markers = quickOcrQuestionCount(ocrText)
  const filled = questions.filter((q) => String(q?.text ?? q?.stem ?? '').trim()).length
  // Real marker count wins. A filled paper with no OCR text is not "catalog 51".
  let expected = markers >= 8 ? markers : 0
  if (expected < 8 && filled >= 8 && ocrText.trim().length < 80) expected = filled
  else if (expected < 8) expected = expectedPyqTargetFromOcrLite(exam, ocrText)
  const reserved = questions.length - filled
  const typeCounts = liteTypeCounts(questions.filter((q) => String(q?.text ?? '').trim()))
  const ocrFigures = (ocrText.match(/\\includegraphics|cdn\.mathpix\.com/gi) || []).length
  const instrBlocks = (ocrText.match(/SECTION\s+\d+|This section contains|Maximum Marks:/gi) || []).length
  let ocrErrors = 0
  if (ocrText && markers < 1) ocrErrors += 1
  if (ocrText.length > 400 && markers < 2) ocrErrors += 1
  const matchExpected =
    expected <= 0 ? filled >= 4 : filled >= expected - 2 && filled <= expected + 2
  return {
    expected,
    pdf: {
      questionCount: markers,
      figureQuestions: ocrFigures,
      instructionBlocks: instrBlocks,
    },
    latex: {
      questionCount: markers,
      markers,
      figureQuestions: ocrFigures,
      errors: ocrErrors,
      charCount: ocrText.length,
    },
    split: {
      questionCount: filled,
      typeCounts,
      typeSummary: liteTypeSummary(typeCounts),
      figureQuestions: 0,
      correct: filled,
      partial: reserved > 0 ? reserved : 0,
      incorrect: 0,
      instructionsFiltered: instrBlocks,
      matchExpected,
    },
    extractMeta: null,
  }
}

/** True when local Mathpix re-parse is good enough — skip optional Gemini. */
export function localOfficialPyqReparseAcceptable(count, target, exam, previousCount = 0) {
  const n = Number(count) || 0
  const prev = Number(previousCount) || 0
  const t = Number(target) || 0
  const minKeep =
    exam === 'jee-advanced' ? 40 : exam === 'jee-main' ? 20 : exam === 'neet' ? 30 : 8
  if (n < minKeep) return false
  if (t > 0 && n >= t - 3 && n <= t + 3) return true
  if (n > prev && n >= minKeep) return true
  return n >= minKeep
}

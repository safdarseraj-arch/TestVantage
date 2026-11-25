/**
 * Lightweight OCR question counts for Official PYQ local re-parse.
 * Avoids importing pyqGeminiExtract (heavy inferOcr / full split).
 */

import { countMathpixQuestionMarkers, sanitizeMathpixOcrText } from './mathpixQuestionSplit.js'

/** @param {'jee-main' | 'jee-advanced' | 'neet' | string} exam */
export function pyqCatalogQuestionTarget(exam) {
  if (exam === 'jee-advanced') return 51
  // Full JEE Main sitting is 90 (20 SCQ + 10 numerical × 3). Old 30 under-counted FIITJEE booklets.
  if (exam === 'jee-main') return 90
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
 * Catalog (51 / 90 / 180) is the fallback when OCR has no countable questions,
 * or when Mathpix markers are sparse on a long full-paper OCR (FIITJEE booklets).
 */
export function expectedPyqTargetFromOcrLite(exam, ocrText) {
  const catalog = pyqCatalogQuestionTarget(exam)
  const markers = quickOcrQuestionCount(ocrText)
  const raw = String(ocrText ?? '')
  if (markers >= 8) {
    // Keep real short OCR counts (e.g. Advanced partial 18). Do not let ~8 markers
    // on a 60k+ char Main/Adv/NEET OCR override the known full-paper size.
    if (catalog >= 40 && markers < Math.floor(catalog * 0.35) && raw.length > 20000) {
      return catalog
    }
    return markers
  }
  return catalog
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
  // Prefer a coherent expected size: sparse markers on a long OCR / full split must not
  // report "~8" when the sitting catalog (or filled cards) is ~90 / 51 / 180.
  let expected = expectedPyqTargetFromOcrLite(exam, ocrText)
  if (expected < 8 && filled >= 8 && ocrText.trim().length < 80) expected = filled
  const catalog = pyqCatalogQuestionTarget(exam)
  if (
    catalog >= 40 &&
    filled >= catalog - 2 &&
    filled <= catalog + 2 &&
    (markers < Math.floor(catalog * 0.35) || Math.abs(expected - filled) > 2)
  ) {
    expected = filled
  }
  const displayOcrCount =
    catalog >= 40 && markers < Math.floor(catalog * 0.35) && filled >= catalog - 2 ? filled : markers
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
      questionCount: displayOcrCount,
      figureQuestions: ocrFigures,
      instructionBlocks: instrBlocks,
    },
    latex: {
      questionCount: displayOcrCount,
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

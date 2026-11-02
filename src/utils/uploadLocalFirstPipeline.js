/**
 * Standing upload order for Official PYQ, PDF, image, and Question Bank Convert.
 * Not a per-paper patch.
 *
 * 1. Mathpix OCR extract (PDF / image / handwriting only — never Local or Gemini)
 * 2. Local AI manages (split, options, lists, stem, figures, order, dedupe)
 * 3. Gemini flash-lite for metatags, answers, and brief solutions
 * 4. If local managing fails, Gemini flash-lite retries that step only (still not OCR)
 */

import { latexExtractionIncomplete } from './healTruncatedLatex.js'
import { extractMathpixImageUrls } from './mathpixMedia.js'
import { findGluedNextQuestionStart } from './mathpixQuestionSplit.js'

function matchQuestionMissingListI(q) {
  const t = String(q?.text ?? '')
  if (!/Match|List|Column/i.test(t)) return false
  return !/\(\s*[PQRSABCD]\s*\)\s+\S/.test(t)
}

export const GEMINI_LIGHT_MODEL = 'gemini-3.5-flash-lite'

/** @param {unknown} text */
function stemShowsRawAlignedCode(text) {
  const t = String(text ?? '')
  if (/\\begin\{(?:aligned|align\*?|eqnarray)\}/.test(t)) return false
  return /&\s*[^\n]{0,160}\\\\/.test(t)
}

/**
 * Why local split/clean is not good enough (Gemini may retry this step).
 * Never invents missing math or list rows.
 * @param {unknown[]} questions
 * @param {unknown} rawText
 * @param {{ exam?: string, bank?: boolean }} [meta]
 */
export function diagnoseLocalUploadSplit(questions, rawText, meta = {}) {
  const list = Array.isArray(questions) ? questions : []
  const raw = String(rawText ?? '')
  const reasons = []
  if (!list.length) reasons.push('empty-split')

  let incomplete = 0
  let missingListI = 0
  let rawCode = 0
  for (const q of list) {
    const stem = String(q?.text ?? q?.stem ?? '')
    if (latexExtractionIncomplete(stem)) {
      const optsOk = (Array.isArray(q?.options) ? q.options : []).filter((o) => String(o ?? '').trim()).length >= 2
      const onlyThenTail = /\bThen\s*$/i.test(stem.trim()) && !/\\frac\s*\{[^}]*$/.test(stem)
      if (!(onlyThenTail && optsOk)) incomplete += 1
    }
    if (matchQuestionMissingListI(q)) missingListI += 1
    if (stemShowsRawAlignedCode(stem)) rawCode += 1
  }
  const badStems = incomplete + rawCode
  const tooManyBad =
    badStems > 0 &&
    (list.length <= 2 ? true : badStems > Math.max(2, Math.floor(list.length * 0.2)))
  if (incomplete) reasons.push('incomplete-stem')
  if (missingListI) reasons.push('missing-list-i')
  if (rawCode) reasons.push('raw-aligned-code')
  if (tooManyBad) reasons.push('too-many-bad-stems')

  const ocrFigs = extractMathpixImageUrls(raw)
  const cardFigs = list.flatMap((q) => extractMathpixImageUrls(q?.text ?? q?.stem ?? ''))
  const mentionsFig = list.some((q) =>
    /\b(?:figure|diagram|as shown|shown below)\b/i.test(String(q?.text ?? q?.stem ?? '')),
  )
  if (ocrFigs.length && !cardFigs.length && mentionsFig) reasons.push('missing-figures')

  let glued = 0
  for (const q of list) {
    if (findGluedNextQuestionStart(q?.text ?? q?.stem ?? '') >= 24) glued += 1
  }
  if (glued && (list.length <= 3 || glued >= Math.max(1, Math.floor(list.length * 0.15)))) {
    reasons.push('merged-questions')
  }

  return {
    ok:
      list.length > 0 &&
      !reasons.includes('empty-split') &&
      !reasons.includes('too-many-bad-stems') &&
      !reasons.includes('missing-figures') &&
      !reasons.includes('merged-questions'),
    reasons,
    count: list.length,
    bank: meta.bank === true,
  }
}

/**
 * Copy Gemini light tags/answers/solutions onto local cards.
 * Never replaces stem, options, or figures.
 * @param {object[]} localQuestions
 * @param {unknown[]} geminiRows
 * @param {{ deferSolutions?: boolean }} [opts]
 */
export function mergeLightEnrichOntoDrafts(localQuestions, geminiRows, opts = {}) {
  const list = Array.isArray(localQuestions) ? localQuestions : []
  const rows = Array.isArray(geminiRows) ? geminiRows : []
  const deferSolutions = opts.deferSolutions === true
  return list.map((q, i) => {
    const row = rows.find((x) => Number(x?.i) === i) || rows[i]
    if (!row || typeof row !== 'object') return q
    const next = { ...q }
    if (row.subject) next.subject = String(row.subject)
    if (row.section) next.section = String(row.section)
    if (row.chapter && (!next.chapter || next.chapter === 'General')) next.chapter = String(row.chapter)
    if (row.topic) next.topic = String(row.topic)
    if (Number.isFinite(Number(row.toughnessLevel))) next.toughnessLevel = Number(row.toughnessLevel)
    const hasAnswer =
      next.correctIndex != null ||
      (Array.isArray(next.correctIndices) && next.correctIndices.length) ||
      next.correctInteger != null ||
      next.correctNumerical != null
    if (!hasAnswer && Number.isInteger(row.correctIndex) && row.correctIndex >= 0 && row.correctIndex <= 5) {
      next.correctIndex = row.correctIndex
      next.answerSource = next.answerSource && next.answerSource !== 'unknown' ? next.answerSource : 'ai_generated'
    }
    if (!hasAnswer && Array.isArray(row.correctIndices) && row.correctIndices.length) {
      next.correctIndices = row.correctIndices.map(Number).filter((n) => Number.isFinite(n))
      next.answerSource = next.answerSource && next.answerSource !== 'unknown' ? next.answerSource : 'ai_generated'
    }
    if (!hasAnswer && row.correctInteger != null && Number.isFinite(Number(row.correctInteger))) {
      next.correctInteger = Number(row.correctInteger)
      next.answerSource = next.answerSource && next.answerSource !== 'unknown' ? next.answerSource : 'ai_generated'
    }
    if (!hasAnswer && row.correctNumerical != null && Number.isFinite(Number(row.correctNumerical))) {
      next.correctNumerical = Number(row.correctNumerical)
      next.answerSource = next.answerSource && next.answerSource !== 'unknown' ? next.answerSource : 'ai_generated'
    }
    if (!deferSolutions && !String(next.solution ?? '').trim()) {
      const sol = String(row.solution ?? '').trim()
      if (sol && sol.length >= 8 && sol.length <= 800) {
        next.solution = sol
        next.solutionSource = 'ai_generated'
        next.solutionPending = false
      }
    }
    return next
  })
}

/**
 * Bank Convert / Word / PDF: two clean cards (or one if OCR is a single question).
 * @param {unknown[]} questions
 * @param {unknown} rawText
 */
export function localBankSplitGoodEnough(questions, rawText) {
  const list = Array.isArray(questions) ? questions : []
  const raw = String(rawText ?? '')
  if (list.length < 1) return false
  const markers = (raw.match(/\\item\s*\[Q/gi) || []).length
  const numbered = (raw.match(/(?:^|\n)\s*(?:Q\s*\.?\s*)?\d{1,3}[\.\)]\s+\S/g) || []).length
  const expected = Math.max(markers, numbered)
  if (expected >= 2 && list.length < 2) return false
  if (expected >= 4 && list.length < expected - 1) return false
  return diagnoseLocalUploadSplit(list, raw, { bank: true }).ok
}

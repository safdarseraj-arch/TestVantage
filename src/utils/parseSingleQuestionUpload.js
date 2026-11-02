import { parseBulkQuestions } from './parseBulkQuestions.js'
import { applyParsedToForm, parseQuestionText } from './parseQuestionText.js'
import { inferMsqTruthCorrectIndices } from './inferMsqCorrect.js'
import { normalizeMathText } from './normalizeMathText.js'
import {
  repairDeterminantOcr,
  looksLikeDeterminantIntegerStem,
  looksLikeDeterminantQuestion } from './repairDeterminantOcr.js'
import { applyMcqParseRepairs } from './repairRegistry.js'
import { looksLikePassageMultiMcq } from './parsePassageUpload.js'
import { polishOcrText } from './ocrExtractPolish.js'
import { mathContentScore } from './fixOcrMathSymbols.js'
import { enrichParsedWithAnswerProvenance } from './answerProvenance.js'
import { applyUploadQualityGuards } from './uploadQualityGuards.js'

/** @param {string[]} [options] */
function scoreMcqOptions(options) {
  let score = 0
  ;(options ?? []).forEach((o, i) => {
    const t = String(o ?? '').trim()
    if (!t) return
    if (/\\vec\{[A-D]\}\s*\\cdot\s*\\vec\{[A-Z]\}/i.test(t)) score -= 50
    if (/^(?:A\.P\.|G\.P\.|H\.P\.|A\.G\.P\.)$/i.test(t)) score += 40
    score += 10 + Math.min(t.length, 400)
    if (i < 2) score += 20
  })
  return score
}

/** @param {ReturnType<typeof buildSingleParse>} a @param {ReturnType<typeof buildSingleParse>} b */
function pickRicherParse(a, b) {
  const sa = scoreMcqOptions(a.options)
  const sb = scoreMcqOptions(b.options)
  if (sb > sa) return b
  if (sa > sb) return a
  const aAb = (a.options?.[0]?.trim() ? 1 : 0) + (a.options?.[1]?.trim() ? 1 : 0)
  const bAb = (b.options?.[0]?.trim() ? 1 : 0) + (b.options?.[1]?.trim() ? 1 : 0)
  return bAb > aAb ? b : a
}

/**
 * Best-effort parse for one MCQ from OCR / paste / PDF text.
 * @param {string} raw
 * @returns {{
 *   multi: boolean
 *   items?: import('./parseBulkQuestions').ParsedBulkQuestion[]
 *   text?: string
 *   options?: string[]
 *   optionsFound?: number
 *   complete?: boolean
 *   correctIndex?: number
 *   correctIndices?: number[]
 *   solution?: string
 * }}
 */
/**
 * @param {string} source
 * @param {import('./parseBulkQuestions').ParsedBulkQuestion[]} bulk
 */
function buildSingleParse(source, bulk) {
  const direct = parseQuestionText(source)
  const applied = applyParsedToForm(direct, source)

  let text = applied.text
  let options = applied.options.map((o) => String(o || '').trim())
  let optionsFound = applied.optionsFound
  let correctIndex
  let correctIndices
  let solution

  if (bulk.length === 1) {
    const b = bulk[0]
    const bOpts = (b.options ?? []).map((o) => String(o || '').trim())
    const bFound = bOpts.filter((o) => o).length
    const determinantInteger = looksLikeDeterminantIntegerStem(`${text}\n${source}\n${b.text ?? ''}`)
    if (
      !determinantInteger &&
      (bFound > optionsFound || (!text?.trim() && b.text?.trim()))
    ) {
      text = b.text?.trim() || text
      options = bOpts.length ? bOpts : options
      while (options.length < 4) options.push('')
      optionsFound = bFound
    }
    if (b.correctIndex != null) correctIndex = b.correctIndex
    if (b.correctIndices?.length) correctIndices = b.correctIndices
    if (b.solution) solution = b.solution
  }

  if (looksLikeDeterminantQuestion(`${text}\n${source}`)) {
    text = repairDeterminantOcr(text || source)
  }

  while (options.length < 4) options.push('')
  if (options.length > 6) options = options.slice(0, 6)

  optionsFound = options.filter((o) => o.trim()).length
  const complete = optionsFound >= 4

  const blob = `${text}\n${source}`
  const suggestedQuestionType =
    /\bwhich\s+of\s+the\s+following\s+(?:statements?\s+)?(?:is\/are|are|is)\s+(?:correct|true|incorrect|false|wrong|possible|valid)\b/i.test(
      blob,
    ) ||
    /\bone\s+or\s+more\s+of\s+the\s+following\b/i.test(blob) ||
    /\b(?:mark|select|choose)\s+all\s+(?:that\s+apply|correct)\b/i.test(blob) ||
    /\bchoose\s+the\s+correct\s+options?\b/i.test(blob)
      ? 'multiple_correct'
      : undefined

  const suggestedCorrectIndices =
    correctIndices?.length
      ? correctIndices
      : inferMsqTruthCorrectIndices(text, options)

  const base = {
    multi: false,
    text,
    options,
    optionsFound,
    complete,
    correctIndex,
    correctIndices,
    solution,
    suggestedQuestionType,
    suggestedCorrectIndices }

  return enrichParsedWithAnswerProvenance(base, source)
}

/**
 * @param {string} raw
 * @param {string} [alternateRaw] — e.g. lightly-normalized OCR before heavy math polish
 */
export function parseSingleQuestionUpload(raw, alternateRaw = '') {
  const normalized = raw.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return { multi: false, text: '', options: ['', '', '', ''], optionsFound: 0, complete: false }
  }

  const alt = String(alternateRaw ?? '')
    .replace(/\r\n/g, '\n')
    .trim()

  const bulk = parseBulkQuestions(normalized)
  if (
    bulk.length > 1 &&
    !looksLikePassageMultiMcq(normalized) &&
    !(alt && looksLikePassageMultiMcq(alt))
  ) {
    return { multi: true, items: bulk }
  }

  let result = buildSingleParse(normalized, bulk)
  if (alt && alt !== normalized) {
    const altPolished = polishOcrText(alt)
    const altNorm = normalizeMathText(altPolished)
    const altBulk = parseBulkQuestions(altNorm)
    if (altBulk.length <= 1) {
      const altResult = buildSingleParse(altNorm, altBulk)
      result = pickRicherParse(result, altResult)
    }
    if (
      altPolished.trim() &&
      mathContentScore(altPolished) > mathContentScore(result.text ?? '') + 8
    ) {
      const altStem = buildSingleParse(altNorm, altBulk).text?.trim()
      if (altStem) result = { ...result, text: altStem }
      else if (!result.text?.trim() || /jlasamea|Wx\s*\+\s*x/i.test(result.text)) {
        result = { ...result, text: altPolished.trim() }
      }
    }
  }

  const ocrSource = alt || normalized
  result = applyMcqParseRepairs(result, ocrSource, { passes: 2 })

  // Provenance after repairs so answer/solution badges stay attached
  if (!result.multi) {
    result = enrichParsedWithAnswerProvenance(result, ocrSource)
    if (bulk.length === 1 && /\\begin\{aligned\}/.test(String(bulk[0].text ?? ''))) {
      result = { ...result, text: bulk[0].text }
    }
    const healed = applyUploadQualityGuards([result], ocrSource)[0]
    if (healed) result = healed
  }

  return result
}

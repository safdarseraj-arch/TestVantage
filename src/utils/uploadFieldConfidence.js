/**
 * Per-field confidence for upload review — flags low-confidence stem/options/answer.
 */

import { countRealMcqOptions } from './stemDiagramDetect.js'
import {
  derivativeTokensDifferWildly,
  looksLikeCurveDerivativeGraphMcq,
} from './repairDerivativePrimeStemOcr.js'

/**
 * Detect stem math that looks corrupted vs typical OCR (neq^0, stripped matrix vars).
 * @param {string} stem
 * @param {string} [ocrRaw]
 */
export function detectStemMathFidelityIssues(stem, ocrRaw = '') {
  const s = String(stem ?? '')
  const raw = String(ocrRaw ?? '')
  /** @type {string[]} */
  const issues = []
  if (/\\neq\s*\^|\\ne\s*\^|\\leq\s*\^|\\geq\s*\^/.test(s)) {
    issues.push('inequality digit became a superscript (e.g. ≠^0) — should be ≠ 0')
  }
  const rawHasVarCell =
    /1\s*\+\s*[xyz]|1\s*\+\s*\d+[xyz]|[xyz]\s*\^\s*\{?-?1\}?/i.test(raw) ||
    /1\+[xyz]|1\+\d+[xyz]/i.test(raw)
  const stemHasVarCell = /1\+[xyz]|1\+\d+[xyz]/i.test(s)
  if (rawHasVarCell && !stemHasVarCell && /\\begin\{vmatrix\}|\|\s*\d/.test(s)) {
    issues.push('determinant cells lost variables (expected terms like 1+x, 1+2y)')
  }
  if (
    /\\begin\{vmatrix\}/.test(s) &&
    !/\\\\/.test(s) &&
    (s.match(/&/g) || []).length >= 4
  ) {
    issues.push('vmatrix is missing row breaks')
  }
  if (
    looksLikeCurveDerivativeGraphMcq(s) &&
    (derivativeTokensDifferWildly(s, raw) ||
      (/f\s*''\s*\(\s*x\s*\)\s*>\s*0/i.test(s) && /f\s*\(\s*x\s*\)\s*<\s*0/i.test(s) && !/f\s*'\s*\(\s*x\s*\)\s*>\s*0/i.test(s)))
  ) {
    issues.push(
      "derivative primes may be wrong vs the image (expected f'(x)/f''(x) — compare side-by-side)",
    )
  }
  return issues
}

/**
 * @param {{
 *   text?: string
 *   options?: string[]
 *   correctIndex?: number
 *   correctIndices?: number[]
 *   correctInteger?: number
 *   correctNumerical?: number
 *   solution?: string
 *   answerSource?: string
 *   answerConfidence?: number
 *   solutionConfidence?: number
 *   ocrConfidence?: number
 *   uploadQualityScore?: number
 *   _ocrSource?: string
 * }} q
 * @returns {{
 *   overall: number
 *   fields: {
 *     stem: number
 *     options: number
 *     answer: number
 *     solution: number
 *   }
 *   lowConfidenceFields: string[]
 *   needsManualCheck: boolean
 *   mathFidelityIssues: string[]
 * }}
 */
export function scoreUploadFieldConfidence(q = {}) {
  const stem = String(q.text ?? '').trim()
  const options = q.options ?? []
  const found = countRealMcqOptions(stem, options)
  const ocrBase = Number(q.ocrConfidence ?? q.uploadQualityScore ?? 70)
  const mathFidelityIssues = detectStemMathFidelityIssues(stem, q._ocrSource ?? '')

  let stemScore = 40
  if (stem.length >= 20) stemScore += 20
  if (stem.length >= 60) stemScore += 10
  if (/\$|\\frac|\\int|\\sum|\\sqrt/.test(stem)) stemScore += 8
  if (/[?]/.test(stem) || /\b(?:find|evaluate|which|calculate|determine)\b/i.test(stem)) stemScore += 8
  if (/jlasamea|Wx\s*\+\s*x|�|ï¿½/i.test(stem)) stemScore -= 35
  if (stem.length < 12) stemScore -= 20
  if (mathFidelityIssues.length) stemScore -= 25
  stemScore = clamp(Math.round(stemScore * (0.55 + 0.45 * (ocrBase / 100))))

  let optScore = 30
  if (found >= 2) optScore += 25
  if (found >= 4) optScore += 30
  const emptyOpts = options.filter((o) => !String(o ?? '').trim()).length
  if (emptyOpts > 0 && found >= 2) optScore -= emptyOpts * 8
  for (const o of options) {
    if (/�|ï¿½/.test(String(o ?? ''))) optScore -= 10
  }
  optScore = clamp(Math.round(optScore * (0.6 + 0.4 * (ocrBase / 100))))

  let ansScore = 20
  const hasAns =
    q.correctIndex != null ||
    (Array.isArray(q.correctIndices) && q.correctIndices.length > 0) ||
    q.correctInteger != null ||
    q.correctNumerical != null
  if (hasAns) {
    ansScore = Number(q.answerConfidence ?? 70)
    if (q.answerSource === 'from_paper') ansScore = Math.max(ansScore, 85)
    if (q.answerSource === 'ai_generated') ansScore = Math.min(ansScore, 78)
    if (q.answerSource === 'unknown' || !q.answerSource) ansScore = Math.min(ansScore, 55)
  }

  let solScore = 15
  const sol = String(q.solution ?? '').trim()
  if (sol) {
    solScore = Number(q.solutionConfidence ?? (sol.length >= 40 ? 75 : 55))
    if (q.answerSource === 'ai_generated') solScore = Math.min(solScore, 70)
  }

  const fields = {
    stem: stemScore,
    options: optScore,
    answer: ansScore,
    solution: solScore,
  }

  const lowConfidenceFields = /** @type {string[]} */ ([])
  if (fields.stem < 55 || mathFidelityIssues.length) lowConfidenceFields.push('stem')
  if (fields.options < 55 && found > 0) lowConfidenceFields.push('options')
  if (fields.answer < 60) lowConfidenceFields.push('answer')
  if (sol && fields.solution < 55) lowConfidenceFields.push('solution')
  if (!hasAns) lowConfidenceFields.push('answer')

  const overall = clamp(
    Math.round(
      fields.stem * 0.3 +
        fields.options * 0.3 +
        fields.answer * 0.25 +
        (sol ? fields.solution * 0.15 : fields.stem * 0.05 + fields.options * 0.05 + fields.answer * 0.05),
    ),
  )

  return {
    overall,
    fields,
    lowConfidenceFields: [...new Set(lowConfidenceFields)],
    needsManualCheck: lowConfidenceFields.length > 0 || overall < 62 || mathFidelityIssues.length > 0,
    mathFidelityIssues,
  }
}

/** @param {number} n */
function clamp(n) {
  return Math.max(0, Math.min(100, n))
}

const EVERYDAY_FIELD_LABELS = {
  stem: 'Question',
  question: 'Question',
  options: 'Options',
  answer: 'Answer',
  solution: 'Solution',
  meta: 'Tags',
  generation: 'Generated',
}

/**
 * Known 0–100 score, or null when missing / unknown.
 * Does not invent 100 (or any default). 0 and blank count as not scored.
 * Values in (0, 1] are treated as 0–1 fractions (some model APIs).
 * @param {unknown} value
 * @returns {number | null}
 */
export function knownConfidenceScore(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  const pct = n <= 1 ? Math.round(n * 100) : Math.round(n)
  return clamp(pct)
}

/**
 * @param {unknown} value
 * @returns {string} e.g. "72%" or "—"
 */
export function formatConfidencePercent(value) {
  const n = knownConfidenceScore(value)
  return n == null ? '—' : `${n}%`
}

/**
 * Everyday label: "Question 72%" or "Solution not scored".
 * @param {string} field  stem | options | answer | solution | meta
 * @param {unknown} value
 */
export function formatEverydayConfidenceLabel(field, value) {
  const name = EVERYDAY_FIELD_LABELS[field] || field
  const n = knownConfidenceScore(value)
  return n == null ? `${name} not scored` : `${name} ${n}%`
}

function pickKnownScore(...vals) {
  for (const v of vals) {
    const n = knownConfidenceScore(v)
    if (n != null) return n
  }
  return null
}

function questionHasAnswer(q) {
  return (
    q?.correctIndex != null ||
    (Array.isArray(q?.correctIndices) && q.correctIndices.length > 0) ||
    q?.correctInteger != null ||
    q?.correctNumerical != null
  )
}

function storedFieldConfidence(q) {
  const raw = q?.fieldConfidence
  return raw && typeof raw === 'object' ? raw : null
}

/**
 * Map stored confidence objects onto display scores. Never fakes 100% when unknown.
 * Gemini / manual drafts without OCR stay "not scored" unless generationConfidence
 * (or a stored fieldConfidence snapshot) exists.
 * @param {object} [q]
 * @returns {{
 *   overall: number | null
 *   fields: {
 *     stem: number | null
 *     options: number | null
 *     answer: number | null
 *     solution: number | null
 *     meta: number | null
 *   }
 *   optionScores: (number | null)[] | null
 *   generation: number | null
 *   needsManualCheck: boolean
 *   lowConfidenceFields: string[]
 * }}
 */
export function resolveQuestionFieldConfidence(q = {}) {
  const stored = storedFieldConfidence(q)
  const storedFields = stored?.fields && typeof stored.fields === 'object' ? stored.fields : {}

  const generation = pickKnownScore(
    q.generationConfidence,
    q.aiGenerationConfidence,
    q.generateConfidence,
    q.modelConfidence,
    stored?.generation,
    storedFields.generation,
  )

  let stem = pickKnownScore(storedFields.stem, storedFields.question)
  let options = pickKnownScore(storedFields.options)
  let answer = pickKnownScore(storedFields.answer, q.answerConfidence)
  let solution = pickKnownScore(storedFields.solution, q.solutionConfidence)
  const meta = pickKnownScore(
    storedFields.meta,
    q.metaConfidence,
    q.tagConfidence,
    q.metadataConfidence,
  )

  const rawOptionScores = Array.isArray(stored?.optionScores)
    ? stored.optionScores
    : Array.isArray(storedFields.optionScores)
      ? storedFields.optionScores
      : Array.isArray(q.optionConfidence)
        ? q.optionConfidence
        : null
  const optionScores = rawOptionScores
    ? rawOptionScores.map((n) => knownConfidenceScore(n))
    : null
  if (options == null && optionScores?.some((n) => n != null)) {
    const known = optionScores.filter((n) => n != null)
    if (known.length) {
      options = clamp(Math.round(known.reduce((s, n) => s + n, 0) / known.length))
    }
  }

  const overall = pickKnownScore(stored?.overall, q.uploadFieldConfidence, generation)

  // Rebuild OCR-era per-field scores only when an OCR/upload score exists.
  // Generation-only drafts must stay "not scored" on stem/options.
  const hasOcrSignal =
    generation == null &&
    pickKnownScore(q.ocrConfidence, q.uploadQualityScore, q.uploadFieldConfidence) != null

  // Old OCR drafts only stored overall — rebuild per-field from the same helper.
  // Do not run this for Gemini/manual rows that only have generationConfidence.
  if (hasOcrSignal && (stem == null || options == null || (answer == null && questionHasAnswer(q)))) {
    const scored = scoreUploadFieldConfidence(q)
    if (stem == null) stem = scored.fields.stem
    if (options == null) options = scored.fields.options
    if (answer == null && questionHasAnswer(q)) answer = scored.fields.answer
    if (solution == null && String(q.solution ?? '').trim()) solution = scored.fields.solution
  }

  const fields = { stem, options, answer, solution, meta }
  const lowConfidenceFields = Array.isArray(stored?.lowConfidenceFields)
    ? stored.lowConfidenceFields
    : []
  const needsManualCheck = !!(
    stored?.needsManualCheck ||
    q.uploadNeedsManualCheck ||
    lowConfidenceFields.length > 0 ||
    (overall != null && overall < 62)
  )

  return {
    overall,
    fields,
    optionScores,
    generation,
    needsManualCheck,
    lowConfidenceFields,
  }
}

/**
 * Compact list badge: "72%" or "not scored".
 * @param {ReturnType<typeof resolveQuestionFieldConfidence>} resolved
 */
export function compactConfidenceBadge(resolved) {
  const n =
    resolved?.overall ??
    resolved?.fields?.stem ??
    resolved?.fields?.options ??
    resolved?.fields?.answer ??
    resolved?.generation
  return n == null ? 'not scored' : `${n}%`
}

/**
 * Restore editor/upload-review state from a saved question. Null when nothing was scored.
 * @param {object} [q]
 * @returns {ReturnType<typeof scoreUploadFieldConfidence> | {
 *   overall: number | null
 *   fields: object
 *   lowConfidenceFields: string[]
 *   needsManualCheck: boolean
 *   mathFidelityIssues: string[]
 *   generation?: number | null
 *   optionScores?: (number | null)[] | null
 * } | null}
 */
export function restoreFieldConfidenceState(q) {
  const resolved = resolveQuestionFieldConfidence(q)
  const hasAny =
    resolved.overall != null ||
    resolved.generation != null ||
    Object.values(resolved.fields).some((n) => n != null)
  if (!hasAny) return null
  return {
    overall: resolved.overall,
    fields: resolved.fields,
    lowConfidenceFields: resolved.lowConfidenceFields,
    needsManualCheck: resolved.needsManualCheck,
    mathFidelityIssues: [],
    generation: resolved.generation,
    optionScores: resolved.optionScores,
  }
}

function pickExistingConfidenceFields(existing = {}) {
  const resolved = resolveQuestionFieldConfidence(existing)
  const hasAny =
    resolved.overall != null ||
    resolved.generation != null ||
    Object.values(resolved.fields).some((n) => n != null)
  if (!hasAny) return {}
  /** @type {Record<string, unknown>} */
  const out = {}
  if (resolved.overall != null && resolved.generation == null) {
    out.uploadFieldConfidence = resolved.overall
  }
  if (resolved.needsManualCheck) out.uploadNeedsManualCheck = true
  if (resolved.fields.answer != null) out.answerConfidence = resolved.fields.answer
  if (resolved.fields.solution != null) out.solutionConfidence = resolved.fields.solution
  if (resolved.generation != null) out.generationConfidence = resolved.generation
  const fields = {}
  for (const key of ['stem', 'options', 'answer', 'solution', 'meta']) {
    if (resolved.fields[key] != null) fields[key] = resolved.fields[key]
  }
  out.fieldConfidence = {
    overall: resolved.overall,
    fields,
    needsManualCheck: resolved.needsManualCheck,
    lowConfidenceFields: resolved.lowConfidenceFields,
    ...(resolved.generation != null ? { generation: resolved.generation } : {}),
    ...(resolved.optionScores?.some((n) => n != null)
      ? { optionScores: resolved.optionScores }
      : {}),
  }
  return out
}

/**
 * Fields to persist on save. Live upload scores are stored as-is; otherwise
 * existing stored scores are kept. Empty when nothing was scored (no fake 100).
 * @param {ReturnType<typeof scoreUploadFieldConfidence> | null | undefined} score
 * @param {object} [existing]
 */
export function buildConfidencePersistFields(score, existing = {}) {
  if (score && score.fields && typeof score.fields === 'object') {
    const fields = {}
    for (const key of ['stem', 'options', 'answer', 'solution', 'meta']) {
      const n = knownConfidenceScore(score.fields[key])
      if (n != null) fields[key] = n
    }
    const overall = knownConfidenceScore(score.overall)
    const gen = pickKnownScore(score.generation, existing.generationConfidence)
    const optionScores = Array.isArray(score.optionScores)
      ? score.optionScores.map((n) => knownConfidenceScore(n))
      : null
    /** @type {Record<string, unknown>} */
    const out = {}
    if (overall != null && gen == null) out.uploadFieldConfidence = overall
    if (score.needsManualCheck) out.uploadNeedsManualCheck = true
    if (fields.answer != null) out.answerConfidence = fields.answer
    if (fields.solution != null) out.solutionConfidence = fields.solution
    if (gen != null) out.generationConfidence = gen
    if (overall != null || Object.keys(fields).length || gen != null) {
      out.fieldConfidence = {
        overall: overall ?? null,
        fields,
        needsManualCheck: !!score.needsManualCheck,
        lowConfidenceFields: score.lowConfidenceFields ?? [],
        ...(gen != null ? { generation: gen } : {}),
        ...(optionScores?.some((n) => n != null) ? { optionScores } : {}),
      }
    }
    return out
  }
  return pickExistingConfidenceFields(existing)
}

/**
 * Short UI hint for flagged fields.
 * @param {ReturnType<typeof scoreUploadFieldConfidence>} score
 */
export function formatFieldConfidenceHint(score) {
  if (!score?.needsManualCheck) return ''
  const math = score.mathFidelityIssues?.length
    ? `Math looks wrong vs the image: ${score.mathFidelityIssues.join('; ')}. Compare with the original upload.`
    : ''
  const names = (score.lowConfidenceFields ?? []).map((f) => {
    if (f === 'stem') return 'question text'
    if (f === 'options') return 'options A–D'
    if (f === 'answer') return 'correct answer'
    if (f === 'solution') return 'solution'
    return f
  })
  const fieldHint = names.length
    ? `Check carefully: ${names.join(', ')}.`
    : 'Review before save — overall confidence is low.'
  return [math, fieldHint].filter(Boolean).join(' ')
}

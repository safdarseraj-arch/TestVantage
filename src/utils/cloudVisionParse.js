/**
 * Pure parsers for cloud-vision JSON (no live API — unit-test friendly).
 */

import { looksLikeVerbalGraphOptionDescription } from './graphOptionOcr.js'
import {
  curveDerivativeStemLooksMangled,
  normalizeDerivativePrimeChars,
  repairDerivativePrimeStemOcr,
} from './repairDerivativePrimeStemOcr.js'
import { mcqLaterOptionsLookTruncated } from './mcqOptionCompleteness.js'
import { hasMeaningfulOptionAnswerTail } from './optionStemLeak.js'
import { repairBarePiConstant } from './prepareMathForRender.js'
import { repairCasesLatex } from './repairCasesLatex.js'
import { countRealMcqOptions, looksLikeUnusableOcrSoup } from './stemDiagramDetect.js'
import { jsonParseWithLatexSalvage } from './repairJsonLatexEscapes.js'
import { looksLikeLeakedOptionBand } from './splitStemAndGarbledOptions.js'
import {
  instructionLikeOptions,
  looksLikePyqSectionInstructionStem,
} from './bulkExtractClean.js'

/**
 * @param {unknown} raw
 * @returns {object | null}
 */
export function parseVisionJsonLoose(raw) {
  if (raw && typeof raw !== 'string' && typeof raw === 'object') return /** @type {object} */ (raw)
  const text = String(raw ?? '').trim()
  if (!text) return null
  const direct = jsonParseWithLatexSalvage(text)
  if (direct && typeof direct === 'object') return /** @type {object} */ (direct)
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    const inner = jsonParseWithLatexSalvage(fenced[1].trim())
    if (inner && typeof inner === 'object') return /** @type {object} */ (inner)
  }
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        const sliced = jsonParseWithLatexSalvage(text.slice(start, i + 1))
        if (sliced && typeof sliced === 'object') return /** @type {object} */ (sliced)
        break
      }
    }
  }
  const end = text.lastIndexOf('}')
  if (end > start) {
    const tail = jsonParseWithLatexSalvage(text.slice(start, end + 1))
    if (tail && typeof tail === 'object') return /** @type {object} */ (tail)
    return null
  }
  return null
}

/**
 * Normalize regionTypes from Gemini/OpenAI (stemText, optionText, optionGraph, …).
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeVisionRegionTypes(raw) {
  if (!Array.isArray(raw)) return []
  const allowed = new Set([
    'stemText',
    'stemFigure',
    'optionText',
    'optionGraph',
    'answerKey',
    'solution',
  ])
  return [
    ...new Set(raw.map((r) => String(r ?? '').trim()).filter((r) => allowed.has(r))),
  ].slice(0, 8)
}

/**
 * Safe stem polish for cloud JSON — primes + π + cases/sgn light heal; never truncate “does not exist”.
 * @param {string} stem
 */
export function polishVisionStemSafe(stem) {
  let s = normalizeDerivativePrimeChars(String(stem ?? '').trim())
  if (!s) return s
  // Only rewrite when classic curve primes are clearly mangled — not every f' stem.
  if (curveDerivativeStemLooksMangled(s)) {
    s = repairDerivativePrimeStemOcr(s)
  }
  s = repairBarePiConstant(s)
  // Preserve Gemini cases: insert missing \\\\ / fix bare sgn — never strip row breaks.
  s = repairCasesLatex(s)
  return s
}

/**
 * Validate one normalized vision question before accepting into the bank path.
 * @param {ReturnType<typeof normalizeVisionQuestion>} q
 * @returns {{ ok: boolean, issues: string[], confidence: 'high' | 'medium' | 'low' }}
 */
export function validateVisionQuestion(q) {
  /** @type {string[]} */
  const issues = []
  if (!q || typeof q !== 'object') {
    return { ok: false, issues: ['missing-question'], confidence: 'low' }
  }
  const stem = String(q.text ?? '').trim()
  const options = Array.isArray(q.options) ? q.options.map((o) => String(o ?? '')) : ['', '', '', '']
  const regionTypes = Array.isArray(q.regionTypes) ? q.regionTypes : []
  const graphOpts =
    regionTypes.includes('optionGraph') ||
    options.every((o) => !String(o).trim()) ||
    options.every((o) => looksLikeVerbalGraphOptionDescription(o) || !String(o).trim())

  if (!stem) issues.push('empty-stem')
  if (/\(\s*[A-D]\s*\)\s*\S{3,}/.test(stem) && options.filter((o) => o.trim()).length >= 2) {
    issues.push('options-in-stem')
  }
  if (!graphOpts) {
    const filled = options.filter((o) => String(o).trim()).length
    if (filled < 2) issues.push('too-few-options')
    if (mcqLaterOptionsLookTruncated(options, `${stem}\n${options.join('\n')}`)) {
      const cdOk =
        hasMeaningfulOptionAnswerTail(options[2]) || hasMeaningfulOptionAnswerTail(options[3])
      if (!cdOk) issues.push('truncated-cd')
    }
    for (const o of options) {
      if (looksLikeVerbalGraphOptionDescription(o)) issues.push('graph-invent')
    }
  }

  const uniqueIssues = [...new Set(issues)]
  const hard = uniqueIssues.some((i) =>
    ['empty-stem', 'too-few-options', 'truncated-cd', 'missing-question'].includes(i),
  )
  const confidence = uniqueIssues.length === 0 ? 'high' : hard ? 'low' : 'medium'
  return { ok: !hard, issues: uniqueIssues, confidence }
}

/**
 * Validate a full extract payload (after normalizeVisionExtract).
 * @param {{ questions?: any[], text?: string }} extract
 */
export function validateVisionExtract(extract) {
  const questions = Array.isArray(extract?.questions) ? extract.questions : []
  if (!questions.length) {
    const text = String(extract?.text ?? '').trim()
    if (!text) {
      return { ok: false, issues: ['empty-extract'], confidence: 'low', questionResults: [] }
    }
    const weak = scoreLocalOcrWeakness(text)
    return {
      ok: weak < 70,
      issues: weak >= 70 ? ['weak-text'] : [],
      confidence: weak < 40 ? 'high' : weak < 70 ? 'medium' : 'low',
      questionResults: [],
    }
  }
  const questionResults = questions.map((q) => validateVisionQuestion(q))
  const hardFails = questionResults.filter((r) => !r.ok).length
  const allHigh = questionResults.every((r) => r.confidence === 'high')
  const issues = [...new Set(questionResults.flatMap((r) => r.issues))]
  return {
    ok: hardFails === 0,
    issues,
    confidence: hardFails > 0 ? 'low' : allHigh ? 'high' : 'medium',
    questionResults,
  }
}

/**
 * Normalize one vision question object.
 * @param {any} q
 * @param {number} [fallbackNum]
 */
export function normalizeVisionQuestion(q, fallbackNum = 1) {
  if (!q || typeof q !== 'object') return null
  const regionTypes = normalizeVisionRegionTypes(q.regionTypes ?? q.region_types)
  const options = Array.isArray(q.options)
    ? q.options.map((o) => String(o ?? '').trim()).filter((_, i) => i < 6)
    : []
  while (options.length < 4) options.push('')
  const graphMode =
    regionTypes.includes('optionGraph') && !regionTypes.includes('optionText')
  // Strip invented "[Graph A: …]" — never strip real text answers (incl. “does not exist”).
  for (let i = 0; i < options.length; i++) {
    if (hasMeaningfulOptionAnswerTail(options[i])) continue
    if (looksLikeVerbalGraphOptionDescription(options[i])) options[i] = ''
  }
  if (
    !graphMode &&
    options.some((o) => o.trim()) &&
    options.every((o) => !o.trim() || looksLikeVerbalGraphOptionDescription(o))
  ) {
    for (let i = 0; i < options.length; i++) options[i] = ''
  }
  const number = Number(q.number ?? q.qNumber ?? fallbackNum)
  const answerKeyVisible =
    q.answerKeyVisible === true ||
    q.answer_key_visible === true ||
    regionTypes.includes('answerKey')
  const correctIndex =
    q.correctIndex != null && Number.isFinite(Number(q.correctIndex))
      ? Number(q.correctIndex)
      : undefined
  // Drop guessed answers when model says no printed key — stops wrong “Answer: A”.
  let safeCorrectIndex =
    q.answerKeyVisible === false
      ? undefined
      : correctIndex != null && Number.isFinite(correctIndex) && correctIndex >= 0 && correctIndex <= 3
        ? options[correctIndex]?.trim()
          ? correctIndex
          : correctIndex === 0
            ? undefined
            : correctIndex
        : undefined
  // Without an explicit answer key, never keep a lone guessed A (index 0).
  if (!answerKeyVisible && safeCorrectIndex === 0 && !q.solution) {
    safeCorrectIndex = undefined
  }
  const finalCorrect =
    safeCorrectIndex === 0 && options.every((o) => !String(o ?? '').trim())
      ? undefined
      : safeCorrectIndex
  return {
    number: Number.isFinite(number) ? number : fallbackNum,
    text: polishVisionStemSafe(String(q.text ?? q.stem ?? '').trim()),
    options: options.slice(0, 4),
    correctIndex: finalCorrect,
    answerKeyVisible: answerKeyVisible || undefined,
    regionTypes: regionTypes.length ? regionTypes : undefined,
    correctIndices: Array.isArray(q.correctIndices)
      ? q.correctIndices
          .map(Number)
          .filter((n) => Number.isFinite(n) && n >= 0 && n <= 3 && options[n]?.trim())
      : undefined,
    correctInteger:
      q.correctInteger != null && Number.isFinite(Number(q.correctInteger))
        ? Number(q.correctInteger)
        : undefined,
    correctNumerical:
      q.correctNumerical != null && Number.isFinite(Number(q.correctNumerical))
        ? Number(q.correctNumerical)
        : undefined,
    solution: q.solution ? String(q.solution).trim() : undefined,
    subject: q.subject ? String(q.subject).trim().toLowerCase() : undefined,
    section: q.section ? String(q.section).trim() : undefined,
    chapter: q.chapter ? String(q.chapter).trim() : undefined,
    topic: q.topic ? String(q.topic).trim() : undefined,
    examIds: Array.isArray(q.examIds)
      ? q.examIds.map((e) => String(e).trim()).filter(Boolean).slice(0, 4)
      : undefined,
    toughnessLevel:
      q.toughnessLevel != null && Number.isFinite(Number(q.toughnessLevel))
        ? Math.max(1, Math.min(10, Number(q.toughnessLevel)))
        : undefined,
  }
}

/**
 * Turn vision extract payload into bulk-parseable text + structured questions.
 * @param {unknown} payload
 */
export function normalizeVisionExtract(payload) {
  const obj = parseVisionJsonLoose(payload) ?? {}
  const list = Array.isArray(obj.questions)
    ? obj.questions
        .map((q, i) => normalizeVisionQuestion(q, i + 1))
        .filter((q) => {
          if (!q || !(q.text || q.options.some(Boolean))) return false
          if (looksLikePyqSectionInstructionStem(q.text)) return false
          if (instructionLikeOptions(q.options)) return false
          return true
        })
    : []

  let text = String(obj.text ?? '').trim()
  if (!text && list.length) {
    text = formatVisionQuestionsAsBulkText(list)
  } else if (list.length >= 2 && !/\bQ\.?\s*2\b|^\s*2[\.\)]/m.test(text)) {
    const structured = formatVisionQuestionsAsBulkText(list)
    if (structured.length > text.length * 0.6) text = structured
  }

  const validation = validateVisionExtract({ text, questions: list })

  return {
    text,
    questions: list,
    pageKind: String(obj.pageKind ?? 'unknown'),
    multi: list.length >= 2 || countQuestionMarkers(text) >= 2,
    validation,
    confidence: validation.confidence,
    valid: validation.ok,
  }
}

/**
 * Map a normalized vision question into the MCQ parse shape used by Question Bank fill.
 * @param {ReturnType<typeof normalizeVisionQuestion>} q
 */
export function visionQuestionToMcqParse(q) {
  if (!q || typeof q !== 'object') return null
  const options = Array.isArray(q.options)
    ? q.options.map((o) => String(o ?? '').trim()).slice(0, 4)
    : ['', '', '', '']
  while (options.length < 4) options.push('')
  const text = String(q.text ?? '').trim()
  const optionsFound = countRealMcqOptions(text, options)
  if (!text && optionsFound < 2) return null
  return {
    multi: false,
    text,
    options,
    optionsFound,
    complete: optionsFound >= 4,
    correctIndex: q.correctIndex,
    correctIndices: q.correctIndices,
    correctInteger: q.correctInteger,
    correctNumerical: q.correctNumerical,
    solution: q.solution,
    subject: q.subject,
    section: q.section,
    chapter: q.chapter,
    topic: q.topic,
    examIds: q.examIds,
    toughnessLevel: q.toughnessLevel,
    regionTypes: Array.isArray(q.regionTypes) ? q.regionTypes : undefined,
  }
}

/**
 * True when Gemini/OpenAI already gave a usable stem (+ options or graph/figure layout).
 * Callers should skip heavy local heal/reparse that can wipe A–D / cases / chem formulas.
 * @param {ReturnType<typeof visionQuestionToMcqParse> | null | undefined} seed
 * @param {string} [engine]
 */
export function shouldPreserveVisionStructuredFill(seed, engine = 'cloud-vision') {
  if (engine !== 'cloud-vision' || !seed) return false
  const stem = String(seed.text ?? '').trim()
  if (stem.length < 12) return false
  const found = countRealMcqOptions(stem, seed.options ?? [])
  const placeholderOpts = (seed.options ?? []).filter((o) =>
    /^Option\s+[A-D]$/i.test(String(o ?? '').trim()),
  ).length
  // Gemini often emits "Option A" stubs instead of the real math — never lock those in.
  if (placeholderOpts >= 2) return false
  if (looksLikeLeakedOptionBand(stem)) return false
  if (looksLikeUnusableOcrSoup(stem, seed.options ?? [])) return false
  if (found >= 2) return true
  const regions = Array.isArray(seed.regionTypes) ? seed.regionTypes : []
  // Graph / figure questions: empty A–D text is intentional — preserve stem, don't invent options.
  if (found === 0 && (regions.includes('optionGraph') || regions.includes('stemFigure'))) {
    return true
  }
  // Calculus MCQ with blank options: Convert must still run option recovery.
  if (found < 2 && /\\int|\bdx\b/.test(stem)) return false
  if (
    found === 0 &&
    /\\begin\{|\\frac|\\ce\{|\\vec\{|\\rightarrow|\\alpha|\\beta|\\mu_0|\\epsilon_0/i.test(stem)
  ) {
    return true
  }
  return false
}

/**
 * Prefer prior structured vision options over a heal that shrinks or invents duplicates.
 * @param {string[]} prevOptions
 * @param {string[]} nextOptions
 * @param {{ preserve?: boolean }} [opts]
 */
export function mergeVisionOptionsPreferPreserve(prevOptions = [], nextOptions = [], opts = {}) {
  const prev = (prevOptions ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  while (prev.length < 4) prev.push('')
  const next = (nextOptions ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  while (next.length < 4) next.push('')
  const prevFilled = prev.filter(Boolean).length
  const nextFilled = next.filter(Boolean).length
  if (opts.preserve && prevFilled >= 2 && nextFilled < prevFilled) return prev
  if (opts.preserve && prevFilled >= 4 && nextFilled >= 4) {
    // Keep prior when next looks like invented graph captions
    if (
      next.some((o) => /\[Graph\s*[A-D]/i.test(o)) &&
      !prev.some((o) => /\[Graph\s*[A-D]/i.test(o))
    ) {
      return prev
    }
  }
  if (nextFilled === 0 && prevFilled > 0) return prev
  if (nextFilled < prevFilled && prevFilled >= 2) return prev
  return next
}

/**
 * @param {ReturnType<typeof normalizeVisionQuestion>[]} questions
 */
export function formatVisionQuestionsAsBulkText(questions) {
  return (questions ?? [])
    .map((q, i) => {
      const n = q?.number ?? i + 1
      const lines = [`Q${n}. ${q.text || ''}`.trim()]
      ;(q.options ?? []).forEach((opt, oi) => {
        if (!String(opt ?? '').trim()) return
        lines.push(`(${String.fromCharCode(65 + oi)}) ${opt}`)
      })
      if (q.correctIndices?.length) {
        lines.push(`Answer: ${q.correctIndices.map((i) => String.fromCharCode(65 + i)).join(', ')}`)
      } else if (q.correctIndex != null) {
        lines.push(`Answer: ${String.fromCharCode(65 + q.correctIndex)}`)
      } else if (q.correctInteger != null) {
        lines.push(`Ans: ${q.correctInteger}`)
      } else if (q.correctNumerical != null) {
        lines.push(`Ans: ${q.correctNumerical}`)
      }
      if (q.solution) lines.push(`Solution: ${q.solution}`)
      return lines.join('\n')
    })
    .join('\n\n')
}

/** @param {string} text */
export function countQuestionMarkers(text) {
  const t = String(text ?? '')
  const qNums = t.match(/(?:^|\n)\s*(?:Q(?:uestion)?\s*\.?\s*)?\d{1,2}[\.\)\:]/gim) ?? []
  return qNums.length
}

/**
 * Normalize solve JSON from cloud.
 * @param {unknown} payload
 */
export function normalizeVisionSolve(payload) {
  const obj = parseVisionJsonLoose(payload) ?? {}
  const steps = Array.isArray(obj.steps)
    ? obj.steps.map((s) => String(s ?? '').trim()).filter(Boolean)
    : []
  let solution = String(obj.solution ?? '').trim()
  if (!solution && steps.length) {
    solution = steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
  }
  if (obj.whyCorrect) {
    const why = String(obj.whyCorrect).trim()
    if (why && !solution.includes(why)) {
      solution = `${solution}\n\n**Why correct:** ${why}`.trim()
    }
  }
  if (Array.isArray(obj.whyOthersWrong) && obj.whyOthersWrong.length) {
    const lines = obj.whyOthersWrong
      .slice(0, 3)
      .map((w) => {
        const opt = String(w?.option ?? '').trim()
        let reason = String(w?.reason ?? '').trim()
        if (reason.length > 90) reason = `${reason.slice(0, 87)}…`
        if (!opt && !reason) return ''
        return `- (${opt || '?'}) ${reason}`
      })
      .filter(Boolean)
    if (lines.length) {
      solution = `${solution}\n\n**Quick eliminations:**\n${lines.join('\n')}`.trim()
    }
  }
  return {
    solution,
    steps,
    correctIndex:
      obj.correctIndex != null && Number.isFinite(Number(obj.correctIndex))
        ? Number(obj.correctIndex)
        : undefined,
    correctIndices: Array.isArray(obj.correctIndices)
      ? obj.correctIndices.map(Number).filter((n) => Number.isFinite(n))
      : undefined,
    correctInteger:
      obj.correctInteger != null && Number.isFinite(Number(obj.correctInteger))
        ? Number(obj.correctInteger)
        : undefined,
    correctNumerical:
      obj.correctNumerical != null && Number.isFinite(Number(obj.correctNumerical))
        ? Number(obj.correctNumerical)
        : undefined,
    whyCorrect: obj.whyCorrect ? String(obj.whyCorrect).trim() : undefined,
    whyOthersWrong: Array.isArray(obj.whyOthersWrong) ? obj.whyOthersWrong : undefined,
  }
}

/** Count (A)–(D) markers that have almost no option text after them. */
function countEmptyOptionSlots(text) {
  const t = String(text ?? '')
  const marks = [...t.matchAll(/\(\s*([A-D])\s*\)\s*([^\n(]*)/gi)]
  if (!marks.length) return 0
  let empty = 0
  for (const m of marks) {
    const body = String(m[2] ?? '')
      .replace(/^\s*[-–—:.]+\s*/, '')
      .trim()
    // Single-digit options like "3" are valid — only count truly empty slots
    if (body.length < 1) empty += 1
  }
  return empty
}

/**
 * Heuristic: OCR blob looks like determinant / matrix / inverse-power JEE math.
 * @param {string} text
 */
export function looksLikeMathHeavyOcr(text) {
  const t = String(text ?? '')
  if (!t.trim()) return false
  if (
    /\\begin\{(?:v|b|p)matrix\}|\\det\b|determinant|vmatrix|bmatrix/i.test(t) ||
    /\|\s*[a-z0-9+\-^_{}\\]+\s+[a-z0-9+\-^_{}\\]+\s*\|/i.test(t) ||
    /x\s*[⁻\^]\s*\{?-?1\}?|y\s*[⁻\^]\s*\{?-?1\}?|z\s*[⁻\^]\s*\{?-?1\}?/i.test(t) ||
    /x\s*!=\s*0|x\s*≠\s*0|x\s*\\neq\s*0/i.test(t)
  ) {
    return true
  }
  if ((t.match(/\|/g) ?? []).length >= 4 && /[=0]|matrix|det/i.test(t)) return true
  // Piecewise / sgn / exponential stems — Local OCR routinely mangles these
  if (
    /differentiab/i.test(t) &&
    (/sgn|asgn|\\begin\{cases\}|piecewise|e\^\{2\(x-1\)\}|2\s*2\s*\(\s*x\s*-\s*1\s*\)/i.test(t) ||
      /cos\s*\(\s*2\s*x\s*-\s*2\s*\)/i.test(t))
  ) {
    return true
  }
  if (/asgn\s*\(|Usxst|f\^0\s*<\s*x\s*<\s*l/i.test(t)) return true
  return false
}

/**
 * Ultra-garbled OCR that must not be auto-saved as a bank question.
 * @param {string} text
 */
export function isUltraLowConfidenceOcr(text) {
  return scoreLocalOcrWeakness(text) >= 70
}

/**
 * Score whether local OCR text looks weak enough to prefer cloud vision.
 * Higher = worse / more need for cloud.
 * @param {string} text
 */
export function scoreLocalOcrWeakness(text) {
  const t = String(text ?? '').trim()
  if (!t) return 100
  let score = 0
  if (t.length < 40) score += 40
  else if (t.length < 80) score += 12

  const optMarks = (t.match(/\(\s*[A-D]\s*\)/gi) ?? []).length
  const emptyOpts = countEmptyOptionSlots(t)
  if (optMarks < 2) score += 25
  else if (optMarks < 4) score += 10
  if (emptyOpts >= 2) score += 20 + emptyOpts * 8
  if (emptyOpts >= 3 && optMarks >= 3) score += 15

  const garbageHits = (t.match(/~~|\|{2,}|\?{3,}|¢|¹\+/g) ?? []).length
  if (garbageHits >= 1) score += 20
  if (garbageHits >= 3) score += 15
  if (/[il|]{4,}/i.test(t)) score += 10
  if (countQuestionMarkers(t) >= 2 && optMarks < 6) score += 15

  if (garbageHits >= 1 || emptyOpts >= 2 || /Van\s*g/i.test(t)) {
    const tokens = t.split(/[\s,;:]+/).filter((w) => w.length >= 2)
    const weird = tokens.filter((w) => /^(?:van|het|they|qual|g¹\+|i\+2)$/i.test(w)).length
    if (weird >= 2) score += 25
  }

  if (
    /equal\s+to|then|matrix|determin/i.test(t) &&
    !/\$|\\frac|\\begin|\\neq|⁻¹|\^{-1}/.test(t) &&
    /[=~|]{2,}|~~|¢|¹\+|Van\s*g/i.test(t)
  ) {
    score += 30
  }

  if (looksLikeMathHeavyOcr(t) || /asgn\s*\(|Usxst|f\^0\s*<\s*x\s*<\s*l/i.test(t)) {
    if (emptyOpts >= 2 || garbageHits >= 1 || /asgn\s*\(|Usxst/i.test(t)) {
      score += 20
    }
  }

  // Piecewise / differentiability OCR soup (common JEE scan failure)
  if (
    /differentiab/i.test(t) &&
    (/asgn\s*\(|Usxst|bx\?|f\^0\s*<\s*x\s*<\s*l|2\s+2\s*\(\s*x\s*-\s*1\s*\)/i.test(t) ||
      (!/\\begin\{cases\}/.test(t) && /sgn\s*\(\s*x\s*\+\s*1\s*\)/i.test(t) && /cos\s*\(\s*2/i.test(t)))
  ) {
    score += 35
  }

  // Healthy filled MCQ — keep score low
  if (optMarks >= 4 && emptyOpts === 0 && garbageHits === 0 && t.length >= 35) {
    score = Math.min(score, 25)
  }

  return Math.min(100, score)
}

/**
 * Heuristic: local text likely needs cloud for dense multi-Q pages / garbage math.
 * @param {string} text
 */
export function localOcrNeedsCloudAssist(text) {
  return scoreLocalOcrWeakness(text) >= 40
}

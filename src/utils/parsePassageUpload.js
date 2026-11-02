import {
  sanitizePassageBundle,
  stripOcrStemTailJunk,
  trimPassageBodyText,
} from './passage.js'
import {
  isTowerPassageSetupStem,
  repairTowerPassageOcr,
  stripDiagramNoiseAfterGravity,
} from './repairTowerPassageOcr.js'
import { persistPassageBundleFields } from './persistUpload.js'
import { parseQuestionText } from './parseQuestionText.js'
import { looksLikeMatchColumnUpload } from './parseMatchColumnUpload.js'
import { looksLikeSingleIntegralCalculusQuestion } from './repairIntegralStemOcr.js'
import { looksLikeDeterminantQuestion } from './repairDeterminantOcr.js'
import { looksLikeDeterminantMcq } from './repairDeterminantMcqOcr.js'
import { looksLikeZ5ImaginaryRootsExpDeterminantMcq } from './repairZ5ImaginaryRootsExpDeterminantMcqOcr.js'
import { looksLikeCompositionIdentityMcq } from './repairCompositionMcqOcr.js'
import { looksLikeTrigPeriodMcq } from './repairTrigPeriodMcqOcr.js'
import { looksLikeAngleBisectorMag36Mcq } from './repairAngleBisectorMag36McqOcr.js'
import {
  isMcqOptionBlockStart,
  normalizeOptionMarkersInText,
} from './mcqOptionMarkers.js'
import { stripNextQuestionFromOptions } from './optionStemLeak.js'
import { enrichPassageSubQuestion } from './answerProvenance.js'

/**
 * @typedef {Object} PassageSubQuestion
 * @property {string} text
 * @property {string[]} options
 * @property {number} [correctIndex]
 * @property {number[]} [correctIndices]
 * @property {number|string} [correctInteger]
 * @property {number|string} [correctNumerical]
 * @property {number} [numericalTolerance]
 * @property {'integer' | 'numerical'} [answerMode]
 * @property {string} [label] e.g. "Q1"
 */

/**
 * @typedef {Object} ParsedPassageUpload
 * @property {string} passageText
 * @property {PassageSubQuestion[]} subQuestions
 */

/** Case-sensitive — avoids false splits on "the value of …" in passage prose. */
const QUESTION_STEM_SPLIT =
  /\b(?:Value\s+of|Find\s+the|Which\s+of\s+the\s+following|Calculate|Compute|Determine)\b/

const QUESTION_STEM_CUE_LOOSE =
  /\b(?:Value\s+of|Find\s+the|Which\s+of\s+the\s+following|Calculate|Compute|Determine|The\s+value\s+of|(?:ratio|sum)\s+(?:of\s+)?(?:S_p|N_p|S\s*_p|N\s*_p))\b/i

/** Indices where a full A–D MCQ option block starts */
function findCompleteMcqOptionStarts(text) {
  const starts = []
  const seen = new Set()

  const tryPush = (index) => {
    if (index < 0 || seen.has(index)) return
    if (!isMcqOptionBlockStart(text, index)) return
    seen.add(index)
    starts.push(index)
  }

  const patterns = [
    /\(\s*A\s*\)/gi,
    /(?:^|\n)\s*A[\)\.\:]\s+/gim,
  ]

  for (const re of patterns) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text)) !== null) {
      tryPush(m.index)
    }
  }

  return starts.sort((a, b) => a - b)
}

/**
 * JEE passage OCR: "Value of $\\sum…$ is - 10000 9801 5050 2401" with no (A)–(D) labels (2×2 grid).
 * @param {string} chunk
 * @returns {{ stem: string, options: string[] } | null}
 */
export function splitStemAndInlineMcqOptions(chunk) {
  const normalized = String(chunk ?? '').replace(/\r\n/g, '\n').trim()
  if (!normalized || /\(\s*A\s*\)/i.test(normalized)) return null

  const isCue = normalized.match(/^([\s\S]+?\bis)\s*[-–—:]\s*([\s\S]+)$/i)
  if (!isCue) return null

  let stem = String(isCue[1] ?? '').trim()
  let tail = String(isCue[2] ?? '').trim()
  if (!stem || !tail) return null

  const nextVal = tail.search(/\b(?:\d{1,2}[\.\)]\s+)?Value\s+of\b/i)
  if (nextVal > 4) tail = tail.slice(0, nextVal).trim()

  const tokenRe =
    /(\$[^$]+\$|\\frac\{[^}]+\}\{[^}]+\}|\d+\s*\/\s*\d+|\d+(?:\.\d+)?)/g
  const tokens = []
  let m
  while ((m = tokenRe.exec(tail)) !== null) {
    const tok = m[1].trim()
    if (tok) tokens.push(tok)
  }
  if (tokens.length < 2) return null

  const options = tokens.slice(0, 4).map((o) => {
    const frac = o.match(/^(\d+)\s*\/\s*(\d+)$/)
    if (frac) return `$\\frac{${frac[1]}}{${frac[2]}}$`
    return o
  })
  while (options.length < 4) options.push('')
  return { stem, options }
}

/** Turn inline numeric tails into (A)–(D) lines so option-block parsing can run. */
function injectInlineMcqOptionMarkers(text) {
  let t = String(text ?? '')
  const re =
    /\b(Value\s+of[\s\S]{6,320}?\bis)\s*[-–—:]\s*(?!\(\s*A\b)([\s\S]*?)(?=\s*(?:\d{1,2}[\.\)]\s+)?Value\s+of\b|$)/gi
  t = t.replace(re, (full, stemPart, tail) => {
    const split = splitStemAndInlineMcqOptions(`${stemPart} - ${tail}`)
    if (!split || split.options.filter((o) => String(o).trim()).length < 2) return full
    const labels = ['A', 'B', 'C', 'D']
    const block = labels
      .map((l, i) => `(${l}) ${split.options[i] ?? ''}`.trim())
      .join('\n')
    return `${split.stem} -\n${block}\n`
  })
  return t
}

/** Insert newlines before inline (A) / numbered sub-questions (common in Mathpix one-line OCR). */
export function preprocessPassageOcrText(text) {
  let t = repairTowerPassageOcr(String(text ?? '').replace(/\r\n/g, '\n').trim())
  if (!t) return t
  t = t.replace(/∑/g, '\\sum ')
  t = t.replace(/\s+\(\s*([A-D])\s*\)/gi, '\n($1)')
  t = t.replace(/(?:^|\s)([A-D])\)\s+/gim, '\n$1) ')
  t = t.replace(/\s+(\d{1,2})[\.\)]\s+(?=(?:Value|Find|ratio|sum|The\s|Partial|In\s+final))/g, '\n$1. ')
  t = t.replace(/\b(\d{3,5})\s+(?=Value\s+of\b)/gi, '$1\n')
  t = t.replace(/(\d+\s*\/\s*\d+)\s+(?=Value\s+of\b)/gi, '$1\n')
  t = t.replace(
    /\b(answer\s+the\s+following\s+questions?\s*:?\s*)\s*/gi,
    '\n$1\n',
  )
  t = t.replace(/\s+(Partial\s+pressure)/gi, '\n$1')
  t = t.replace(/\s+(In\s+final\s+conditions)/gi, '\n$1')
  // JEE integer passage: "Answer the following questions. If Distance… If wind…"
  t = t.replace(/([.?)])\s+(If\s+(?:Distance|wind|the\s+mass|both\s+))/gi, '$1\n$2')
  // JEE integer passage: "…questions Let r, s, t… Let P(x)…"
  t = t.replace(/([.?)])\s+(Let\s+)/gi, '$1\n$2')
  t = t.replace(/([.?)])\s+(What\s+is\s+the\b)/gi, '$1\n$2')
  t = t.replace(
    /(answer\s+the\s+following\s+questions?\s*:?\s*)\s*(\d{1,2}[\.\)])/gi,
    '$1\n$2 ',
  )
  t = t.replace(
    /\s+(\d{1,2})[\.\)]\s+(?=(?:If\s|The\s|What\s|Find\s|Calculate|Determine|Compute|How\s|Which\s|Value\s|Matrix\s|Let\s))/gi,
    '\n$1. ',
  )
  // Two independent problems on one page: "…sum) Consider the quadratic expression…"
  t = t.replace(/([.?)])\s+(Consider\s+the\s+(?:quadratic\s+)?(?:expression|following|circuit|data|graph|figure|passage|arrangement)\b)/gi, '$1\n$2')
  t = t.replace(/\bLet\s*\$/gi, 'Let $')
  t = t.replace(/\bLet\s*([A-Za-z])\s*\(/g, 'Let $1(')
  t = injectInlineMcqOptionMarkers(t)
  return normalizeOptionMarkersInText(t)
}

/** @param {string} chunk @returns {import('./parseQuestionText.js').ParseResult | null} */
function parsePassageSubChunk(chunk) {
  const inline = splitStemAndInlineMcqOptions(chunk)
  if (inline) {
    const opts = inline.options.map((o) => String(o ?? ''))
    const found = opts.filter((o) => o.trim()).length
    return {
      text: inline.stem,
      options: opts.length >= 4 ? opts.slice(0, 4) : [...opts, '', '', '', ''].slice(0, 4),
      parsed: found >= 2,
      optionsFound: found,
    }
  }
  const parsed = parseQuestionText(chunk)
  if (parsed.optionsFound >= 2 || !parsed.text?.trim()) return parsed
  const retry = splitStemAndInlineMcqOptions(chunk)
  if (!retry) return parsed
  const opts = retry.options.map((o) => String(o ?? ''))
  const found = opts.filter((o) => o.trim()).length
  return {
    text: retry.stem,
    options: opts.slice(0, 4),
    parsed: found >= 2,
    optionsFound: found,
  }
}

/** @param {number[]} indices @param {number} minGap */
function mergeCloseStemIndices(indices, minGap = 72) {
  const sorted = [...indices].sort((a, b) => a - b)
  const out = []
  for (const idx of sorted) {
    if (out.length && idx - out[out.length - 1] < minGap) continue
    out.push(idx)
  }
  return out
}

function integerPassageSearchStart(text) {
  const m = text.match(/\banswer\s+the\s+following\s+questions?\s*:?\s*/i)
  if (m && m.index != null) return m.index + m[0].length
  return 0
}

/** Second problem on same page: "Consider the quadratic expression …" */
const CONSIDER_PROBLEM_BOUNDARY_RE =
  /\bConsider\s+the\s+(?:quadratic\s+)?(?:expression|following|circuit|data|graph|figure|passage|arrangement)\b/gi

/** First numbered sub-problem: "Let F(a,b)=…" / "Let f(x)=…" (not "Let g(b) be minimum" clauses). */
function findFirstProblemStemIndex(text) {
  const letF = text.search(/\bLet\s*\$?F\s*\(\s*a\s*,/i)
  if (letF >= 0) return letF
  const letFn = text.search(/\bLet\s*\$?[A-Za-z]\s*\([^)]*\)\s*=/i)
  if (letFn >= 40) return letFn
  const evaluate = text.search(/\bthen\s+evaluate\s*:/i)
  if (evaluate >= 60) {
    const before = text.slice(0, evaluate)
    const letBack = before.search(/\bLet\s+/i)
    if (letBack >= 0) return letBack
  }
  return -1
}

/**
 * JEE sheet with shared intro + two separate problems (no "Answer the following").
 * Splits before "Consider the quadratic expression …".
 */
function parseByConsiderProblemSplit(text) {
  const boundaries = []
  CONSIDER_PROBLEM_BOUNDARY_RE.lastIndex = 0
  let m
  while ((m = CONSIDER_PROBLEM_BOUNDARY_RE.exec(text)) !== null) {
    boundaries.push(m.index)
  }
  if (boundaries.length !== 1) return null

  const splitAt = boundaries[0]
  const firstStart = findFirstProblemStemIndex(text)
  if (firstStart < 0 || firstStart >= splitAt) return null

  const passageText = trimPassageBodyText(text.slice(0, firstStart).trim())
  const q1 = text.slice(firstStart, splitAt).trim()
  const q2 = text.slice(splitAt).trim()
  if (passageText.length < 12 || q1.length < 16 || q2.length < 16) return null

  return sanitizePassageBundle({
    passageText,
    subQuestions: [
      enrichPassageSubQuestion({ label: 'Q1', text: q1, options: ['', '', '', ''] }, q1),
      enrichPassageSubQuestion({ label: 'Q2', text: q2, options: ['', '', '', ''] }, q2),
    ],
  })
}

/** @param {string} slice @param {RegExp} re */
function firstMatchIndex(slice, re) {
  const m = slice.match(re)
  if (!m || m.index == null) return -1
  return m.index
}

/**
 * Piecewise / cases "if" conditions must not count as integer-passage sub-stems
 * (e.g. `\text{if } x=1` or `, if 3/4 < x < 1` inside `\begin{cases}`).
 * @param {string} text
 * @param {number} index
 */
function isPiecewiseConditionIf(text, index) {
  const before = text.slice(Math.max(0, index - 48), index)
  if (/[,&]\s*$/.test(before)) return true
  if (/\\(?:text|mathrm|textrm|textit|mbox)\{\s*$/i.test(before)) return true
  const head = text.slice(0, index)
  const beginCases = Math.max(head.lastIndexOf('\\begin{cases}'), head.lastIndexOf('\\begin{array}'))
  const endCases = Math.max(head.lastIndexOf('\\end{cases}'), head.lastIndexOf('\\end{array}'))
  if (beginCases > endCases) return true
  // Garbled OCR after cases damage: "if } 3/4" / "if } x = 1"
  if (/^if\s*\}/i.test(text.slice(index, index + 8))) return true
  return false
}

/**
 * Integer passage stems after "Answer the following questions".
 * Supports "Let r, s, t… / Let P(x)…", "If Distance…", and "Partial pressure…" styles.
 */
function findIntegerPassageStemIndices(text) {
  if (looksLikeCompositionIdentityMcq(text)) return []

  if (looksLikeTrigPeriodMcq(text)) return []

  const from = integerPassageSearchStart(text)
  const indices = []

  const letRe = /\bLet\s+/gi
  let m
  while ((m = letRe.exec(text)) !== null) {
    if (m.index >= from) indices.push(m.index)
  }
  if (indices.length >= 2) {
    const considerAt = text.search(CONSIDER_PROBLEM_BOUNDARY_RE)
    if (considerAt >= 0) {
      const beforeConsider = indices.filter((idx) => idx < considerAt)
      const afterConsider = indices.filter((idx) => idx >= considerAt)
      if (beforeConsider.length <= 1 && afterConsider.length >= 2) {
        return mergeCloseStemIndices(afterConsider, 120)
      }
      if (beforeConsider.length >= 1 && afterConsider.length >= 1) {
        return mergeCloseStemIndices([...beforeConsider.slice(0, 1), afterConsider[0]], 28)
      }
    }
    const minGap = indices.every((idx) => /^Let\s/i.test(text.slice(idx, idx + 5))) ? 28 : 72
    return mergeCloseStemIndices(indices, minGap)
  }
  indices.length = 0

  const ifRe = /\bIf\s+/gi
  while ((m = ifRe.exec(text)) !== null) {
    if (m.index < from) continue
    if (isPiecewiseConditionIf(text, m.index)) continue
    indices.push(m.index)
  }
  if (indices.length >= 2) {
    // JEE "If Distance… / If wind…" stems can be <72 chars apart on one OCR line
    const minGap = indices.every((idx) => /^If\s/i.test(text.slice(idx, idx + 4))) ? 28 : 72
    return mergeCloseStemIndices(indices, minGap)
  }
  indices.length = 0

  const whatRe = /\bWhat\s+is\s+the\b/gi
  while ((m = whatRe.exec(text)) !== null) {
    if (m.index >= from) indices.push(m.index)
  }
  if (indices.length >= 2) {
    return mergeCloseStemIndices(indices, 28)
  }
  indices.length = 0

  const tail = text.slice(from)
  const q1 = firstMatchIndex(tail, /\bPartial\s+pressure\s+of\b/i)
  if (q1 >= 0) indices.push(from + q1)

  const afterQ1 = indices[0] != null ? indices[0] + 24 : from
  const q2 = firstMatchIndex(text.slice(afterQ1), /\bIn\s+final\s+conditions\b/i)
  if (q2 >= 0) indices.push(afterQ1 + q2)

  if (indices.length < 2) {
    const generic = [
      /\bWhat\s+is\s+the\b/i,
      /\bThe\s+(?:value|number)\s+of\b/i,
      /\bFind\s+the(?:\s+value)?\b/i,
      /\bthen\s+(?:the\s+)?value\b/i,
      /\bthen\s+find\b/i,
      /\bCalculate\b/i,
      /\bCompute\b/i,
      /\bDetermine\b/i,
    ]
    let cursor = indices[0] != null ? indices[0] + 30 : from
    for (const re of generic) {
      if (indices.length >= 2) break
      const hit = firstMatchIndex(text.slice(cursor), re)
      if (hit >= 0) {
        indices.push(cursor + hit)
        cursor += hit + 30
      }
    }
  }

  return mergeCloseStemIndices(indices)
}

function countIntegerPassageSubStems(text) {
  return findIntegerPassageStemIndices(text).length
}

/** Split passage + 2+ integer-style sub-questions (no MCQ options). */
function parseByIntegerPassageStems(text) {
  const indices = findIntegerPassageStemIndices(text)
  if (indices.length < 2) return null
  // One complete A–D block → single MCQ (do not split mid-cases / piecewise "if").
  if (findCompleteMcqOptionStarts(text).length === 1) return null

  const passageText = trimPassageBodyText(text.slice(0, indices[0]).trim())
  if (passageText.length < 12) return null

  const subQuestions = []
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i]
    const end = i + 1 < indices.length ? indices[i + 1] : text.length
    let chunk = stripOcrStemTailJunk(text.slice(start, end).trim())
    chunk = chunk.replace(/^(?:Q\.?\s*)?\d{1,2}[\.\)]\s+/, '').trim()
    if (!chunk || chunk.length < 12) continue
    subQuestions.push(
      enrichPassageSubQuestion(
        {
          label: `Q${subQuestions.length + 1}`,
          text: chunk,
          options: ['', '', '', ''],
        },
        chunk,
      ),
    )
  }
  if (subQuestions.length < 2) return null
  return sanitizePassageBundle({ passageText, subQuestions })
}

/** Split on repeated "Value of …" / similar stems (common in JEE passages) */
function parseByQuestionStems(text) {
  const indices = []
  const re = new RegExp(QUESTION_STEM_SPLIT.source, 'g')
  let m
  while ((m = re.exec(text)) !== null) {
    indices.push(m.index)
  }
  if (indices.length < 2) return null

  // One complete A–D block → single MCQ (e.g. "Find… Determine which option… (A)–(D)").
  const optionStarts = findCompleteMcqOptionStarts(text)
  if (optionStarts.length === 1) return null

  const subQuestions = []
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i]
    const end = i + 1 < indices.length ? indices[i + 1] : text.length
    let chunk = stripOcrStemTailJunk(text.slice(start, end).trim())
    chunk = chunk.replace(/^\d{1,2}[\.\)]\s+/, '').trim()
    const parsed = parsePassageSubChunk(chunk)
    const opts = [...(parsed.options ?? [])]
    while (opts.length < 4) opts.push('')
    if (parsed.optionsFound < 2 && !parsed.text?.trim()) continue

    const stemText =
      parsed.text?.trim() ||
      chunk.split(/\(\s*A\s*\)|(?:^|\n)\s*A[\)\.\:]\s+/i)[0]?.trim() ||
      chunk.slice(0, 280)
    const options = stripNextQuestionFromOptions(opts.slice(0, 4).map(cleanOptionTail))
    subQuestions.push(
      enrichPassageSubQuestion(
        {
          label: `Q${subQuestions.length + 1}`,
          text: stemText,
          options,
        },
        chunk,
      ),
    )
  }

  if (subQuestions.length < 2) return null

  const passageText = trimPassageBodyText(text.slice(0, indices[0]).trim())
  if (!passageText || passageText.length < 12) return null

  return sanitizePassageBundle({ passageText, subQuestions })
}

/**
 * Split a passage into sub-questions by numbered / labelled markers ("1.", "2)",
 * "Q1", "Q.2") even when the questions carry NO A–D options. Each sub-question is
 * returned with whatever options were found (often none → blank), so the author can
 * fill them in afterwards. Used only on explicit request (manual split / passage
 * fallback) to avoid falsely splitting ordinary single questions.
 * @param {string} text
 * @returns {ParsedPassageUpload | null}
 */
function findNumberedPassageMarkers(text) {
  const markers = []
  const from = integerPassageSearchStart(text)
  const re = /(?:^|\n)[ \t]*(?:Q\.?[ \t]*)?(\d{1,2})[.)][ \t]+(?=\S)/g
  let m
  while ((m = re.exec(text)) !== null) {
    const idx = m.index + (text[m.index] === '\n' ? 1 : 0)
    if (idx >= from) markers.push(idx)
  }
  const tail = text.slice(from)
  const inlineRe = /\s(\d{1,2})[.)]\s+(?=If\s|The\s|What\s|Find\s|Matrix\s|Let\s)/gi
  while ((m = inlineRe.exec(tail)) !== null) {
    markers.push(from + m.index + 1)
  }
  return [...new Set(markers)].sort((a, b) => a - b)
}

function parseByNumberedStems(text) {
  const markers = findNumberedPassageMarkers(text)
  if (markers.length < 2) return null

  let passageText = trimPassageBodyText(text.slice(0, markers[0]).trim())
  if (passageText.length < 12) return null

  const subQuestions = []
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i]
    const end = i + 1 < markers.length ? markers[i + 1] : text.length
    let chunk = stripOcrStemTailJunk(text.slice(start, end).trim())
    chunk = chunk.replace(/^(?:Q\.?\s*)?\d{1,2}[.)]\s+/, '').trim()
    if (!chunk) continue
    if (isTowerPassageSetupStem(chunk)) {
      passageText = trimPassageBodyText(
        `${passageText}\n${stripDiagramNoiseAfterGravity(chunk)}`,
      )
      continue
    }
    const parsed = parsePassageSubChunk(chunk)
    const opts = stripNextQuestionFromOptions([...(parsed.options ?? [])])
    while (opts.length < 4) opts.push('')
    const stemText = parsed.text?.trim() || chunk
    if (!stemText) continue
    subQuestions.push(
      enrichPassageSubQuestion(
        {
          label: `Q${subQuestions.length + 1}`,
          text: stemText,
          options: opts.slice(0, 4).map(cleanOptionTail),
        },
        chunk,
      ),
    )
  }
  if (subQuestions.length < 2) return null
  return sanitizePassageBundle({ passageText, subQuestions })
}

/** Stem / sub-question line immediately before an (A) block */
function findQuestionStemBeforeOptionA(text, optionAIndex, searchFrom = 0) {
  const slice = text.slice(searchFrom, optionAIndex)
  const base = searchFrom
  const candidates = []

  const stemRe = new RegExp(QUESTION_STEM_SPLIT.source, 'g')
  let m
  while ((m = stemRe.exec(slice)) !== null) candidates.push(base + m.index)

  const numRe = /\n\s*\d{1,2}[\.\)]\s+/g
  while ((m = numRe.exec(slice)) !== null) candidates.push(base + m.index + 1)

  /** OCR: "2401 10. Value of ratio" on one line after option D */
  const inlineNum = /(?:\s)(\d{1,2})[\.\)]\s+(?=[A-Za-z])/g
  while ((m = inlineNum.exec(slice)) !== null) candidates.push(base + m.index + 1)

  const qRe = /\n\s*Q\.?\s*\d{1,2}[\.\)\:\-\s]+/gi
  while ((m = qRe.exec(slice)) !== null) candidates.push(base + m.index + 1)

  const para = slice.lastIndexOf('\n\n')
  if (para >= 0 && slice.length - para < 220) candidates.push(base + para + 2)

  if (!candidates.length) return Math.max(0, searchFrom)
  return Math.max(...candidates)
}

/** First sub-question stem in passage (before the first (A) block) */
function findFirstQuestionStemStart(text, firstOptionAIndex) {
  const slice = text.slice(0, firstOptionAIndex)
  const stems = []
  const stemRe = new RegExp(QUESTION_STEM_SPLIT.source, 'g')
  let m
  while ((m = stemRe.exec(slice)) !== null) stems.push(m.index)
  if (stems.length) return stems[0]

  const numRe = /\n\s*\d{1,2}[\.\)]\s+/g
  const nums = []
  while ((m = numRe.exec(slice)) !== null) nums.push(m.index + 1)
  const inlineNum = /(?:\s)(\d{1,2})[\.\)]\s+(?=[A-Za-z])/g
  while ((m = inlineNum.exec(slice)) !== null) nums.push(m.index + 1)
  if (nums.length) return Math.min(...nums)

  const lastPara = slice.lastIndexOf('\n\n')
  if (lastPara > 40) return lastPara + 2
  return 0
}

/** OCR: $1{16}{3}$ → $\frac{16}{3}$ */
function repairBrokenFracOption(opt) {
  const s = String(opt ?? '').trim()
  const m = s.match(/^\$?1\{(\d+)\}\{(\d+)\}\$?$/)
  if (m) return `$\\frac{${m[1]}}{${m[2]}}$`
  return s
}

/** Trim OCR junk after option D (e.g. "2401 10.") */
function cleanOptionTail(opt) {
  return repairBrokenFracOption(
    String(opt ?? '')
      .trim()
      .replace(/\s+\d{1,2}[\.\)]\s+.*$/s, '')
      .replace(/\s+\d{1,2}\.?\s*$/g, '')
      .trim(),
  )
}

/**
 * Build sub-questions by pairing each complete (A)–(D) block with its stem.
 * @param {string} text
 * @param {number[]} optionStarts
 */
function parseByMcqOptionBlocks(text, optionStarts) {
  const segments = []
  for (let i = 0; i < optionStarts.length; i++) {
    const aIndex = optionStarts[i]
    const prevA = i > 0 ? optionStarts[i - 1] : 0
    const qStart =
      i === 0
        ? findFirstQuestionStemStart(text, aIndex)
        : findQuestionStemBeforeOptionA(text, aIndex, prevA)
    const qEnd =
      i + 1 < optionStarts.length
        ? findQuestionStemBeforeOptionA(text, optionStarts[i + 1], aIndex)
        : text.length

    if (qEnd <= qStart) continue

    let chunk = stripOcrStemTailJunk(text.slice(qStart, qEnd).trim())
    chunk = chunk
      .replace(/^\d{1,2}[\.\)]\s+/, '')
      .replace(/^Q\.?\s*\d{1,2}[\.\)\:\-\s]*/i, '')
      .trim()
    if (!chunk) continue

    const parsed = parsePassageSubChunk(chunk)
    const opts = stripNextQuestionFromOptions([...(parsed.options ?? [])])
    while (opts.length < 4) opts.push('')
    if (parsed.optionsFound < 2 && !parsed.text?.trim()) continue

    const stemText =
      parsed.text?.trim() ||
      chunk.split(/\(\s*A\s*\)/i)[0]?.trim() ||
      chunk.split(/(?:^|\n)\s*A[\)\.\:]\s+/i)[0]?.trim() ||
      chunk.slice(0, 280)
    segments.push(
      enrichPassageSubQuestion(
        {
          label: `Q${segments.length + 1}`,
          text: stemText,
          options: opts.slice(0, 4),
        },
        chunk,
      ),
    )
  }
  return segments
}

/**
 * @param {string} raw
 * @returns {boolean}
 */
export function looksLikePassageMultiMcq(raw) {
  const text = normalizeOptionMarkersInText(String(raw ?? '').replace(/\r\n/g, '\n').trim())
  if (text.length < 80) return false
  if (looksLikeMatchColumnUpload(text)) return false
  if (looksLikeSingleIntegralCalculusQuestion(text)) return false
  if (looksLikeZ5ImaginaryRootsExpDeterminantMcq(text)) return false
  if (looksLikeDeterminantQuestion(text) || looksLikeDeterminantMcq(text)) return false
  if (looksLikeCompositionIdentityMcq(text)) return false
  if (looksLikeTrigPeriodMcq(text)) return false
  if (looksLikeAngleBisectorMag36Mcq(text)) return false

  const blocks = findCompleteMcqOptionStarts(text)
  // One-line SCQ: "… variance … is:(A) $\\frac{12}{5}$(B) …" — not a passage
  if (/\bis\s*:\s*\(\s*A\s*\)/i.test(text) && blocks.length <= 2) return false

  const stemHits = (text.match(new RegExp(QUESTION_STEM_CUE_LOOSE.source, 'gi')) ?? []).length
  if (stemHits >= 2) {
    // Single SCQ: "find the value of … (A)…(D)" — both "find the" and "value of" match.
    if (blocks.length <= 1 && /\(\s*[A-D]\s*\)/i.test(text)) return false
    // Two stem cues + one A–D set (e.g. Find… Determine… (A)–(D)) is still one MCQ.
    if (blocks.length <= 1) return false
    return true
  }

  const integerSubs = countIntegerPassageSubStems(text)
  // "Answer the following questions" alone is not enough — need 2+ MCQ blocks or 2+ integer stems.
  if (
    /\b(?:answer\s+the\s+following\s+questions?|on\s+the\s+basis\s+of\s+(?:the\s+)?above)\b/i.test(
      text,
    )
  ) {
    if (blocks.length >= 2 || integerSubs >= 2) return true
    // One A–D set under a passage cue → ordinary single MCQ, not a multi-Q passage.
    return false
  }

  // 2+ "If/Let" hits with one A–D set is usually piecewise cases, not a multi-Q passage.
  if (integerSubs >= 2 && text.length >= 120) {
    if (blocks.length <= 1) return false
    return true
  }

  if (blocks.length < 2) return false

  // One SCQ with options at the end (e.g. "the value of … is:(A)…(D)") — not a passage
  if (blocks.length === 1) return false
  if (
    blocks.length === 2 &&
    blocks[1] - blocks[0] < 400 &&
    /\bis\s*:\s*\(\s*A\s*\)|\?\s*\(\s*A\s*\)/i.test(text.slice(blocks[0] - 40, blocks[0] + 20))
  ) {
    return false
  }

  const firstStart = findFirstQuestionStemStart(text, blocks[0])
  const passageLen = firstStart > 0 ? firstStart : blocks[0]
  const passageBit = text.slice(0, blocks[0])
  // Strong shared-passage signals only (avoid bare "following" / "row" from normal MCQ stems).
  return (
    passageLen >= 40 ||
    /\b(?:passage|comprehension|paragraph\s*:|paragraph\s+for|read\s+the\s+following|on\s+the\s+basis|arrangement|denotes|represents|N_p|S_p|N\s*_p|S\s*_p|pth\s+row)\b/i.test(
      passageBit,
    )
  )
}

/**
 * Split OCR / paste into one passage + multiple SCQ sub-questions.
 * @param {string} raw
 * @returns {ParsedPassageUpload | null}
 */
/**
 * Try several OCR variants until a passage + 2+ MCQs is found.
 * @param {string} raw
 * @param {string} [normalized]
 */
export function resolvePassageUpload(raw, normalized = '', { allowOptionless = false } = {}) {
  const base = String(raw ?? '').replace(/\r\n/g, '\n').trim()
  const norm = String(normalized ?? '').replace(/\r\n/g, '\n').trim()
  if (looksLikeMatchColumnUpload(base) || looksLikeMatchColumnUpload(norm)) return null
  const attempts = new Set(
    [
      base,
      norm,
      preprocessPassageOcrText(base),
      preprocessPassageOcrText(norm),
      normalizeOptionMarkersInText(base),
      normalizeOptionMarkersInText(norm),
    ].filter(Boolean),
  )
  for (const text of attempts) {
    const parsed = parsePassageWithSubQuestions(text, { allowOptionless })
    if (parsed?.subQuestions?.length >= 2) {
      return persistPassageBundleFields(parsed)
    }
  }
  // Integer-style passage stems (Let/If/What…) — retry with optionless numbered split.
  if (
    !allowOptionless &&
    (looksLikePassageMultiMcq(base) || looksLikePassageMultiMcq(norm))
  ) {
    for (const text of attempts) {
      const parsed = parsePassageWithSubQuestions(text, { allowOptionless: true })
      if (parsed?.subQuestions?.length >= 2) {
        return persistPassageBundleFields(parsed)
      }
    }
  }
  return null
}

/**
 * Pick the longest non-empty OCR / paste source for manual passage split.
 * @param {string[]} sources
 */
export function pickPassageSplitSource(...sources) {
  const candidates = sources
    .map((s) => String(s ?? '').replace(/\r\n/g, '\n').trim())
    .filter((s) => s.length > 40)
  if (!candidates.length) {
    return { raw: '', normalized: '' }
  }
  const raw = candidates.sort((a, b) => b.length - a.length)[0]
  return { raw, normalized: raw }
}

export function parsePassageWithSubQuestions(raw, { allowOptionless = false } = {}) {
  let text = preprocessPassageOcrText(raw)
  if (!text) return null

  const byConsider = parseByConsiderProblemSplit(text)
  if (byConsider?.subQuestions?.length >= 2) return byConsider

  const byStems = parseByQuestionStems(text)
  if (byStems?.subQuestions?.length >= 2) return byStems

  const byNumbered = allowOptionless ? parseByNumberedStems(text) : null
  if (byNumbered?.subQuestions?.length >= 2) return byNumbered

  const byInteger = parseByIntegerPassageStems(text)
  if (byInteger?.subQuestions?.length >= 2) return byInteger

  const optionStarts = findCompleteMcqOptionStarts(text)
  if (optionStarts.length < 2) {
    return allowOptionless ? parseByNumberedStems(text) : null
  }

  const segments = parseByMcqOptionBlocks(text, optionStarts)
  if (segments.length < 2) return null

  const firstQStart = findFirstQuestionStemStart(text, optionStarts[0])
  let passageText = text.slice(0, firstQStart > 0 ? firstQStart : optionStarts[0]).trim()
  if (passageText.length < 15) {
    passageText = text.slice(0, optionStarts[0]).trim()
  }
  const strippedPassage = passageText
    .replace(/^(?:Passage|Comprehension|Read the following)[\s:\-]*/i, '')
    .trim()
  if (strippedPassage.length >= 12) passageText = strippedPassage

  if (!passageText || passageText.length < 12) return null

  return sanitizePassageBundle({
    passageText: trimPassageBodyText(passageText),
    subQuestions: segments,
  })
}

/**
 * @param {string} raw
 */
export function tryParsePassageOrSingle(raw) {
  const passage = parsePassageWithSubQuestions(raw)
  if (passage?.subQuestions?.length >= 2) {
    return { mode: 'passage', passage }
  }
  return { mode: 'single', passage: null }
}

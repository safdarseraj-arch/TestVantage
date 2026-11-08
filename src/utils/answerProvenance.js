/**
 * Answer + solution provenance for paper uploads.
 * Detects printed answer keys ("from paper") vs local heuristic / pattern solve ("AI-generated").
 * No cloud LLM required — uses OCR text patterns + safe local solvers.
 * Deep step drafts live in deepSolutionGenerator.js (optional cloud upgrade).
 */

import { generateDeepSolutionLocal, stemTooGarbledForSolution } from './deepSolutionGenerator.js'
import {
  tanInverseKIntegralAnswer,
} from './repairTanInverseKIntegralOcr.js'
import { isUltraLowConfidenceOcr, scoreLocalOcrWeakness } from './cloudVisionParse.js'
import {
  looksLikeCurveDerivativeGraphMcq,
  repairDerivativePrimeStemOcr,
  trySolveIncreasingConcaveDownGraphMcq,
} from './repairDerivativePrimeStemOcr.js'

/** @typedef {'from_paper' | 'ai_generated' | 'manual' | 'draft' | 'unknown'} AnswerSource */

const ANSWER_LINE =
  /^(?:Ans(?:wer)?s?|Key|Correct(?:\s+option)?|Ans\.?)\s*[\:\-\=]?\s*(?:is\s+)?(?:option\s+)?([A-D1-4](?:\s*[,;&\/]\s*[A-D1-4])*)\b/i

const ANSWER_INLINE =
  /(?:^|[\n\s])(?:Ans(?:wer)?s?|Key|Correct(?:\s+option)?)\s*[\:\-\=]?\s*(?:is\s+)?(?:option\s+)?\(?([A-D])\)?(?:\s|$|[.,;])/i

const ANSWER_PAREN =
  /\(\s*(?:Ans(?:wer)?\.?|Sol\.?)\s*[:\-]?\s*([A-D1-4](?:\s*[,;]\s*[A-D1-4])*)\s*\)/i

const ANSWER_THEREFORE = /(?:∴|therefore|hence)\s*(?:the\s+)?(?:answer|option)?\s*(?:is\s+)?\(?([A-D])\)?/i

const SOLUTION_LINE = /^(?:Solution|Explanation|Sol\.?|Hint)\s*[\:\-]?\s*(.*)$/i

const INTEGER_ANS =
  /^(?:Ans(?:wer)?s?|Key)\s*[\:\-\=]?\s*(-?\d{1,4}(?:\.\d+)?)\s*$/i

/** A printed key at the end of a stem: "Answer: A", "Answer: 6", "Answer: [0.7 to 0.8]". */
const PRINTED_ANSWER_TAIL =
  /(?:^|\n|\s)((?:(?:Official\s+)?(?:Ans(?:wer)?s?\.?|Key)|Correct\s+(?:option|answer))\s*[:.\-=]\s*(?:is\s+)?(?!\s*the\b)([^\n]{1,80}))\s*$/i

/**
 * @param {string} key
 * @returns {{ correctIndex?: number, correctIndices?: number[], correctInteger?: number, correctNumerical?: number }}
 */
function lettersToAnswer(key) {
  const upper = String(key ?? '').toUpperCase()
  const letters = upper.match(/[A-D]/g) ?? []
  if (letters.length > 1) {
    return { correctIndices: [...new Set(letters.map((l) => l.charCodeAt(0) - 65))] }
  }
  if (letters.length === 1) {
    return { correctIndex: letters[0].charCodeAt(0) - 65 }
  }
  const digit = upper.match(/[1-4]/)
  if (digit) return { correctIndex: Number(digit[0]) - 1 }
  return {}
}

/**
 * Extract printed answer from a question block / OCR blob.
 * @param {string} block
 * @returns {{
 *   correctIndex?: number
 *   correctIndices?: number[]
 *   correctInteger?: number
 *   correctNumerical?: number
 *   answerSource: AnswerSource
 *   answerConfidence: number
 *   matchedLine?: string
 * }}
 */
export function detectAnswerFromPaper(block) {
  /** Mathpix prints some keys as headings: "\section*{Answer: [2.2 to 2.3]}" (2025 P1 Q9/Q41/Q42). */
  const text = String(block ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\\section\*?\{\s*((?:(?:Official\s+)?Ans(?:wer)?s?\.?|Key)\s*[:.\-=][^{}\n]*)\}/gi, '$1')
  if (!text.trim()) {
    return { answerSource: 'unknown', answerConfidence: 0 }
  }

  const lines = text.split('\n')
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    const intM = t.match(INTEGER_ANS)
    if (intM) {
      const n = Number(intM[1])
      if (Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= 9999) {
        return {
          correctInteger: n,
          answerSource: 'from_paper',
          answerConfidence: 92,
          matchedLine: t,
        }
      }
      if (Number.isFinite(n)) {
        return {
          correctNumerical: n,
          answerSource: 'from_paper',
          answerConfidence: 88,
          matchedLine: t,
        }
      }
    }
    const m = t.match(ANSWER_LINE)
    if (m) {
      return {
        ...lettersToAnswer(m[1]),
        answerSource: 'from_paper',
        answerConfidence: 94,
        matchedLine: t,
      }
    }
  }

  const paren = text.match(ANSWER_PAREN)
  if (paren) {
    return {
      ...lettersToAnswer(paren[1]),
      answerSource: 'from_paper',
      answerConfidence: 90,
      matchedLine: paren[0],
    }
  }

  const inline = text.match(ANSWER_INLINE)
  if (inline) {
    return {
      ...lettersToAnswer(inline[1]),
      answerSource: 'from_paper',
      answerConfidence: 86,
      matchedLine: inline[0].trim(),
    }
  }

  const there = text.match(ANSWER_THEREFORE)
  if (there) {
    return {
      ...lettersToAnswer(there[1]),
      answerSource: 'from_paper',
      answerConfidence: 78,
      matchedLine: there[0].trim(),
    }
  }

  const tail = printedAnswerTail(text)
  if (tail) return tail

  return { answerSource: 'unknown', answerConfidence: 0 }
}

/**
 * Read a printed key that sits at the end of the question, including a range.
 * A band such as [0.7 to 0.8] becomes 0.75 ± 0.05, so exactly the printed band is marked correct.
 * @param {string} text
 */
function printedAnswerTail(text) {
  const m = String(text ?? '').match(PRINTED_ANSWER_TAIL)
  if (!m) return null
  let value = String(m[2] ?? '').trim()
  if (!value.includes('{')) value = value.replace(/\}+$/, '').trim()
  value = value.replace(/\.$/, '')
  if (!value || /^(?:a|an|the)\b/i.test(value)) return null
  const letter = value.match(/^\(?([A-D])\)?$/i)
  if (letter) {
    return {
      ...lettersToAnswer(letter[1]),
      answerSource: 'from_paper',
      answerConfidence: 94,
      matchedLine: m[1].trim(),
    }
  }
  const num = value.match(/^(-?\d+(?:\.\d+)?)$/)
  if (num) {
    const n = Number(num[1])
    if (!Number.isFinite(n)) return null
    if (Number.isInteger(n)) {
      return {
        correctInteger: n,
        answerSource: 'from_paper',
        answerConfidence: 92,
        matchedLine: m[1].trim(),
      }
    }
    return {
      correctNumerical: n,
      answerSource: 'from_paper',
      answerConfidence: 88,
      matchedLine: m[1].trim(),
    }
  }
  if (!/^(?:-?\d|\[[\d.+\-])/.test(value)) return null
  const band = value.match(/^\[?\s*(-?\d+(?:\.\d+)?)\s*(?:to|–|—)\s*(-?\d+(?:\.\d+)?)\s*\]?$/i)
  const low = band ? Number(band[1]) : NaN
  const high = band ? Number(band[2]) : NaN
  /** "[0.27 to 0.33]" is the band itself: its middle with half its width accepts exactly that band. */
  const bandAnswer =
    Number.isFinite(low) && Number.isFinite(high) && high > low
      ? {
          correctNumerical: Number(((low + high) / 2).toFixed(6)),
          numericalTolerance: Number(((high - low) / 2).toFixed(6)),
        }
      : {}
  return {
    ...bandAnswer,
    answerSource: 'from_paper',
    answerConfidence: 90,
    solution: m[1].trim(),
    solutionSource: 'from_paper',
    matchedLine: m[1].trim(),
  }
}

/**
 * Extract printed solution / explanation text from a block.
 * @param {string} block
 * @returns {{ solution?: string, solutionSource: AnswerSource, solutionConfidence: number }}
 */
export function detectSolutionFromPaper(block) {
  const lines = String(block ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (SOLUTION_LINE.test(lines[i].trim())) {
      start = i
      break
    }
  }
  if (start === -1) {
    return { solutionSource: 'unknown', solutionConfidence: 0 }
  }
  const first = lines[start].trim().match(SOLUTION_LINE)
  const parts = first?.[1]?.trim() ? [first[1].trim()] : []
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim()
    if (!t) continue
    if (ANSWER_LINE.test(t) || INTEGER_ANS.test(t)) break
    if (/^(?:Q(?:uestion)?\s*\.?\s*\d|\d{1,2}[\.\)])/i.test(t) && parts.length > 0) break
    parts.push(t)
  }
  if (!parts.length) {
    return { solutionSource: 'unknown', solutionConfidence: 0 }
  }
  return {
    solution: parts.join('\n'),
    solutionSource: 'from_paper',
    solutionConfidence: parts.join(' ').length >= 40 ? 88 : 72,
  }
}

/**
 * Strip answer/solution meta lines so they don't pollute the stem.
 * @param {string} block
 */
const PRINTED_ANSWER_LINE =
  /^(?:(?:Official\s+)?(?:Ans(?:wer)?s?\.?|Key)|Correct\s+(?:option|answer))\s*[:.\-=]?\s*(?:is\s+)?\(?[A-D1-4](?:\s*[,;&/]\s*[A-D1-4])*\)?\.?\s*$/i

export function stripAnswerMetaLines(block) {
  return String(block ?? '')
    .split('\n')
    .flatMap((line) => {
      const t = line.trim()
      if (!t) return [line]
      if (ANSWER_LINE.test(t) || INTEGER_ANS.test(t) || SOLUTION_LINE.test(t)) return []
      if (PRINTED_ANSWER_LINE.test(t)) return []
      if (PRINTED_ANSWER_TAIL.test(t)) {
        // 2025 P2: "Then the value of $r$ is \_\_\_\_. Answer: 6" — the question sentence stays.
        const kept = line.replace(PRINTED_ANSWER_TAIL, '').trimEnd()
        return kept.trim() ? [kept] : []
      }
      if (ANSWER_PAREN.test(t) && t.length < 40) return []
      return [line]
    })
    .join('\n')
    .trim()
}

/**
 * Take a printed key off the question. The key can stay in the answer field.
 * Does not invent a key, and does not remove a sentence such as "the answer is a single number".
 * @param {string} block
 */
export function peelPrintedAnswerFromStem(block) {
  let s = stripAnswerMetaLines(block)
  s = s.replace(PRINTED_ANSWER_TAIL, '')
  s = s.replace(
    /\s+(?:(?:Official\s+)?(?:Ans(?:wer)?s?\.?|Key)|Correct\s+(?:option|answer))\s*[:.\-=]?\s*(?:is\s+)?\(?[A-D1-4](?:\s*[,;&/]\s*[A-D1-4])*\)?\.?\s*$/i,
    '',
  )
  s = s.replace(
    /\n\s*(?:The\s+)?correct\s+(?:option|answer)\s+is\s+\(?[A-D]\)?\.?\s*$/i,
    '',
  )
  return s.trim()
}

/**
 * Very safe local "AI" solve for trivial MCQs (arithmetic / direct match).
 * Never invents hard JEE answers — only high-confidence trivial cases.
 * @param {{ text?: string, options?: string[] }} q
 * @returns {{
 *   correctIndex?: number
 *   answerSource: AnswerSource
 *   answerConfidence: number
 *   solution?: string
 *   solutionSource?: AnswerSource
 *   reason?: string
 * } | null}
 */
export function tryAiSolveMcq(q) {
  const stem = String(q?.text ?? '').replace(/\s+/g, ' ').trim()
  const options = (q?.options ?? []).map((o) => String(o ?? '').trim())
  const filled = options.filter(Boolean)

  // Classic graph MCQ can have empty option text (crops only) — solve before early exit
  const curveGraphEarly = trySolveIncreasingConcaveDownGraphMcq(q)
  if (curveGraphEarly) {
    return {
      correctIndex: curveGraphEarly.correctIndex,
      answerSource: 'ai_generated',
      answerConfidence: 88,
      solution: curveGraphEarly.solution,
      solutionSource: 'ai_generated',
      reason: curveGraphEarly.reason,
    }
  }

  if (filled.length < 2) return null

  // Pattern: "What is 2+2?" / "2 + 2 = ?" with numeric options
  const arith = stem.match(
    /(?:what\s+is|evaluate|find(?:\s+the\s+value\s+of)?|compute)?\s*([\-]?\d+)\s*([+\-×x*\/÷])\s*([\-]?\d+)\s*[=\?]*/i,
  )
  if (arith) {
    const a = Number(arith[1])
    const b = Number(arith[3])
    const op = arith[2]
    let result = NaN
    if (op === '+') result = a + b
    else if (op === '-') result = a - b
    else if (op === '*' || op === 'x' || op === '×') result = a * b
    else if ((op === '/' || op === '÷') && b !== 0) result = a / b
    if (Number.isFinite(result)) {
      const idx = options.findIndex((o) => {
        const n = Number(String(o).replace(/[^\d.\-]/g, ''))
        return Number.isFinite(n) && Math.abs(n - result) < 1e-9
      })
      if (idx >= 0) {
        const label = String.fromCharCode(65 + idx)
        return {
          correctIndex: idx,
          answerSource: 'ai_generated',
          answerConfidence: 82,
          solution: `Compute $${a} ${op === '*' || op === 'x' ? '\\times' : op} ${b} = ${result}$. Option (${label}).`,
          solutionSource: 'ai_generated',
          reason: 'arithmetic_match',
        }
      }
    }
  }

  // Stem ends with "= ?" and one option equals a simple number stated in stem
  const equalsNum = stem.match(/=\s*([\-]?\d+(?:\.\d+)?)\s*[.?]?\s*$/)
  if (equalsNum) {
    const target = Number(equalsNum[1])
    const idx = options.findIndex((o) => {
      const n = Number(String(o).replace(/[^\d.\-]/g, ''))
      return Number.isFinite(n) && Math.abs(n - target) < 1e-9
    })
    if (idx >= 0) {
      return {
        correctIndex: idx,
        answerSource: 'ai_generated',
        answerConfidence: 70,
        solution: `The stem states the value equals $${target}$, which matches option (${String.fromCharCode(65 + idx)}).`,
        solutionSource: 'ai_generated',
        reason: 'stem_equals_option',
      }
    }
  }

  // Unique exact option echo in stem ("… is (B) …" already handled as option marker;
  // here: stem contains "correct answer is B" style without Ans: prefix)
  const spoken = stem.match(/\b(?:correct\s+answer|right\s+choice)\s+is\s+\(?([A-D])\)?/i)
  if (spoken) {
    const idx = spoken[1].toUpperCase().charCodeAt(0) - 65
    return {
      correctIndex: idx,
      answerSource: 'from_paper',
      answerConfidence: 80,
      reason: 'spoken_correct',
    }
  }

  // Classic graph MCQ: f'(x)>0 and f''(x)<0 → increasing + concave down → (D)
  const curveGraph = trySolveIncreasingConcaveDownGraphMcq(q)
  if (curveGraph) {
    return {
      correctIndex: curveGraph.correctIndex,
      answerSource: 'ai_generated',
      answerConfidence: 88,
      solution: curveGraph.solution,
      solutionSource: 'ai_generated',
      reason: curveGraph.reason,
    }
  }

  return null
}

/**
 * Build a short step-by-step solution draft when missing.
 * Prefers structured deep local draft for MCQ / integer keys.
 * @param {{
 *   text?: string
 *   options?: string[]
 *   correctIndex?: number
 *   correctIndices?: number[]
 *   correctInteger?: number
 *   correctNumerical?: number
 *   answerSource?: AnswerSource
 *   existingSolution?: string
 * }} q
 */
export function generateSolutionDraft(q) {
  const existing = String(q?.existingSolution ?? '').trim()
  if (existing) {
    return {
      solution: existing,
      solutionSource: /** @type {AnswerSource} */ (q.answerSource === 'from_paper' ? 'from_paper' : 'manual'),
      solutionConfidence: 90,
    }
  }

  const hasAnswer =
    q?.correctIndex != null ||
    (Array.isArray(q?.correctIndices) && q.correctIndices.length > 0) ||
    q?.correctInteger != null ||
    q?.correctNumerical != null

  if (hasAnswer) {
    if (stemTooGarbledForSolution(String(q?.text ?? ''), q?.options ?? [])) {
      return {
        solutionSource: 'unknown',
        solutionConfidence: 0,
      }
    }
    const deep = generateDeepSolutionLocal(q)
    if (deep.solution) {
      return {
        solution: deep.solution,
        solutionSource: /** @type {AnswerSource} */ (deep.solutionSource || 'draft'),
        solutionConfidence: deep.solutionConfidence,
        solutionQuality: deep.quality,
      }
    }
  }

  const opts = q?.options ?? []
  const labels = []
  if (q?.correctIndices?.length) {
    for (const i of q.correctIndices) labels.push(`(${String.fromCharCode(65 + i)})`)
  } else if (q?.correctIndex != null) {
    labels.push(`(${String.fromCharCode(65 + q.correctIndex)})`)
  }

  if (q?.correctInteger != null) {
    return {
      solution: `The correct integer answer is $${q.correctInteger}$.`,
      solutionSource: /** @type {AnswerSource} */ (
        q.answerSource === 'from_paper' ? 'from_paper' : 'ai_generated'
      ),
      solutionConfidence: 65,
    }
  }
  if (q?.correctNumerical != null) {
    return {
      solution: `The correct numerical answer is $${q.correctNumerical}$.`,
      solutionSource: /** @type {AnswerSource} */ (
        q.answerSource === 'from_paper' ? 'from_paper' : 'ai_generated'
      ),
      solutionConfidence: 65,
    }
  }

  if (!labels.length) {
    return { solutionSource: 'unknown', solutionConfidence: 0 }
  }

  const optTexts = labels
    .map((lab, i) => {
      const idx =
        q.correctIndices?.length != null && q.correctIndices[i] != null
          ? q.correctIndices[i]
          : q.correctIndex
      const body = String(opts[idx] ?? '').trim()
      return body ? `${lab} ${body}` : lab
    })
    .join('; ')

  const sourceNote =
    q.answerSource === 'from_paper'
      ? 'Answer taken from the printed key on the paper.'
      : q.answerSource === 'ai_generated'
        ? 'Answer suggested by local AI assist — please verify before publish.'
        : 'Confirm this answer before publish.'

  return {
    solution: `**Correct:** ${optTexts}\n\n${sourceNote}`,
    solutionSource: /** @type {AnswerSource} */ (q.answerSource === 'from_paper' ? 'from_paper' : 'ai_generated'),
    solutionConfidence: q.answerSource === 'from_paper' ? 70 : 55,
  }
}

/**
 * Parse printed Match-the-Column / matrix codes into a grid answer key.
 * Supports: `A → P,Q`, `(A)-(P),(Q)`, `A-P,Q`, `Codes: A → 1,2`.
 * Scoped to Codes/Answer sections when present — avoids Column-I math like `(A) -3/2`.
 * @param {string} block
 * @returns {{ matrixAnswerKey: Record<number, number[]>, answerSource: AnswerSource, answerConfidence: number } | null}
 */
export function detectMatrixAnswerKeyFromPaper(block) {
  const full = String(block ?? '').replace(/\r\n/g, '\n')
  if (!full.trim()) return null

  const codesIdx = full.search(
    /\b(?:Codes?|Answer\s*key|Correct\s*(?:matching|codes?)|Matching\s*list)\b/i,
  )
  const scope = codesIdx >= 0 ? full.slice(codesIdx) : full
  const allowDigits = codesIdx >= 0

  /** @type {Record<number, number[]>} */
  const key = {}

  const colTokenToIndex = (tok) => {
    const t = String(tok ?? '')
      .trim()
      .toUpperCase()
      .replace(/[()]/g, '')
    if (!t) return -1
    if (/^[P-T]$/.test(t)) return t.charCodeAt(0) - 80
    if (allowDigits && /^[1-5]$/.test(t)) return Number(t) - 1
    return -1
  }

  const absorbRow = (rowLetter, colsRaw) => {
    const row = rowLetter.toUpperCase().charCodeAt(0) - 65
    if (row < 0 || row > 3) return
    const letterCols = [...String(colsRaw).matchAll(/\(?\s*([P-Tp-t])\s*\)?/g)]
      .map((m) => colTokenToIndex(m[1]))
      .filter((c) => c >= 0 && c <= 4)
    const digitCols =
      allowDigits && !letterCols.length
        ? [...String(colsRaw).matchAll(/\(?\s*([1-5])\s*\)?/g)]
            .map((m) => colTokenToIndex(m[1]))
            .filter((c) => c >= 0 && c <= 4)
        : []
    const cols = letterCols.length ? letterCols : digitCols
    if (!cols.length) return
    key[row] = [...new Set([...(key[row] ?? []), ...cols])].sort((a, b) => a - b)
  }

  // Prefer arrow / "to" forms (safer than bare A-P inside algebra).
  // Do not let col tokens eat newlines — next row needs a line boundary.
  const arrowRe =
    /(?:^|[\n;])\s*\(?\s*([A-Da-d])\s*\)?\s*(?:→|->|⇒|\bto\b|=|:)\s*((?:\(?[ \t]*[P-Tp-t1-5][ \t]*\)?(?:[ \t]*,[ \t]*|[ \t]+|&|\/)*(?:and[ \t]+)*)+)/gi
  let m
  while ((m = arrowRe.exec(scope)) !== null) {
    absorbRow(m[1], m[2].trim())
  }

  // Compact: A-PQ ; B-R  (only inside Codes/Answer section)
  if (codesIdx >= 0) {
    const compact = scope.match(
      /\bCodes?\b[\s:]*([A-Da-d]\s*[-–→:=]\s*[P-Tp-t1-5,\s\(\)]+(?:\s*[,;|/]\s*[A-Da-d]\s*[-–→:=]\s*[P-Tp-t1-5,\s\(\)]+){1,3})/i,
    )
    if (compact?.[1]) {
      const parts = compact[1].split(/[,;|/]+/)
      for (const part of parts) {
        const pm = part.trim().match(/^\(?\s*([A-Da-d])\s*\)?\s*[-–→:=]\s*(.+)$/i)
        if (pm) absorbRow(pm[1], pm[2])
      }
    }
  }

  // Without a Codes header, only accept if ≥2 rows use explicit P–T letters.
  if (codesIdx < 0) {
    const letterOnly = Object.values(key).every((cols) =>
      cols.every((c) => c >= 0 && c <= 4),
    )
    const hasPt = Object.values(key).some((cols) => cols.some((c) => c <= 4))
    if (!letterOnly || !hasPt || Object.keys(key).length < 2) return null
    // Verify matches actually named P–T in scope (not digit-only leftovers)
    if (!/\([P-T]\)|[→:=]\s*[P-T]/i.test(scope)) return null
  }

  if (Object.keys(key).length < 2) return null
  return {
    matrixAnswerKey: key,
    answerSource: 'from_paper',
    answerConfidence: Object.keys(key).length >= 4 ? 90 : 78,
  }
}

/**
 * Fill answer/solution on a passage sub-question from its OCR chunk (no empty-A default).
 * @param {Record<string, unknown>} sq
 * @param {string} [chunk]
 */
export function enrichPassageSubQuestion(sq, chunk = '') {
  const opts = Array.isArray(sq?.options) ? [...sq.options] : ['', '', '', '']
  while (opts.length < 4) opts.push('')
  const block = String(chunk || `${sq?.text ?? ''}\n${opts.join('\n')}`)
  const enriched = enrichParsedWithAnswerProvenance(
    {
      text: String(sq?.text ?? ''),
      options: opts.slice(0, 4),
      correctIndex: sq?.correctIndex != null ? sq.correctIndex : undefined,
      correctIndices: sq?.correctIndices,
      correctInteger: sq?.correctInteger,
      correctNumerical: sq?.correctNumerical,
      solution: sq?.solution,
      answerSource: sq?.answerSource,
      solutionSource: sq?.solutionSource,
    },
    block,
  )
  /** @type {Record<string, unknown>} */
  const out = { ...sq, options: opts.slice(0, 4) }
  if (enriched.correctIndex != null) out.correctIndex = enriched.correctIndex
  else delete out.correctIndex
  if (Array.isArray(enriched.correctIndices) && enriched.correctIndices.length) {
    out.correctIndices = enriched.correctIndices
  }
  if (enriched.correctInteger != null) out.correctInteger = enriched.correctInteger
  if (enriched.correctNumerical != null) out.correctNumerical = enriched.correctNumerical
  if (enriched.solution) out.solution = enriched.solution
  if (enriched.answerSource) out.answerSource = enriched.answerSource
  if (enriched.solutionSource) out.solutionSource = enriched.solutionSource
  return out
}

/**
 * Enrich a parsed question (single or bulk item) with answer/solution provenance.
 * Paper answers win over AI; never overwrite an existing explicit correctIndex from caller
 * unless it came from the same enrich pass.
 * `paperOnly` keeps what the paper prints and stops there: no solving, no drafted solution.
 * @param {Record<string, unknown>} parsed
 * @param {string} [rawBlock]
 * @param {{ paperOnly?: boolean }} [opts]
 */
export function enrichParsedWithAnswerProvenance(parsed, rawBlock = '', opts = {}) {
  const block = String(rawBlock || parsed?.text || '')
  const paperAns = detectAnswerFromPaper(block)
  const paperSol = detectSolutionFromPaper(block)

  /** @type {Record<string, unknown>} */
  const out = { ...parsed }

  // Repair mangled f'/f'' in curve-graph stems before answer logic
  if (looksLikeCurveDerivativeGraphMcq(String(out.text ?? ''))) {
    const fixed = repairDerivativePrimeStemOcr(String(out.text ?? ''), block)
    if (fixed && fixed !== out.text) out.text = fixed
  }

  const optsArr = /** @type {string[]} */ (out.options ?? [])
  const imgsArr = /** @type {(string|null|undefined)[]} */ (out.optionImages ?? [])
  const graphOpts =
    looksLikeCurveDerivativeGraphMcq(String(out.text ?? '')) &&
    (imgsArr.filter(Boolean).length >= 2 ||
      optsArr.filter((o) => String(o ?? '').trim()).length === 0 ||
      optsArr.every((o) => !String(o ?? '').trim() || /graph|attach|diagram/i.test(String(o))))

  // Drop "correct = A" when option A is empty (common OCR / default mistake).
  // Also drop guessed A on derivative+graph MCQs unless a paper key restores it below.
  if (
    out.correctIndex === 0 &&
    ((!String(optsArr[0] ?? '').trim() && !(imgsArr[0])) || graphOpts)
  ) {
    delete out.correctIndex
  }

  const hasAnswer =
    out.correctIndex != null ||
    (Array.isArray(out.correctIndices) && out.correctIndices.length > 0) ||
    out.correctInteger != null ||
    out.correctNumerical != null

  if (!hasAnswer && paperAns.answerSource === 'from_paper') {
    if (paperAns.correctIndices) out.correctIndices = paperAns.correctIndices
    if (paperAns.correctIndex != null) out.correctIndex = paperAns.correctIndex
    if (paperAns.correctInteger != null) out.correctInteger = paperAns.correctInteger
    if (paperAns.correctNumerical != null) out.correctNumerical = paperAns.correctNumerical
    out.answerSource = 'from_paper'
    out.answerConfidence = paperAns.answerConfidence
  } else if (hasAnswer && !out.answerSource) {
    // Already had answer from bulk parseAnswerKey — treat as from paper
    out.answerSource = paperAns.answerSource === 'from_paper' ? 'from_paper' : 'from_paper'
    out.answerConfidence = paperAns.answerConfidence || 85
  }

  if (!out.solution && paperSol.solution) {
    out.solution = paperSol.solution
    out.solutionSource = 'from_paper'
    out.solutionConfidence = paperSol.solutionConfidence
  } else if (out.solution && !out.solutionSource) {
    out.solutionSource = paperSol.solutionSource === 'from_paper' ? 'from_paper' : 'from_paper'
    out.solutionConfidence = paperSol.solutionConfidence || 80
  }

  if (opts.paperOnly === true) {
    if (!out.answerSource) out.answerSource = 'unknown'
    return out
  }

  const stillNoAnswer =
    out.correctIndex == null &&
    !(Array.isArray(out.correctIndices) && out.correctIndices.length) &&
    out.correctInteger == null &&
    out.correctNumerical == null

  if (stillNoAnswer) {
    const kAns = tanInverseKIntegralAnswer(`${String(out.text ?? '')}\n${block}`)
    if (kAns != null) {
      out.correctInteger = kAns
      out.answerSource = 'ai_generated'
      out.answerConfidence = 86
    }
  }

  const stillNoAnswerAfterK =
    out.correctIndex == null &&
    !(Array.isArray(out.correctIndices) && out.correctIndices.length) &&
    out.correctInteger == null &&
    out.correctNumerical == null

  if (stillNoAnswerAfterK) {
    const ocrBlob = `${block}\n${(out.options ?? []).join('\n')}`
    const tooGarbled =
      scoreLocalOcrWeakness(ocrBlob) >= 65 || isUltraLowConfidenceOcr(ocrBlob)
    if (!tooGarbled) {
      const ai = tryAiSolveMcq({
        text: String(out.text ?? ''),
        options: optsArr,
        optionImages: imgsArr,
      })
      if (ai) {
        if (ai.correctIndex != null) out.correctIndex = ai.correctIndex
        out.answerSource = ai.answerSource
        out.answerConfidence = ai.answerConfidence
        if (!out.solution && ai.solution) {
          out.solution = ai.solution
          out.solutionSource = ai.solutionSource
          out.solutionConfidence = ai.answerConfidence
        }
      }
    }
  }

  if (
    !out.solution &&
    (out.answerSource === 'from_paper' || out.answerSource === 'ai_generated') &&
    (out.correctIndex != null ||
      out.correctIndices ||
      out.correctInteger != null ||
      out.correctNumerical != null) &&
    !stemTooGarbledForSolution(String(out.text ?? ''), /** @type {string[]} */ (out.options ?? []))
  ) {
    const draft = generateSolutionDraft({
      text: String(out.text ?? ''),
      options: /** @type {string[]} */ (out.options ?? []),
      correctIndex: /** @type {number|undefined} */ (out.correctIndex),
      correctIndices: /** @type {number[]|undefined} */ (out.correctIndices),
      correctInteger: /** @type {number|undefined} */ (out.correctInteger),
      correctNumerical: /** @type {number|undefined} */ (out.correctNumerical),
      answerSource: /** @type {AnswerSource} */ (out.answerSource || 'unknown'),
    })
    if (draft.solution) {
      out.solution = draft.solution
      out.solutionSource = draft.solutionSource
      out.solutionConfidence = draft.solutionConfidence
    }
  }

  if (!out.answerSource) out.answerSource = 'unknown'
  return out
}

/**
 * Human badge label for UI.
 * @param {AnswerSource | string | undefined} source
 */
export function answerSourceBadgeLabel(source) {
  switch (source) {
    case 'from_paper':
      return 'From paper'
    case 'ai_generated':
      return 'AI-generated'
    case 'draft':
      return 'Draft'
    case 'manual':
      return 'Manual'
    default:
      return 'Needs check'
  }
}

/**
 * Solution-specific badge (From paper / AI solution / Draft).
 * @param {string | undefined} source
 * @param {{ quality?: string }} [meta]
 */
export function solutionBadgeLabel(source, meta = {}) {
  if (source === 'from_paper') return 'From paper'
  if (source === 'draft' || meta.quality === 'draft') return 'Draft'
  if (source === 'ai_generated') return 'AI solution'
  if (source === 'manual') return 'Manual'
  return 'Needs check'
}

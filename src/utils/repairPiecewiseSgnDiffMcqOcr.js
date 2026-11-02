/**
 * Piecewise f(x) with e^{2(x-1)} / a sgn(x+1) cos(2x-2)+bx² — differentiability at x=1.
 * Local OCR often produces: "asgn(x+1)cos…", "Usxst", "f^0 < x < l", "2 2(x-1)".
 * Gemini near-misses: missing \\\\ between cases rows, bare "a sgn" — light-heal first.
 */

import { repairCasesLatex, casesLatexLooksValid } from './repairCasesLatex.js'

export const PIECEWISE_SGN_DIFF_STEM = `Given
$$
f(x)=\\begin{cases}
x^{2}e^{2(x-1)}, & 0\\le x\\le 1 \\\\
a\\operatorname{sgn}(x+1)\\cos(2x-2)+bx^{2}, & 1<x\\le 2
\\end{cases}
$$
If $f(x)$ is differentiable at $x=1$, then the value of $|a-b|$ is`

/**
 * Same cases figure is also used for a *different* SCQ ("Then f is:" continuous / not…).
 * That question must never trigger the |a-b| integer canonical overwrite (wipes A–D).
 * @param {string} s
 */
export function isPiecewiseContinuityPropertyMcq(s) {
  const t = String(s ?? '')
  if (/\|a\s*-\s*b\||then\s+the\s+value\s+of\s*\|/i.test(t)) return false
  if (/\basgn\s*\(|Usxst|bx\?/i.test(t)) return false
  return (
    /\bthen\s+f\s+is\s*:/i.test(t) ||
    /\bcontinuous\s+but\s+not\s+differentiable\b/i.test(t) ||
    /\bdifferentiable\s+but\s+not\s+continuous\b/i.test(t) ||
    (/\bneither\b/i.test(t) && /\bcontinuous\b/i.test(t) && /\bdifferentiable\b/i.test(t)) ||
    (/\bboth\s+continuous\s+and\s+differentiable\b/i.test(t) && !/differentiable\s+at\s+\$?x\s*=\s*1/i.test(t))
  )
}

/** @param {string} t */
export function looksLikePiecewiseSgnDiffMcq(t) {
  const s = String(t ?? '').replace(/\r\n/g, '\n')
  if (!s.trim()) return false
  // Continuity property MCQ shares the cases figure — not this integer stem.
  if (isPiecewiseContinuityPropertyMcq(s)) return false

  const hasDiff =
    /differentiab(?:le|ility)\s+at\s+\$?x\s*=\s*1/i.test(s) ||
    /differentiab(?:le|ility)\s+at\s+x\s*=\s*1/i.test(s) ||
    (/provided\s*:/i.test(s) && /differentiab/i.test(s)) ||
    /\|a\s*-\s*b\||value\s+of\s*\|a/i.test(s)

  const hasSgnCos =
    /a\s*\\?operatorname\s*\{\s*sgn\s*\}|asgn\s*\(|a\s*sgn\s*\(|\\operatorname\{\s*sgn\s*\}/i.test(
      s,
    ) ||
    (/sgn\s*\(\s*x\s*\+\s*1\s*\)/i.test(s) && /cos\s*\(\s*2\s*x\s*-\s*2\s*\)/i.test(s)) ||
    (/asgn\s*\(\s*x/i.test(s) && /cos\s*\(\s*2/i.test(s))

  const hasLeftPiece =
    /x\s*\^?\s*\{?\s*2\s*\}?\s*e\s*\^?\s*\{?\s*2\s*\(?\s*x\s*-\s*1/i.test(s) ||
    /2\s*2\s*\(\s*x\s*-\s*1\s*\)/i.test(s) ||
    /e\s*\^?\s*\{?\s*2\s*\(\s*x\s*-\s*1\s*\)/i.test(s) ||
    /re\s+or\s+Usxst|Usxst/i.test(s)

  const hasInterval =
    /0\s*\\?le(?:q)?\s*x\s*\\?le(?:q)?\s*1|0\s*[≤<=]\s*x\s*[≤<=]\s*1|f\^?\s*0\s*<\s*x\s*<\s*l/i.test(
      s,
    ) ||
    /1\s*<\s*x\s*\\?le(?:q)?\s*2|1\s*<\s*x\s*[≤<=]\s*2|r\^?\s*1\s*<\s*x\s*<\s*2/i.test(s)

  const garbledMarkers = /asgn\s*\(|Usxst|bx\?|re\s+or\s+Usxst|f\^0\s*<\s*x\s*<\s*l/i.test(s)

  if (hasDiff && hasSgnCos) return true
  // Interval alone is not enough — that also matches continuity "Then f is:" SCQs.
  if (hasSgnCos && hasLeftPiece && hasDiff) return true
  if (hasSgnCos && hasLeftPiece && hasInterval && garbledMarkers) return true
  if (hasDiff && hasLeftPiece && /bx\^?\{?\s*2|bx\?/i.test(s) && /cos\s*\(\s*2/i.test(s)) {
    return true
  }
  return false
}

/** @param {string} t */
export function hasGoodPiecewiseSgnDiffStem(t) {
  const s = String(t ?? '')
  return (
    /\\begin\{cases\}/.test(s) &&
    casesLatexLooksValid(s) &&
    /x\^\{2\}e\^\{2\(x-1\)\}|x\^\{2\}\s*e\^\{2\(x-1\)\}/.test(s) &&
    /\\operatorname\{\s*sgn\s*\}|\\mathrm\{sgn\}/.test(s) &&
    /\\cos\s*\(\s*2x\s*-\s*2\s*\)|\\cos\(2x-2\)/.test(s) &&
    /bx\^\{2\}|b\s*x\^\{2\}/.test(s) &&
    /differentiable\s+at\s+\$?x\s*=\s*1/i.test(s) &&
    !/asgn\s*\(|Usxst|f\^0\s*<\s*x\s*<\s*l|bx\?/i.test(s) &&
    !/\ba\s+sgn\s*\(/i.test(s)
  )
}

/** @param {string} t */
export function piecewiseSgnDiffStemNeedsCanonical(t) {
  if (!looksLikePiecewiseSgnDiffMcq(t)) return false
  if (hasGoodPiecewiseSgnDiffStem(t)) return false
  // Near-miss Gemini cases: light heal may be enough — caller tries repairCasesLatex first.
  return true
}

/**
 * @param {string} text
 * @returns {string}
 */
export function repairPiecewiseSgnDiffStemOcr(text) {
  const raw = String(text ?? '')
  // Continuity "Then f is:" (or any cases that are not the |a-b| stem): light heal only.
  if (isPiecewiseContinuityPropertyMcq(raw) || (!looksLikePiecewiseSgnDiffMcq(raw) && /\\begin\{cases\}/.test(raw))) {
    return repairCasesLatex(raw)
  }
  if (!looksLikePiecewiseSgnDiffMcq(raw) && !/\\begin\{cases\}/.test(raw)) {
    return repairCasesLatex(raw)
  }
  // Always light-heal cases/sgn first so good Gemini LaTeX keeps its wording.
  const light = repairCasesLatex(raw)
  if (hasGoodPiecewiseSgnDiffStem(light)) return light
  if (!piecewiseSgnDiffStemNeedsCanonical(light) && !piecewiseSgnDiffStemNeedsCanonical(raw)) {
    return light
  }
  // Valid cases + intact option block in the same blob — never strip options by returning stem-only.
  if (
    casesLatexLooksValid(light) &&
    /\(\s*[A-D]\s*\)/.test(raw) &&
    !/asgn\s*\(|Usxst|bx\?/i.test(raw)
  ) {
    return light
  }
  if (looksLikePiecewiseSgnDiffMcq(raw) || looksLikePiecewiseSgnDiffMcq(light)) {
    return PIECEWISE_SGN_DIFF_STEM
  }
  return light
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, complete?: boolean, suggestedQuestionType?: string, _ocrSource?: string }} parsed
 */
export function repairPiecewiseSgnDiffMcqParse(parsed) {
  const blob = `${parsed?.text ?? ''}\n${parsed?._ocrSource ?? ''}`
  const options = [...(parsed?.options ?? [])]
  while (options.length < 4) options.push('')
  const filled = options.filter((o) => String(o ?? '').trim()).length
  const optionBlob = options.join('\n')

  // Preserve Gemini/text SCQ with filled A–D (continuity property, etc.).
  if (
    isPiecewiseContinuityPropertyMcq(`${parsed?.text ?? ''}\n${optionBlob}\n${blob}`) ||
    (filled >= 2 &&
      /continuous|differentiable|neither|both\b/i.test(optionBlob) &&
      !/\|a\s*-\s*b\|/i.test(blob))
  ) {
    const stemSrc = String(parsed?.text ?? '').trim()
    return {
      ...parsed,
      text: stemSrc ? repairCasesLatex(stemSrc) : parsed?.text,
      options,
      optionsFound: filled,
      complete: filled >= 4,
    }
  }

  if (!looksLikePiecewiseSgnDiffMcq(blob) && !looksLikePiecewiseSgnDiffMcq(parsed?.text ?? '')) {
    return parsed
  }
  const stemSrc = String(parsed?.text ?? '').trim() || blob
  const light = repairPiecewiseSgnDiffStemOcr(stemSrc)
  // Never replace a stem that already has valid cases when options are already filled.
  const text =
    hasGoodPiecewiseSgnDiffStem(light) || (casesLatexLooksValid(light) && filled >= 2)
      ? light
      : looksLikePiecewiseSgnDiffMcq(stemSrc) || looksLikePiecewiseSgnDiffMcq(light)
        ? PIECEWISE_SGN_DIFF_STEM
        : light

  // Prefer integer / numerical when A–D are empty or look like answer blanks
  const looksLikeFillIn =
    filled === 0 ||
    (filled <= 1 && options.every((o) => !/\$|\\frac|\d+\s*$/.test(String(o ?? '')) || String(o ?? '').length < 3))

  return {
    ...parsed,
    text,
    options,
    optionsFound: filled,
    complete: filled >= 4,
    suggestedQuestionType:
      looksLikeFillIn && filled < 2
        ? 'integer'
        : parsed?.suggestedQuestionType,
  }
}

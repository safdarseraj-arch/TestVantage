/**
 * Repair garbled OCR for:
 * If lim f(x) exists finite nonzero and lim (f + (3f-1)/f^2) = 3, find lim f(x).
 * Options: 1, -1, 2, None of these. Correct: (A) 1.
 */

export const FX_LIMIT_FINITE_STEM = `If $\\lim_{x \\to \\infty} f(x)$ exists and is finite and non-zero and
$$\\lim_{x \\to \\infty} \\left( f(x) + \\frac{3f(x) - 1}{f^{2}(x)} \\right) = 3,$$
then the value of $\\lim_{x \\to \\infty} f(x)$ is equal to:`

export const FX_LIMIT_FINITE_OPTION_ITEMS = ['1', '-1', '2', 'None of these']

/** @param {string} s */
function hasFxLimitProse(s) {
  return (
    /\bfinite\b/i.test(s) &&
    /\bnon[\s\-]?zero\b/i.test(s) &&
    /\blim\b|\\lim|\/im|lim\s+f\s*\(/i.test(s) &&
    /\bf\s*\(\s*x\s*\)/i.test(s)
  )
}

/** @param {string} s */
function hasFxLimitInnerSoup(s) {
  return (
    /3f\s*\(\s*x\s*\)|3f\(x\)|3f\s*x/i.test(s) ||
    /f\^\{?2\}?\s*\(\s*x\s*\)|f\^2\s*\(x\)|f\s*\^\s*2/i.test(s) ||
    /J\s*PEA|PEA\s*i|\/im\s*\$?f|lim\s+J\s+PEA/i.test(s) ||
    (/=\s*3\b/.test(s) && /3f|f\^2|f\^\{2\}/i.test(s))
  )
}

/**
 * @param {string} t
 */
export function looksLikeFxLimitFiniteMcq(t) {
  const s = String(t ?? '')
  if (!s.trim()) return false
  if (!hasFxLimitProse(s)) return false
  if (hasFxLimitInnerSoup(s)) return true
  // Clean copy already has the nested limit expression
  if (/\\lim_\{x\s*\\to\s*\\infty\}/.test(s) && /3f\(x\)\s*-\s*1|3f\(x\)-1/.test(s)) {
    return true
  }
  // Garbled but still mentions value of lim f(x)
  if (
    /value\s+of\s+(?:\\lim|\/im|lim)/i.test(s) &&
    /\bfinite\b/i.test(s) &&
    /\bnon[\s\-]?zero\b/i.test(s) &&
    /=\s*3\b/.test(s)
  ) {
    return true
  }
  return false
}

/** @param {string} t */
export function hasGoodFxLimitFiniteStem(t) {
  const s = String(t ?? '')
  if (!looksLikeFxLimitFiniteMcq(s)) return false
  return (
    /\\lim_\{x\s*\\to\s*\\infty\}/.test(s) &&
    /\\frac\{3f\(x\)\s*-\s*1\}\{f\^\{2\}\(x\)\}/.test(s) &&
    !/J\s*PEA|\/im\s*\$?f|lim\s+J\s+PEA/i.test(s) &&
    !/\(\s*A\s*\)/i.test(s)
  )
}

/** @param {string[]} [options] */
export function fxLimitFiniteOptionsNeedHeal(options = []) {
  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  if (opts.filter(Boolean).length < 4) return true
  if (/None\s+of\s+these/i.test(opts[2]) || /®\s*D\)|\(D\)|Ⓡ\s*D/i.test(opts[2])) return true
  if (/\(Graph\/diagram/i.test(opts[3])) return true
  const aOk = /^\$?1\$?$|^1$/.test(opts[0].replace(/\s/g, ''))
  const bOk = /^-1$|^\$\-1\$$/.test(opts[1].replace(/\s/g, ''))
  const cOk = /^\$?2\$?$|^2$/.test(opts[2].replace(/\s/g, ''))
  const dOk = /none\s+of\s+these/i.test(opts[3])
  return !(aOk && bOk && cOk && dOk)
}

/** @param {string[]} [options] */
export function healFxLimitFiniteOptions(options = []) {
  return fxLimitFiniteOptionsNeedHeal(options)
    ? [...FX_LIMIT_FINITE_OPTION_ITEMS]
    : [...options.slice(0, 4)]
}

/**
 * Concise correct solution for this classic limit MCQ (L=1).
 */
export function FX_LIMIT_FINITE_SOLUTION() {
  return [
    '**Step 1.** Let $L = \\lim_{x \\to \\infty} f(x)$ (finite, $L \\neq 0$).',
    '**Step 2.** The second limit becomes $L + \\dfrac{3L - 1}{L^{2}} = 3$.',
    '**Step 3.** Multiply by $L^{2}$: $L^{3} + 3L - 1 = 3L^{2}$ → $L^{3} - 3L^{2} + 3L - 1 = 0$ → $(L-1)^{3} = 0$.',
    '**Step 4.** So $L = 1$.',
    '**Quick eliminations:** (B) $-1$ and (C) $2$ do not satisfy the cubic; (D) fails since $L=1$ works.',
    '**Correct:** (A) 1',
  ].join('\n\n')
}

/**
 * @param {string} text
 */
export function repairFxLimitFiniteStemOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t
  if (!looksLikeFxLimitFiniteMcq(t)) return t
  if (hasGoodFxLimitFiniteStem(t) && !/\(\s*[A-D]\s*\)/i.test(t)) return t
  return `${FX_LIMIT_FINITE_STEM}
(A) 1
(B) -1
(C) 2
(D) None of these`
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, _ocrSource?: string, correctIndex?: number, solution?: string }} parsed
 */
export function repairFxLimitFiniteMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}\n${parsed._ocrSource ?? ''}`
  if (!looksLikeFxLimitFiniteMcq(blob)) return parsed

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  if (hasGoodFxLimitFiniteStem(parsed.text ?? '') && !fxLimitFiniteOptionsNeedHeal(opts)) {
    const sol = String(parsed.solution ?? '')
    if (
      !sol.trim() ||
      /What is asked|Work it out\.|J\s*PEA|\/im/i.test(sol) ||
      (/^\*\*Answer\.\*\*/m.test(sol) && !/\*\*Step\s*1/i.test(sol))
    ) {
      parsed.solution = FX_LIMIT_FINITE_SOLUTION()
      parsed.solutionSource = 'ai_generated'
      parsed.solutionConfidence = 90
    }
    return parsed
  }

  parsed.text = FX_LIMIT_FINITE_STEM
  parsed.options = healFxLimitFiniteOptions(parsed.options)
  parsed.optionsFound = 4
  parsed.complete = true
  if (parsed.correctIndex == null && !(Array.isArray(parsed.correctIndices) && parsed.correctIndices.length)) {
    parsed.correctIndex = 0
    parsed.answerSource = parsed.answerSource || 'ai_generated'
    parsed.answerConfidence = Math.max(Number(parsed.answerConfidence ?? 0), 86)
  }
  if (!String(parsed.solution ?? '').trim() || /What is asked|Work it out\.|J\s*PEA|\/im/i.test(String(parsed.solution)) || (/^\*\*Answer\.\*\*/m.test(String(parsed.solution)) && !/\*\*Step\s*1/i.test(String(parsed.solution)))) {
    parsed.solution = FX_LIMIT_FINITE_SOLUTION()
    parsed.solutionSource = 'ai_generated'
    parsed.solutionConfidence = 88
  }
  return parsed
}

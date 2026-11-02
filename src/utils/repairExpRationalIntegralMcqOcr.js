/**
 * Repair garbled OCR for:
 * exp rational integral MCQ: Ax + B log_e(9e^{2x} - 4) + C with A/B/C/D statements.
 */

export const EXP_RATIONAL_INTEGRAL_STEM = `$$\\int \\left( \\frac{4e^x + 6e^{-x}}{9e^x - 4e^{-x}} \\right) dx = Ax + B \\log_e(9e^{2x} - 4) + C,$$
then:`

export const EXP_RATIONAL_INTEGRAL_OPTIONS = [
  '$A = \\frac{3}{2}$',
  '$B = \\frac{35}{36}$',
  '$C$ is indefinite',
  '$A + B = -\\frac{19}{36}$',
]

/** @param {string} s */
export function looksLikeExpRationalIntegralMcq(s) {
  const t = String(s ?? '')
  if (!t.trim()) return false

  const abLog = /\bAx\s*\+\s*B\b|Ax\s*\+\s*Blog/i.test(t)
  const logNine =
    /log[\s\S]{0,20}?9|Blog[\s\S]{0,12}?9|9e\^\{?2x\}?|9[ex¢*™]{1,4}[\s\S]{0,8}?-?\s*4/i.test(t)
  const dxPart = /\bdx\b|dx\s*=|\|\s*[\d€¢]*\s*dx/i.test(t)
  const stmtSig =
    /then\s*:|35\s*\/\s*36|35\{36\}|indefinite|Cisindefinite|A\s*\+\s*B|4=32|4\s*=\s*32/i.test(t)
  const expSig = /e\^|e\-\{|e™|4e|6e|\-4e|Blog|9x\s*-?\s*4e/i.test(t)

  if (abLog && logNine && dxPart && stmtSig && expSig) return true

  if (
    /35\s*\/\s*36|35\{36\}/.test(t) &&
    /indefinite|Cisindefinite/i.test(t) &&
    /A\s*\+\s*B|A\+B/i.test(t) &&
    (abLog || /Blog|9e|9x|9¢/i.test(t))
  ) {
    return true
  }
  return false
}

/** @param {string} t */
export function hasGoodExpRationalIntegralStem(t) {
  const s = String(t ?? '')
  if (!looksLikeExpRationalIntegralMcq(s)) return false
  return (
    /\\int[\s\S]*\\frac[\s\S]*4e\^x\s*\+\s*6e\^\{-x\}/.test(s) &&
    /9e\^x\s*-\s*4e\^\{-x\}/.test(s) &&
    /Ax\s*\+\s*B[\s\S]*\\log_e\(9e\^\{2x\}\s*-\s*4\)/.test(s) &&
    !/Blog,|2€|9¢|4=32|Cisindefinite|\|\s*[\d€]+\s*dx/i.test(s)
  )
}

/** @param {string[]} [options] */
export function expRationalIntegralOptionsNeedHeal(options = []) {
  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  if (opts.filter(Boolean).length < 4) return true
  const aOk = /\bA\s*=|\$A\s*=|3\s*\/\s*2|3\{2\}/i.test(opts[0])
  const bOk = /35\s*\/\s*36|35\{36\}/.test(opts[1])
  const cOk = /indefinite/i.test(opts[2])
  const dOk = /A\s*\+\s*B|19\s*\/\s*36|19\{36\}/.test(opts[3])
  if (!aOk || !bOk || !cOk || !dOk) return true
  if (/4=32|Cisindefinite|A\+B=\s*=|B=\$\\frac/i.test(opts.join('\n'))) return true
  return false
}

/** @param {string[]} [options] */
export function healExpRationalIntegralOptions(options = []) {
  return expRationalIntegralOptionsNeedHeal(options)
    ? [...EXP_RATIONAL_INTEGRAL_OPTIONS]
    : [...options.slice(0, 4)]
}

export function EXP_RATIONAL_INTEGRAL_SOLUTION() {
  return [
    '**Step 1.** Multiply integrand by $e^x$: $\\dfrac{4e^{2x}+6}{9e^{2x}-4}$.',
    '**Step 2.** Match $\\dfrac{d}{dx}[Ax + B\\ln(9e^{2x}-4)] = A + \\dfrac{18B\\,e^{2x}}{9e^{2x}-4}$ to the integrand.',
    '**Step 3.** Compare coefficients: $-4A = 6 \\Rightarrow A = -\\dfrac{3}{2}$; $9A + 18B = 4 \\Rightarrow B = \\dfrac{35}{36}$.',
    '**Step 4.** So $A + B = -\\dfrac{19}{36}$ and $C$ is an arbitrary constant.',
    '**Quick eliminations:** (A) uses $+\\tfrac{3}{2}$ — wrong sign; (B), (C), (D) hold.',
    '**Correct:** (B), (C), (D)',
  ].join('\n\n')
}

/** @param {string} text */
export function repairExpRationalIntegralStemOcr(text) {
  const t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t
  if (!looksLikeExpRationalIntegralMcq(t)) return t
  if (hasGoodExpRationalIntegralStem(t) && !/\(\s*[A-D]\s*\)/i.test(t)) return t
  return EXP_RATIONAL_INTEGRAL_STEM
}

/** @param {string} blob */
export function expRationalIntegralCorrectIndices(blob) {
  if (!looksLikeExpRationalIntegralMcq(blob)) return null
  return [1, 2, 3]
}

/** @param {object} parsed */
export function repairExpRationalIntegralMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}\n${parsed._ocrSource ?? ''}`
  if (!looksLikeExpRationalIntegralMcq(blob)) return parsed

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  if (hasGoodExpRationalIntegralStem(parsed.text ?? '') && !expRationalIntegralOptionsNeedHeal(opts)) {
    return parsed
  }

  parsed.text = EXP_RATIONAL_INTEGRAL_STEM
  parsed.options = healExpRationalIntegralOptions(parsed.options)
  parsed.optionsFound = 4
  parsed.complete = true
  parsed.questionType = 'multiple_correct'
  parsed.correctIndices = expRationalIntegralCorrectIndices(blob) ?? [1, 2, 3]
  parsed.correctIndex = undefined
  parsed.answerSource = parsed.answerSource || 'ai_generated'
  parsed.answerConfidence = Math.max(Number(parsed.answerConfidence ?? 0), 88)

  const sol = String(parsed.solution ?? '')
  if (
    !sol.trim() ||
    /Blog,|2€|9¢|What is asked|Work it out\./i.test(sol) ||
    (/^\*\*Answer\.\*\*/m.test(sol) && !/\*\*Step\s*1/i.test(sol))
  ) {
    parsed.solution = EXP_RATIONAL_INTEGRAL_SOLUTION()
    parsed.solutionSource = 'ai_generated'
    parsed.solutionConfidence = 88
  }
  return parsed
}

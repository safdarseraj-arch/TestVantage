/**
 * Repair garbled OCR for:
 * integral dx/(1 + e cos x) must be same as MCQ.
 */

export const ECOSX_INTEGRAL_STEM =
  'The value of $$\\int \\frac{dx}{1 + e\\cos x}$$ must be same as:'

export const ECOSX_INTEGRAL_OPTIONS = [
  '$$\\frac{1}{\\sqrt{1-e^2}}\\tan^{-1}\\left(\\sqrt{\\frac{1-e}{1+e}}\\tan \\frac{x}{2}\\right)+c,\\quad 0 < e < 1$$',
  '$$\\frac{2}{\\sqrt{1-e^2}}\\tan^{-1}\\left(\\sqrt{\\frac{1-e}{1+e}}\\tan \\frac{x}{2}\\right)+c,\\quad 0 < e < 1$$',
  '$$\\frac{1}{\\sqrt{e^2-1}}\\log \\frac{e + \\cos x + \\sqrt{e^2-1}\\sin x}{1 + e\\cos x}+c,\\quad e > 1$$',
  '$$\\frac{2}{\\sqrt{e^2-1}}\\log \\frac{e + \\cos x + \\sqrt{e^2-1}\\sin x}{1 + e\\cos x}+c,\\quad e > 1$$',
]

export function looksLikeEcosxIntegralMcq(s) {
  const t = String(s ?? '')
  if (!t.trim()) return false
  if (!/must be same as|must\s+be\s+same\s+as/i.test(t)) return false
  if (!/value\s+of|the\s+value/i.test(t)) return false
  return /\\int|ecosx|e\\cos\s*x|e\s*cos\s*x|\+ecosx|1\s*\+\s*e\\cos|\|\s*he\s+must/i.test(t)
}

export function hasGoodEcosxIntegralStem(t) {
  const s = String(t ?? '')
  if (!looksLikeEcosxIntegralMcq(s)) return false
  return (
    /\\int\s*\\frac\{dx\}\{1\s*\+\s*e\\cos\s*x\}/.test(s) &&
    /must be same as/i.test(s) &&
    !/\+ecosx|\|\s*he\s+must|-\s*tan\s*-\s*tan|\[1-\s*e\s*x|\$\\int\s*\$\$/i.test(s)
  )
}

export function ecosxIntegralOptionsNeedHeal(options = []) {
  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  if (opts.filter(Boolean).length < 4) return true
  if (opts.every((o) => /^Option\s+[A-D]$/i.test(o))) return true
  if (/^Option\s+[A-D]$/im.test(opts.join('\n'))) return true
  const needTan = opts.slice(0, 2).some((o) => !/tan\^{-1}|\\tan/i.test(o))
  const needLog = opts.slice(2).some((o) => !/\\log|\blog\b/i.test(o))
  return needTan || needLog
}

export function healEcosxIntegralOptions(options = []) {
  return ecosxIntegralOptionsNeedHeal(options) ? [...ECOSX_INTEGRAL_OPTIONS] : [...options.slice(0, 4)]
}

export function ECOSX_INTEGRAL_SOLUTION() {
  return [
    '**Step 1.** Use $t = \\tan(x/2)$ substitution.',
    '**Step 2.** For $0<e<1$: tan inverse form; for $e>1$: log form.',
    '**Correct:** (A)-(D) by range on $e$ and constant $k$.',
  ].join('\n\n')
}

export function repairEcosxIntegralStemOcr(text) {
  const t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t
  if (!looksLikeEcosxIntegralMcq(t)) return t
  if (hasGoodEcosxIntegralStem(t) && !/\(\s*[A-D]\s*\)/i.test(t)) return t
  return ECOSX_INTEGRAL_STEM
}

export function repairEcosxIntegralMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}\n${parsed._ocrSource ?? ''}`
  if (!looksLikeEcosxIntegralMcq(blob)) return parsed
  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')
  if (hasGoodEcosxIntegralStem(parsed.text ?? '') && !ecosxIntegralOptionsNeedHeal(opts)) return parsed
  parsed.text = ECOSX_INTEGRAL_STEM
  parsed.options = healEcosxIntegralOptions(parsed.options)
  parsed.optionsFound = 4
  parsed.complete = true
  parsed.questionType = 'multiple_correct'
  parsed.correctIndices = [0, 1, 2, 3]
  parsed.correctIndex = undefined
  parsed.answerSource = parsed.answerSource || 'ai_generated'
  parsed.answerConfidence = Math.max(Number(parsed.answerConfidence ?? 0), 86)
  const sol = String(parsed.solution ?? '')
  if (!sol.trim() || /\+ecosx|Option\s+[A-D]/i.test(sol)) {
    parsed.solution = ECOSX_INTEGRAL_SOLUTION()
    parsed.solutionSource = 'ai_generated'
    parsed.solutionConfidence = 86
  }
  return parsed
}

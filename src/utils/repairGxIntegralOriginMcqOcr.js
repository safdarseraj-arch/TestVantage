/**
 * Repair garbled OCR for g(x) integral through origin MCQ.
 */

export const GX_INTEGRAL_ORIGIN_STEM =
  'A curve $g(x) = \\int x^{27}(1 + x + x^2)^6(6x^2 + 5x + 4)\\,dx$ is passing through origin, then:'

export const GX_INTEGRAL_ORIGIN_OPTIONS = [
  '$g(1) = \\dfrac{3^{7}}{7}$',
  '$g(1) = \\dfrac{2^{7}}{7}$',
  '$g(-1) = \\dfrac{1}{7}$',
  '$g(-1) = \\dfrac{3^{7}}{14}$',
]

export function looksLikeGxIntegralOriginMcq(s) {
  const t = String(s ?? '')
  if (!t.trim()) return false
  if (!/passing through origin/i.test(t)) return false
  if (!/\bg\s*\(\s*x\s*\)/i.test(t)) return false
  const poly = /6x\s*\^\s*2\s*\+\s*5x\s*\+\s*4|6x\^2\s*\+\s*5x\s*\+\s*4/i.test(t)
  const uPart = /1\s*\+\s*x\s*\+\s*x|l\s*\+\s*x\s*\+\s*x|x\?/i.test(t)
  const thenPart = /\bthen\s*:/i.test(t)
  return poly && (uPart || thenPart)
}

export function hasGoodGxIntegralOriginStem(t) {
  const s = String(t ?? '')
  if (!looksLikeGxIntegralOriginMcq(s)) return false
  return (
    /\\int\s*x\^\{27\}/.test(s) &&
    /\(1\s*\+\s*x\s*\+\s*x\^2\)\^6/.test(s) &&
    /6x\^2\s*\+\s*5x\s*\+\s*4/.test(s) &&
    !/\[\+|x\?|Ww\s+w=t|SREY/i.test(s)
  )
}

export function gxIntegralOriginOptionsNeedHeal(options = []) {
  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  if (opts.filter(Boolean).length < 4) return true
  if (opts.every((o) => /^Option\s+[A-D]$/i.test(o))) return true
  const aOk = /g\s*\(\s*1\s*\)/i.test(opts[0]) && /3\^\{?7\}?/.test(opts[0])
  const bOk = /g\s*\(\s*1\s*\)/i.test(opts[1]) && /2\^\{?7\}?/.test(opts[1])
  const cOk = /g\s*\(\s*-1\s*\)/i.test(opts[2]) && /1\s*\/\s*7|dfrac\{1\}\{7\}/.test(opts[2])
  const dOk = /g\s*\(\s*-1\s*\)/i.test(opts[3]) && /14/.test(opts[3])
  return !(aOk && bOk && cOk && dOk)
}

export function healGxIntegralOriginOptions(options = []) {
  return gxIntegralOriginOptionsNeedHeal(options)
    ? [...GX_INTEGRAL_ORIGIN_OPTIONS]
    : [...options.slice(0, 4)]
}

export function GX_INTEGRAL_ORIGIN_SOLUTION() {
  return [
    '**Step 1.** Note $\\dfrac{d}{dx}[x^{28}(1+x+x^2)^{7}] = 7x^{27}(1+x+x^2)^{6}(6x^{2}+5x+4)$.',
    '**Step 2.** So $g(x) = \\dfrac{x^{28}(1+x+x^2)^{7}}{7}$. Through origin: $g(0)=0$.',
    '**Step 3.** $g(1) = \\dfrac{3^{7}}{7}$ and $g(-1) = \\dfrac{1}{7}$.',
    '**Correct:** (A), (C)',
  ].join('\n\n')
}

export function repairGxIntegralOriginStemOcr(text) {
  const t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t
  if (!looksLikeGxIntegralOriginMcq(t)) return t
  if (hasGoodGxIntegralOriginStem(t) && !/\(\s*[A-D]\s*\)/i.test(t) && !/Ww\s+w=t|SREY/i.test(t)) return t
  return GX_INTEGRAL_ORIGIN_STEM
}

export function repairGxIntegralOriginMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}\n${parsed._ocrSource ?? ''}`
  if (!looksLikeGxIntegralOriginMcq(blob)) return parsed
  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')
  if (hasGoodGxIntegralOriginStem(parsed.text ?? '') && !gxIntegralOriginOptionsNeedHeal(opts)) return parsed
  parsed.text = GX_INTEGRAL_ORIGIN_STEM
  parsed.options = healGxIntegralOriginOptions(parsed.options)
  parsed.optionsFound = 4
  parsed.complete = true
  parsed.questionType = 'multiple_correct'
  parsed.correctIndices = [0, 2]
  parsed.correctIndex = undefined
  parsed.answerSource = parsed.answerSource || 'ai_generated'
  parsed.answerConfidence = Math.max(Number(parsed.answerConfidence ?? 0), 88)
  const sol = String(parsed.solution ?? '')
  if (!sol.trim() || /\[\+|Ww\s+w=t|SREY|Option\s+[A-D]/i.test(sol)) {
    parsed.solution = GX_INTEGRAL_ORIGIN_SOLUTION()
    parsed.solutionSource = 'ai_generated'
    parsed.solutionConfidence = 88
  }
  return parsed
}

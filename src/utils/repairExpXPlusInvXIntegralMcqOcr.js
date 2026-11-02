/**
 * Repair garbled OCR for:
 * ∫ (1 + x − x^{-1}) e^{x + x^{-1}} dx
 * (A) (x+1) e^{x+x^{-1}} + C
 * (B) (x-1) e^{x+x^{-1}} + C
 * (C) −x e^{x+x^{-1}} + C
 * (D) x e^{x+x^{-1}} + C   ← correct
 *
 * d/dx [ x e^{x+1/x} ] = e^{x+1/x} + x e^{x+1/x}(1−1/x^2)
 *   = e^{x+1/x}[1 + x − 1/x] = (1+x−x^{-1}) e^{x+x^{-1}}.
 */

export const EXP_X_PLUS_INV_X_INTEGRAL_STEM =
  '$$\\int(1+x-x^{-1})e^{x+x^{-1}}\\,dx$$'

export const EXP_X_PLUS_INV_X_INTEGRAL_OPTIONS = [
  '$(x+1)e^{x+x^{-1}}+C$',
  '$(x-1)e^{x+x^{-1}}+C$',
  '$-xe^{x+x^{-1}}+C$',
  '$xe^{x+x^{-1}}+C$',
]

/** @param {string} s */
export function looksLikeExpXPlusInvXIntegralMcq(s) {
  const t = String(s ?? '')
  if (!t.trim()) return false

  // Do not steal other dedicated integral plugins.
  if (/passing through origin/i.test(t) && /\bg\s*\(\s*x\s*\)/i.test(t)) return false
  if (/QInx/i.test(t) || /241\s*\|/.test(t) || /LU\s*I\s*ne/i.test(t)) return false
  if (/x\^\{x\^2\s*\+\s*1\}/.test(t)) return false
  if (/gsmx\s*\+\s*cosx|egrsmxteosx|grsmatcosx/i.test(t)) return false
  if (/\[e\s*\[2\s*cose/i.test(t) || (/g\s*\(\s*x\s*\)\s*\+\s*K/i.test(t) && /tan\s*x|cose/i.test(t))) {
    return false
  }
  if (/\bdx\b/i.test(t) && /xX\s*1\s*\)/i.test(t) && /\\times|xt\s*C/i.test(t)) return false

  // Screenshot soup: "$- oC XX A AL (x -1) \vec{c} x - eT ax (B) Fel +C |x ne +C"
  if (/oC\s*XX\s*A\s*AL/i.test(t) && /\(x\s*-1\)/i.test(t)) return true
  if (/eT\s*ax/i.test(t) && /Fel\s*\+C/i.test(t)) return true
  if (/\(x\s*-1\)/i.test(t) && /\\vec\{c\}/i.test(t) && /\(\s*B\s*\)/i.test(t) && /\+C/i.test(t)) {
    return true
  }
  if (/x\s*ne\s*\+C/i.test(t) && /\(x\s*-1\)/i.test(t) && /eT\s*ax|Fel\s*\+C/i.test(t)) return true

  if (
    /1\s*\+\s*x\s*-\s*x\^\{?-1\}/.test(t) &&
    /e\^\{x\s*\+\s*x\^\{?-1\}/.test(t)
  ) {
    return true
  }
  if (/\\int/.test(t) && /x\^\{?-1\}/.test(t) && /e\^\{x\s*\+\s*x/.test(t) && /\(x\s*\+\s*1\)|\(x\s*-1\)/.test(t)) {
    return true
  }
  return false
}

/** @param {string} t */
export function hasGoodExpXPlusInvXIntegralStem(t) {
  const s = String(t ?? '')
  if (!looksLikeExpXPlusInvXIntegralMcq(s)) return false
  return (
    /\\int\s*\(1\s*\+\s*x\s*-\s*x\^\{?-1\}/.test(s) &&
    /e\^\{x\s*\+\s*x\^\{?-1\}/.test(s) &&
    !/oC\s*XX|eT\s*ax|Fel\s*\+C|\\vec\{c\}/i.test(s)
  )
}

/** @param {string[]} [options] */
export function expXPlusInvXIntegralOptionsNeedHeal(options = []) {
  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  if (opts.filter(Boolean).length < 4) return true
  if (opts.some((o) => /Graph\/diagram|^Option\s+[A-D]$/i.test(o))) return true
  const aOk = /\(x\s*\+\s*1\)/.test(opts[0]) && /e\^\{x/.test(opts[0])
  const bOk = /\(x\s*-1\)/.test(opts[1]) && /e\^\{x/.test(opts[1])
  const cOk = /-\s*x\s*e\^\{x|^\$?-x/.test(opts[2])
  const dOk = /\$x\s*e\^\{x|^\$?xe\^\{x/.test(opts[3]) && !/\(x/.test(opts[3])
  return !(aOk && bOk && cOk && dOk)
}

/** @param {string[]} [options] */
export function healExpXPlusInvXIntegralOptions(options = []) {
  return expXPlusInvXIntegralOptionsNeedHeal(options)
    ? [...EXP_X_PLUS_INV_X_INTEGRAL_OPTIONS]
    : [...options.slice(0, 4)]
}

export function EXP_X_PLUS_INV_X_INTEGRAL_SOLUTION() {
  return [
    '**Step 1.** Differentiate $x\\,e^{x+x^{-1}}$ by the product rule.',
    '**Step 2.** $\\dfrac{d}{dx}[x+x^{-1}]=1-x^{-2}$, so the second factor contributes $x(1-x^{-2})=x-x^{-1}$.',
    '**Step 3.** Total: $e^{x+x^{-1}}\\bigl(1+x-x^{-1}\\bigr)$. That matches the integrand, so the antiderivative is $x e^{x+x^{-1}}+C$.',
    '**Correct:** (D)',
  ].join('\n\n')
}

/** @param {string} text */
export function repairExpXPlusInvXIntegralStemOcr(text) {
  const t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t
  if (!looksLikeExpXPlusInvXIntegralMcq(t)) return t
  if (hasGoodExpXPlusInvXIntegralStem(t) && !/\(\s*[A-D]\s*\)/i.test(t)) return t
  return EXP_X_PLUS_INV_X_INTEGRAL_STEM
}

/** @param {object} parsed */
export function repairExpXPlusInvXIntegralMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const parts = [parsed.text ?? '', (parsed.options ?? []).join('\n'), parsed._ocrSource ?? '']
  if (!parts.some((p) => looksLikeExpXPlusInvXIntegralMcq(p))) return parsed

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  if (hasGoodExpXPlusInvXIntegralStem(parsed.text ?? '') && !expXPlusInvXIntegralOptionsNeedHeal(opts)) {
    return parsed
  }

  parsed.text = EXP_X_PLUS_INV_X_INTEGRAL_STEM
  parsed.options = healExpXPlusInvXIntegralOptions(parsed.options)
  parsed.optionsFound = 4
  parsed.complete = true
  parsed.questionType = 'single_correct'
  parsed.correctIndices = [3]
  parsed.correctIndex = 3
  parsed.answerSource = parsed.answerSource || 'ai_generated'
  parsed.answerConfidence = Math.max(Number(parsed.answerConfidence ?? 0), 90)

  const sol = String(parsed.solution ?? '')
  if (
    !sol.trim() ||
    /oC\s*XX|eT\s*ax|Fel\s*\+C|Graph\/diagram|Option\s+[A-D]|\\vec\{c\}/i.test(sol)
  ) {
    parsed.solution = EXP_X_PLUS_INV_X_INTEGRAL_SOLUTION()
    parsed.solutionSource = 'ai_generated'
    parsed.solutionConfidence = 90
  }
  return parsed
}

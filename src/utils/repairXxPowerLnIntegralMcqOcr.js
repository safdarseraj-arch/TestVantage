/**
 * Repair garbled OCR for:
 * integral x^{x^2+1}(2 ln x + 1) dx with antiderivative options involving + C.
 * Correct: (D) (x^x)^x + C  because (x^x)^x = x^{x^2}.
 */

export const XX_POWER_LN_INTEGRAL_STEM =
  '$$\\int x^{x^2+1}(2\\ln x + 1)\\,dx$$'

export const XX_POWER_LN_INTEGRAL_OPTIONS = [
  '$x^{2x}+C$',
  '$x^2 \\ln x + C$',
  '$x^{(x^x)}+C$',
  '$(x^x)^x+C$',
]

/** @param {string} s */
export function looksLikeXxPowerLnIntegralMcq(s) {
  const t = String(s ?? '')
  if (!t.trim()) return false

  // Do not steal other dedicated integral plugins (check pieces, never a concatenated blob).
  if (/passing through origin/i.test(t) && /\bg\s*\(\s*x\s*\)/i.test(t)) return false
  if (/must be same as/i.test(t) && /e\\cos|ecosx|e\s*cos\s*x/i.test(t)) return false
  if (/Ax\s*\+\s*B/i.test(t) && /9e|log_e\(9/i.test(t)) return false
  // Already-healed sibling integrals.
  if (/\\int\s*\(1\s*\+\s*x\s*-\s*x\^\{?-1\}/.test(t) && /e\^\{x\s*\+\s*x\^\{?-1\}/.test(t)) {
    return false
  }
  if (/2\\tan\s*x/.test(t) && /\\csc\^/.test(t) && /g\\left|g\s*\(\s*x\s*\)/.test(t) && /\\int/.test(t)) {
    return false
  }
  // Screenshot 202333: e^{x sin x + cos x} fraction — not this power-ln MCQ.
  if (
    /xsinx\s*\+\s*cos\s*x|gsmx\s*\+\s*cosx|egrsmxteosx|grsmatcosx/i.test(t) &&
    !/QInx|2\s*(?:ln|In)\s*x|LU\s*I\s*ne/i.test(t)
  ) {
    return false
  }
  // tan-csc g(x)+K integer MCQ
  if (/\[e\s*\[2\s*cose/i.test(t) || (/g\s*\(\s*x\s*\)\s*\+\s*K/i.test(t) && /tan\s*x|cose/i.test(t))) {
    return false
  }
  // ∫ (1+x-x^{-1}) e^{x+x^{-1}} soup — "oC XX" / "x ne +C" is not xX 1) dx
  if (/oC\s*XX\s*A\s*AL/i.test(t) && /\(x\s*-1\)/i.test(t) && !/LU\s*I\s*ne|xX\s*1\s*\)|QInx|241\s*\|/i.test(t)) {
    return false
  }
  if (/eT\s*ax/i.test(t) && /Fel\s*\+C/i.test(t) && !/LU\s*I\s*ne|xX\s*1\s*\)|QInx|241\s*\|/i.test(t)) {
    return false
  }

  if (/x\^\{x\^2\s*\+\s*1\}/.test(t) && /2\\ln\s*x|2\s*\\ln\s*x|\(2\\ln/.test(t)) return true
  if (/\\int\s*x\^\{x\^2\s*\+\s*1\}/.test(t)) return true

  // Screenshot OCR: "241 | 1 QInx + 1)dx A FC"
  if (/QInx/i.test(t) && /\bdx\b/i.test(t)) return true
  if (/241\s*\|/.test(t) && (/\+ 1\)dx/i.test(t) || /QInx/i.test(t))) return true

  // Cloud/builtin soup: "LU I ne" + "xX 1) dx" + times$$3 — options may be Option A–D stubs.
  // Keep tokens specific: bare dx+ne+XX also appears in the e^{x+1/x} soup.
  if (/LU\s*I?\s*ne/i.test(t) && (/dx/i.test(t) || /xX\s*1/i.test(t) || /\\times/i.test(t))) return true
  if (/xX\s*1\s*\)/i.test(t) && /dx/i.test(t)) return true
  if (/\\times\s*\$\$?\s*3/i.test(t) && (/LU/i.test(t) || /\bne\b/i.test(t)) && /dx/i.test(t)) return true
  if (/xt\s*C/i.test(t) && /xX\s*1\s*\)/i.test(t)) return true

  // Source-image OCR (builtin): 2 ln x / 2Inx with nested x^{x2+1} without QInx
  if (/\bdx\b/i.test(t) && /2\s*(?:ln|In|log)\s*x/i.test(t) && /x\^\{?x\^?2/i.test(t)) return true
  if (/\bdx\b/i.test(t) && /x\^\{?x\^?2\s*\+\s*1/i.test(t)) return true

  const hasDx = /\bdx\b|\\int/i.test(t)
  const has2x = /x\^\{2x\}|x\^2x\b/.test(t)
  const hasTower = /\(x\s*\^\s*x\)\s*\^\s*x|x\^\{?\(x\s*\^\s*x\)\}?/.test(t)
  if (hasDx && has2x && hasTower) return true

  if (/\bdx\b|QInx/i.test(t) && /Lhx\s*\+\s*C/i.test(t)) return true
  if (/\bdx\b/i.test(t) && /\(FY\s*\+\s*C/i.test(t)) return true

  return false
}

/** @param {string} t */
export function hasGoodXxPowerLnIntegralStem(t) {
  const s = String(t ?? '')
  if (!looksLikeXxPowerLnIntegralMcq(s)) return false
  return (
    /\\int\s*x\^\{x\^2\s*\+\s*1\}/.test(s) &&
    /2\\ln\s*x/.test(s) &&
    !/QInx|241\s*\||LU\s*I\s*ne|xX\s*1\s*\)/i.test(s)
  )
}

/** @param {string[]} [options] */
export function xxPowerLnIntegralOptionsNeedHeal(options = []) {
  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  if (opts.filter(Boolean).length < 4) return true
  if (opts.some((o) => /Graph\/diagram/i.test(o) || /^Option\s+[A-D]$/i.test(o))) return true
  const aOk = /x\^\{?2x\}?/.test(opts[0])
  const bOk = /x\^2/.test(opts[1]) && /\\ln|\bln\b/i.test(opts[1])
  const cOk = /x\^\{?\(x\s*\^\s*x\)\}?/.test(opts[2])
  const dOk = /\(x\s*\^\s*x\)\s*\^\s*x/.test(opts[3])
  return !(aOk && bOk && cOk && dOk)
}

/** @param {string[]} [options] */
export function healXxPowerLnIntegralOptions(options = []) {
  return xxPowerLnIntegralOptionsNeedHeal(options)
    ? [...XX_POWER_LN_INTEGRAL_OPTIONS]
    : [...options.slice(0, 4)]
}

export function XX_POWER_LN_INTEGRAL_SOLUTION() {
  return [
    '**Step 1.** Let $y = x^{x^2}$. Then $\\ln y = x^2 \\ln x$.',
    '**Step 2.** Differentiate: $\\dfrac{y\\prime}{y} = 2x\\ln x + x$, so $y\\prime = x^{x^2}(2x\\ln x + x) = x^{x^2+1}(2\\ln x + 1)$.',
    '**Step 3.** Therefore $\\int x^{x^2+1}(2\\ln x + 1)\\,dx = x^{x^2} + C$.',
    '**Step 4.** Note $(x^x)^x = x^{x\\cdot x} = x^{x^2}$, which is option (D). Option (C) $x^{(x^x)} = x^{x^x}$ is a different tower.',
    '**Correct:** (D)',
  ].join('\n\n')
}

/** @param {string} text */
export function repairXxPowerLnIntegralStemOcr(text) {
  const t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t
  if (!looksLikeXxPowerLnIntegralMcq(t)) return t
  if (hasGoodXxPowerLnIntegralStem(t) && !/\(\s*[A-D]\s*\)/i.test(t)) return t
  return XX_POWER_LN_INTEGRAL_STEM
}

/** @param {object} parsed */
export function repairXxPowerLnIntegralMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  // Detect on each piece — concatenating a healed sibling stem with this OCR source
  // used to false-positive (dx from one integral + XX/ne from another).
  const parts = [parsed.text ?? '', (parsed.options ?? []).join('\n'), parsed._ocrSource ?? '']
  if (!parts.some((p) => looksLikeXxPowerLnIntegralMcq(p))) return parsed

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  if (hasGoodXxPowerLnIntegralStem(parsed.text ?? '') && !xxPowerLnIntegralOptionsNeedHeal(opts)) {
    return parsed
  }

  parsed.text = XX_POWER_LN_INTEGRAL_STEM
  parsed.options = healXxPowerLnIntegralOptions(parsed.options)
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
    /QInx|241\s*\||Graph\/diagram|Lhx\s*\+\s*C|Option\s+[A-D]|LU\s*I\s*ne|xX\s*1\s*\)/i.test(sol)
  ) {
    parsed.solution = XX_POWER_LN_INTEGRAL_SOLUTION()
    parsed.solutionSource = 'ai_generated'
    parsed.solutionConfidence = 90
  }
  return parsed
}

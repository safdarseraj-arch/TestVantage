/** JEE SCQ: If f:R→R and (f(x+1))x = 8, x>0 — options 4, 8, 32, 64. */

export const FX_PLUS_ONE_TIMES_EIGHT_STEM =
  'If $f : \\mathbb{R} \\to \\mathbb{R}$ is a function such that $(f(x+1))x = 8$, $x > 0$, then the value is equal to'

export const FX_PLUS_ONE_TIMES_EIGHT_OPTIONS = ['$4$', '$8$', '$32$', '$64$']

/** @param {string} t */
export function looksLikeFxPlusOneTimesEightMcq(t) {
  const s = String(t ?? '')
  if (/x\s*\^?\s*2\s*\+\s*1|\b256\b|R\s*\^?\s*\+|x\^\{?1\/4/i.test(s)) return false
  if (!/function\s+such\s+that/i.test(s)) return false
  if (!/\bf\s*[:(]/i.test(s)) return false
  const hasFxPlusOne =
    /f\s*\(\s*x\s*\+\s*1\s*\)/i.test(s) ||
    /fx\s*\+\s*1|fx\*|f\s*x\s*\+\s*1|\(\s*fx/i.test(s)
  const hasTimesEight = /\bx\s*=\s*8\b/i.test(s) || /=\s*8\s*[,)]/i.test(s) || /"\s*=\s*8/i.test(s)
  const hasDomain = /x\s*>\s*0/i.test(s) || /then\s+the\s+value/i.test(s)
  return hasFxPlusOne && hasTimesEight && hasDomain
}

/** @param {string} t */
function stemNeedsCanonicalRepair(t) {
  const s = String(t ?? '')
  if (!looksLikeFxPlusOneTimesEightMcq(s)) return false
  if (/R\s*\^?\s*2|R\^2|fx\*|"\s*=\s*8|\(\s*\+\s*\(/i.test(s)) return true
  if (!/\(f\s*\(\s*x\s*\+\s*1\s*\)\)\s*x/i.test(s) && !/\$.*f\(x\+1\)/i.test(s)) return true
  if (/\(\s*[A-D]\s*\)/i.test(s) && s.length > FX_PLUS_ONE_TIMES_EIGHT_STEM.length + 20) return true
  return false
}

/** @param {string[]} [options] */
export function fxPlusOneTimesEightOptionsNeedHeal(options = []) {
  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  if (opts.filter(Boolean).length < 4) return true
  const nums = opts.filter((o) => /^-?\d+$/.test(o.replace(/\$/g, '')) || /^\$\d+\$$/.test(o))
  if (nums.length < 4) return true
  return false
}

/** @param {string} text */
export function repairFxPlusOneTimesEightMcqOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t
  t = t.replace(/^\s*(?:[a-z]\s+)?\d{1,3}\s+/i, '')
  if (!looksLikeFxPlusOneTimesEightMcq(t)) return t
  if (!stemNeedsCanonicalRepair(t)) return t
  const optBlock = FX_PLUS_ONE_TIMES_EIGHT_OPTIONS.map(
    (o, i) => `(${String.fromCharCode(65 + i)}) ${o}`,
  ).join('\n')
  return `${FX_PLUS_ONE_TIMES_EIGHT_STEM}\n${optBlock}`
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, _ocrSource?: string }} parsed
 */
export function repairFxPlusOneTimesEightMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}\n${parsed._ocrSource ?? ''}`
  if (!looksLikeFxPlusOneTimesEightMcq(blob)) return parsed

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  if (stemNeedsCanonicalRepair(`${parsed.text ?? ''}\n${blob}`) || fxPlusOneTimesEightOptionsNeedHeal(opts)) {
    parsed.text = FX_PLUS_ONE_TIMES_EIGHT_STEM
    for (let i = 0; i < 4; i++) opts[i] = FX_PLUS_ONE_TIMES_EIGHT_OPTIONS[i]
    parsed.options = opts
    parsed.optionsFound = 4
    parsed.complete = true
  }
  return parsed
}

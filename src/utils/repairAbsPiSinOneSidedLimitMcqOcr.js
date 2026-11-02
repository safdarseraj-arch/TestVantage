/**
 * Let f(x) = |x+π| / sin x — one-sided limits / existence SCQ (text options).
 * OCR often merges A–D into the stem and destroys f(x) / the fraction.
 */

import { normalizeOptionMarkersInText } from './mcqOptionMarkers.js'
import { parseQuestionText } from './parseQuestionText.js'

export const ABS_PI_SIN_ONE_SIDED_LIMIT_STEM =
  'Let $f(x) = \\dfrac{|x+\\pi|}{\\sin x}$, then :'

export const ABS_PI_SIN_ONE_SIDED_LIMIT_OPTIONS = [
  '$f(-\\pi^{+}) = -1$',
  '$f(-\\pi^{-}) = 1$',
  '$\\lim_{x \\to -\\pi} f(x)$ does not exist',
  '$\\lim_{x \\to \\pi} f(x)$ does not exist',
]

/** @param {string} t */
export function looksLikeAbsPiSinOneSidedLimitMcq(t) {
  const s = String(t ?? '').replace(/\r\n/g, '\n')
  if (!s.trim()) return false

  // Avoid nearby period / GI / one-one plugins
  if (/\bperiod\s+of\b/i.test(s) && /\bmin\b|\\min/i.test(s)) return false
  if (/\bone[- ]?one|onto\b/i.test(s) && /\bintegral\s+part|greatest\s+integer/i.test(s)) {
    return false
  }

  const hasAbsPi =
    /\|?\s*x\s*\+\s*(?:\\?pi|π)\s*\|?/i.test(s) ||
    /\|x\+\\pi\|/i.test(s) ||
    /x\s*\+\s*pi/i.test(s) ||
    /\|x\+pi\|/i.test(s)
  const hasSin = /\bsin\s*x\b|\\sin\s*x|sinx|\/\s*sin/i.test(s)
  const hasFx =
    /\bf\s*\(\s*x\s*\)/i.test(s) ||
    /\bLet\s+f\b/i.test(s) ||
    /\bLet\s+Fn?\s*\)/i.test(s) ||
    /\bf\s*\(\s*-\s*(?:\\?pi|π)/i.test(s)
  const hasOneSidedOrLim =
    /(?:\\?pi|π)\s*\^\s*\{?\s*[+\-−⁺⁻]/i.test(s) ||
    /f\s*\(\s*-\s*(?:\\?pi|π)/i.test(s) ||
    /\blim\b|\\lim/i.test(s) ||
    /does\s+not\s+exist/i.test(s)

  if (hasAbsPi && hasSin && (hasFx || hasOneSidedOrLim)) return true
  if (hasAbsPi && hasSin && /\bthen\s*:/i.test(s)) return true
  // Garbled OCR: "Let Fn) , then : sinx f(- π^+ )=-1" + lim options
  if (
    hasFx &&
    hasSin &&
    hasOneSidedOrLim &&
    /\bthen\s*:/i.test(s) &&
    /does\s+not\s+exist/i.test(s)
  ) {
    return true
  }
  if (hasFx && hasOneSidedOrLim && /sinx|\\sin\s*x/i.test(s) && /π|\\pi|pi/i.test(s)) {
    return true
  }
  return false
}

/** @param {string} t */
function hasGoodAbsPiSinStem(t) {
  const s = String(t ?? '')
  return (
    /\\dfrac\{\|x\+\\pi\|\}\{\\sin\s*x\}|\\frac\{\|x\+\\pi\|\}\{\\sin\s*x\}/.test(s) &&
    /Let\s+\$?f\s*\(\s*x\s*\)/i.test(s) &&
    /\bthen\s*:/i.test(s) &&
    !/\(\s*[A-D]\s*\)/i.test(s) &&
    !/f\s*\(\s*-\\pi/i.test(s.slice(s.search(/\bthen\b/i) + 4))
  )
}

/** @param {string} t */
function stemNeedsCanonicalRepair(t) {
  const s = String(t ?? '')
  if (!looksLikeAbsPiSinOneSidedLimitMcq(s)) return false
  if (hasGoodAbsPiSinStem(s)) return false
  if (/Let\s+Fn?\s*\)/i.test(s)) return true
  if (/\(\s*[A-D]\s*\)/i.test(s)) return true
  if (/sinx\s+f\s*\(/i.test(s)) return true
  if (!/\|x\+\\pi\||\\dfrac\{\|x\+\\pi\||\\frac\{\|x\+\\pi\|/.test(s)) return true
  if (/f\s*\(\s*-\s*(?:\\?pi|π)/i.test(s) && /\bthen\b/i.test(s)) return true
  return s.length > ABS_PI_SIN_ONE_SIDED_LIMIT_STEM.length + 40
}

/** @param {string} opt @param {number} i */
function optionLooksLikeSlot(opt, i) {
  const t = String(opt ?? '').trim()
  if (!t) return false
  if (i === 0) return /f\s*\(\s*-?\s*(?:\\?pi|π).*?\^\s*\{?\s*\+|=\s*-?\s*1/i.test(t)
  if (i === 1) return /f\s*\(\s*-?\s*(?:\\?pi|π).*?\^\s*\{?\s*-|=\s*1(?!\d)/i.test(t)
  if (i === 2) {
    return (
      (/\\lim|lim/i.test(t) && /-\s*(?:\\?pi|π)/i.test(t) && /does\s+not\s+exist/i.test(t)) ||
      (/\\lim|lim/i.test(t) && /-\s*(?:\\?pi|π)/i.test(t)) ||
      /does\s+not\s+exist/i.test(t)
    )
  }
  if (i === 3) {
    return (
      (/\\lim|lim/i.test(t) && /(?:\\to|→|->)\s*(?:\\?pi|π)/i.test(t) && /does\s+not\s+exist/i.test(t)) ||
      (/\\lim|lim/i.test(t) && /x\s*→\s*(?:\\?pi|π)|to\s+(?:\\?pi|π)/i.test(t) && !/-\s*(?:\\?pi|π)/i.test(t)) ||
      (/\\lim|lim/i.test(t) && /(?:\\?pi|π)/i.test(t) && !/-\s*(?:\\?pi|π)/i.test(t))
    )
  }
  return false
}

/** @param {string} blob */
function extractAbsPiSinOptions(blob) {
  const s = normalizeOptionMarkersInText(String(blob ?? ''))
  /** @type {string[]} */
  const out = ['', '', '', '']
  const parsed = parseQuestionText(s)
  if ((parsed.optionsFound ?? 0) >= 2) {
    for (let i = 0; i < 4; i += 1) {
      const o = String(parsed.options?.[i] ?? '').trim()
      if (optionLooksLikeSlot(o, i) || /pi|π|lim|exist|f\s*\(/i.test(o)) {
        out[i] = ABS_PI_SIN_ONE_SIDED_LIMIT_OPTIONS[i]
      }
    }
  }
  // Marker-based fallbacks when parse failed
  if (
    /\(\s*A\s*\)[^(\n]{0,80}f\s*\([^)]*(?:\\?pi|π)/i.test(s) ||
    /\(\s*A\s*\)[^(\n]{0,40}=\s*-?\s*1/i.test(s)
  ) {
    out[0] = ABS_PI_SIN_ONE_SIDED_LIMIT_OPTIONS[0]
  }
  if (
    /\(\s*B\s*\)[^(\n]{0,80}f\s*\([^)]*(?:\\?pi|π)/i.test(s) ||
    /\(\s*B\s*\)[^(\n]{0,40}=\s*1/i.test(s)
  ) {
    out[1] = ABS_PI_SIN_ONE_SIDED_LIMIT_OPTIONS[1]
  }
  if (/\(\s*C\s*\)[^(\n]{0,100}(?:lim|does\s+not\s+exist)/i.test(s)) {
    out[2] = ABS_PI_SIN_ONE_SIDED_LIMIT_OPTIONS[2]
  }
  if (/\(\s*D\s*\)[^(\n]{0,100}(?:lim|does\s+not\s+exist)/i.test(s)) {
    out[3] = ABS_PI_SIN_ONE_SIDED_LIMIT_OPTIONS[3]
  }
  return out
}

/** @param {string[]} options @param {string} blob */
function canonicalizeAbsPiSinOptions(options, blob) {
  const extracted = extractAbsPiSinOptions(blob)
  const out = [...(options ?? [])]
  while (out.length < 4) out.push('')
  for (let i = 0; i < 4; i += 1) {
    const cur = String(out[i] ?? '').trim()
    if (extracted[i]) {
      out[i] = extracted[i]
      continue
    }
    if (!cur || /tabular|hline|Graph\s*[A-D]|Fn\)|sinx\s+f\(/i.test(cur)) {
      out[i] = ABS_PI_SIN_ONE_SIDED_LIMIT_OPTIONS[i]
      continue
    }
    // Truncated lim without "does not exist" — always restore full C/D.
    if (
      (i === 2 || i === 3) &&
      /\\lim|\blim\b/i.test(cur) &&
      !/\bdoes\s+not\s+exist\b/i.test(cur)
    ) {
      out[i] = ABS_PI_SIN_ONE_SIDED_LIMIT_OPTIONS[i]
      continue
    }
    if (optionLooksLikeSlot(cur, i) || /pi|π|lim|exist|f\s*\(/i.test(cur)) {
      out[i] = ABS_PI_SIN_ONE_SIDED_LIMIT_OPTIONS[i]
    }
  }
  // If still empty after detection, fill canonical A–D for this known MCQ
  const filled = out.filter((o) => String(o ?? '').trim()).length
  if (filled < 4 && looksLikeAbsPiSinOneSidedLimitMcq(blob)) {
    for (let i = 0; i < 4; i += 1) {
      if (!String(out[i] ?? '').trim()) out[i] = ABS_PI_SIN_ONE_SIDED_LIMIT_OPTIONS[i]
    }
  }
  return out.slice(0, 4)
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, complete?: boolean, _ocrSource?: string }} parsed
 */
export function repairAbsPiSinOneSidedLimitMcqParse(parsed) {
  const blob = [parsed._ocrSource, parsed.text, ...(parsed.options ?? [])]
    .filter(Boolean)
    .join('\n')
  if (!looksLikeAbsPiSinOneSidedLimitMcq(blob)) return parsed

  let text = String(parsed.text ?? '')
  if (stemNeedsCanonicalRepair(text) || stemNeedsCanonicalRepair(blob)) {
    text = ABS_PI_SIN_ONE_SIDED_LIMIT_STEM
  } else if (!hasGoodAbsPiSinStem(text)) {
    text = ABS_PI_SIN_ONE_SIDED_LIMIT_STEM
  }

  const options = canonicalizeAbsPiSinOptions(parsed.options ?? [], blob)
  const found = options.filter((o) => String(o ?? '').trim()).length
  return {
    ...parsed,
    text,
    options,
    optionsFound: Math.max(found, parsed.optionsFound ?? 0, 4),
    complete: found >= 4,
  }
}

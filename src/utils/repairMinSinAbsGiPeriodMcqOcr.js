/**
 * Period of f(x) = min{sin x, |x|} + {x/π} — greatest-integer MCQ (π/2, π, 2π, 4π).
 */

import { normalizeOptionMarkersInText } from './mcqOptionMarkers.js'
import { parseQuestionText } from './parseQuestionText.js'
import { stripOcrHlineTableArtifact } from './repairF0MoebiusFunctionalMcqOcr.js'

export const MIN_SIN_ABS_GI_PERIOD_STEM =
  'Period of function $f(x) = \\min\\{\\sin x, |x|\\} + \\frac{x}{\\pi} - \\left[\\frac{x}{\\pi}\\right]$ (where $[.]$ denotes greatest integer function) is -'

export const MIN_SIN_ABS_GI_PERIOD_OPTIONS = [
  '$\\frac{\\pi}{2}$',
  '$\\pi$',
  '$2\\pi$',
  '$4\\pi$',
]

/** @param {string} t */
export function looksLikeMinSinAbsGiPeriodMcq(t) {
  const s = String(t ?? '').replace(/\r\n/g, '\n')
  if (!/\bperiod\s+of\s+(?:the\s+)?(?:function\s+)?f\s*\(/i.test(s) && !/\bperiod\s+of\s+function\b/i.test(s)) {
    return false
  }
  if (!/\bmin\b|\\min/i.test(s) || !/\bsin\b|\\sin/i.test(s)) return false
  if (!/greatest\s+integer/i.test(s)) return false
  if (/\bfundamental\s+period\b/i.test(s) && /\bT\s*[_\s]?1\b|T₁|T\u2081/i.test(s)) return false
  return true
}

/** @param {string} text */
export function repairMinSinAbsGiPeriodStemOcr(text) {
  const t = stripOcrHlineTableArtifact(String(text ?? ''))
  if (!looksLikeMinSinAbsGiPeriodMcq(t)) return String(text ?? '')
  return MIN_SIN_ABS_GI_PERIOD_STEM
}

/** @param {string} blob */
function extractMinSinAbsGiPeriodOptions(blob) {
  const s = normalizeOptionMarkersInText(String(blob ?? ''))
  /** @type {string[]} */
  const out = ['', '', '', '']
  if (/\(\s*A\s*\)[^(\n]{0,40}(?:\\frac\s*\{\s*\\?pi\s*\}\s*\{\s*2\s*\}|(?:pi|π)\s*\/\s*2)/i.test(s)) {
    out[0] = MIN_SIN_ABS_GI_PERIOD_OPTIONS[0]
  }
  if (/\(\s*B\s*\)[^(\n]{0,24}(?:\\pi|π)(?!\s*\/)/i.test(s) || /\(\s*B\s*\)\s*\\pi\b/i.test(s)) {
    out[1] = MIN_SIN_ABS_GI_PERIOD_OPTIONS[1]
  }
  if (/\(\s*C\s*\)[^(\n]{0,24}2\s*(?:\\pi|π)/i.test(s)) out[2] = MIN_SIN_ABS_GI_PERIOD_OPTIONS[2]
  if (/\(\s*D\s*\)[^(\n]{0,24}4\s*(?:\\pi|π)/i.test(s)) out[3] = MIN_SIN_ABS_GI_PERIOD_OPTIONS[3]
  if (!out[0] && /pi\s*\/\s*2|π\/2/i.test(s)) out[0] = MIN_SIN_ABS_GI_PERIOD_OPTIONS[0]
  if (!out[1] && /(?:^|[^\d/])(?:\\pi|π)(?!\s*\/)/i.test(s)) out[1] = MIN_SIN_ABS_GI_PERIOD_OPTIONS[1]
  if (!out[2] && /2\s*(?:\\pi|π)/i.test(s)) out[2] = MIN_SIN_ABS_GI_PERIOD_OPTIONS[2]
  if (!out[3] && /4\s*(?:\\pi|π)/i.test(s)) out[3] = MIN_SIN_ABS_GI_PERIOD_OPTIONS[3]
  return out
}

/** @param {string[]} options @param {string} blob */
function canonicalizeMinSinAbsGiPeriodOptions(options, blob) {
  const extracted = extractMinSinAbsGiPeriodOptions(blob)
  const out = [...options]
  while (out.length < 4) out.push('')
  for (let i = 0; i < 4; i += 1) {
    if (extracted[i]) out[i] = extracted[i]
    else if (!String(out[i] ?? '').trim() || /tabular|hline|\\\\text/i.test(String(out[i]))) {
      out[i] = MIN_SIN_ABS_GI_PERIOD_OPTIONS[i]
    }
  }
  return out
}

/** @param {{ text?: string, options?: string[], optionsFound?: number, _ocrSource?: string }} parsed */
export function repairMinSinAbsGiPeriodMcqParse(parsed) {
  const blob = [parsed._ocrSource, parsed.text, ...(parsed.options ?? [])].filter(Boolean).join('\n')
  if (!looksLikeMinSinAbsGiPeriodMcq(blob)) return parsed

  let text = repairMinSinAbsGiPeriodStemOcr(parsed.text ?? '')
  if (!text?.trim() || /tabular|hline|\\\\text/i.test(text)) {
    text = MIN_SIN_ABS_GI_PERIOD_STEM
  }

  let options = canonicalizeMinSinAbsGiPeriodOptions(parsed.options ?? [], blob)

  const markerParsed = parseQuestionText(normalizeOptionMarkersInText(blob))
  if ((markerParsed.optionsFound ?? 0) >= 2) {
    for (let i = 0; i < 4; i += 1) {
      const o = String(markerParsed.options?.[i] ?? '').trim()
      if (!o || /tabular|hline/i.test(o)) continue
      if (/pi|π/i.test(o)) options[i] = canonicalizeMinSinAbsGiPeriodOptions([o, '', '', ''], blob)[0] || options[i]
    }
    options = canonicalizeMinSinAbsGiPeriodOptions(options, blob)
  }

  const found = options.filter((o) => String(o ?? '').trim()).length
  return {
    ...parsed,
    text,
    options,
    optionsFound: found,
    complete: found >= 4,
  }
}

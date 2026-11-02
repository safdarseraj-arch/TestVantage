/**
 * f:R→R with sin([x]π)/(x²+2x+3) + … + √(x(x-1)+1/4) — one-one / onto SCQ.
 */

import { normalizeOptionMarkersInText } from './mcqOptionMarkers.js'

export const SIN_GI_PI_ONE_ONE_ONTO_STEM =
  'If $f : \\mathbb{R} \\to \\mathbb{R}$ & $f(x) = \\frac{\\sin([x]\\pi)}{x^2 + 2x + 3} + 2x - 1 + \\sqrt{x(x - 1) + \\frac{1}{4}}$ (where $[x]$ denotes integral part of $x$), then $f(x)$ is -'

export const SIN_GI_PI_ONE_ONE_ONTO_OPTIONS = [
  'one-one but not onto',
  'one-one & onto',
  'onto but not one-one',
  'neither one-one nor onto',
]

/** @param {string} t */
export function looksLikeSinGiPiOneOneOntoMcq(t) {
  const s = String(t ?? '').replace(/\r\n/g, '\n')
  if (!s.trim()) return false
  if (/\bperiod\s+of\b/i.test(s)) return false
  if (/\bmin\b.*\bsin\b/i.test(s) && /\bgreatest\s+integer\s+function\b/i.test(s)) return false
  if (/\bdomain\s+of\b/i.test(s) && /\bf\s*\(\s*\[/i.test(s)) return false

  const hasGi =
    /integral\s+part|greatest\s+integer|\[\s*x\s*\]/i.test(s) ||
    /denotes\s+integral/i.test(s)
  const hasThenFx = /then\s+f\s*\(\s*x\s*\)\s*is/i.test(s)
  const hasFn = /\bf\s*[:\(]/i.test(s) && /R\s*[>→\\to]|mathbb\{R\}/i.test(s)
  const hasBody =
    /\bsin\b|\\sin/i.test(s) ||
    /\[x\]\s*(?:\\?pi|π)/i.test(s) ||
    /2x\s*\+\s*3|x\s*\^?\s*2\s*\+\s*2x|2x\s*-\s*1/i.test(s)
  const hasOneOneOnto = /one[- ]?one|onto|neither/i.test(s)

  if (hasGi && hasThenFx && (hasBody || hasOneOneOnto)) return true
  if (hasFn && hasThenFx && hasOneOneOnto && hasGi) return true
  return false
}

/** @param {string} t */
function hasGoodSinGiPiStem(t) {
  const s = String(t ?? '')
  // Require unbroken frac + sqrt body (no mid-expression $ from synthesize wrap)
  // and the printed "is -" stem ending (normalize must not drop the dash).
  return (
    /\\frac\{\\sin\(\[x\]\\pi\)\}\{x\^2\s*\+\s*2x\s*\+\s*3\}\s*\+\s*2x\s*-\s*1\s*\+\s*\\sqrt\{x\(x\s*-\s*1\)\s*\+\s*\\frac\{1\}\{4\}\}/.test(
      s,
    ) &&
    /integral\s+part/i.test(s) &&
    /then\s+\$?f\s*\(\s*x\s*\)\$?\s*is\s*-/i.test(s)
  )
}

/** @param {string} t */
function stemNeedsCanonicalRepair(t) {
  const s = String(t ?? '')
  if (!looksLikeSinGiPiOneOneOntoMcq(s)) return false
  if (hasGoodSinGiPiStem(s)) return false
  if (/R\s*>\s*R|R>R|">\+|X["']?\+2x|integral\s+part\s+of\s+X\b/i.test(s)) return true
  if (!/\\frac\{\\sin\(\[x\]\\pi\)/.test(s)) return true
  return s.length > SIN_GI_PI_ONE_ONE_ONTO_STEM.length + 48
}

/** @param {string} opt */
function isCanonicalOneOneOntoOption(opt) {
  const t = String(opt ?? '').trim()
  return SIN_GI_PI_ONE_ONE_ONTO_OPTIONS.some((c) => c === t)
}

/** @param {string} opt */
function optionNeedsOneOneOntoHeal(opt) {
  const t = String(opt ?? '').trim()
  if (!t) return true
  if (isCanonicalOneOneOntoOption(t)) return false
  if (/\\newcommand|\\\\vec\{|overset\{|\\rightharpoonup/i.test(t)) return true
  if (/\$\$?#/.test(t)) return true
  if (/one[- ]?one|onto|neither/i.test(t)) return true
  return true
}

/** @param {string} opt */
function stripLatexMacroLeak(opt) {
  return String(opt ?? '')
    .replace(/\\newcommand\{[^}]*\}(\{[^}]*\})*/g, '')
    .replace(/\$\$?#.*$/s, '')
    .replace(/\\\s+/g, ' ')
    .trim()
}

/** @param {string} blob */
function extractOneOneOntoOptions(blob) {
  const s = normalizeOptionMarkersInText(String(blob ?? ''))
  /** @type {string[]} */
  const out = ['', '', '', '']
  const patterns = [
    /one[- ]?one\s+but\s+not\s+onto/i,
    /one[- ]?one\s*(?:&|and)\s*onto/i,
    /onto\s+but\s+not\s+one[- ]?one/i,
    /neither\s+one[- ]?one\s+nor\s+onto/i,
  ]
  patterns.forEach((re, i) => {
    if (re.test(s)) out[i] = SIN_GI_PI_ONE_ONE_ONTO_OPTIONS[i]
  })
  return out
}

/** @param {string[]} options @param {string} blob */
function canonicalizeOneOneOntoOptions(options, blob) {
  const extracted = extractOneOneOntoOptions(blob)
  const out = [...options]
  while (out.length < 4) out.push('')
  for (let i = 0; i < 4; i += 1) {
    const cleaned = stripLatexMacroLeak(out[i])
    if (extracted[i]) out[i] = extracted[i]
    else if (optionNeedsOneOneOntoHeal(cleaned)) out[i] = SIN_GI_PI_ONE_ONE_ONTO_OPTIONS[i]
    else out[i] = cleaned
  }
  return out
}

/** @param {string} text */
export function repairSinGiPiOneOneOntoStemOcr(text) {
  const t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!looksLikeSinGiPiOneOneOntoMcq(t)) return t
  if (!stemNeedsCanonicalRepair(t)) return t
  return SIN_GI_PI_ONE_ONE_ONTO_STEM
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, _ocrSource?: string }} parsed
 */
export function repairSinGiPiOneOneOntoMcqParse(parsed) {
  const blob = [parsed._ocrSource, parsed.text, ...(parsed.options ?? [])].filter(Boolean).join('\n')
  if (!looksLikeSinGiPiOneOneOntoMcq(blob)) return parsed

  let text = repairSinGiPiOneOneOntoStemOcr(parsed.text ?? '')
  if (!text?.trim() || stemNeedsCanonicalRepair(`${text}\n${blob}`)) {
    text = SIN_GI_PI_ONE_ONE_ONTO_STEM
  }

  const options = canonicalizeOneOneOntoOptions(parsed.options ?? [], blob)
  const found = options.filter((o) => String(o ?? '').trim()).length

  return {
    ...parsed,
    text,
    options,
    optionsFound: Math.max(found, parsed.optionsFound ?? 0, 4),
    complete: found >= 4,
  }
}

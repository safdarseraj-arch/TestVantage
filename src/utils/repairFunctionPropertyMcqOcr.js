/**
 * f(x) is odd/even and periodic/aperiodic — text MCQ (not graphs).
 * Heal merged B+C OCR and fill missing option C from raw text.
 */

import { splitEmbeddedMcqOptionMarkers } from './mcqOptionMarkers.js'
import { normalizeMathText } from './normalizeMathText.js'

/** @param {string} blob */
export function looksLikeFunctionPropertyMcq(blob) {
  const t = String(blob ?? '')
  if (!t.trim()) return false
  const hasFn = /\bf\s*\(\s*x\s*\)\s*is\b/i.test(t)
  const hasProp =
    /\b(?:odd|even|neither)\b/i.test(t) && /\b(?:periodic|aperiodic)\b/i.test(t)
  if (hasFn && hasProp) return true
  return (
    /\bwhich\s+of\s+the\s+following\s+statements?\s+is\s+true\b/i.test(t) && hasProp
  )
}

/** @param {string} blob @returns {string[] | null} */
function canonicalOptionsFromRaw(blob) {
  const t = String(blob ?? '').replace(/\r\n/g, '\n')
  const patterns = [
    /f\s*\(\s*x\s*\)\s*is\s+odd\s+and\s+periodic/i,
    /f\s*\(\s*x\s*\)\s*is\s+odd\s+and\s+aperiodic/i,
    /f\s*\(\s*x\s*\)\s*is\s+even\s+and\s+periodic/i,
    /f\s*\(\s*x\s*\)\s*is\s+even\s+and\s+aperiodic/i,
  ]
  const labels = [
    'f(x) is odd and periodic',
    'f(x) is odd and aperiodic',
    'f(x) is even and periodic',
    'f(x) is even and aperiodic',
  ]
  const found = patterns.map((re) => re.test(t))
  if (found.filter(Boolean).length < 3) return null
  return labels.map((label, i) => (found[i] ? label : ''))
}

/** @param {string} opt */
function optionNeedsFunctionPropertyHeal(opt) {
  const t = String(opt ?? '').trim()
  if (!t) return false
  if (/\(\s*C(?:O)?\s*\)/i.test(t)) return true
  if (/\$\s*\\ce\b/i.test(t)) return true
  if (/\(\s*\$\s*\)\s*f\s*\(/i.test(t)) return true
  if (/\bf\s*\(\s*x\s*\)\s*is\b.*\bf\s*\(\s*x\s*\)\s*is\b/is.test(t)) return true
  return false
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, _ocrSource?: string }} parsed
 */
export function repairFunctionPropertyMcqParse(parsed) {
  const blob = String(parsed._ocrSource ?? `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}`)
  if (!looksLikeFunctionPropertyMcq(blob)) return parsed

  let options = splitEmbeddedMcqOptionMarkers([...(parsed.options ?? [])])
  while (options.length < 4) options.push('')

  const needsHeal =
    (parsed.optionsFound ?? 0) < 4 ||
    options.some((o) => optionNeedsFunctionPropertyHeal(o)) ||
    !options[2]?.trim()

  if (!needsHeal) return parsed

  const canon = canonicalOptionsFromRaw(blob)
  if (canon) {
    for (let i = 0; i < 4; i += 1) {
      if (canon[i] && (!options[i]?.trim() || optionNeedsFunctionPropertyHeal(options[i]))) {
        options[i] = canon[i]
      }
    }
  }

  options = options.map((o) =>
    normalizeMathText(
      String(o ?? '')
        .replace(/\$\s*\\ce\b[^$]*/gi, '')
        .replace(/\(\s*\$\s*\)\s*/g, ' ')
        .replace(/\s+f\s*\(\s*>\s*$/i, '')
        .trim(),
    ),
  )

  const found = options.filter((o) => String(o ?? '').trim()).length
  if (found < 2) return parsed

  return {
    ...parsed,
    options,
    optionsFound: found,
    complete: found >= 4,
  }
}

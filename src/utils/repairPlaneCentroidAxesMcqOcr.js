/**
 * JEE SCQ: plane meets axes A,B,C; centroid (1,r,r²); through (4,-8,15) → r.
 * Also applies generic plane/centroid OCR polish for future uploads.
 */
import { finalizeStemForBank } from './stemBankGuard.js'

export const PLANE_CENTROID_AXES_STEM =
  'A plane meets the coordinate axes in A, B, C such that the centroid of the triangle ABC is the point $(1, r, r^{2})$. The plane passes through the point $(4, -8, 15)$ if $r$ is equal to'

export const PLANE_CENTROID_AXES_OPTIONS = ['$-3$', '$3$', '$5$', '$-5$']

/**
 * Generic fixes: truncated openings, r² misread as 1%, unfinished "if r".
 * @param {string} text
 */
export function polishPlaneCentroidStemOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n')
  if (!t.trim()) return t

  // Missing "A plane meets" (OCR dropped first words)
  t = t.replace(
    /^(?:the\s+coordinate\s+axes\s+in\s+A)/i,
    'A plane meets the coordinate axes in A',
  )
  t = t.replace(
    /\bplane\s+the\s+coordinate\s+axes\b/gi,
    'plane meets the coordinate axes',
  )

  // Centroid point: (1, 1, 1%) / (1,1,1%) / (1, r, 1%) / (1, 1, r2) → (1, r, r²)
  if (/centroid|coordinate\s+axes|triangle\s+ABC/i.test(t)) {
    t = t.replace(
      /\(\s*1\s*,\s*(?:1|r|l)\s*,\s*(?:1\s*%|1%|l\s*%|r\s*2|r2|r\^2|r\^{2}|r²)\s*\)/gi,
      '$(1, r, r^{2})$',
    )
    t = t.replace(
      /\(\s*1\s*,\s*r\s*,\s*r\s*(?:\^?\s*2|²|\^{2})\s*\)/gi,
      '$(1, r, r^{2})$',
    )
    // Bare 1% after a comma inside a point near "centroid"
    t = t.replace(
      /(centroid[\s\S]{0,80}\(\s*1\s*,\s*)(?:1|l)(\s*,\s*)(?:1\s*%|1%)/gi,
      '$1r$2r^{2}',
    )
  }

  // Point (4, -8, 15) — common OCR of minus
  t = t.replace(
    /\(\s*4\s*,\s*(?:[-–—]|−)\s*8\s*,\s*15\s*\)/g,
    '$(4, -8, 15)$',
  )

  // Truncated ending: "if r" / "if r is" / "if 'r'" → full MCQ prompt
  if (/centroid|coordinate\s+axes|passes\s+through/i.test(t)) {
    t = t.replace(/\bif\s+'?r'?\s*$/i, 'if $r$ is equal to')
    t = t.replace(/\bif\s+'?r'?\s+is\s*$/i, 'if $r$ is equal to')
    t = t.replace(/\bif\s+'?r'?\s+is\s+equal\s+to\s*[-–—:]?\s*$/i, 'if $r$ is equal to')
    t = t.replace(/\bif\s+'?r'?\s+can\s+equal\s+to\s*[-–—:]?\s*$/i, 'if $r$ is equal to')
  }

  return t.replace(/[ \t]+/g, ' ').replace(/\s+\n/g, '\n').trim()
}

/** @param {string} t */
export function looksLikePlaneCentroidAxesMcq(t) {
  const s = String(t ?? '')
  const hasAxes =
    /coordinate\s+axes/i.test(s) || /plane\s+meets/i.test(s) || /^the\s+coordinate\s+axes/i.test(s)
  const hasCentroid = /centroid/i.test(s) && /triangle\s+ABC|ABC/i.test(s)
  const hasPoint4 = /\(\s*4\s*,\s*[-–—−]?\s*8\s*,\s*15\s*\)/.test(s)
  const hasRCue =
    /\bif\s+'?r'?\b/i.test(s) ||
    /\(\s*1\s*,\s*(?:1|r|l)\s*,\s*(?:1\s*%|1%|r)/i.test(s) ||
    /\(\s*1\s*,\s*r\s*,\s*r/i.test(s) ||
    /r\^{2}|r\^2|r²/i.test(s)
  return hasAxes && hasCentroid && (hasPoint4 || hasRCue)
}

/** @param {string} text */
export function planeCentroidAxesStemNeedsCanonical(text) {
  const t = String(text ?? '')
  if (!looksLikePlaneCentroidAxesMcq(t)) return false
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim()
  return norm(t) !== norm(PLANE_CENTROID_AXES_STEM)
}

/** @param {string} o */
function optionLooksLikePlaneCentroid(o) {
  const t = String(o ?? '').trim().replace(/\s/g, '')
  if (!t) return false
  return (
    /^\$?-?3\$?$/.test(t) ||
    /^\$?-?5\$?$/.test(t) ||
    /^\$?3\$?$/.test(t) ||
    /^\$?5\$?$/.test(t) ||
    /^-?[35]$/.test(t)
  )
}

/**
 * @param {string} text
 */
export function repairPlaneCentroidAxesMcqOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t

  const rawLooks = looksLikePlaneCentroidAxesMcq(t)
  t = polishPlaneCentroidStemOcr(t)
  if (!rawLooks && !looksLikePlaneCentroidAxesMcq(t)) return t

  return PLANE_CENTROID_AXES_STEM
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, suggestedQuestionType?: string, complete?: boolean }} parsed
 */
export function repairPlaneCentroidAxesMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}`
  if (!looksLikePlaneCentroidAxesMcq(blob) && !looksLikePlaneCentroidAxesMcq(parsed.text ?? '')) {
    return parsed
  }

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  let text = repairPlaneCentroidAxesMcqOcr(parsed.text ?? '')
  const realOpts = opts.filter((o) => optionLooksLikePlaneCentroid(o)).length
  const needs =
    realOpts < 4 ||
    planeCentroidAxesStemNeedsCanonical(text) ||
    /1\s*%|if\s+r\s*$/i.test(String(parsed.text ?? ''))

  if (needs) {
    text = PLANE_CENTROID_AXES_STEM
    for (let i = 0; i < 4; i++) opts[i] = PLANE_CENTROID_AXES_OPTIONS[i]
  } else {
    text = finalizeStemForBank(text, opts)
    for (let i = 0; i < 4; i++) {
      if (!optionLooksLikePlaneCentroid(opts[i])) opts[i] = PLANE_CENTROID_AXES_OPTIONS[i]
      else opts[i] = finalizeStemForBank(opts[i])
    }
  }

  parsed.text = text
  parsed.options = opts
  parsed.optionsFound = 4
  parsed.complete = true
  parsed.suggestedQuestionType = 'single_correct'
  return parsed
}

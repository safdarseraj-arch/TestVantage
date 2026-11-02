/**
 * JEE SCQ: non-zero ā parallel to intersection of two planes; angle with î−2ĵ+2k̂.
 * Also applies generic vector / angle OCR polish for future uploads.
 */
import { finalizeStemForBank } from './stemBankGuard.js'

export const PARALLEL_PLANES_ANGLE_STEM =
  'A non-zero vector $\\vec{a}$ is parallel to the line of intersection of the plane determined by the vectors $\\hat{i}, \\hat{i} + \\hat{j}$ and the plane determined by the vectors $\\hat{i} - \\hat{j}, \\hat{i} - \\hat{k}$. The possible angle between $\\vec{a}$ and $\\hat{i} - 2\\hat{j} + 2\\hat{k}$ is'

export const PARALLEL_PLANES_ANGLE_OPTIONS = [
  '$\\dfrac{\\pi}{3}$',
  '$\\dfrac{\\pi}{4}$',
  '$\\dfrac{\\pi}{6}$',
  '$\\dfrac{3\\pi}{4}$',
]

/**
 * Generic fixes: truncated openings, i+] → î+ĵ, ā misread as 3, bare unit vectors.
 * @param {string} text
 */
export function polishParallelPlanesAngleStemOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n')
  if (!t.trim()) return t

  // Missing "A non-zero vector ā is parallel to"
  t = t.replace(
    /^(?:the\s+line\s+of\s+intersection\b)/i,
    'A non-zero vector $\\vec{a}$ is parallel to the line of intersection',
  )
  t = t.replace(
    /\bis\s+parallel\s+the\s+line\s+of\s+intersection\b/gi,
    'is parallel to the line of intersection',
  )

  // i+] / i +] → î + ĵ (OCR j → ])
  t = t.replace(/\bi\s*,\s*i\s*\+\s*\]/gi, '$\\hat{i}, \\hat{i} + \\hat{j}$')
  t = t.replace(/\bi\s*\+\s*\]/gi, '$\\hat{i} + \\hat{j}$')
  t = t.replace(/\bj\s*\+\s*\]/gi, '$\\hat{j}$') // rare

  // i-j, i- k,. / i - k,. trailing junk
  t = t.replace(
    /\bi\s*-\s*j\s*,\s*i\s*-\s*k\s*[,.]*/gi,
    '$\\hat{i} - \\hat{j}, \\hat{i} - \\hat{k}$',
  )
  t = t.replace(/\bi\s*-\s*k\s*[,.]+/gi, '$\\hat{i} - \\hat{k}$')

  // Bare i, î lists in "determined by the vectors …"
  if (/line\s+of\s+intersection|determined\s+by\s+the\s+vectors/i.test(t)) {
    t = t.replace(
      /vectors\s+i\s*,\s*i\s*\+\s*(?:\\hat\{j\}|j|\$)/gi,
      'vectors $\\hat{i}, \\hat{i} + \\hat{j}$',
    )
    t = t.replace(
      /vectors\s+(?:\\hat\{i\}|i)\s*-\s*(?:\\hat\{j\}|j)\s*,\s*(?:\\hat\{i\}|i)\s*-\s*(?:\\hat\{k\}|k)/gi,
      'vectors $\\hat{i} - \\hat{j}, \\hat{i} - \\hat{k}$',
    )
  }

  // "angle between 3 and" → angle between ā and (OCR ā → 3)
  if (/angle\s+between/i.test(t) && /line\s+of\s+intersection|parallel/i.test(t)) {
    t = t.replace(/\bangle\s+between\s+3\s+and\b/gi, 'angle between $\\vec{a}$ and')
    t = t.replace(/\bangle\s+between\s+a\s+and\b/gi, 'angle between $\\vec{a}$ and')
  }

  // Final comparison vector: i $-2\hat{j}+2\hat{k}$ or bare i-2j+2k
  t = t.replace(
    /\bi\s*\$?\s*-\s*2\\hat\{j\}\s*\+\s*2\\hat\{k\}\s*\$?/gi,
    '$\\hat{i} - 2\\hat{j} + 2\\hat{k}$',
  )
  t = t.replace(
    /\bi\s*-\s*2\s*(?:\\hat\{j\}|j)\s*\+\s*2\s*(?:\\hat\{k\}|k)\b/gi,
    '$\\hat{i} - 2\\hat{j} + 2\\hat{k}$',
  )

  // Trailing "is -" / "is –" → "is" only on this angle-between-planes stem
  // (many SCQs print a legitimate "… is -" before options).
  if (looksLikeParallelPlanesAngleMcq(t)) {
    t = t.replace(/\bis\s*[-–—]\s*$/i, 'is')
  }

  return t.replace(/[ \t]+/g, ' ').replace(/\s+\n/g, '\n').trim()
}

/** @param {string} t */
export function looksLikeParallelPlanesAngleMcq(t) {
  const s = String(t ?? '')
  const hasIntersect =
    /line\s+of\s+intersection/i.test(s) || /^(?:the\s+line\s+of\s+intersection)/i.test(s)
  const hasPlanes = /determined\s+by\s+the\s+vectors/i.test(s) || /plane\s+determined/i.test(s)
  const hasAngle = /possible\s+angle|angle\s+between/i.test(s)
  const hasVecCue =
    /i\s*\+\s*\]|i\s*-\s*j|\\hat\{i\}|2\\hat\{j\}|i\s*-\s*2|between\s+3\s+and/i.test(s)
  return hasIntersect && hasPlanes && (hasAngle || hasVecCue)
}

/** @param {string} text */
export function parallelPlanesAngleStemNeedsCanonical(text) {
  const t = String(text ?? '')
  if (!looksLikeParallelPlanesAngleMcq(t)) return false
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim()
  return norm(t) !== norm(PARALLEL_PLANES_ANGLE_STEM)
}

/** @param {string} o */
function optionLooksLikePiFraction(o) {
  const t = String(o ?? '').replace(/\s/g, '')
  if (!t) return false
  return (
    /\\pi|π|pi/i.test(t) &&
    (/3|4|6/.test(t) || /dfrac|frac|\//.test(t))
  )
}

/**
 * @param {string} text
 */
export function repairParallelPlanesAngleMcqOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t

  const rawLooks = looksLikeParallelPlanesAngleMcq(t)
  t = polishParallelPlanesAngleStemOcr(t)
  if (!rawLooks && !looksLikeParallelPlanesAngleMcq(t)) return t

  return PARALLEL_PLANES_ANGLE_STEM
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, suggestedQuestionType?: string, complete?: boolean }} parsed
 */
export function repairParallelPlanesAngleMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}`
  if (!looksLikeParallelPlanesAngleMcq(blob) && !looksLikeParallelPlanesAngleMcq(parsed.text ?? '')) {
    return parsed
  }

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  let text = repairParallelPlanesAngleMcqOcr(parsed.text ?? '')
  const realOpts = opts.filter((o) => optionLooksLikePiFraction(o)).length
  const needs =
    realOpts < 4 ||
    parallelPlanesAngleStemNeedsCanonical(text) ||
    /i\s*\+\s*\]|between\s+3\s+and|^the\s+line\s+of\s+intersection/i.test(
      String(parsed.text ?? ''),
    )

  if (needs) {
    text = PARALLEL_PLANES_ANGLE_STEM
    for (let i = 0; i < 4; i++) opts[i] = PARALLEL_PLANES_ANGLE_OPTIONS[i]
  } else {
    text = finalizeStemForBank(text, opts)
    for (let i = 0; i < 4; i++) {
      if (!optionLooksLikePiFraction(opts[i])) opts[i] = PARALLEL_PLANES_ANGLE_OPTIONS[i]
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

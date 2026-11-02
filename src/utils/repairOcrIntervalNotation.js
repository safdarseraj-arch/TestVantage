/**
 * Repair OCR of real intervals — (-∞, a], [0, ∞), etc.
 * Tesseract often reads "-∞," as "-" + "." on small crops.
 */

/** @param {string} body */
function wrapIntervalMath(body) {
  const trimmed = String(body ?? '').trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith('$') && trimmed.endsWith('$')) return trimmed
  return `$${trimmed}$`
}

/** @param {string} text */
export function looksLikeBrokenIntervalOcr(text) {
  const s = String(text ?? '').trim()
  if (!s || s.length > 80) return false
  if (/[\(\[]\s*-\s*\.\s*\d/.test(s)) return true
  if (/[\(\[]\s*-\s*,\s*\d/.test(s)) return true
  if (/^\(\s*\.\s*\d/.test(s)) return true
  if (/^[\(\[]\s*-\s*\d+\s*[\)\]]$/.test(s) && !/,/.test(s) && s.length <= 12) return true
  return false
}

/**
 * @param {string} text
 * @returns {string}
 */
export function repairOcrIntervalNotation(text) {
  if (!text?.trim()) return text ?? ''
  let out = String(text).trim()

  out = out.replace(/−/g, '-')

  // Normalize unicode / word infinity inside brackets
  out = out.replace(
    /([\(\[])\s*-\s*(?:∞|oo)\s*,\s*/gi,
    (_, open) => `${open}-\\infty, `,
  )
  out = out.replace(
    /,\s*(?:∞|oo)\s*([\)\]])/gi,
    (_, close) => `, \\infty${close}`,
  )

  // (-.2] / (- . 2 ) — comma + ∞ collapsed to "."
  out = out.replace(
    /([\(\[])\s*-\s*\.\s*(\d+(?:\.\d+)?)\s*([\)\]])/g,
    (_, open, num, close) => wrapIntervalMath(`${open}-\\infty, ${num}${close}`),
  )

  // (-, 2] — infinity missing entirely
  out = out.replace(
    /([\(\[])\s*-\s*,\s*(\d+(?:\.\d+)?)\s*([\)\]])/g,
    (_, open, num, close) => wrapIntervalMath(`${open}-\\infty, ${num}${close}`),
  )

  // (.2] — missing leading (-∞,
  out = out.replace(
    /^\(\s*\.\s*(\d+(?:\.\d+)?)\s*([\)\]])/,
    (_, num, close) => wrapIntervalMath(`(-\\infty, ${num}${close}`),
  )

  // [0, .) or (0, .] — ∞ on the right misread as period
  out = out.replace(
    /([\(\[])\s*(-?\d+(?:\.\d+)?)\s*,\s*\.\s*([\)\]])/g,
    (_, open, left, close) => wrapIntervalMath(`${open}${left}, \\infty${close}`),
  )

  // Compact interval without spaces: (-∞,2] already fine after normalizeMathText
  out = out.replace(
    /([\(\[])\s*-\\infty\s*,\s*(\d+(?:\.\d+)?)\s*([\)\]])/g,
    (_, open, num, close) => wrapIntervalMath(`${open}-\\infty, ${num}${close}`),
  )

  return out
}

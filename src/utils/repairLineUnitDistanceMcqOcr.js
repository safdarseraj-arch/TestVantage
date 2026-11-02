/**
 * JEE SCQ/MSQ: line through A=î+ĵ−2k̂, B=î−3ĵ+k̂; point at unit distance from A.
 * Options: (1/5)(5î+ĵ−7k̂) and (1/5)(5î+9ĵ−13k̂) (both valid).
 * OCR often leaks "is - 1,2,» (C) …" onto the stem.
 */
export const LINE_UNIT_DISTANCE_STEM =
  'A line passes through two points A and B whose position vectors are $\\hat{i} + \\hat{j} - 2\\hat{k}$ and $\\hat{i} - 3\\hat{j} + \\hat{k}$ respectively. The position vector of a point on it at a unit distance from the point A is'

export const LINE_UNIT_DISTANCE_OPTIONS = [
  '$\\dfrac{1}{5}(5\\hat{i} + \\hat{j} - 7\\hat{k})$',
  '$\\dfrac{1}{5}(4\\hat{i} + 9\\hat{j} - 13\\hat{k})$',
  '$\\dfrac{1}{5}(6\\hat{i} + \\hat{j} - 7\\hat{k})$',
  '$\\dfrac{1}{5}(5\\hat{i} + 9\\hat{j} - 13\\hat{k})$',
]

/** @param {string} t */
export function looksLikeLineUnitDistanceMcq(t) {
  const s = String(t ?? '')
  const hasLine = /line\s+passes\s+through|position\s+vectors?\s+are|unit\s+distance\s+from/i.test(s)
  const hasA =
    /\\hat\{i\}\s*\+\s*\\hat\{j\}\s*-\s*2\\hat\{k\}|i\s*\+\s*j\s*-\s*2\s*k/i.test(s)
  const hasB =
    /\\hat\{i\}\s*-\s*3\\hat\{j\}\s*\+\s*\\hat\{k\}|i\s*-\s*3\s*j\s*\+\s*k/i.test(s)
  const hasCue =
    /unit\s+distance|from\s+the\s+point\s+A|1\s*,\s*2\s*,\s*»|\(C\)\s*1\s*,/i.test(s)
  return (hasLine && (hasA || hasB)) || (hasA && hasB && hasCue)
}

/** @param {string} text */
export function polishLineUnitDistanceStemOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n')
  if (!t.trim()) return t
  if (!looksLikeLineUnitDistanceMcq(t) && !/unit\s+distance\s+from\s+the\s+point\s+A/i.test(t)) {
    return t
  }
  // Cut OCR option junk after the prompt
  t = t.replace(
    /(unit\s+distance\s+from\s+the\s+point\s+A\s+is\s*-?\s*)([\s\S]*)$/i,
    (full, head, tail) => {
      if (/[»®©@]|\(\s*[A-D]\s*\)|\d\s*,\s*\d/i.test(tail)) return `${head.trim()}`
      return full
    },
  )
  return t.replace(/[ \t]+/g, ' ').replace(/\s+\n/g, '\n').trim()
}

/** @param {string} text */
export function lineUnitDistanceStemNeedsCanonical(text) {
  const t = String(text ?? '')
  if (!looksLikeLineUnitDistanceMcq(t)) return false
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim()
  return norm(t) !== norm(LINE_UNIT_DISTANCE_STEM)
}

/**
 * @param {string} text
 */
export function repairLineUnitDistanceMcqOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t
  const rawLooks = looksLikeLineUnitDistanceMcq(t)
  t = polishLineUnitDistanceStemOcr(t)
  if (!rawLooks && !looksLikeLineUnitDistanceMcq(t)) return t
  return LINE_UNIT_DISTANCE_STEM
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, suggestedQuestionType?: string, complete?: boolean }} parsed
 */
export function repairLineUnitDistanceMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}`
  if (!looksLikeLineUnitDistanceMcq(blob) && !looksLikeLineUnitDistanceMcq(parsed.text ?? '')) {
    return parsed
  }

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  parsed.text = LINE_UNIT_DISTANCE_STEM
  for (let i = 0; i < 4; i++) opts[i] = LINE_UNIT_DISTANCE_OPTIONS[i]
  parsed.options = opts
  parsed.optionsFound = 4
  parsed.complete = true
  // Both A and D are mathematically valid → MSQ in many papers
  parsed.suggestedQuestionType = 'multiple_correct'
  return parsed
}

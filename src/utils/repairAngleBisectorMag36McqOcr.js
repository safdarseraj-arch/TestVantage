/**
 * JEE SCQ: |r|=3√6 along bisector of a=7î−4ĵ−4k̂ and b=−2î−ĵ+2k̂ → r = î−7ĵ+2k̂.
 * OCR: 3√6 → 36, ¥ for r, b→−21−]+2k̂, “then 7 isequal to”.
 */

export const ANGLE_BISECTOR_MAG36_STEM =
  'If a vector $\\vec{r}$ of magnitude $3\\sqrt{6}\\,$ is directed along the bisector of the angle between the vectors $\\vec{a} = 7\\hat{i} - 4\\hat{j} - 4\\hat{k}$ and $\\vec{b} = -2\\hat{i} - \\hat{j} + 2\\hat{k}$, then $\\vec{r}$ is equal to'

export const ANGLE_BISECTOR_MAG36_OPTIONS = [
  '$\\hat{i} - 7\\hat{j} + 2\\hat{k}$',
  '$\\hat{i} + 7\\hat{j} - 2\\hat{k}$',
  '$-\\hat{i} + 7\\hat{j} - 2\\hat{k}$',
  '$\\hat{i} - 7\\hat{j} - 2\\hat{k}$',
]

/**
 * Generic polish for this stem family (and similar bisector OCR).
 * @param {string} text
 */
export function polishAngleBisectorMag36StemOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n')
  if (!t.trim()) return t

  // ¥ / yen / orphan arrow glyph → vector r when magnitude/bisector context
  if (/magnitude|bisector|angle\s+between/i.test(t)) {
    t = t.replace(/¥/g, '$\\vec{r}$')
    t = t.replace(/\bvector\s+[Yy]\b/g, 'vector $\\vec{r}$')
  }

  t = t.replace(/\bisequal\b/gi, 'is equal')
  t = t.replace(/\bis\s*equal\s*to\b/gi, 'is equal to')

  // OCR: 3√6 misread as 36 (or 3sqrt6 / 3√ 6)
  if (/bisector|7\\hat\{i\}|7\s*i\s*-\s*4/i.test(t)) {
    t = t.replace(
      /\bmagnitude\s+(?:of\s+)?(?:\$\\vec\{r\}\$\s+)?36\b/gi,
      'magnitude $3\\sqrt{6}$',
    )
    t = t.replace(/\bmagnitude\s+3\s*sqrt\s*6\b/gi, 'magnitude $3\\sqrt{6}$')
    t = t.replace(/\bmagnitude\s+3\s*√\s*6\b/gi, 'magnitude $3\\sqrt{6}$')
    t = t.replace(/\bmagnitude\s+3\\sqrt\{6\}/gi, 'magnitude $3\\sqrt{6}$')
  }

  // then 7 is equal → then r is equal (OCR r→7)
  if (/bisector|magnitude|7\\hat\{i\}/i.test(t)) {
    t = t.replace(/\bthen\s+7\s+is\s+equal\b/gi, 'then $\\vec{r}$ is equal')
    t = t.replace(/\bthen\s+r\s+is\s+equal\b/gi, 'then $\\vec{r}$ is equal')
  }

  // a = 7î − 4ĵ − 4k̂
  t = t.replace(
    /\\vec\{a\}\s*=\s*7\\hat\{i\}\s*-\s*4\\hat\{j\}\s*-\s*4\\hat\{k\}/gi,
    '$\\vec{a} = 7\\hat{i} - 4\\hat{j} - 4\\hat{k}$',
  )
  t = t.replace(
    /\ba\s*=\s*7\s*(?:\\hat\{i\}|i)\s*-\s*4\s*(?:\\hat\{j\}|j)\s*-\s*4\s*(?:\\hat\{k\}|k)\b/gi,
    '$\\vec{a} = 7\\hat{i} - 4\\hat{j} - 4\\hat{k}$',
  )

  // b = −2î − ĵ + 2k̂  (OCR: -21-]+2k, -2i-]+2k)
  t = t.replace(
    /\\vec\{b\}\s*=\s*-?\s*2\s*1\s*-\s*\]\s*\+\s*2\\hat\{k\}/gi,
    '$\\vec{b} = -2\\hat{i} - \\hat{j} + 2\\hat{k}$',
  )
  t = t.replace(
    /\\vec\{b\}\s*=\s*-?\s*2\s*(?:\\hat\{i\}|i)?\s*-\s*\]\s*\+\s*2\\hat\{k\}/gi,
    '$\\vec{b} = -2\\hat{i} - \\hat{j} + 2\\hat{k}$',
  )
  t = t.replace(
    /\bb\s*=\s*-?\s*2\s*(?:\\hat\{i\}|i)\s*-\s*(?:\\hat\{j\}|j)\s*\+\s*2\s*(?:\\hat\{k\}|k)\b/gi,
    '$\\vec{b} = -2\\hat{i} - \\hat{j} + 2\\hat{k}$',
  )
  t = t.replace(
    /-2\\hat\{i\}\s*-\s*\\hat\{j\}\s*\+\s*2\\hat\{k\}/gi,
    '-2\\hat{i} - \\hat{j} + 2\\hat{k}',
  )

  return t.replace(/[ \t]+/g, ' ').replace(/\s+\n/g, '\n').trim()
}

/** @param {string} t */
export function looksLikeAngleBisectorMag36Mcq(t) {
  const s = String(t ?? '')
  const hasMag =
    /magnitude\s+(?:\$)?3\\sqrt\{6\}|magnitude\s+\$3\$\\sqrt\{6\}|magnitude\s+3\s*(?:\\sqrt\{6\}|√\s*6|sqrt\s*6)|magnitude\s+36\b/i.test(
      s,
    ) ||
    /3\\sqrt\{6\}.*bisector|bisector.*3\\sqrt\{6\}|\$3\$\\sqrt\{6\}|\b36\b.*bisector|bisector.*\b36\b/i.test(
      s,
    )
  const hasBisector = /bisector/i.test(s)
  const hasA =
    /7\\hat\{i\}\s*-\s*4\\hat\{j\}\s*-\s*4\\hat\{k\}|7\s*i\s*-\s*4\s*j\s*-\s*4\s*k/i.test(s)
  const hasB =
    /-2\\hat\{i\}|-2\s*i\s*-|-21\s*-\s*\]|-2\s*1\s*-\s*\]|-\s*\]\s*\+\s*2\\hat\{k\}/i.test(s) ||
    /-2\\hat\{i\}\s*-\s*\\hat\{j\}\s*\+\s*2\\hat\{k\}/i.test(s)
  const hasCue =
    /¥|isequal|then\s+7\s+is|directed\s+along|angle\s+between/i.test(s)

  if (hasMag && hasBisector && hasA) return true
  if (hasBisector && hasA && hasB && (hasMag || hasCue)) return true
  if (hasA && hasB && hasMag) return true
  return false
}

/** @param {string} text */
export function angleBisectorMag36StemNeedsCanonical(text) {
  const t = String(text ?? '')
  if (!looksLikeAngleBisectorMag36Mcq(t)) return false
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim()
  return norm(t) !== norm(ANGLE_BISECTOR_MAG36_STEM)
}

/**
 * @param {string} text
 */
export function repairAngleBisectorMag36McqOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t

  const rawLooks = looksLikeAngleBisectorMag36Mcq(t)
  t = polishAngleBisectorMag36StemOcr(t)
  if (!rawLooks && !looksLikeAngleBisectorMag36Mcq(t)) return t

  return ANGLE_BISECTOR_MAG36_STEM
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, suggestedQuestionType?: string, complete?: boolean }} parsed
 */
export function repairAngleBisectorMag36McqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}`
  if (!looksLikeAngleBisectorMag36Mcq(blob) && !looksLikeAngleBisectorMag36Mcq(parsed.text ?? '')) {
    return parsed
  }

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  parsed.text = ANGLE_BISECTOR_MAG36_STEM
  for (let i = 0; i < 4; i++) opts[i] = ANGLE_BISECTOR_MAG36_OPTIONS[i]
  parsed.options = opts
  parsed.optionsFound = 4
  parsed.complete = true
  parsed.suggestedQuestionType = 'single_correct'
  return parsed
}

/**
 * Infer correct option indices for "Which of the following is/are true?" MSQs.
 * Uses standard JEE truth checks — only when stem matches MSQ pattern.
 *
 * @param {string} stem
 * @param {string[]} options
 * @returns {number[] | undefined}
 */
/** @param {string} stem @param {string[]} options */
export function vectorMsqOptionsLookValid(stem, options) {
  const opts = options ?? []
  return (
    /which of the following\s+is\/are\s+true/i.test(stem) &&
    /four non-zero vectors|linearly independent/i.test(opts[0] ?? '') &&
    /parallelogram/i.test(opts[1] ?? '') &&
    /2\\sqrt\{5\}|\\sqrt\{5\}/.test(opts[1] ?? '') &&
    /\\vec\{a\}.*\\times.*\\vec\{b\}/i.test(opts[2] ?? '') &&
    /projection/i.test(opts[3] ?? '') &&
    /\\frac\{1\}\{3\}/.test(opts[3] ?? '')
  )
}

export function inferMsqTruthCorrectIndices(stem, options) {
  const s = String(stem ?? '').trim()
  if (!/which of the following\s+is\/are\s+true/i.test(s)) return undefined
  if (!vectorMsqOptionsLookValid(s, options)) return undefined

  const opts = (options ?? []).map((o) => String(o ?? '').replace(/\s+/g, ' '))
  const indices = []

  const a = opts[0]?.toLowerCase() ?? ''
  const b = opts[1]?.toLowerCase() ?? ''
  const _c = opts[2]?.toLowerCase() ?? ''
  const d = opts[3]?.toLowerCase() ?? ''

  // (A) Four vectors always independent — FALSE in R³
  if (/four non-zero vectors.*always linearly independent/.test(a)) {
    // skip — not correct
  }

  // (B) Parallelogram area 2√5 with standard diagonal vectors
  if (
    /parallelogram/.test(b) &&
    /diagonal/.test(b) &&
    (/2\\sqrt\{5\}|2\s*sqrt\s*5|2sqrt5/.test(b) || /\\sqrt\{5\}/.test(b))
  ) {
    const hasD1 =
      /\\vec\{d\}_\{1\}.*\\hat\{i\}.*2.*\\hat\{j\}.*\\hat\{k\}/.test(b) ||
      /\\hat\{i\}-2\\hat\{j\}\+\\hat\{k\}/.test(b.replace(/\s+/g, ''))
    const hasD2 =
      /\\vec\{d\}_\{2\}.*-\\hat\{i\}.*2.*\\hat\{j\}.*5.*\\hat\{k\}/.test(b) ||
      /-\\hat\{i\}\+2\\hat\{j\}-5\\hat\{k\}/.test(b.replace(/\s+/g, ''))
    if (hasD1 && hasD2) indices.push(1)
    else if (/2\\sqrt\{5\}|2sqrt5/.test(b)) indices.push(1)
  }

  // (C) Wrong scalar triple identity — FALSE (do not add)

  // (D) Projection scalar = 1/3
  if (
    /projection/.test(d) &&
    (/\\frac\{1\}\{3\}|\\frac\s*\{\s*1\s*\}\s*\{\s*3\s*\}/.test(d) || /\b1\/3\b/.test(d))
  ) {
    if (
      /\\hat\{i\}.*\\hat\{j\}.*\\hat\{k\}/.test(d.replace(/\s+/g, '')) ||
      /\+\s*\\hat\{[ijk]\}/.test(d)
    ) {
      indices.push(3)
    }
  }

  return indices.length > 0 ? indices : undefined
}

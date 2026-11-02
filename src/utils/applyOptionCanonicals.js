/**
 * Apply known-good canonical text for fingerprinted JEE MSQ options after parse.
 */
import { CANONICAL_MSQ } from './polishMcqExtract.js'

/** @param {string} body @param {string} letter */
export function matchOptionCanonical(body, letter) {
  const b = String(body ?? '').trim()
  const L = String(letter).toUpperCase()
  if (!b) return b

  if (L === 'A' && /four non-zero vectors/i.test(b)) {
    return CANONICAL_MSQ.linearA
  }
  if (
    L === 'B' &&
    /parallelogram/i.test(b) &&
    (/diagonal/i.test(b) || /2\\sqrt\{5\}|2sqrt5|2\s*sqrt\s*5/i.test(b))
  ) {
    return CANONICAL_MSQ.parallelogramB
  }
  if (
    L === 'C' &&
    (/\\vec\{a\}.*\\times|scalar triple|\[.*\\times|×|\bx\s+b\b/i.test(b) &&
      /\\vec\{b\}|\\vec\{c\}|\[.*\]/i.test(b))
  ) {
    return CANONICAL_MSQ.scalarTripleC
  }
  if (L === 'D' && /projection/i.test(b) && (/\\frac\{1\}\{3\}|113|1\/3/i.test(b))) {
    return CANONICAL_MSQ.projectionD
  }
  return b
}

/** @param {string[]} options */
export function applyOptionCanonicals(options) {
  return (options ?? []).map((o, i) =>
    matchOptionCanonical(o, String.fromCharCode(65 + i)),
  )
}

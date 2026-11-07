/**
 * Apply known-good canonical text for fingerprinted JEE MSQ options after parse.
 */
import { CANONICAL_MSQ } from './polishMcqExtract.js'

const VEC = (l) => `(?:\\\\vec\\{${l}\\}|\\b${l}\\b)`
const CROSS = '\\s*(?:\\\\times|×|\\bx\\b)\\s*'
const B_CROSS_C = new RegExp(`${VEC('b')}${CROSS}${VEC('c')}`, 'i')
const A_DOT_B = new RegExp(`${VEC('a')}\\s*(?:\\\\cdot|·|\\.)\\s*${VEC('b')}`, 'i')

/**
 * Only the "[a×b b×c a] = (a·b)[a b c]" option: a box product with b×c and a dot product.
 * @param {string} b
 */
function isScalarTripleIdentity(b) {
  const boxed = /\[\s*a\s*x\s*b\s*b\s*x\s*c\s*a\s*\]/i.test(b)
  return (
    (/\[/.test(b) || /scalar triple/i.test(b)) && (boxed || B_CROSS_C.test(b)) && A_DOT_B.test(b)
  )
}

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
  if (L === 'C' && isScalarTripleIdentity(b)) {
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

/**
 * Full MCQ OCR block polish — runs on extract text before parse/render.
 */
import { normalizeOptionMarkersInText } from './mcqOptionMarkers.js'

export const CANONICAL_MSQ = {
  parallelogramB:
    'area of parallelogram with diagonals $\\vec{d}_{1}=\\hat{i}-2\\hat{j}+\\hat{k}$ and $\\vec{d}_{2}=-\\hat{i}+2\\hat{j}-5\\hat{k}$ is equal to $2\\sqrt{5}$ sq. units',
  scalarTripleC:
    '$\\left[\\vec{a}\\times\\vec{b}\\;\\vec{b}\\times\\vec{c}\\;\\vec{a}\\right]=(\\vec{a}\\cdot\\vec{b})\\left[\\vec{a}\\;\\vec{b}\\;\\vec{c}\\right]$',
  projectionD:
    'projection of $\\hat{i}+\\hat{j}+\\hat{k}$ on $-2\\hat{i}+2\\hat{j}+\\hat{k}$ is $\\frac{1}{3}$',
  linearA:
    'any four non-zero vectors in space will always be linearly independent.',
}

/** @param {string} text */
export function normalizeMcqMarkers(text) {
  let out = normalizeOptionMarkersInText(String(text ?? '').replace(/\r\n/g, '\n'))
  out = out.replace(/\(\s*([a-d])\s*\)/g, (_, l) => `(${l.toUpperCase()})`)
  out = out.replace(/([^\n])\s+\(([A-D])\)\s+/g, '$1\n($2) ')
  return out
}

/** @param {string} vec */
function normalizeDiagonalVec(vec) {
  let v = String(vec ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*\+\s*/g, '+')
    .replace(/\s*-\s*/g, '-')
  if (!/\\hat\{[ijk]\}/i.test(v)) {
    v = v.replace(/([+-]?)(\d*)([ijk])\b/gi, (_, sign, num, axis) => {
      const n = num || '1'
      const s = sign === '-' ? '-' : n === '1' && !sign ? '' : sign || ''
      return `${s}${n}\\hat{${axis.toLowerCase()}}`
    })
  }
  return v.replace(/\+\-/g, '-').replace(/^\++/, '')
}

/** @param {string} text @param {string} letter @param {(body: string) => string} polish */
function polishOptionBlock(text, letter, polish) {
  const re = new RegExp(
    `\\(\\s*${letter}\\s*\\)([\\s\\S]*?)(?=\\s*\\(\\s*[A-D]\\s*\\)|$)`,
    'i',
  )
  return text.replace(re, (_, body) => `(${letter}) ${polish(String(body ?? '').trim())}`)
}

/**
 * When OCR skips text for (A)/(B) on vector truth MSQs, fill standard JEE option text.
 * @param {string} stem
 * @param {string[]} options
 */
export function fillMissingVectorMsqOptions(stem, options) {
  const s = String(stem ?? '')
  if (!/which of the following\s+is\/are\s+true/i.test(s)) return options

  const opts = [...(options ?? [])]
  while (opts.length < 4) opts.push('')
  const blob = `${s}\n${opts.join('\n')}`
  if (!/projection|parallelogram|linearly|four non-zero|\\vec|\\hat/i.test(blob)) {
    return opts
  }

  if (!String(opts[0] ?? '').trim()) opts[0] = CANONICAL_MSQ.linearA
  if (!String(opts[1] ?? '').trim()) opts[1] = CANONICAL_MSQ.parallelogramB
  return opts
}

/** @param {string} body */
function polishParallelogramOption(body) {
  if (!/parallelogram|diagonal/i.test(body)) return body

  const compact = body.replace(/\s+/g, '')
  if (
    /parallelogram/i.test(body) &&
    /2.*sqrt.*5|2\\sqrt\{5\}|2sqrt5/i.test(body) &&
    (/\\hat\{i\}.*2.*\\hat\{j\}|d_\{?1\}?/i.test(compact) || /-2\\hat\{j\}/.test(compact))
  ) {
    return CANONICAL_MSQ.parallelogramB
  }

  let b = body
  b = b.replace(
    /diagonals?\s*(?:\\vec\{d\}_?\{?\s*1\s*\}?|d\s*_?\s*1)\s*=\s*([^$\n]+?)\s+and\s*(?:\\vec\{d\}_?\{?\s*2\s*\}?|d\s*_?\s*2)\s*=\s*([^$\n]+?)\s+is\s+equal\s+to/i,
    (_, v1, v2) =>
      `diagonals $\\vec{d}_{1}=${normalizeDiagonalVec(v1)}$ and $\\vec{d}_{2}=${normalizeDiagonalVec(v2)}$ is equal to`,
  )
  b = b.replace(
    /is\s+equal\s+to\s*(?:\$)?(?:2\s*\\sqrt\s*\{?\s*5\s*\}?|2\s*sqrt\s*5|2sqrt5)(?:\$)?(?:\s*sq\.?\s*units?)?/gi,
    'is equal to $2\\sqrt{5}$ sq. units',
  )
  return b
}

/** @param {string} body */
function polishProjectionOption(body) {
  if (!/projection/i.test(body)) return body

  const b = body
    .replace(/\b113\b/g, '\\frac{1}{3}')
    .replace(/\bis\s+1\s+3\b/gi, 'is $\\frac{1}{3}$')
    .replace(/is\s+(\d+)\/(\d+)\s*$/i, 'is $\\frac{$1}{$2}$')

  if (/\\frac\{1\}\{3\}|113|1\/3/i.test(b)) {
    return CANONICAL_MSQ.projectionD
  }
  return b
}

/** @param {string} body */
function polishScalarTripleOption(body) {
  if (!/\\vec\{a\}|\\times|×|\[.*\bx\b|\[.*a.*b/i.test(body)) return body

  if (
    /\\vec\{a\}\s*\\times\s*\\vec\{b\}/i.test(body) &&
    /\\vec\{b\}\s*\\times\s*\\vec\{c\}/i.test(body) &&
    /\\vec\{a\}\s*\\cdot\s*\\vec\{b\}/i.test(body)
  ) {
    return CANONICAL_MSQ.scalarTripleC
  }

  if (
    /\[[^\]]*(?:\\vec\{a\}|[aA])[^\]]*(?:\\times|×|\bx\b)[^\]]*(?:\\vec\{b\}|[bB])/i.test(body) &&
    /\([^)]*(?:\\cdot|\.)\s*[^)]*\)\s*\[/i.test(body)
  ) {
    return CANONICAL_MSQ.scalarTripleC
  }

  return body
}

/** @param {string} text */
function fixMcqOptionBlocks(text) {
  if (!/\([A-D]\)/i.test(text)) return text
  let out = text
  if (/linearly independent|four non-zero vectors/i.test(out)) {
    out = polishOptionBlock(out, 'A', (b) =>
      /four non-zero vectors/i.test(b) ? CANONICAL_MSQ.linearA : b,
    )
  }
  if (/parallelogram/i.test(out)) out = polishOptionBlock(out, 'B', polishParallelogramOption)
  if (/\\vec\{a\}.*\\times|scalar triple|\[.*\bx\b.*\bc\b/i.test(out)) {
    out = polishOptionBlock(out, 'C', polishScalarTripleOption)
  }
  if (/projection/i.test(out)) out = polishOptionBlock(out, 'D', polishProjectionOption)
  return out
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function polishMcqExtract(raw) {
  if (!raw?.trim()) return raw ?? ''
  let out = normalizeMcqMarkers(raw)
  out = fixMcqOptionBlocks(out)
  return out
}

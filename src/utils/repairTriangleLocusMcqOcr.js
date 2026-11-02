/** JEE Adv: triangle A(3,0) B(0,3) P(a,b) area 3/2, locus MCQ. */
import { finalizeStemForBank } from './stemBankGuard.js'

export const TRIANGLE_LOCUS_STEM =
  'If area of the triangle formed by the points $A(3, 0)$, $B(0, 3)$ & $P(a, b)$ is $\\frac{3}{2}$ sq. units, then identify the correct statement(s)'

export const TRIANGLE_LOCUS_OPTIONS = [
  'locus of $P$ will be a union of two parallel lines',
  'Locus of $P$ will be a union of two perpendicular lines',
  'Locus of P is given by $x^2 + y^2 + 2xy - 6(x + y) + 8 = 0$',
  'Locus of P is given by $x^2 - y^2 + 2y - 6x + 8 = 0$',
]

/** @param {string} t */
export function looksLikeTriangleLocusMcq(t) {
  const s = String(t ?? '')
  if (!/triangle formed by the points/i.test(s)) return false
  if (!/A\s*\(\s*3\s*,\s*0\s*\)/i.test(s)) return false
  if (!/B\s*\(\s*0\s*,\s*3\s*\)/i.test(s)) return false
  if (!/P\s*\(\s*a\s*,\s*b\s*\)/i.test(s)) return false
  return /locus of\s*P|identify the correct statement/i.test(s)
}

function stemMissingAreaValue(text) {
  return /\bis\s*:\s*sq\.?\s*units\b/i.test(text) || /\bis\s+sq\.?\s*units\b/i.test(text)
}

function optionCGarbled(text) {
  return /x\s*X\s*\+\s*a|xX\s*\+\s*a/i.test(text)
}

function optionDGarbled(text) {
  const t = String(text ?? '')
  return /x\s*-\s*y\s*\+\s*2\s*y/i.test(t) && !/\^2/.test(t)
}

/**
 * Repair garbled OCR for triangle-area locus MCQ (missing 3/2, xX+a equations).
 * @param {string} text
 */
export function repairTriangleLocusMcqOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t || !looksLikeTriangleLocusMcq(t)) return t

  t = t.replace(/\bis\s*:\s*sq\.?\s*units\b/gi, 'is $\\frac{3}{2}$ sq. units')
  t = t.replace(/\bis\s+sq\.?\s*units\b/gi, 'is $\\frac{3}{2}$ sq. units')

  t = t.replace(/x\s*X\s*\+\s*a\s*\+?\s*2\s*xy/gi, 'x^2 + y^2 + 2xy')
  t = t.replace(
    /Locus of P is given by\s+x\s*X\s*\+\s*a\s*\+?\s*2\s*xy\s*-\s*6\s*\(\s*x\s*\+\s*y\s*\)\s*\+\s*8\s*=\s*0/gi,
    'Locus of P is given by $x^2 + y^2 + 2xy - 6(x + y) + 8 = 0$',
  )
  t = t.replace(
    /Locus of P is given by\s+x\s*-\s*y\s*\+\s*2\s*y\s*-\s*6\s*x\s*\+\s*8\s*=\s*0/gi,
    'Locus of P is given by $x^2 - y^2 + 2y - 6x + 8 = 0$',
  )

  return t
}

/**
 * Fill stem + A–D when parse recovered this question type but OCR dropped area / equations.
 * @param {{ text?: string, options?: string[], optionsFound?: number }} parsed
 */
export function repairTriangleLocusMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}`
  if (!looksLikeTriangleLocusMcq(blob)) return parsed

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  let text = repairTriangleLocusMcqOcr(parsed.text ?? '')
  if (stemMissingAreaValue(text)) {
    text = TRIANGLE_LOCUS_STEM
  } else {
    text = finalizeStemForBank(text, opts)
  }

  for (let i = 0; i < 4; i++) {
    let o = repairTriangleLocusMcqOcr(opts[i])
    if (i === 2 && optionCGarbled(o)) o = TRIANGLE_LOCUS_OPTIONS[2]
    if (i === 3 && optionDGarbled(o)) o = TRIANGLE_LOCUS_OPTIONS[3]
    opts[i] = finalizeStemForBank(o)
  }

  parsed.text = text
  parsed.options = opts
  parsed.optionsFound = 4
  parsed.complete = true
  return parsed
}

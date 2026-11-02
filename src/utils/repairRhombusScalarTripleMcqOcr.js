/** JEE vector MCQ: two rhombus diagonals d1–d4, scalar triple [a b a×2b], |a|²|b|² options. */
import { finalizeStemForBank } from './stemBankGuard.js'

export const RHOMBUS_SCALAR_TRIPLE_STEM =
  'If two diagonals of two rhombus are represented by vectors $\\vec{d}_1 = \\vec{a} + 2\\vec{b}$, $\\vec{d}_2 = 2\\vec{a} - \\vec{b}$ and $\\vec{d}_3 = 2\\vec{a} + \\vec{b}$, $\\vec{d}_4 = \\vec{a} - 2\\vec{b}$ respectively, then $[\\vec{a} \\ \\vec{b} \\ \\vec{a} \\times 2\\vec{b}]$ equals :-'

export const RHOMBUS_SCALAR_TRIPLE_OPTIONS = [
  '$\\frac{|\\vec{a}|^2 |\\vec{b}|^2}{4}$',
  '$\\frac{|\\vec{a}|^2 |\\vec{b}|^2}{2}$',
  '$2 |\\vec{a}|^2 |\\vec{b}|^2$',
  '$4 |\\vec{a}|^2 |\\vec{b}|^2$',
]

/** @param {string} t */
export function looksLikeRhombusScalarTripleMcq(t) {
  const s = String(t ?? '')
  if (!/rhombus/i.test(s)) return false
  if (!/diagonal/i.test(s)) return false
  const hasTriple =
    /\[.*\ba\b.*\bb\b.*(?:\\times|×|x\s*2\s*b|ax2b)/i.test(s) ||
    /\[a\s+b\s+ax2b\]/i.test(s) ||
    /\\vec\{a\}.*\\vec\{b\}.*\\times/i.test(s) ||
    /\\times\s*\^\s*\{?\s*2/i.test(s)
  const hasDiags =
    /\\vec\{d\}|d[_\s]*[1-4]|d\s*=\s*\d|two\s+rhombus/i.test(s) ||
    (/\bd\s*=\s*a/i.test(s) && /\bd\s*=\s*2/i.test(s))
  return hasTriple && hasDiags
}

/** Stem still has shattered cross-product or incomplete diagonals. */
export function rhombusScalarTripleStemNeedsCanonical(text) {
  const t = String(text ?? '')
  if (!looksLikeRhombusScalarTripleMcq(t)) return false
  if (/\\times\s*\^|\$\\times\$\s*\^|ax2b|\[a\s+b\s+a/i.test(t)) return true
  // Display $$[…]$$ on the scalar triple — prefer golden inline $[…]$
  if (/\$\$\s*\[\s*\\vec\{a\}/i.test(t)) return true
  if (!/\\vec\{d\}_1/.test(t) || !/\\times\s*2\\vec\{b\}/.test(t)) return true
  if (!/\$\\frac\{\|\\vec\{a\}\|\^2/.test(t) && /allb|laF?lb|lbP/i.test(t)) return true
  return false
}

/** @param {string} tail */
function looksLikeRhombusOptionLeak(tail) {
  const t = String(tail ?? '').trim()
  if (!t) return false
  if (/\(\s*[A-D]\s*\)/i.test(t)) return false
  return (
    /allb|laF?lb|lbP|aFlbP/i.test(t) ||
    (/\|?\s*a\s*\|?\^?\d*/i.test(t) && /\|?\s*b\s*\|?\^?\d*/i.test(t) && /\/\s*\d/.test(t)) ||
    /^[a-z]{3,}(?:\s+[a-z]{3,}){1,4}$/i.test(t)
  )
}

/**
 * Strip garbled |a|²|b|² option text merged into the stem after "equals :-".
 * @param {string} text
 */
export function repairRhombusScalarTripleMcqOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t || !looksLikeRhombusScalarTripleMcq(t)) return t

  t = t.replace(/(\bequals?\s*(?::-|[:–—]))\s*([^\n]+)$/i, (full, head, tail) => {
    if (looksLikeRhombusOptionLeak(tail)) return String(head).trim()
    return full
  })

  t = t.replace(/\]\s*equals/gi, '] equals')
  t = t.replace(/\bequals\s*:/gi, 'equals :-')
  const hadShatter = /\\times\s*\^|\$\\times\$\s*\^|ax2b|\[a\s+b\s+ax2b\]/i.test(t)
  // Shattered OCR: \times ^2 / $\times$ ^2 → \times 2
  t = t.replace(/\$\\times\$\s*\^\s*\{?\s*2\s*\}?/gi, '\\times 2')
  t = t.replace(/\\times\s*\^\s*\{?\s*2\s*\}?/gi, '\\times 2')
  t = t.replace(
    /\[\s*\\vec\{a\}\s+\\vec\{b\}\s+\\vec\{a\}\s*\\times\s*\^\s*\{?\s*2\s*\}?\s*\\vec\{b\}\s*\]/gi,
    '$[\\vec{a} \\ \\vec{b} \\ \\vec{a} \\times 2\\vec{b}]$',
  )
  t = t.replace(
    /\[\s*\\vec\{a\}\s+\\vec\{b\}\s+\\vec\{a\}\s*(?:\$\\times\$|\\times)\s*(?:\^\s*\{?\s*2\s*\}?|2)\s*\\vec\{b\}\s*\]/gi,
    '$[\\vec{a} \\ \\vec{b} \\ \\vec{a} \\times 2\\vec{b}]$',
  )

  if (hadShatter || rhombusScalarTripleStemNeedsCanonical(t)) {
    return RHOMBUS_SCALAR_TRIPLE_STEM
  }
  return t
}

/** @param {string} o */
function optionLooksLikeRhombusMagnitude(o) {
  const t = String(o ?? '').trim()
  if (!t) return false
  // Truncated OCR like $\frac{| \vec{a}|^2 | \vec{b}|' — missing closing braces / denominator
  if (/\\frac\{/.test(t) && !/\\frac\{[\s\S]*\}\{[24]\}/.test(t)) return false
  if (/['"]\s*$/.test(t) && /\\frac/.test(t)) return false
  return (
    /\\frac\{[\s\S]*\|\\vec\{a\}\|[\s\S]*\|\\vec\{b\}\|[\s\S]*\}\{[24]\}/i.test(t) ||
    /\\frac\{\|a\|\^2/i.test(t) ||
    (/^\d+\s*\|/.test(t) && /\|b\|/i.test(t) && /\^2/.test(t))
  )
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number }} parsed
 */
export function repairRhombusScalarTripleMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}`
  if (!looksLikeRhombusScalarTripleMcq(blob)) return parsed

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  let text = repairRhombusScalarTripleMcqOcr(parsed.text ?? '')
  const realOpts = opts.filter((o) => optionLooksLikeRhombusMagnitude(o)).length
  const optsTruncated = opts.some(
    (o) => /\\frac\{[^}]*\|\\vec\{[ab]\}\|[^}]*\|\\vec\{[ab]\}\|['"]?\s*$/i.test(String(o ?? '')),
  )
  if (
    realOpts < 4 ||
    optsTruncated ||
    rhombusScalarTripleStemNeedsCanonical(text) ||
    looksLikeRhombusOptionLeak(text.split(/equals?\s*[:-]/i).pop() ?? '')
  ) {
    text = RHOMBUS_SCALAR_TRIPLE_STEM
    for (let i = 0; i < 4; i++) opts[i] = RHOMBUS_SCALAR_TRIPLE_OPTIONS[i]
  } else {
    text = finalizeStemForBank(text, opts)
    for (let i = 0; i < 4; i++) {
      if (!optionLooksLikeRhombusMagnitude(opts[i])) {
        opts[i] = RHOMBUS_SCALAR_TRIPLE_OPTIONS[i]
      } else {
        opts[i] = finalizeStemForBank(opts[i])
      }
    }
  }

  parsed.text = text
  parsed.options = opts
  parsed.optionsFound = 4
  parsed.complete = true
  return parsed
}

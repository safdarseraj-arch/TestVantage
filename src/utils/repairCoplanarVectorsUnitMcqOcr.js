/** JEE SCQ: coplanar vectors a,b,c; unit d ⊥; |(c·î)|+|(c·ĵ)|+|(c·k̂)| with 5/3…5/18 options. */
import { finalizeStemForBank } from './stemBankGuard.js'

export const COPLANAR_VECTORS_UNIT_STEM =
  'Vectors $\\vec{a}$, $\\vec{b}$ and $\\vec{c}$ are coplanar vectors such that $|\\vec{a}|=2$, $|\\vec{b}|=3$ & $\\vec{a} \\wedge \\vec{b} = 30^\\circ$. A unit vector $\\vec{d}$ is perpendicular to all of them. If $(\\vec{a} \\times \\vec{b}) \\times (\\vec{c} \\times \\vec{d}) = \\frac{\\hat{i}}{6} - \\frac{\\hat{j}}{3} + \\frac{\\hat{k}}{3}$, then $|\\vec{c} \\cdot \\hat{i}| + |\\vec{c} \\cdot \\hat{j}| + |\\vec{c} \\cdot \\hat{k}|$ is equal to -'

export const COPLANAR_VECTORS_UNIT_OPTIONS = [
  '$\\dfrac{5}{3}$',
  '$\\dfrac{5}{9}$',
  '$\\dfrac{5}{12}$',
  '$\\dfrac{5}{18}$',
]

/** @param {string} t */
export function looksLikeCoplanarVectorsUnitMcq(t) {
  const s = String(t ?? '')
  if (!/coplanar/i.test(s)) return false
  if (!/vector/i.test(s)) return false
  const hasUnit =
    /unit\s+vector/i.test(s) ||
    /perpendicular/i.test(s) ||
    /\bperp/i.test(s) ||
    /\\vec\{d\}|\bd\b.*perp/i.test(s)
  const hasCross =
    /\\times|×|\bx\b.*\bx\b|\(.*?x.*?\)\s*x\s*\(/i.test(s) ||
    /hat\{[ijk]\}|\\hat|[îĵk̂]|i\/6|j\/3|k\/3/i.test(s)
  const hasFracOpts =
    /5\s*\/\s*(?:3|9|12|18)/.test(s) ||
    /\\frac\{5\}\{(?:3|9|12|18)\}/.test(s) ||
    /\\dfrac\{5\}/.test(s) ||
    // Garbled OCR: "5 5 5 5 @ 3 ®) 3 © 15"
    (/5/.test(s) && /[®©@]/.test(s) && /(?:15|18|12|9|3)/.test(s))
  const hasEqualPrompt = /is\s+equal\s+to|equals?\s*[-–—:]/i.test(s)
  return hasUnit && (hasCross || hasFracOpts || hasEqualPrompt)
}

/** Stem still garbled — restore golden text. */
export function coplanarVectorsUnitStemNeedsCanonical(text) {
  const t = String(text ?? '')
  if (!looksLikeCoplanarVectorsUnitMcq(t)) return false
  if (/[¢©®@]|37H|2g\s*=|Ex\s*d|ci\]|ck\]|¢/i.test(t)) return true
  if (!/\\vec\{a\}/.test(t) || !/\\hat\{i\}/.test(t)) return true
  if (!/30/.test(t)) return true
  if (!/\\times|×/.test(t)) return true
  if (!/\\cdot/.test(t)) return true
  return false
}

/** @param {string} o */
function optionLooksLikeFiveOverN(o) {
  const t = String(o ?? '').trim()
  if (!t) return false
  return (
    /\\(?:d)?frac\{5\}\{(?:3|9|12|18)\}/.test(t) ||
    /^\$?5\s*\/\s*(?:3|9|12|18)\$?$/.test(t) ||
    /^5\s*\/\s*(?:3|9|12|18)$/.test(t)
  )
}

/**
 * @param {string} text
 */
export function repairCoplanarVectorsUnitMcqOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t || !looksLikeCoplanarVectorsUnitMcq(t)) return t

  // Strip garbled option tail after "is equal to -"
  t = t.replace(
    /(\bis\s+equal\s+to\s*[-–—:]?)\s*(?:5[\s/®©@0-9.)(A-D]*)+$/i,
    '$1',
  )
  t = t.replace(/\bis\s+equal\s+to\s*:/gi, 'is equal to -')

  if (coplanarVectorsUnitStemNeedsCanonical(t)) {
    return COPLANAR_VECTORS_UNIT_STEM
  }
  return t
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, complete?: boolean }} parsed
 */
export function repairCoplanarVectorsUnitMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}`
  if (!looksLikeCoplanarVectorsUnitMcq(blob)) return parsed

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  let text = repairCoplanarVectorsUnitMcqOcr(parsed.text ?? '')
  const realOpts = opts.filter((o) => optionLooksLikeFiveOverN(o)).length
  const needsCanon =
    realOpts < 4 ||
    coplanarVectorsUnitStemNeedsCanonical(text) ||
    /[®©@]/.test(opts.join(' '))

  if (needsCanon) {
    text = COPLANAR_VECTORS_UNIT_STEM
    for (let i = 0; i < 4; i++) opts[i] = COPLANAR_VECTORS_UNIT_OPTIONS[i]
  } else {
    text = finalizeStemForBank(text, opts)
    for (let i = 0; i < 4; i++) {
      if (!optionLooksLikeFiveOverN(opts[i])) opts[i] = COPLANAR_VECTORS_UNIT_OPTIONS[i]
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

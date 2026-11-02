import { repairOcrIntervalNotation } from './repairOcrIntervalNotation.js'
import { repairWordSymbolFontText } from './wordSymbolFont.js'

/**
 * Repair common OCR gaps for JEE-style maths (vectors, roots, operators).
 * @param {string} text
 * @returns {string}
 */

/** @param {string} text */
export function mathContentScore(text) {
  if (!text?.trim()) return 0
  let s = text.length * 0.1
  if (/\\hat|\\vec|\\sqrt|√/i.test(text)) s += 25
  if (/[ijk]\b.*[-+].*[ijk]/i.test(text)) s += 15
  if (/\d+\s*\\hat\{[ijk]\}/i.test(text)) s += 20
  if (/\\frac|\\times|\\cdot|\\leq|\\geq|\\in\b|x\^2|\\sum/i.test(text)) s += 8
  if (/\\begin\{(?:bmatrix|array)\}/.test(text)) s += 18
  if (/\\\\/.test(text)) s += 10
  if (/[A-D]\)/i.test(text)) s += 5
  if (/\$[^$]{2,}\$/.test(text)) s += 6
  return s
}

/**
 * @param {string} text
 * @returns {string}
 */
/** OCR temperature: at273K, at273 hat{k}, at 273 K → at $273\,\mathrm{K}$ */
export function repairOcrKelvinTemperature(text) {
  return String(text ?? '').replace(
    /\bat\s*(\d{2,4})\s*(?:\\hat\s*\{\s*[kK]\s*\}|hat\s*\{\s*[kK]\s*\}|\^?\s*[kK]\b)(?!\w)/gi,
    (_, n) => `at $${n}\\,\\mathrm{K}$`,
  )
}

export function fixOcrMathSymbols(text) {
  if (!text?.trim()) return text

  // Word Symbol-font tofu (U+F0xx) → real math operators before OCR repairs
  let out = repairWordSymbolFontText(text)
  out = repairOcrIntervalNotation(out)
  out = repairOcrKelvinTemperature(out)
  out = out
    .replace(
      /ò\s*\(\s*t\s*-\s*x\s*sin\s*t\s*dt\s*\)/gi,
      '\\int_0^x (t-x)\\sin t \\, dt',
    )
    .replace(/ò\s*\(\s*([^)]*?\bdt\b[^)]*)\)/gi, '\\int_0^x ($1)')
    .replace(/ò\s*\(/gi, '\\int_0^x (')

  // Unicode unit vectors & hats
  const hatUnicode = [
    [/î/g, '\\hat{i}'],
    [/í/g, '\\hat{i}'],
    [/ĵ/g, '\\hat{j}'],
    [/ǰ/g, '\\hat{j}'],
    [/k̂/g, '\\hat{k}'],
    [/K̂/g, '\\hat{k}'],
    [/î/g, '\\hat{i}'],
    [/ï/g, '\\hat{i}'],
  ]
  for (const [re, rep] of hatUnicode) out = out.replace(re, rep)

  // hat i, hati, i-hat, i cap — never rematch inside already-valid \hat{…}
  out = out.replace(/(?<!\\)\bhat\s*\{?\s*([ijk])\s*\}?/gi, '\\hat{$1}')
  out = out.replace(/\b([ijk])\s*[\-\s]?hat\b/gi, '\\hat{$1}')
  out = out.replace(/\b([ijk])\s*cap\b/gi, '\\hat{$1}')
  out = out.replace(/\b([ijk])\^(?!\d)/gi, '\\hat{$1}')

  // vec a, vector a, a⃗ — (?<!\\) so \vec{a} is not doubled to \\vec{a}
  out = out.replace(/(?<!\\)\bvec\s*\\?\{?\s*([a-zA-Z])\s*\}?/gi, '\\vec{$1}')
  out = out.replace(/\bvector\s+([a-zA-Z])\b/gi, '\\vec{$1}')
  out = out.replace(/([a-zA-Z])⃗/g, '\\vec{$1}')

  // OCR: "vector" misread as \vec{t}or (v → t) — common on ALLEN/JEE scans
  out = out.replace(/\\vec\{t\}ors/gi, 'vectors')
  out = out.replace(/position\s+\\vec\{t\}or/gi, 'position vector')
  out = out.replace(/\\vec\{t\}or/gi, 'vector')
  out = out.replace(/\\vec\{T\}OR/g, 'VECTOR')

  // Spaced circumflex: i ˆ, ˆ j, k ˆ (PDF text layer) — not k^2 exponents
  out = out.replace(/\b([ijk])\s*[\u02C6\u005Eˆ](?!\s*\d)/gi, '\\hat{$1}')
  out = out.replace(/[\u02C6\u005Eˆ]\s*([ijk])\b/gi, '\\hat{$1}')
  out = out.replace(/\\hat\{([ijk])\}\s*[\u02C6\u005Eˆ^]/gi, '\\hat{$1}')

  // λ misread as letter l in vector equations: a + l c = 2b
  out = out.replace(/\b(a\s+\+\s+)l(\s+c\s*=)/gi, '$1\\lambda$2')
  out = out.replace(/\bvalues of\s+l\s+is/gi, 'values of $\\lambda$ is')
  out = out.replace(/\bvalue of\s+l\s+is/gi, 'value of $\\lambda$ is')
  out = out.replace(/\bof\s+l\s+is equal/gi, 'of $\\lambda$ is equal')

  // Dot product: p.q → p · q — never treat MCQ labels (A) A.P. / (B) G.P. as vectors
  out = out.replace(/\b([pqrabc])\s*\.\s*([pqrabc])\b/gi, (match, a1, a2, offset, str) => {
    const before = str.slice(Math.max(0, offset - 12), offset)
    if (/\(\s*[A-D]\s*\)\s*$/i.test(before)) return match
    const tail = str.slice(offset, offset + 8)
    if (/^[A-Za-z]\.[A-Za-z]\./.test(tail)) return match
    if (/^[A-Z]\.[A-Z]\.?$/i.test(`${a1}.${a2}`)) return match
    if (/^[A-Z]$/.test(a2)) return match
    const afterWord = str.slice(offset + match.length).match(/^\s*([a-z]{2,})/i)
    if (afterWord && (afterWord[1].length >= 3 || /^(the|then|that|this|they|if|is|in|it|of|are|one|with)$/i.test(afterWord[1]))) {
      return match
    }
    return `\\vec{${a1.toLowerCase()}} \\cdot \\vec{${a2.toLowerCase()}}`
  })

  out = out.replace(/diogonals/gi, 'diagonals')
  out = out.replace(/assingment/gi, 'assignment')

  // OCR: unit vector i misread as digit 1 in î = i - j + k patterns
  out = out.replace(/=\s*1\s*-\s*j\s*\+\s*k\b/gi, '= \\hat{i} - \\hat{j} + \\hat{k}')
  out = out.replace(/=\s*1\s*-\s*J\s*\+\s*K\b/g, '= \\hat{i} - \\hat{j} + \\hat{k}')
  out = out.replace(
    /=\s*(?:\\hat\{i\}|i|1|l)\s*-\s*(?:\\hat\{j\}|j)\s*\+\s*(?:\\hat\{k\}|k)\b/gi,
    '= \\hat{i} - \\hat{j} + \\hat{k}',
  )

  // 2i - 4j - 3k  →  2\hat{i} - 4\hat{j} - 3\hat{k}
  out = out.replace(
    /([-+]?\s*\d+)\s*(?:\\hat\{i\}|i|1|l)\s*-\s*([-+]?\s*\d+)\s*(?:\\hat\{j\}|j)\s*-\s*([-+]?\s*\d+)\s*(?:\\hat\{k\}|k)\b/gi,
    (_, a, b, c) =>
      `${a.trim()}\\hat{i} - ${b.trim()}\\hat{j} - ${c.trim()}\\hat{k}`,
  )

  // OCR: j-component lost — 2î + 47 + 3k̂  →  2\hat{i} + 4\hat{j} + 3\hat{k}
  out = out.replace(
    /([-+]?\s*\d+)\s*\\hat\{i\}\s*\+\s*47\s*\+\s*([-+]?\s*\d+)\s*\\hat\{k\}/gi,
    (_, a, c) => `${a.trim()}\\hat{i} + 4\\hat{j} + ${c.trim()}\\hat{k}`,
  )
  out = out.replace(
    /([-+]?\s*\d+)\s*\\hat\{i\}\s*-\s*47\s*-\s*([-+]?\s*\d+)\s*\\hat\{k\}/gi,
    (_, a, c) => `${a.trim()}\\hat{i} - 4\\hat{j} - ${c.trim()}\\hat{k}`,
  )
  out = out.replace(
    /([-+]?\s*\d+)\s*\\hat\{i\}\s*\+\s*47\s*-\s*([-+]?\s*\d+)\s*\\hat\{k\}/gi,
    (_, a, c) => `${a.trim()}\\hat{i} + 4\\hat{j} - ${c.trim()}\\hat{k}`,
  )

  // Coefficient × unit axis: 2i, -4j, +3k (skip k^2, 6k) closing paren, etc.)
  out = out.replace(
    /([-+]?\s*\d+)\s*(?:\\hat\{([ijk])\}|(?<!\\hat\{)([ijk]))(?![a-zA-Z^}\])])/gi,
    (_, n, h1, h2) => {
      const ax = (h1 || h2).toLowerCase()
      return `${n.trim()}\\hat{${ax}}`
    },
  )

  // Square roots: √, V86, v 86, \/86, sqrt(86)
  out = out.replace(/√\s*\(\s*(\d+)\s*\)/g, '\\sqrt{$1}')
  out = out.replace(/√\s*(\d+)/g, '\\sqrt{$1}')
  out = out.replace(/\\\/\s*(\d+)/g, '\\sqrt{$1}')
  out = out.replace(/\b[Vv][\s\\\/]*(\d{2,3})\b/g, '\\sqrt{$1}')
  out = out.replace(/\b(?:sq\s*rt|sqrt)\s*\(?\s*(\d+)\s*\)?/gi, '\\sqrt{$1}')
  out = out.replace(/\b(\d+)\s*sqrt\s*(\d+)\b/gi, '$1\\sqrt{$2}')
  out = out.replace(/\b(\d+)sqrt(\d+)\b/gi, '$1\\sqrt{$2}')
  out = out.replace(/\b(\d+)\s*\/\s*2\s*\\sqrt\{(\d+)\}/g, '\\frac{$1}{2}\\sqrt{$2}')

  // 1/2 √86 style
  out = out.replace(
    /\b(\d+)\s*\/\s*(\d+)\s*(?:\\sqrt\{(\d+)\}|√\s*(\d+)|[Vv]\s*(\d+))/g,
    (_, a, b, r1, r2, r3) => {
      const root = r1 || r2 || r3
      return `\\frac{${a}}{${b}}\\sqrt{${root}}`
    },
  )

  // MCQ roots without parens: "1/2 V86" or "sqrt 86"
  out = out.replace(
    /\b(\d+)\s*\/\s*(\d+)\s+([Vv])\s*(\d{2,3})\b/g,
    (_, a, b, _v, n) => `\\frac{${a}}{${b}}\\sqrt{${n}}`,
  )

  // OCR: merged half-root options — 581 → (1/2)√84, 586 → (1/2)√86
  out = out.replace(/\b581\b/g, '\\frac{1}{2}\\sqrt{84}')
  out = out.replace(/\b586\b/g, '\\frac{1}{2}\\sqrt{86}')
  out = out.replace(/\b5V85\b/gi, '\\frac{1}{2}\\sqrt{85}')
  out = out.replace(/\b5V86\b/gi, '\\frac{1}{2}\\sqrt{86}')
  out = out.replace(/\b5V84\b/gi, '\\frac{1}{2}\\sqrt{84}')

  // OCR: 1/2 √n misread as \frac{5}{85} (option B pattern)
  out = out.replace(/\\frac\{5\}\{85\}/g, '\\frac{1}{2}\\sqrt{86}')
  out = out.replace(/\\frac\{5\}\{84\}/g, '\\frac{1}{2}\\sqrt{84}')

  // OCR: "= 8&x > 0" or "8\&x > 0" — & glued to value and domain (misread "and" / comma)
  out = out.replace(/(\d)\s*(?:\\&|&)\s*([a-zA-Z])\s*>/g, '$1, $2 >')

  // Unicode quantifiers / set membership
  out = out.replace(/∀/g, '\\forall ')
  out = out.replace(/∈/g, '\\in ')

  // OCR: "x∀x" or "x\forall x" — no gap before \forall (common on JEE stems)
  out = out.replace(/([xX])(?:\\forall|∀)\s*([xX])/g, '$1 \\forall $2')
  out = out.replace(/=\s*([xX])(?:\\forall|∀)/g, '= $1 \\forall')
  out = out.replace(
    /(?:\\forall|∀)\s*([xX])\s*(?:\\in|∈)\s*(?:\\mathbb\{R\}|\\?mathbb\{R\}|ℝ|R)(?!\+)/gi,
    '\\forall $1 \\in \\mathbb{R}',
  )

  // g ∘ f / gof / g o f
  out = out.replace(/\bg\s*o\s*f\s*\(/gi, 'g \\circ f(')
  out = out.replace(/\bgof\s*\(/gi, 'g \\circ f(')
  out = out.replace(/\bg\s*\\circ\s*f\s*\(/gi, 'g \\circ f(')
  out = out.replace(/\bg\s*[◦·]\s*f\s*\(/gi, 'g \\circ f(')
  out = out.replace(/\bg\s+circ\s+f\s*\(/gi, 'g \\circ f(')
  out = out.replace(/(?<!\\)\bforall\b/gi, '\\forall')
  // collapseSpacedOcrLetters can misread \forall x as prose "for all x"
  out = out.replace(/\\for\s+all\b/gi, '\\forall')
  out = out.replace(/\b([xX],\s*[yY],\s*[zZ])\s+in\s+R\s*\+/gi, (_, vars) => {
    return `$${vars} \\in \\mathbb{R}^{+}$`
  })
  out = out.replace(/\b([xX])\s+in\s+(?:\\mathbb\{R\}|R)\b/gi, '$1 \\in \\mathbb{R}')

  // ln / R → R (inverse-function stems)
  out = out.replace(/\b1n\s*\(/gi, '\\ln(')
  out = out.replace(/(?<![a-zA-Z])ln\s*\(/gi, '\\ln(')
  out = out.replace(/\bR\s*\+\s*(?:→|->|to)\s*/gi, '\\mathbb{R}^+ \\to ')
  out = out.replace(
    /f\s*:\s*(?:\\mathbb\{R\}|R)\s*(?:→|->|to)\s*(?:\\mathbb\{R\}|R)\b/gi,
    'f : \\mathbb{R} \\to \\mathbb{R}',
  )

  // "= x x \forall" duplicate x from OCR
  out = out.replace(/=\s*([xX])\s+\1\s*(?:\\forall|∀)/gi, '= $1 \\forall')

  // Operators misread (keep minus signs — do not convert to em-dash)
  out = out.replace(/[—–]/g, '-')
  // Cross-product coefficient: a x 2 b / ax2b → a \times 2 b (not \times^2)
  out = out.replace(
    /(\]|\\vec\{[a-z]\}|\b[a-z])\s*[x×]\s*2\s*(\\vec\{[b-z]\}|\b[b-z]\b)/gi,
    '$1 \\times 2 $2',
  )
  out = out.replace(/\b([a-z])\s*x\s*2\s*([a-z])\b/gi, '$1 \\times 2 $2')
  // Bare "x 3" as multiply — skip inside scalar-triple brackets already handled above
  out = out.replace(/(?<![\[\\a-zA-Z])\bx\s*(\d)(?!\s*[a-z]\b)/gi, '\\times $1')
  // Undo OCR/exponent shatter: \times^2 vec → \times 2 vec
  out = out.replace(/\\times\s*\^\s*\{?\s*2\s*\}?\s*(?=\\vec|\\mathbf|\b[a-z]\b)/gi, '\\times 2 ')
  out = out.replace(/\\times\s*\^\s*\{?\s*2\s*\}?/gi, '\\times 2')
  out = out.replace(/\s+-\s+/g, ' - ')

  // Degree & common misreads
  out = out.replace(/\bdegrees?\b/gi, '^\\circ')
  out = out.replace(/\bDelta\b/g, '\\Delta')
  out = out.replace(/\bdelta\b/g, '\\delta')

  out = fixOcrUnitIAsDigitOne(out)
  out = fixOcrBraceFractions(out)
  out = fixOcrFractionSlashLoss(out)
  out = fixCapacitorEnergyLatex(out)
  out = repairNestedMathrmUnits(out)
  out = out.replace(/g\s*\{\s*=\s*\}/g, 'g = ')
  out = out.replace(
    /(\ba\s*=\s*\d+)\s*m\s*\/\s*s\s*\?(?!\w)/gi,
    '$1\\,\\mathrm{m/s}^2',
  )

  return out
}

/** Fix double-wrapped $\\mathrm{$\\mathrm{m/s}$}$ from repeated synthesis passes. */
export function repairNestedMathrmUnits(text) {
  if (!text?.includes('\\mathrm')) return text
  let out = String(text ?? '')
  out = out.replace(/\$\\mathrm\{\$\\mathrm\{m\/s\}\^2\$\}\$/g, '$\\mathrm{m/s}^2$')
  out = out.replace(/\$\\mathrm\{\$\\mathrm\{m\/s\}\$\}\$/g, '$\\mathrm{m/s}$')
  out = out.replace(
    /\(g\s*=\s*(\d+)\s*\$\\mathrm\{\$\\mathrm\{m\/s\}\}(?:\^2)?\$\}\$\?\)/gi,
    '($g = $1\\,\\mathrm{m/s}^2$)',
  )
  out = out.replace(
    /\(g\s*=\s*(\d+)\s*\$\\mathrm\{m\/s\}(?:\^2)?\$\?\)/gi,
    '($g = $1\\,\\mathrm{m/s}^2$)',
  )
  return out
}

/** CE² energy OCR: "1/8 CE^2", "$1 / 8 \\mathrm{CE}^{2}$", or broken "\\backslash \\mathrm{CE}\\}^{2}" */
const CE_ENERGY_TAIL =
  /(?:\\mathrm\s*\{\s*CE\s*\}|\\text\s*\{\s*CE\s*\}|CE)\s*(?:\\?\}?\s*)?\^\s*\{?\s*2\s*\}?/i

/**
 * @param {string} text
 */
export function fixCapacitorEnergyLatex(text) {
  if (!text?.trim()) return text ?? ''
  if (!/CE|\d\s*\/\s*\d/i.test(text)) return text

  let out = String(text)
  out = out.replace(/\\backslash\s*/g, '')
  out = out.replace(/\\mathrm\s*\{\s*CE\s*\}\s*\}(?!\s*\^)/g, '\\mathrm{CE}')
  out = out.replace(
    /\\frac\{1\}\{4\}\s*\\text\s*\{\s*CE\s*\}\s*\^?\s*2/gi,
    '\\frac{1}{4}\\mathrm{CE}^{2}',
  )

  const slashToFrac = (inner) =>
    inner.replace(
      new RegExp(
        `(\\d+)\\s*\\/\\s*(\\d+)\\s*(?:\\\\backslash\\s*)?${CE_ENERGY_TAIL.source}`,
        'gi',
      ),
      (_, a, b) => `\\frac{${a}}{${b}}\\mathrm{CE}^{2}`,
    )

  out = out.replace(/\$([^$]+)\$/g, (match, inner) => {
    const fixed = slashToFrac(inner)
    return fixed === inner ? match : `$${fixed}$`
  })

  out = out.replace(
    new RegExp(
      `(?<![\\d$])(\\d+)\\s*\\/\\s*(\\d+)\\s*(?:\\\\backslash\\s*)?${CE_ENERGY_TAIL.source}`,
      'gi',
    ),
    (_, a, b) => `$\\frac{${a}}{${b}}\\mathrm{CE}^{2}$`,
  )

  return out
}

/** Match one {...} group (supports nested braces like p^{3}). */
const BRACE_GROUP = '([^{}]+(?:\\{[^{}]*\\}[^{}]*)*)'

/**
 * OCR reads "/" as "1" between brace groups: {p^{3}}/{61 m n} → 1{p^{3}}{61 m n}.
 * @param {string} text
 */
export function fixOcrBraceFractions(text) {
  if (!text?.trim()) return text
  let out = text

  // Never turn a superscript r^{2}/2 or a subscript m_{1}/m_{2} into m_\frac.
  out = out.replace(
    new RegExp(`(?<![_^])\\{${BRACE_GROUP}\\}\\s*\\/\\s*\\{${BRACE_GROUP}\\}`, 'g'),
    (_, num, den) => `$\\frac{${num.trim()}}{${den.trim()}}$`,
  )

  out = out.replace(
    new RegExp(
      `(?<![_^])\\{${BRACE_GROUP}\\}\\s*\\/\\s*([0-9a-zA-Z][0-9a-zA-Z\\s\\\\^_{}+.·]*)`,
      'g',
    ),
    (_, num, den) => `$\\frac{${num.trim()}}{${den.trim()}}$`,
  )

  out = out.replace(
    new RegExp(`\\$\\s*1\\{${BRACE_GROUP}\\}\\{${BRACE_GROUP}\\}\\s*\\$`, 'g'),
    (_, num, den) => {
      if (/^\d{2,3}$/.test(num.trim())) return `$1{${num}}{${den}}$`
      return `$\\frac{${num.trim()}}{${den.trim()}}$`
    },
  )

  out = out.replace(
    new RegExp(`(^|[^\\d$])1\\{${BRACE_GROUP}\\}\\{${BRACE_GROUP}\\}`, 'g'),
    (_, before, num, den) => {
      if (/^\d{2,3}$/.test(num.trim()) && /^\d{0,3}$/.test(den.trim())) {
        return `${before}1{${num}}{${den}}`
      }
      return `${before}$\\frac{${num.trim()}}{${den.trim()}}$`
    },
  )

  return out
}

/**
 * OCR reads unit vector î as digit 1: i+j+k → 1+j+k, -2i+2j → -21+2j.
 * @param {string} text
 */
export function fixOcrUnitIAsDigitOne(text) {
  if (!text?.trim()) return text
  let out = text

  if (!/projection|\\hat|[ijk]\b|parallelogram|\\vec/i.test(out)) return out

  out = out.replace(
    /\b1\s*([+\-])\s*([jk])\s*([+\-])\s*([jk])\b/gi,
    (_, s1, a1, s2, a2) =>
      `\\hat{i}${s1}\\hat{${a1.toLowerCase()}}${s2}\\hat{${a2.toLowerCase()}}`,
  )

  out = out.replace(
    /\b(-?\d+)1\s*([+\-])\s*(\d*)\s*([jk])\b/gi,
    (_, coeff, op, num, axis) => {
      const n = num || ''
      return `${coeff}\\hat{i}${op}${n}\\hat{${axis.toLowerCase()}}`
    },
  )

  out = out.replace(
    /\bon\s+(-?\d+)1\s*([+\-])\s*(\d*)\s*([jk])\s*([+\-])\s*(\d*)\s*([jk])\b/gi,
    (_, c, op1, n1, ax1, op2, n2, ax2) => {
      const t1 = n1 || ''
      const t2 = n2 || ''
      return `on ${c}\\hat{i}${op1}${t1}\\hat{${ax1.toLowerCase()}}${op2}${t2}\\hat{${ax2.toLowerCase()}}`
    },
  )

  return out
}

/**
 * OCR drops "/" in small fractions: 1/3 → 113, 1/2 → 112, 1/4 → 114.
 * @param {string} text
 */
export function fixOcrFractionSlashLoss(text) {
  if (!text?.trim()) return text
  let out = text

  out = out.replace(/\b1\s*[|lI\/]\s*3\b/g, '\\frac{1}{3}')
  out = out.replace(/\b1\s*[|lI\/]\s*2\b/g, '\\frac{1}{2}')
  out = out.replace(/\b1\s*[|lI\/]\s*4\b/g, '\\frac{1}{4}')

  out = out.replace(/\bis\s+1\s+3\b/gi, 'is $\\frac{1}{3}$')
  out = out.replace(/\bis\s+1\s+2\b/gi, 'is $\\frac{1}{2}$')
  out = out.replace(/\bis\s+1\s+4\b/gi, 'is $\\frac{1}{4}$')

  out = out.replace(/\bis\s*\$?\s*113\s*\$?/gi, 'is $\\frac{1}{3}$')
  out = out.replace(/\bis\s*\$?\s*112\s*\$?/gi, 'is $\\frac{1}{2}$')
  out = out.replace(/\bis\s*\$?\s*114\s*\$?/gi, 'is $\\frac{1}{4}$')

  out = out.replace(/\$113\$/g, '$\\frac{1}{3}$')
  out = out.replace(/\$112\$/g, '$\\frac{1}{2}$')
  out = out.replace(/\$114\$/g, '$\\frac{1}{4}$')

  const mathCtx = /projection|is equal to|\\vec|\\hat|\\frac|[ijk]\b/i.test(out)
  if (mathCtx) {
    out = out.replace(/\b113\b/g, '\\frac{1}{3}')
    out = out.replace(/\b112\b/g, '\\frac{1}{2}')
    out = out.replace(/\b114\b/g, '\\frac{1}{4}')
  }

  return out
}

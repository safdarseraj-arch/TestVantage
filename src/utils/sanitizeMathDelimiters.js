import { isFractionVectorMcq, isTriangleAreaMcq, isVectorTruthMsq } from './mcqContextDetect.js'
import { fixOcrBraceFractions } from './fixOcrMathSymbols.js'
import { repairInlineMathDelimiters } from './repairInlineMathDelimiters.js'

/**
 * Clean broken $ delimiters and over-escaped LaTeX from OCR polish passes.
 * @param {string} text
 */
export function sanitizeMathDelimiters(text) {
  if (!text?.trim()) return text

  let out = text.replace(/\r\n/g, '\n')

  out = repairInlineMathDelimiters(out)

  out = out.replace(/\\{3,}/g, '\\')
  out = out.replace(/[—–]/g, '-')
  out = out.replace(/\bwhere([a-z])/gi, 'where $1')

  if (/[a-z]\^2\s*[-+].*\b[a-z]\s*[-+]\s*a\s*=\s*0/i.test(out) && !/\\vec\{[a-z]\}.*\\hat\{|vectors?|medians?/i.test(out)) {
    out = out.replace(/\\vec\{a\}/g, 'a')
  }

  // Quadratic: x^2 -3x—-\vec{a} =0  →  x^2 - 3x - a = 0
  out = out.replace(
    /([a-z])\^2\s*-?\s*(\d+)\s*([a-z])\s*[-\s\\vec\{\}]*\\vec\{a\}\s*=\s*0/gi,
    '$1^2 - $2$3 - a = 0',
  )
  out = out.replace(
    /equation\s+([a-z])\^2\s*-?\s*(\d+)\s*([a-z])\s*-\s*a\s*=\s*0/gi,
    'equation $1^2 - $2$3 - a = 0',
  )

  // Wrong \vec on polynomial constant
  out = out.replace(
    /([a-z])\^2\s*([-+0-9a-z\s]+)-\s*\\vec\{([a-z])\}\s*=\s*0/gi,
    (_, v, mid, coeff) => `${v}^2 ${mid.trim()} - ${coeff} = 0`,
  )

  // OCR: split math — $\vec{b} = 2\hat{i}$$+ 47 + 3\hat{k}  →  single block with 4\hat{j}
  out = out.replace(
    /\\vec\{b\}\s*=\s*2\\hat\{i\}\s*\$+\s*\+\s*47\s*\+\s*3\\hat\{k\}/gi,
    '\\vec{b} = 2\\hat{i} + 4\\hat{j} + 3\\hat{k}',
  )
  out = out.replace(
    /2\\hat\{i\}\s*\$+\s*\+\s*47\s*\+\s*3\\hat\{k\}/gi,
    '2\\hat{i} + 4\\hat{j} + 3\\hat{k}',
  )

  out = mergeSplitUnitVectorMath(out)
  out = fixOcrBraceFractions(out)

  // Broken sqrt in options: $$1{86}$ or 1{86} → \sqrt{86} (digits only — not 1{p^{3}}{61 m n})
  out = out.replace(/\$+\s*1\{(\d{2,3})\}\s*\$+/g, '\\sqrt{$1}')
  out = out.replace(/\(([A-D])\)\s*\$+\s*1\{(\d{2,3})\}\s*\$+/gi, '($1) $\\sqrt{$2}$')

  // (A)$$1{86}$ style without backslash-sqrt
  out = out.replace(/\(([A-D])\)\s*\$+(\d)\{(\d{2,3})\}\$+/gi, '($1) $\\sqrt{$3}$')

  // Adjacent math blocks: $\frac{...}$$(C) → $\frac{...}$ (C)
  out = out.replace(/(\$[^$]+\$)\s*\$+\s*\(([A-D])\)/g, '$1 ($2)')
  out = out.replace(/\(([A-D])\)\s*(\$[^$]+\$)\s*\$+\s*\(([A-D])\)/g, '($1) $2 ($3)')

  // Double-dollar inline (short) → single $…$ — keep display $$ for
  // matrices, chemistry \left…\right lists, and Given “en = …” lines.
  out = out.replace(/\$\$([^$\n]{1,400}?)\$\$/g, (full, inner, offset, whole) => {
    const body = inner.trim()
    const ownLine =
      (offset === 0 || whole[offset - 1] === '\n') &&
      (offset + full.length >= whole.length || whole[offset + full.length] === '\n')
    if (ownLine && /\\(?:frac|dfrac)\b/.test(body)) return `$$${body}$$`
    if (
      /\\begin\{(?:matrix|pmatrix|bmatrix|vmatrix|array|cases|tabular)\}/.test(body) ||
      /\\left\[\\begin\{/.test(body) ||
      /^A=\\begin\{bmatrix\}/.test(body) ||
      /\\left\b/.test(body) ||
      /\\text\s*\{\s*en\s*\}/i.test(body) ||
      /\\(?:xrightarrow|longrightarrow)\b/.test(body)
    ) {
      return `$$${body}$$`
    }
    return `$${body}$`
  })

  // Unclosed $$ before plain English: $$\vec{b}=...\hat{k} are one
  out = out.replace(
    /\$\$([^$\n]+?)(?=\s+(?:are|is|of|through|then|where)\b)/gi,
    (match, inner, offset, whole) =>
      // A $$ that closes a display block is not an unclosed opener — leaving
      // it alone keeps "…+K$$, then $g(x)$" from becoming "…+K$,$ then".
      isInsideMathSpan(whole, offset) ? match : `$${inner.trim()}$`,
  )

  // MCQ options missing $ delimiters: (A) \sqrt{86}
  out = out.replace(
    /\(([A-D])\)\s*(\\(?:sqrt|frac)\{[^}]+\}(?:\{[^}]+\})?(?:\\sqrt\{[^}]+\})?)/g,
    '($1) $$$2$',
  )

  // Trailing stray $ on unwrapped LaTeX only — skip when already inside $…$
  out = out.replace(
    /(?<!\$)(\\(?:sqrt|frac)\{[^}]+\}(?:\{[^}]+\})?(?:\\sqrt\{[^}]+\})?)\$/g,
    (match, latex, offset, whole) => (isInsideMathSpan(whole, offset) ? match : `$${latex}$`),
  )

  // (B) $1$ between sqrt MCQ options → (B) $\frac{1}{2}\sqrt{86}$
  if (/\\sqrt\{86\}/.test(out) && /\\sqrt\{84\}/.test(out)) {
    out = out.replace(/\(B\)\s*\$1\$/g, '(B) $\\frac{1}{2}\\sqrt{86}$')
  }

  // Merge vec blocks split by $$
  out = out.replace(
    /\$\\vec\{b\}\s*=\s*2\\hat\{i\}\s*\+\s*4\\hat\{j\}\s*\+\s*3\\hat\{k\}\s*\$\s*are/gi,
    '$\\vec{b} = 2\\hat{i} + 4\\hat{j} + 3\\hat{k}$ are',
  )

  // Nested / duplicate $ around sum
  out = out.replace(/value of\s+\$\s*(\$\\sum a\$)\s*/gi, 'value of $\\sum a$ ')
  out = out.replace(/value of\s+\$\\sum a\$\s*/gi, 'value of $\\sum a$ ')

  // Full-line wrap: $93. If ... equal to$  →  plain text + inline math only
  out = out.replace(
    /^\$(\d{1,3}\.\s*If\s+the\s+equation\s+)([^$]+?)(\s+has\s+integral\s+roots\s+where)([^$]*?)(\s+then\s+the\s+value\s+of\s+)([^$]+?)(\s+is\s+equal\s+to)\s*\$$/im,
    (_, p1, eq, p3, mid, p5, sumPart, p7) => {
      const eqClean = eq.replace(/\\vec\{a\}/g, 'a').replace(/—+/g, '-').trim()
      const midClean = mid.replace(/\\vec\{a\}/g, 'a').trim()
      const sumClean = sumPart.replace(/\$+/g, '').trim()
      return `${p1}$${eqClean}$${p3}${midClean}${p5}$${sumClean}$${p7}`
    },
  )

  // Leading $ before If / question number
  out = out.replace(/^\$(\d{1,3}\.\s)/m, '$1')
  out = out.replace(/^\$If\b/im, 'If')

  // Trailing lone $ on a line
  out = out.replace(/\s+\$\s*$/gm, '')

  // Merge broken spacing in equation
  out = out.replace(/=\s*0/g, '= 0')
  out = out.replace(/([a-z])\^2\s*-(\d)/g, '$1^2 - $2')

  // Stray 86$$ after a lone integer — never eat $$ after ]^{3+} chemistry display.
  out = out.replace(/(?<=\s)(\d+)\$\$(?=\s|$)/g, '$1')
  out = out.replace(/\$P\(x\)\s*=\s*\$+/g, 'P(x) = $')
  out = out.replace(/\\hat\{i\}/g, (m, _offset, str) => {
    if (/P\s*\(\s*x\s*\)/i.test(str)) return 'i'
    return m
  })

  out = fixBrokenSqrtMcqOptions(out)
  out = fixCorruptedMcqMathDelimiters(out)

  return out
}

/**
 * True when `index` sits between an opening and closing math delimiter on its line.
 * @param {string} text
 * @param {number} index
 */
function isInsideMathSpan(text, index) {
  let open = null
  let i = 0
  while (i < index) {
    const ch = text[i]
    if (ch === '\n') {
      open = null
      i += 1
      continue
    }
    if (ch === '$') {
      const token = text[i + 1] === '$' ? '$$' : '$'
      open = open ? null : token
      i += token.length
      continue
    }
    i += 1
  }
  return !!open
}

/**
 * OCR closes $ before the last \\hat{i/j/k}:
 * $\\hat{i}+\\hat{j}+$\\hat{k}$ → $\\hat{i}+\\hat{j}+\\hat{k}$
 */
function mergeSplitUnitVectorMath(text) {
  let out = text
  let prev
  do {
    prev = out
    out = out.replace(
      /\$([^$\n]*?)\+\s*\$\\hat\{([ijk])\}\$/gi,
      (_, prefix, axis) => `$${prefix.trim()}+\\hat{${axis}}$`,
    )
    out = out.replace(
      /(\$[^$\n]+\$)\+\s*\\hat\{([ijk])\}\$/g,
      (_, block, axis) => `$${block.slice(1, -1)}+\\hat{${axis}}$`,
    )
  } while (out !== prev)
  return out
}

/** Mathpix/Tesseract sometimes read √86 as $$1$ or $1$ in MCQ options */
function fixBrokenSqrtMcqOptions(text) {
  if (!/\([A-D]\)/.test(text)) return text

  let out = text

  const vectorTruthMsq = isVectorTruthMsq(out)
  const triangleMcq = !vectorTruthMsq && isTriangleAreaMcq(out)
  const fractionVectorMcq = !vectorTruthMsq && isFractionVectorMcq(out)

  const triangleOptionDefaults = {
    A: '\\sqrt{86}',
    B: '\\frac{1}{2}\\sqrt{86}',
    C: '\\frac{1}{2}\\sqrt{84}',
    D: '\\sqrt{80}',
  }

  const fractionOptionDefaults = {
    A: '\\frac{1}{4}',
    B: '\\frac{49}{4}',
    C: '\\frac{4}{9}',
    D: '0',
  }

  // $\frac{1}{2}$1$ — triangle MCQ only
  if (triangleMcq) {
    out = out.replace(/\(B\)\s*\$\\frac\{1\}\{2\}\$1\$/g, '(B) $\\frac{1}{2}\\sqrt{86}$')
    out = out.replace(/\(C\)\s*\$\\frac\{1\}\{2\}\$1\$/g, '(C) $\\frac{1}{2}\\sqrt{84}$')
    out = out.replace(
      /\(B\)\s*\$\s*\\frac\{1\}\{2\}\s+\$1\$/g,
      '(B) $\\frac{1}{2}\\sqrt{86}$',
    )
    out = out.replace(
      /\(B\)\s*\$\\frac\{1\}\{2\}\s+\$1\$/g,
      '(B) $\\frac{1}{2}\\sqrt{86}$',
    )
    out = out.replace(/\(C\)\s*\$\$1\$1\$/g, '(C) $\\frac{1}{2}\\sqrt{84}$')
    out = out.replace(/\(C\)\s*\$1\$1\$/g, '(C) $\\frac{1}{2}\\sqrt{84}$')
    out = out.replace(
      /\(C\)\s*\$\s*\\frac\{1\}\{2\}\s*\$1\$/g,
      '(C) $\\frac{1}{2}\\sqrt{84}$',
    )
    out = out.replace(
      /\(C\)\s*\$\\frac\{1\}\{2\}\s*\$1\$/g,
      '(C) $\\frac{1}{2}\\sqrt{84}$',
    )
    out = out.replace(/\(A\)\s*\$\$1\$/g, '(A) $\\sqrt{86}$')
    out = out.replace(/\(B\)\s*\$\$1\$/g, '(B) $\\frac{1}{2}\\sqrt{86}$')
    out = out.replace(/\(C\)\s*\$\$1\$/g, '(C) $\\frac{1}{2}\\sqrt{84}$')
    out = out.replace(/\(D\)\s*\$\$1\$/g, '(D) $\\sqrt{80}$')
    out = out.replace(/\(D\)\s*\$2\$/g, '(D) $\\sqrt{80}$')
    out = out.replace(/\(D\)\s*\$+\s*1\{80\}\s*\$+/g, '(D) $\\sqrt{80}$')
    out = out.replace(/\(D\)\s*\$+\s*80\s*\$+/g, '(D) $\\sqrt{80}$')
    out = out.replace(/\(D\)\s+80\s*$/gm, '(D) $\\sqrt{80}$')
    out = out.replace(
      /\(D\)\s*\$\$?\\frac\{1\}\{2\}\\sqrt\{84\}\$?/g,
      '(D) $\\sqrt{80}$',
    )
    out = out.replace(
      /\(D\)\s*\$\$?\\frac\{1\}\{2\}\$\\sqrt\{84\}\$/g,
      '(D) $\\sqrt{80}$',
    )
  }

  // Vector box-product MCQ: (A) 1/4 … (D) 0 — OCR $$1$ is not √86
  if (fractionVectorMcq) {
    for (const [label, latex] of Object.entries(fractionOptionDefaults)) {
      if (latex === '0') {
        out = out.replace(new RegExp(`\\(${label}\\)\\s*\\$\\$1\\$`, 'g'), `(${label}) 0`)
        out = out.replace(new RegExp(`\\(${label}\\)\\s*\\$1\\$`, 'g'), `(${label}) 0`)
        out = out.replace(new RegExp(`\\(${label}\\)\\s*\\$2\\$`, 'g'), `(${label}) 0`)
      } else {
        out = out.replace(
          new RegExp(`\\(${label}\\)\\s*\\$\\$1\\$`, 'g'),
          `(${label}) $${latex}$`,
        )
      }
    }
  }

  // Broken $$1$ — only when MCQ type is known; never default all to √86
  out = out.replace(/(\(([A-D])\)\s*)\$\$([^$\n]{1,40}?)\$(?!\$)/g, (match, prefix, label, inner) => {
    if (inner.trim() !== '1') return `${prefix}$${inner.trim()}$`
    if (triangleMcq) {
      const latex = triangleOptionDefaults[label.toUpperCase()] ?? '\\sqrt{86}'
      return `${prefix}$${latex}$`
    }
    if (fractionVectorMcq) {
      const latex = fractionOptionDefaults[label.toUpperCase()]
      if (latex === '0') return `${prefix}0`
      if (latex) return `${prefix}$${latex}$`
    }
    return match
  })

  return out
}

/** Repair $$…$ (double open, single close) from earlier sanitize passes */
function fixCorruptedMcqMathDelimiters(text) {
  return text
    .replace(
      /\(([A-D])\)\s*\$\$(\\(?:frac\{[^}]+\}\{[^}]+\}|sqrt\{[^}]+\})(?:\\sqrt\{[^}]+\})?)\$/g,
      '($1) $$$2$',
    )
    .replace(
      /\(([A-D])\)\s*\$\$(\\frac\{1\}\{2\})\$\\sqrt\{([^}]+)\}\$/g,
      '($1) $$$2\\sqrt{$3}$',
    )
    .replace(/^\$\$(\\frac\{[^}]+\}\{[^}]+\})\$/gm, '$$$1$')
    .replace(/^\$\$(\\sqrt\{[^}]+\})\$/gm, '$$$1$')
    .replace(/^\$\$(\\frac\{[^}]+\}\{[^}]+\}\\sqrt\{[^}]+\})\$/gm, '$$$1$')
}

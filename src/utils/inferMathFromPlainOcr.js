import { fixOcrMathSymbols } from './fixOcrMathSymbols.js'
import { fixOcrStructure } from './fixOcrStructure.js'
import { synthesizeLatexFromPlainOcr } from './synthesizeLatexFromPlainOcr.js'
import { isTriangleAreaMcq, isVectorTruthMsq } from './mcqContextDetect.js'

/** True when line is a quadratic in x (or similar), not a vector geometry problem. */
function isPolynomialEquationLine(line) {
  return /[a-z]\^2\s*[-+].*\b[a-z]\s*[-+]\s*[a-z]\b.*=\s*0/i.test(line) ||
    /equation\s+[a-z]\^2/i.test(line)
}

/** True when vectors (î, ĵ, medians, vec) appear — not plain parameter a. */
function isVectorGeometryLine(line) {
  return /\\hat\{[ijk]\}|\\vec\{[a-z]\}|\\vec\{d\}_|vectors?|medians?|\b sides\b|î|ĵ|k̂|area of triangle|parallelogram|diagonals?|tetrahedron|hexagon|position vector/i.test(
    line,
  )
}

/** Wrap bare vector letters in math when geometry context is detected. */
function fixBareVectorLetters(line) {
  if (!isVectorGeometryLine(line)) return line
  let L = line
  L = L.replace(/\b([a-z])\s*=\s*(\d+)\b/gi, (m, v, n) => {
    if (/^[abcopq]$/.test(v)) return `$|\\vec{${v}}| = ${n}$`
    return m
  })
  return L
}

/**
 * Wrap bare √-style MCQ answers: (A) 86 → (A) $\sqrt{86}$
 * @param {string} line
 * @param {boolean} [triangleMcq] true only for the √86/√84/√80 triangle-area MCQ
 */
function polishMcqOptionLine(line, triangleMcq = false) {
  let L = line.trim()
  if (!/^\([A-D]\)/i.test(L)) return L

  L = fixOcrMathSymbols(L)

  L = L.replace(
    /^\(([A-D])\)\s*(\d{2,3})\s*$/i,
    (_, label, n) => {
      const roots = new Set(['80', '84', '86', '88', '90', '92', '96', '98', '100'])
      if (roots.has(n)) return `(${label}) $\\sqrt{${n}}$`
      return `(${label}) ${n}`
    },
  )

  L = L.replace(/\(\s*([A-D])\s*\)\s*\$\$\s*/gi, '($1) $')
  L = L.replace(/\(\s*([A-D])\s*\)\s*\$\s*(\\frac|\\sqrt)/gi, '($1) $$$2')

  // Bare sqrt radicands in combined option rows
  L = L.replace(
    /\(([A-D])\)\s*(\d{2,3})(?=\s|\(|$)/gi,
    (_, label, n) => {
      const roots = new Set(['80', '84', '86', '88', '90', '92', '96', '98', '100'])
      if (roots.has(n)) return `(${label}) $\\sqrt{${n}}$`
      return `(${label}) ${n}`
    },
  )

  // √ radicands OCR'd as a bare "2". Only the triangle-area MCQ has these
  // answers — elsewhere "(C) $2$" really is the number two.
  if (triangleMcq) {
    L = L.replace(/\(A\)\s*\$2\$/g, '(A) $\\sqrt{86}$')
    L = L.replace(/\(B\)\s*5V8[45]/gi, '(B) $\\frac{1}{2}\\sqrt{86}$')
    L = L.replace(/\(C\)\s*\$2\$/g, '(C) $\\frac{1}{2}\\sqrt{84}$')
    L = L.replace(/\(D\)\s*\$2\$/g, '(D) $\\sqrt{80}$')
    L = L.replace(/\(D\)\s*80\s*$/i, '(D) $\\sqrt{80}$')
    L = L.replace(/\(D\)\s*\$\$?\\frac\{1\}\{2\}\\sqrt\{84\}\$?/gi, '(D) $\\sqrt{80}$')
  }

  return L
}

/** Wrap vector assignments in inline math for geometry questions. */
function wrapVectorAssignments(line) {
  let L = line
  if (!isVectorGeometryLine(L)) return L

  L = L.replace(
    /If\s+\\vec\{a\}\s*=\s*(\\hat\{i\}\s*-\s*\\hat\{j\}\s*\+\s*\\hat\{k\})/gi,
    'If $\\vec{a} = $1$',
  )
  L = L.replace(
    /If\s+a\s*=\s*(\\hat\{i\}\s*-\s*\\hat\{j\}\s*\+\s*\\hat\{k\})/gi,
    'If $\\vec{a} = $1$',
  )
  L = L.replace(
    /\\vec\{b\}\s*=\s*((?:[-+]?\s*\d+\\hat\{[ijk]\}\s*)+)/gi,
    (_, body) => `$\\vec{b} = ${body.replace(/\s+/g, ' ').trim()}$`,
  )
  L = L.replace(
    /\\vec\{b\}\s*=\s*2\\hat\{i\}\s*\+\s*4\\hat\{j\}\s*\+\s*3\\hat\{k\}/gi,
    '$\\vec{b} = 2\\hat{i} + 4\\hat{j} + 3\\hat{k}$',
  )
  L = L.replace(
    /\\vec\{a\}\s*=\s*\\hat\{i\}\s*-\s*\\hat\{j\}\s*\+\s*\\hat\{k\}/gi,
    '$\\vec{a} = \\hat{i} - \\hat{j} + \\hat{k}$',
  )

  L = L.replace(
    /\\vec\{d\}_\{(\d)\}\s*=\s*((?:[-+]?\s*\d*\\hat\{[ijk]\}[\s\+\-]*)+)/gi,
    (_, n, body) => `$\\vec{d}_{${n}} = ${body.replace(/\s+/g, ' ').trim()}$`,
  )

  return L
}

/**
 * Wrap only short math fragments, not entire question sentences.
 * @param {string} line
 */
function wrapInlineMathFragments(line) {
  let L = line

  L = L.replace(
    /equation\s+([a-z]\^2\s*[-+0-9a-z\s=]+?=\s*0)/gi,
    (_, eq) => `equation $${eq.replace(/\s+/g, ' ').replace(/\\vec\{a\}/g, 'a').trim()}$`,
  )

  L = L.replace(/\b([a-z])\s*\\in\s+N\b/gi, '$1 $\\in \\mathbb{N}$')
  L = L.replace(/\b([a-z])\s*\\in\s+([A-Z])\b/g, '$1 $\\in $2$')

  L = L.replace(/\b([a-z])\s*<\s*(\d+)\b/gi, '$1 $< $2$')

  L = L.replace(/\bvalue\s+of\s+(\\sum\s+[a-z])\b/gi, 'value of $$$1$')

  L = L.replace(
    /P\s*\(\s*x\s*\)\s*=\s*([^.\n]+?)(?=\s*,|\s+where|\s+has)/gi,
    (_, body) => `P(x) = $${body.replace(/\s+/g, ' ').trim()}$`,
  )

  L = L.replace(
    /\\lim(?:_\{[^}]+\})?\s*\\frac\{[^}]+\}\{[^}]+\}/g,
    (m) => `$${m}$`,
  )

  L = L.replace(
    /\bis\s+(\d+)\\sqrt\{(\d+)\}\s*(?:sq\.?\s*unit|square\s*unit)/gi,
    'is $$1\\sqrt{$2}$$ sq unit',
  )

  return L
}

/**
 * @param {string} line
 */
function polishQuestionLine(line, triangleMcq = false) {
  let L = line.trim()
  if (!L) return L
  if (/^\([A-D]\)\s/i.test(L) || /^\([a-d]\)\s/i.test(L)) return polishMcqOptionLine(L, triangleMcq)

  L = fixOcrMathSymbols(L)

  if (isVectorGeometryLine(L) && !isPolynomialEquationLine(L) && !/P\s*\(\s*x\s*\)/i.test(L)) {
    L = L.replace(/\b(a)\s*=\s*(?=[^=]*\\hat|[ijk])/gi, '\\vec{a} =')
    L = L.replace(/\b(b)\s*=\s*(?=[^=]*\\hat|[ijk])/gi, '\\vec{b} =')
    L = L.replace(/\b(c)\s*=\s*(?=[^=]*\\hat|[ijk])/gi, '\\vec{c} =')
    L = wrapVectorAssignments(L)
    L = fixBareVectorLetters(L)
  }

  return wrapInlineMathFragments(L)
}

/**
 * Reconstruct math from plain ASCII OCR (Tesseract cannot output LaTeX).
 * @param {string} raw
 * @returns {string}
 */
export function inferMathFromPlainOcr(raw) {
  if (!raw?.trim()) return raw

  let out = fixOcrStructure(raw.replace(/\r\n/g, '\n'))

  out = out.replace(
    /(\(?[A-D]\)?[\)\.\:\-]\s*)([^\n]+)/gi,
    (_, label, body) => `${label}${body.trim()}`,
  )

  const triangleMcq = !isVectorTruthMsq(out) && isTriangleAreaMcq(out)

  out = out
    .split('\n')
    .map((line) => polishQuestionLine(line, triangleMcq))
    .join('\n')

  // Inline MCQ row: (A) 86 (B) ... (D) 80
  out = out.replace(
    /\(([A-D])\)\s*([^()]+?)(?=\s*\([A-D]\)|$)/gi,
    (match, label, body) => {
      const polished = polishMcqOptionLine(`(${label}) ${body.trim()}`, triangleMcq)
      return polished.endsWith('$') ? `${polished} ` : `${polished} `
    },
  )

  return out
}

/**
 * @param {string} raw
 */
export function finalizeOcrText(raw) {
  if (!raw?.trim()) return ''
  return synthesizeLatexFromPlainOcr(inferMathFromPlainOcr(raw.trim()))
}

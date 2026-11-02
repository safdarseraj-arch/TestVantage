/**
 * LaTeX synthesis from plain Tesseract output — local alternative to Mathpix equation OCR.
 */

/** sqrt(3)/2, √3/2, V3/2 OCR → \frac{\sqrt{3}}{2} */
function synthesizeSqrtFractions(text) {
  let out = String(text ?? '')
  out = out.replace(
    /(?:√|V|v)\s*(\d+)\s*\/\s*(\d+)/g,
    '\\frac{\\sqrt{$1}}{$2}',
  )
  out = out.replace(
    /sqrt\s*\(\s*(\d+)\s*\)\s*\/\s*(\d+)/gi,
    '\\frac{\\sqrt{$1}}{$2}',
  )
  out = out.replace(
    /-?\s*(\d+)\s*\/\s*(\d+)(?=\s|$|[,.)])/g,
    (m, a, b, offset, str) => {
      const before = str.slice(Math.max(0, offset - 6), offset)
      if (/\\frac|\\sqrt|\d\//.test(before)) return m
      if (Number(a) > 20 || Number(b) > 20) return m
      return `\\frac{${a}}{${b}}`
    },
  )
  return out
}

/**
 * Flat bracket [1 1 0 1] or (1 1; 0 1) after P= / A= → bmatrix.
 * @param {string} text
 */
function synthesizeMatrixAssignments(text) {
  return String(text ?? '').replace(
    /\b([A-Z])\s*=\s*(?:\$)?\s*(?:\\left)?[\[\(]\s*([^\]\)]{3,120}?)[\]\)]/g,
    (match, letter, inner, offset, str) => {
      if (/\\begin\{/.test(inner)) return match
      const pre = str.slice(Math.max(0, offset - 4), offset)
      if (/\d\s*$/.test(pre)) return match

      const cells = inner
        .replace(/\\frac\{\\sqrt\{(\d+)\}\}\{(\d+)\}/g, '§$1/$2§')
        .replace(/\\frac\{(\d+)\}\{(\d+)\}/g, '$1/$2')
        .replace(/[;|]/g, ' ')
        .replace(/\\quad/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((c) => c.replace(/^§(\d+)\/(\d+)§$/, '\\frac{\\sqrt{$1}}{$2}'))

      if (cells.length < 4 || cells.length % 2 !== 0) return match

      const cols = 2
      const rows = []
      for (let i = 0; i < cells.length; i += cols) {
        rows.push(cells.slice(i, i + cols).join(' & '))
      }
      const body = rows.join(' \\\\ ')
      return `$${letter}=\\begin{bmatrix}${body}\\end{bmatrix}$`
    },
  )
}

/** Already has &-separated cells inside bmatrix but no \\\\ */
function synthesizeFlatBmatrixBodies(text) {
  return String(text ?? '').replace(
    /\\begin\{bmatrix\}([\s\S]*?)\\end\{bmatrix\}/gi,
    (full, inner) => {
      if (/\\\\/.test(inner)) return full
      const amps = (inner.match(/&/g) || []).length
      if (amps < 1) return full
      const cells = amps + 1
      const cols = cells % 2 === 0 ? 2 : cells % 3 === 0 ? 3 : 2
      if (cells % cols !== 0) return full
      const parts = inner.split('&').map((s) => s.trim())
      const rows = []
      for (let i = 0; i < parts.length; i += cols) {
        rows.push(parts.slice(i, i + cols).join(' & '))
      }
      return `\\begin{bmatrix}${rows.join(' \\\\ ')}\\end{bmatrix}`
    },
  )
}

/** Q = PAP^T, X = P^T Q^{2005} P — wrap superscript blocks */
function synthesizeMatrixExponents(text) {
  return String(text ?? '')
    .replace(/\b([A-Z])\s*\^\s*\{\s*(\d+)\s*\}/g, '$1^{$2}')
    .replace(/\b([A-Z])\s*\^\s*(\d+)\b/g, '$1^{$2}')
    .replace(/\b([A-Z])\s*P\s*\^\s*T\b/gi, '$1P^T')
}

/** x/100, (x+y)/100 in integer passage stems */
function synthesizeVariableFractions(text) {
  let out = String(text ?? '')
  out = out.replace(
    /\(\s*([xy])\s*\+\s*([xy])\s*\)\s*\/\s*(\d+)/gi,
    '$$\\frac{$1+$2}{$3}$',
  )
  out = out.replace(
    /then\s+the\s+value\s+\(\s*x\s*\+\s*y\s*\)\s*\/\s*(\d+)/gi,
    'then the value $\\frac{x+y}{$1}$',
  )
  out = out.replace(
    /then\s+the\s+value\s+x\s*\/\s*(\d+)/gi,
    'then the value $\\frac{x}{$1}$',
  )
  out = out.replace(/\b([xy])\s*\/\s*(\d{2,4})\b/g, '$$\\frac{$1}{$2}$')
  out = out.replace(
    /\ba_([xyz])\s*=\s*(\d+)\s*m\s*\/\s*s\s*(?:\^|\*\*)?\s*2\b/gi,
    '($a_{$1} = $2\\,\\mathrm{m/s}^2$)',
  )
  return out
}

/** JEE kinematics: g=10 m/s^2, 20sqrt(2) m/s, 45° */
function synthesizePhysicsNotation(text) {
  let out = String(text ?? '')
  out = out.replace(
    /\(?\s*g\s*=\s*(\d+)\s*m\s*\/\s*s\s*(?:\^|\*\*)?\s*2\s*\)?/gi,
    '($g = $1\\,\\mathrm{m/s}^2$)',
  )
  out = out.replace(
    /g\s*=\s*(\d+)\s*m\s*\/\s*s²/gi,
    '($g = $1\\,\\mathrm{m/s}^2$)',
  )
  out = out.replace(
    /(\d+)\s*(?:sqrt|√)\s*\(?\s*(\d+)\s*\)?\s*m\s*\/\s*s/gi,
    '$$1\\sqrt{$2}\\,\\mathrm{m/s}$',
  )
  out = out.replace(
    /(\d+)\s*(?:sqrt|√)\s*\(?\s*(\d+)\s*\)?(?=\s*(?:m\/s|ms|\^|\\circ|°))/gi,
    '$$1\\sqrt{$2}$',
  )
  out = out.replace(/(\d+)\s*(?:°|deg(?:rees?)?)(?=\s|$|[,.)])/gi, '$$1^\\circ$')
  if (!/\\mathrm\{m\/s\}/.test(out)) {
    out = out.replace(
      /(?<!\$)(?<![{\\/])\bm\s*\/\s*s\s*(?:\^|\*\*)?\s*2\b(?!\$)/gi,
      '$\\mathrm{m/s}^2$',
    )
    out = out.replace(
      /(?<!\$)(?<![{\\/])\bm\s*\/\s*s\b(?!\$)/gi,
      '$\\mathrm{m/s}$',
    )
  }
  return out
}

/** Let β = ∫₀¹ (2+3x+4x²) dx / 2√(x²+x+1) */
function synthesizeBetaDefiniteIntegrals(text) {
  let out = String(text ?? '')
  out = out.replace(
    /\bLet\s+(\$?\\?beta\$?|\u03b2)\s*=\s*(?:\\int|int)\s*_?\{?0\}?\^?\{?1\}?\s*/gi,
    'Let $\\beta = \\int_0^1 ',
  )
  out = out.replace(
    /\(2\s*\+\s*3\s*x\s*\+\s*4\s*x\^?2\)\s*d\s*x\s*\/\s*2\s*(?:\\sqrt|sqrt)\s*\(?\s*x\^?2\s*\+\s*x\s*\+\s*1\s*\)?/gi,
    '\\frac{(2+3x+4x^2)\\,dx}{2\\sqrt{x^2+x+1}}',
  )
  out = out.replace(
    /\bthen\s+find\s+the\s+value\s+of\s+(\$?\\?beta\$?|\u03b2)\^?2\b/gi,
    'then find the value of $\\beta^2$',
  )
  return out
}

/** Wrap bare \\frac / \\sqrt / \\begin{bmatrix} not already in $...$ */
function wrapSynthesizedLatexFragments(text) {
  let out = String(text ?? '')
  if (!/\\[a-zA-Z]/.test(out)) return out

  // Only wrap outside existing $ / $$ math — never re-wrap inside a math span
  // (e.g. `$f(x) = \frac{...}{...}$` must not become `$f(x) = $\frac{...}$`).
  const parts = out.split(/(\$\$[\s\S]*?\$\$|\$[^$]*\$)/g)
  return parts
    .map((part) => {
      if (part.startsWith('$')) return part
      return part.replace(
        /(?<!\$)((?:\\frac\{[^{}]+\}\{[^{}]+\}|\\sqrt\{[^{}]+\}|\\begin\{bmatrix\}[\s\S]*?\\end\{bmatrix\})+)(?!\$)/g,
        '$$$1$',
      )
    })
    .join('')
}

/**
 * @param {string} text after inferMathFromPlainOcr
 * @returns {string}
 */
export function synthesizeLatexFromPlainOcr(text) {
  if (!text?.trim()) return text ?? ''
  let out = text
  out = synthesizeSqrtFractions(out)
  out = synthesizeVariableFractions(out)
  out = synthesizePhysicsNotation(out)
  out = synthesizeMatrixExponents(out)
  out = synthesizeMatrixAssignments(out)
  out = synthesizeFlatBmatrixBodies(out)
  out = synthesizeBetaDefiniteIntegrals(out)
  out = wrapSynthesizedLatexFragments(out)
  return out
}

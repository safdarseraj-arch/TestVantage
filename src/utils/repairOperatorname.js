/**
 * OCR doubles / garbles \\operatorname and drops backslashes.
 * @param {string} text
 */
export function repairOperatornameOcr(text) {
  let out = String(text ?? '')

  out = out.replace(
    /\\operatorname\s*\{\s*operatorname\s*\}\s*(?:\\\{\s*Tr\s*\\\}|\{\s*Tr\s*\})/g,
    '\\operatorname{Tr}',
  )
  out = out.replace(/\\operatorname\s*\\\{\s*Tr\s*\\\}/g, '\\operatorname{Tr}')
  out = out.replace(/\\operatorname\s*\{\s*operatorname\s*\}/g, '\\operatorname')
  out = out.replace(/\\operatorname\s*\{\s*Tr\s*\}/g, '\\operatorname{Tr}')
  out = out.replace(/(?<!\\)operatorname\s*\{\s*Tr\s*\}/g, '\\operatorname{Tr}')
  out = out.replace(/(?<!\\)operatorname\s*\{\s*adj\s*\}/gi, '\\operatorname{adj}')
  out = out.replace(/(?<!\\)operatorname\s*\{\s*tr\s*\}/g, '\\operatorname{tr}')
  out = out.replace(/\\text\s*\{\s*tr\s*\}/gi, '\\operatorname{tr}')
  out = out.replace(/\\text\s*\{\s*adj\s*\}\s*\(\s*X\s*\)/gi, '\\operatorname{adj}(X)')
  out = out.replace(/\\text\s*\{\s*tr\s*\}\s*\(\s*X\s*\)/gi, '\\operatorname{tr}(X)')
  out = out.replace(/\\text\s*\{\s*adj\s*([^}]*)\}/gi, (_, tail) => {
    const t = String(tail ?? '').trim()
    return t ? `\\operatorname{adj} ${t}` : '\\operatorname{adj}'
  })
  out = out.replace(/\\mathbb\{M\}\^\{-1\}/gi, 'M^{-1}')
  out = out.replace(/(\d+)\s*operatorname\s*\{/gi, '$1 \\operatorname{')
  out = out.replace(/(\d+)operatorname\s*\{/gi, '$1 \\operatorname{')

  out = out.replace(/\badjointof\b/gi, 'adjoint of')
  out = out.replace(/\$X\s+and\s+\$/gi, '$X$ and')
  out = out.replace(/matrix\s*\$X\s+and\s*\$/gi, 'matrix $X$ and')
  out = out.replace(/\bis\s*\(\s*where\b/gi, 'is (where ')
  out = out.replace(/\bis\s*where\b/gi, 'is (where ')

  out = collapseRunawayBackslashes(out)
  out = repairWhereClauseMath(out)

  return out
}

/** "(where adj(X) denotes … operatorname{tr}(X) denotes …)" → inline $…$ math. */
export function repairWhereClauseMath(text) {
  return String(text ?? '').replace(/\(where\s+([^)]+)\)/gi, (_, inner) => {
    let clause = String(inner ?? '')
    clause = clause.replace(/\badj\s*\(\s*X\s*\)/gi, '$\\operatorname{adj}(X)$')
    clause = clause.replace(
      /(?<!\\)operatorname\s*\{\s*tr\s*\}\s*\(\s*X\s*\)/gi,
      '$\\operatorname{tr}(X)$',
    )
    clause = clause.replace(
      /\\operatorname\s*\{\s*tr\s*\}\s*\(\s*X\s*\)/gi,
      '$\\operatorname{tr}(X)$',
    )
    clause = clause.replace(/\bdenotes\s+trace\s+of\s+matrix\s*X\b/gi, 'denotes trace of matrix $X$')
    clause = clause.replace(/\bdenotes\s+adjoint\s+of\s+matrix\s*X\b/gi, 'denotes adjoint of matrix $X$')
    clause = clause.replace(/\$X\s+and\s+\$/gi, '$X$ and')
    clause = clause.replace(/matrix\s*\$X\s+and\s+\$/gi, 'matrix $X$ and')
    clause = clause.replace(/\\text\s*\{\s*adj\s*\}\s*\(\s*X\s*\)/gi, '$\\operatorname{adj}(X)$')
    clause = clause.replace(/\\text\s*\{\s*tr\s*\}\s*\(\s*X\s*\)/gi, '$\\operatorname{tr}(X)$')
    clause = clause.replace(/\s{2,}/g, ' ').trim()
    return `(where ${clause})`
  })
}

const MATRIX_PLACE = '\uE002M\uE003'
/** Protect matrix/array/cases — row breaks (\\\\) must not be collapsed. */
const BEGIN_MATRIX_ENV = String.raw`\\begin\s*\{?\s*(?:array|vmatrix|pmatrix|matrix|bmatrix|cases|bmatri(?:\s*x\s*\^?\s*2)?)\s*\}?`
const END_MATRIX_ENV = String.raw`\\end\s*\{?\s*(?:array|vmatrix|pmatrix|matrix|bmatrix|cases|bmatri)\s*\}?`

/** Collapse OCR noise like "\\\\ \\\\ \\\\" in prose (keep matrix bodies). */
export function collapseRunawayBackslashes(text) {
  let out = String(text ?? '')
  const blocks = []
  const maskMathBlock = (m) => {
    blocks.push(m)
    return `${MATRIX_PLACE}${blocks.length - 1}`
  }
  const matrixBlockRe = new RegExp(
    `${BEGIN_MATRIX_ENV}[\\s\\S]*?${END_MATRIX_ENV}`,
    'gi',
  )
  out = out.replace(
    new RegExp(`\\$\\$[\\s\\S]*?${BEGIN_MATRIX_ENV}[\\s\\S]*?${END_MATRIX_ENV}[\\s\\S]*?\\$\\$`, 'gi'),
    maskMathBlock,
  )
  out = out.replace(
    new RegExp(`\\$[^$]*${BEGIN_MATRIX_ENV}[\\s\\S]*?${END_MATRIX_ENV}[^$]*\\$`, 'gi'),
    (m) => {
      if (!new RegExp(BEGIN_MATRIX_ENV, 'i').test(m)) return m
      blocks.push(m.startsWith('$$') ? m : `$$${m.replace(/^\$|\$$/g, '')}$$`)
      return `${MATRIX_PLACE}${blocks.length - 1}`
    },
  )
  out = out.replace(matrixBlockRe, maskMathBlock)
  out = out.replace(/(?:\\{2,}\s*){2,}/g, ' ')
  // Collapse stray \\ row-break noise, but never strip \\ before a letter
  // (that is a double-escaped command like \\pi / \\beta — keep for fixDoubleEscapedLatex).
  out = out.replace(/\s*\\\\\s*(?![\\{}a-zA-Z])/g, ' ')
  out = out.replace(new RegExp(`${MATRIX_PLACE}(\\d+)`, 'g'), (_, i) => blocks[Number(i)] ?? '')
  return out.replace(/\s{2,}/g, ' ').trim()
}

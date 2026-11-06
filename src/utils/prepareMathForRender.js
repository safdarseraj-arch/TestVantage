import { dedupeRepeatedStemPhrase } from './dedupeStemText.js'
import { repairCorruptedLatexRight, repairMatchArrowLatex } from './latexValidateRepair.js'
import { rewriteCaptionCommands, rewriteLatexItemLabels, stripMarkdownBoldOutsideMath } from './parseMatchingListDisplay.js'
import { healTruncatedLatexForDisplay, normalizeFracLatex, normalizeSmashedChemDollars, ensureChemDisplayMathClosed, hasUnclosedDisplayMath } from './healTruncatedLatex.js'
import {
  fixRunawayInlineMath,
  repairEvaluateSumMathBlock,
  repairPrematureDollarBeforeLeft,
  repairShatteredLeftRightMath,
  splitEvaluateProseFromLeftSum } from './fixRunawayInlineMath.js'
import { sanitizeMathDelimiters } from './sanitizeMathDelimiters.js'
import { repairInlineMathDelimiters } from './repairInlineMathDelimiters.js'
import { repairMcqOptionForDisplay } from './repairMcqOption.js'
import {
  canonicalizeMatrixDisplayBlocks,
  cleanupBrokenStemDelimiters,
  ensureMatrixStemDelimiters,
  repairMatrixDeterminantStem } from './repairMatrixStem.js'
import { findFracExpression, wrapBareFracExpressions } from './latexBraceMatch.js'
import { repairNpSpPassageArray } from './repairNpSpPassageArray.js'
import { fixCapacitorEnergyLatex, repairNestedMathrmUnits } from './fixOcrMathSymbols.js'
import {
  wrapBareLatexRuns,
  stripStrayMathDelimiters,
  repairOrphanAlignedBody,
  repairOrphanPiecewiseArray,
} from './wrapBareLatexRuns.js'
import {
  LATEX_FENCE,
  convertLatexTabularToArray,
  restoreSheetConfigHtml,
  stashSheetConfigHtml,
  stripDollarsInsideLatexEnvs,
  stripSheetConfigHtml,
} from './latexTabularDisplay.js'
import { sanitizeStemForDisplay } from './sanitizeStemForDisplay.js'
import { repairCasesLatex } from './repairCasesLatex.js'
import { ensureVmatrixStemDelimiters } from './repairDeterminantOcr.js'
import {
  looksLikePolynomialCoeffVmatrix,
  POLY_COEFF_VMATRIX_STEM } from './repairPolynomialCoeffVmatrixOcr.js'
import {
  looksLikeZ5ImaginaryRootsExpDeterminantMcq,
  Z5_IMAGINARY_ROOTS_DET_STEM } from './repairZ5ImaginaryRootsExpDeterminantMcqOcr.js'
import {
  hasGoodLimitGxStem,
  LIMIT_GX_OPTIONS,
  looksLikeLimitGxQuestion,
  LIMIT_GX_STEM } from './repairLimitGxStemOcr.js'
import {
  hasGoodT10LimitStem,
  healT10LimitOptions,
  T10_LIMIT_OPTION_ITEMS,
  looksLikeT10LimitQuestion,
  T10_LIMIT_STEM } from './repairT10LimitStemOcr.js'

/**
 * Scalar-triple-product / determinant row notation. OCR emits the box product
 * [a b c] in several shapes — a 1-row array, a 1-row \left[\begin{matrix}…\right],
 * or already-bracketed [a \quad b \quad c]. Collapse the single-row array/matrix
 * shapes to plain bracket notation so they render inline as [a b c] instead of
 * being promoted to a (broken) multi-row display matrix.
 * @param {string} text
 */
export function normalizeScalarTripleProduct(text) {
  if (/\\begin\{array\}/.test(text ?? '')) return text
  if (/\\begin\{(?:bmatrix|pmatrix)\}/.test(text ?? '')) return text
  if (/\bA\s*=\s*\[\s*[\d]/.test(text ?? '')) return text
  if (/\[\s*\d+(?:\s*\\quad\s*\d+)+/.test(text ?? '')) return text
  if (/\[\s*begin\{bmatrix\}/i.test(text ?? '')) return text
  if (/\[\s*\d+(?:\s*\\\s+\d+)+/.test(text ?? '')) return text
  const hasArray = text && (text.includes('\\begin{array}') || text.includes('\\begin{matrix}'))
  // Bare scalar-triple-product brackets like "[a \quad b \quad c]" can arrive with
  // mismatched OCR delimiters ($$…$) even without an array environment.
  const hasBracketDet = text && /\[\s*[A-Za-z](?:\s*\\quad\s*[A-Za-z])+\s*\]/.test(text)
  if (!hasArray && !hasBracketDet) return text

  const cells = (inner) =>
    inner
      .split('&')
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\\ ')

  let out = text
  // \begin{array}{lll}a & b & c\end{array}  (no row breaks → 1-row determinant)
  out = out.replace(
    /\\begin\{array\}\{[^}]*\}([\s\S]*?)\\end\{array\}/g,
    (m, inner) => {
      if (/\\\\/.test(inner)) return m
      if (/\\mathrm\{I{1,3}\}|\\mathrm\{II\}|\\mathrm\{III\}|\brow\b/i.test(inner)) return m
      return `[${cells(inner)}]`
    },
  )
  // \left[\begin{matrix}a & b & c\end{matrix}\right]  (single row only)
  out = out.replace(
    /\\left\[\s*\\begin\{(?:matrix|bmatrix|pmatrix|vmatrix)\}([\s\S]*?)\\end\{(?:matrix|bmatrix|pmatrix|vmatrix)\}\s*\\right\]/g,
    (m, inner) => (/\\\\/.test(inner) ? m : `[${cells(inner)}]`),
  )
  // Collapse "\quad"-spaced bracket determinant to "[a\ b\ c]".
  out = out.replace(
    /\[\s*([A-Za-z](?:\s*\\quad\s*[A-Za-z])+)\s*\]/g,
    (_, inner) => `[${inner.split(/\s*\\quad\s*/).map((s) => s.trim()).filter(Boolean).join('\\ ')}]`,
  )
  // Repair "$$[a\ b\ c]$ equals$" → "$[a\ b\ c]$ equals": double-open / single-close
  // around a bracket determinant, plus a trailing dangling "$".
  out = out.replace(/\$\$(\[[^$\]]*\])\$(?!\$)/g, '$$$1$')
  out = out.replace(/(\$\[[^$\]]*\]\$)([^$]*?)\$\s*$/g, (_, det, mid) => `${det}${mid.replace(/\s+$/, '')}`)
  // Wrap a bare "[a\ b\ c]" determinant in inline math (skip when already inside $…$).
  out = out.replace(
    /(^|[^$\w\\])(\[[A-Za-z](?:\\ [A-Za-z])+\])(?!\$)/g,
    (_, pre, det) => `${pre}$${det}$`,
  )
  return out
}

/** Mathpix \(...\) / \[...\] → $...$ / $$...$$ */
function convertMathpixDelimiters(text) {
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${inner.trim()}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner.trim()}$`)
}

/**
 * Passage OCR: $$\begin{array}…\end{array} $ or $\begin{array}…\end{array} $$ — fix delimiters.
 * Multi-row \begin{array} must sit in balanced $$…$$ for MathText / KaTeX.
 * @param {string} text
 */
/** Inside $…$ or $$…$$ at `offset`; $$ toggles display math as one delimiter. */
function insideMathBefore(before) {
  let inline = false
  let display = false
  for (let i = 0; i < before.length; i += 1) {
    if (before[i] === '\\') {
      i += 1
      continue
    }
    if (before[i] !== '$') continue
    if (before[i + 1] === '$') {
      display = !display
      i += 1
    } else {
      inline = !inline
    }
  }
  return inline || display
}

const LEFT_FENCE_TAIL = new RegExp(String.raw`\\left\s*${LATEX_FENCE}?\s*$`)

export function wrapDisplayArrayBlocks(text) {
  if (!text?.includes('\\begin{array}')) return text

  let out = text

  out = out.replace(
    /(?<!\$)\$(\\begin\{array\}[\s\S]*?\\end\{array\})\s*\$\$/g,
    (_, block) => `$$${block}$$`,
  )
  out = out.replace(
    /\$\$\s*(\\begin\{array\}[\s\S]*?\\end\{array\})\s*\$(?!\$)/g,
    (full, block, offset, str) => {
      // A “$…$” run right after the table opens its own inline math (the
      // “$\_\_\_\_$ and so on” blank); it is not this block's closing $.
      const after = String(str ?? '').slice(offset + full.length)
      if (/^[^$]{1,60}\$/.test(after)) return `$$${block}$$ $`
      return `$$${block}$$`
    },
  )
  // $$$\begin…\end{array}$$$$$$ → $$\begin…\end{array}$$
  out = out.replace(/\${3,}(\\begin\{array\})/g, '$$$$$1')
  out = out.replace(/(\\end\{array\})\${3,}/g, '$1$$')
  out = out.replace(
    /(?<!\$)\$\$(\\begin\{array\}[\s\S]*?\\end\{array\})\$\$(?!\$)/g,
    '$$$$$1$$$$',
  )
  out = out.replace(
    /(?<!\$)\$(\\begin\{array\}[\s\S]*?\\end\{array\})\$(?!\$)/g,
    (full, block) => (/\\\\/.test(block) ? `$$${block}$$` : full),
  )
  out = out.replace(
    /(?<!\$)\$\s*(\\begin\{array\}[\s\S]*?\\end\{array\})(?!\$)/g,
    (full, block, offset, str) => {
      const before = String(str ?? '').slice(0, offset)
      if (((before.match(/(?<!\\)\$/g) || []).length % 2) === 1) return full
      if (LEFT_FENCE_TAIL.test(before.slice(-24))) return full
      return /\\\\/.test(block) ? `$$${block}$$` : `$${block}$`
    },
  )
  out = out.replace(
    /(?<!\$)\s*(\\begin\{array\}\{[^}]*\}[\s\S]*?\\end\{array\})\s*(?!\$)/g,
    (full, block, offset, str) => {
      const before = String(str ?? '').slice(0, offset)
      if (insideMathBefore(before)) return full
      if (LEFT_FENCE_TAIL.test(before.slice(-24))) return full
      if (/\$\$/.test(full)) return full
      return /\\\\/.test(block) ? `$$${String(block).trim()}$$` : full
    },
  )
  out = out.replace(
    /(\\end\{array\})\s*(?:\$\\_\\_|\\_\\_)+/g,
    '$1 ',
  )
  out = out.replace(
    /(\\end\{array\})\s*\$\s*(?:\\_\\_|_){2,}/g,
    '$1 ',
  )

  // Final: $$\begin…\end{array}$ → $$\begin…\end{array}$$
  out = out.replace(/\$\$(\\begin\{array\}[\s\S]*?\\end\{array\})\$(?!\$)/g, (_, block) => `$$${block}$$`)

  return out
}

/**
 * OCR piecewise: f(x)=\{ \begin{array}{ll} … \end{array} → \begin{cases}…\end{cases}
 * so KaTeX can render instead of dumping raw code.
 * @param {string} text
 */
export function repairPiecewiseBraceArray(text) {
  let s = String(text ?? '')
  if (!s.includes('\\begin{array}') && !s.includes('\\begin{cases}')) return s
  s = s.replace(
    /\\left\s*\\\{\s*\\begin\{array\}\{l+\}([\s\S]*?)\\end\{array\}\s*\\quad\s*\\text\s*\{\s*and\s*\}\s*\\quad\s*(g\s*\(\s*x\s*\)\s*=\s*)\\begin\{cases\}([\s\S]*?)\\end\{cases\}\s*\\right\s*\./gi,
    (_, a, gAssign, b) =>
      `\\begin{cases}${a}\\end{cases}$ and $$${gAssign}\\begin{cases}${b}\\end{cases}$$`,
  )
  s = s.replace(
    /\\left\s*\\\{\s*\\begin\{array\}\{l+\}([\s\S]*?)\\end\{array\}/gi,
    (_, body) => `\\begin{cases}${body}\\end{cases}`,
  )
  // After sanitize: f(x)=$\{$ $$\begin{array}…\end{array}$$
  s = s.replace(
    /=\s*\$\\\{\$\s*\$\$\\begin\{array\}\{l+\}([\s\S]*?)\\end\{array\}\$\$/gi,
    (_, body) => `=$$\\begin{cases}${body}\\end{cases}$$`,
  )
  s = s.replace(
    /=\s*\\\{\s*\$\$\\begin\{array\}\{l+\}([\s\S]*?)\\end\{array\}\$\$/gi,
    (_, body) => `=$$\\begin{cases}${body}\\end{cases}$$`,
  )
  s = s.replace(
    /\\\{\s*\\begin\{array\}\{l+\}([\s\S]*?)\\end\{array\}/gi,
    (_, body) => `\\begin{cases}${body}\\end{cases}`,
  )
  s = s.replace(
    /=\s*\\\{\s*\\begin\{array\}\{l+\}([\s\S]*?)\\end\{array\}/gi,
    (_, body) => `=\\begin{cases}${body}\\end{cases}`,
  )
  return s
}

/**
 * Multi-row \begin{cases} must sit in $$…$$ (same idea as wrapDisplayArrayBlocks).
 * Also pulls a leading f(x)= into the display block.
 * @param {string} text
 */
export function wrapDisplayCasesBlocks(text) {
  if (!text?.includes('\\begin{cases}')) return text

  let out = text
  out = out.replace(
    /(?<!\$)\$(\\begin\{cases\}[\s\S]*?\\end\{cases\})\$(?!\$)/g,
    (full, block) => `$$${block}$$`,
  )
  out = out.replace(
    /(?<!\$)\$(\\begin\{cases\}[\s\S]*?\\end\{cases\})\s*\$\$/g,
    (_, block) => `$$${block}$$`,
  )
  out = out.replace(
    /\$\$\s*(\\begin\{cases\}[\s\S]*?\\end\{cases\})\s*\$(?!\$)/g,
    (_, block) => `$$${block}$$`,
  )
  out = out.replace(
    /\$\$\s*([A-Za-z]\s*\(\s*[A-Za-z]\s*\)\s*=\s*\\begin\{cases\}[\s\S]*?\\end\{cases\})\s*\$(?!\$)/g,
    (_, block) => `$$${block}$$`,
  )
  out = out.replace(
    /(?<!\$)\$\s*(\\begin\{cases\}[\s\S]*?\\end\{cases\})(?!\$)/g,
    (full, block, offset, str) => {
      const before = String(str ?? '').slice(0, offset)
      if (((before.match(/(?<!\\)\$/g) || []).length % 2) === 1) return full
      return `$$${block}$$`
    },
  )
  out = out.replace(
    /(?<!\$)\s*(\\begin\{cases\}[\s\S]*?\\end\{cases\})\s*(?!\$)/g,
    (full, inner, offset, str) => {
      const before = String(str ?? '').slice(0, offset)
      if (((before.match(/(?<!\\)\$/g) || []).length % 2) === 1) return full
      const body = String(inner ?? full).trim()
      if (/\$\$/.test(body)) return full
      return ` $$${body}$$ `
    },
  )
  out = out.replace(
    /([A-Za-z]\s*\(\s*[A-Za-z]\s*\)\s*=\s*)\$\$(\\begin\{cases\}[\s\S]*?\\end\{cases\})\$\$/g,
    (_, assign, block) => `$$${assign}${block}$$`,
  )
  // Final: $$\begin{cases}…\end{cases}$ / $$g(x)=\begin{cases}…\end{cases}$ → balanced $$
  out = out.replace(
    /\$\$((?:[A-Za-z]\s*\(\s*[A-Za-z]\s*\)\s*=\s*)?\\begin\{cases\}[\s\S]*?\\end\{cases\})\$(?!\$)/g,
    (_, block) => `$$${block}$$`,
  )
  return out
}

/** \text { and } sitting outside $…$ → plain "and" */
function latexTextConjunctionsToProse(text) {
  const s = String(text ?? '')
  if (!/\\text\s*\{/.test(s)) return s
  let out = ''
  let i = 0
  while (i < s.length) {
    if (s.startsWith('$$', i)) {
      const end = s.indexOf('$$', i + 2)
      if (end !== -1) {
        out += s.slice(i, end + 2)
        i = end + 2
        continue
      }
    }
    if (s[i] === '$') {
      const end = s.indexOf('$', i + 1)
      if (end !== -1) {
        out += s.slice(i, end + 1)
        i = end + 1
        continue
      }
    }
    const rest = s.slice(i)
    const tm = rest.match(/^\\text\s*\{\s*([^}]*)\s*\}/)
    if (tm && /^(?:and|or|then|if|otherwise|when)$/i.test(tm[1].trim())) {
      out += ` ${tm[1].trim()} `
      i += tm[0].length
      continue
    }
    out += s[i]
    i += 1
  }
  return out
}

/** \text { Let } → plain "Let " for readable stems */
function latexTextToProse(chunk) {
  return chunk.replace(/\\text\s*\{\s*([^}]*)\s*\}/gi, (_, inner) => `${inner.trim()} `)
}

/** OCR: "0 & 2 2 & 1" → "0 & 2 & 1" when an ampersand was dropped */
function repairMatrixRowAmpersands(inner) {
  return inner.replace(/(\d)\s+(\d)\s*&/g, '$1 & $2 &')
}

/** Restore row breaks when OCR lost \\\\ inside a matrix */
function repairMatrixRowBreaks(inner, cols = 3) {
  let body = String(inner ?? '').trim()
  if (!body) return body
  body = body.replace(/\s*\\\\\s*/g, ' \\\\ ')
  if (/\\\\/.test(body)) return repairMatrixRowAmpersands(body)

  const cells = body.split('&').map((s) => s.trim()).filter((s) => s.length > 0)
  if (cells.length < cols || cells.length % cols !== 0) return repairMatrixRowAmpersands(body)

  const rows = []
  for (let i = 0; i < cells.length; i += cols) {
    rows.push(cells.slice(i, i + cols).join(' & '))
  }
  return rows.join(' \\\\ ')
}

/** Wrap \mathrm{A}=\left[\begin{matrix}…\end{matrix}\right] in display math */
function wrapBareMatrixBlock(chunk) {
  const re =
    /(\\mathrm\{[A-Za-z]\}\s*=\s*)?\\left\[\\begin\{(?:matrix|pmatrix|bmatrix|vmatrix)\}([\s\S]*?)\\end\{(?:matrix|pmatrix|bmatrix|vmatrix)\}\\right\]/g
  if (!re.test(chunk)) return null
  re.lastIndex = 0
  let out = latexTextToProse(chunk)
  out = out.replace(re, (_, prefix, inner) => {
    const body = repairMatrixRowBreaks(repairMatrixRowAmpersands(inner), 3)
    let assign = prefix ? prefix.replace(/\\mathrm\{([A-Za-z])\}\s*=\s*/, '$1=').trim() : 'A='
    if (!assign.endsWith('=')) assign += '='
    return `$$${assign}\\begin{bmatrix}${body}\\end{bmatrix}$$ `
  })
  return out
}

/** Wrap bare LaTeX runs in plain-text segments (outside existing $…$). */
function wrapBareLatexChunk(chunk) {
  if (!chunk.includes('\\')) return chunk

  const matrixWrapped = wrapBareMatrixBlock(chunk)
  if (matrixWrapped != null) return matrixWrapped.trim()

  if (chunk.includes('\\times')) return chunk

  let out = chunk
  out = out.replace(
    /((?:\\(?:vec|hat)\{[a-zA-Z]\}\s*,\s*)+\\(?:vec|hat)\{[a-zA-Z]\})/g,
    (m) => `$${m.trim()}$`,
  )
  out = out.replace(/(\\left\[[^[\]]*\\right\])/g, (m) => `$${m.trim()}$`)
  out = out.replace(
    /(\\(?:frac\{[^}]+\}\{[^}]+\}|sqrt\{[^}]+\}|hat\{[a-zA-Z]\}|vec\{[a-zA-Z]\}))/g,
    (m) => `$${m}$`,
  )
  return out
}

export function wrapBareLatexOutsideDollars(text) {
  if (!text?.includes('\\')) return text

  let out = ''
  let i = 0
  let guard = 0
  while (i < text.length) {
    if (++guard > text.length * 6) break

    if (text.startsWith('$$', i)) {
      const end = text.indexOf('$$', i + 2)
      if (end !== -1) {
        out += text.slice(i, end + 2)
        i = end + 2
        continue
      }
    }
    if (text[i] === '$') {
      const end = text.indexOf('$', i + 1)
      if (end !== -1) {
        out += text.slice(i, end + 1)
        i = end + 1
        continue
      }
      // A closer with no partner is still a dollar. Dropping it glues the next word into math.
      out += '$'
      i += 1
      continue
    }
    const nextD = text.indexOf('$$', i)
    const nextS = text.indexOf('$', i)
    let next = text.length
    if (nextD !== -1) next = Math.min(next, nextD)
    if (nextS !== -1) next = Math.min(next, nextS)
    out += wrapBareLatexChunk(text.slice(i, next))
    i = next
  }
  return out
}
const LATEX_CMD =
  'vec|hat|frac|sqrt|left|right|begin|end|times|cdot|text|mathbf|mathrm|boldsymbol|overrightarrow|operatorname|alpha|beta|gamma|delta|theta|pi|sum|int|infty|leq|geq|neq|pm|div|sin|cos|tan|log|ln|Delta|delta|lambda|mu|sigma|phi|omega|angle|perp|parallel|propto|in|notin|subset|cup|cap|rightarrow|leftarrow|Rightarrow|Leftrightarrow|mp|mod|bmod|pmod|det|lim|max|min|sup|inf|partial|nabla|ell|forall|exists|approx|equiv|ne|le|ge|exp|sec|csc|cot|overline|underline|widehat|widetilde|overbrace|underbrace|binom|choose|matrix|pmatrix|bmatrix|vmatrix|cases|ce|pu'

/**
 * \\vec{a} (double-escaped) → \vec{a} for KaTeX. Repeat until stable.
 * @param {string} text
 */
export function fixDoubleEscapedLatex(text) {
  if (!text?.includes('\\')) return text
  let out = text
  let prev
  const re = new RegExp(`\\\\\\\\(?:${LATEX_CMD})\\b`, 'g')
  do {
    prev = out
    out = out.replace(re, (m) => m.slice(1))
  } while (out !== prev)
  // KaTeX treats \\in as linebreak + "in", not ∈
  out = out.replace(/\\{2 }(?=in\b)/g, '\\')
  return out
}

/**
 * Mathpix array box notation → display matrix with stretchy brackets.
 * @param {string} text
 */
export function fixArrayBoxProduct(text) {
  if (!text?.includes('\\begin{array}')) return text

  return text.replace(
    /\\left\[\\begin\{array\}\{[^}]*\}([\s\S]*?)\\end\{array\}\\right\]/g,
    (full, inner) => {
      // A real matrix keeps \\ row breaks. Only the one-row box product
      // [a b c] is flattened. Do not glue 1 \\ 2 into "12".
      if (/\\\\/.test(inner)) return full
      return formatBoxMatrix(parseBoxCells(inner))
    },
  )
}

/** @param {string} inner */
function parseBoxCells(inner) {
  return inner
    .split('&')
    .map((s) => s.trim().replace(/\\\\/g, ' ').replace(/\s+/g, ' '))
    .filter(Boolean)
}

/** @param {string[]} cells */
function formatBoxMatrix(cells) {
  if (!cells.length) return ''
  return `\\left[\\begin{matrix}${cells.join(' & ')}\\end{matrix}\\right]`
}

/**
 * Box product — stretchy brackets + matrix layout.
 * Preserves cross-product cells [a×b, b×c, c×a] when present.
 * @param {string} text
 */
export function fixScalarTripleBoxProduct(text) {
  if (!text.includes('[') && !text.includes('\\left[') && !text.includes('\\vec{')) {
    return text
  }

  let out = text

  // Hybrid OCR shatter: \times ^2 / $\times$ ^2 inside scalar triple → \times 2
  out = out.replace(/\$\\times\$\s*\^\s*\{?\s*2\s*\}?/gi, '\\times 2')
  out = out.replace(/\\times\s*\^\s*\{?\s*2\s*\}?(?=\\vec|\s*\\vec)/gi, '\\times 2')
  out = out.replace(
    /\[\s*\\vec\{a\}\s*(?:\\quad\s*|\\\s+| )+\\vec\{b\}\s*(?:\\quad\s*|\\\s+| )+\\vec\{a\}\s*(?:\$\\times\$|\\times)\s*(?:\^\s*\{?\s*2\s*\}?|2)\s*\\vec\{b\}\s*\]/gi,
    '$[\\vec{a} \\ \\vec{b} \\ \\vec{a} \\times 2\\vec{b}]$',
  )

  // Plain OCR brackets: [a×b  b×c  a] or [a×b, b×c, c]
  out = out.replace(
    /\[\s*\\vec\{a\}\s*\\times\s*\\vec\{b\}(?:\s*[,;\\]\s*|\s+)+\\vec\{b\}\s*\\times\s*\\vec\{c\}(?:\s*[,;\\]\s*|\s+)+\\vec\{([a-z])\}\s*\]/gi,
    (_, third) =>
      formatBoxMatrix([
        '\\vec{a}\\times\\vec{b}',
        '\\vec{b}\\times\\vec{c}',
        `\\vec{${third}}`,
      ]),
  )

  // [a×b  b×c  c×a] — cross-product box (format only, do not replace with a,b,c)
  const crossBoxRe =
    /\\left\[\s*\\vec\{a\}\s*\\times\s*\\vec\{b\}(?:\s*\\[;,]\s*|\s+)*\\vec\{b\}\s*\\times\s*\\vec\{c\}(?:\s*\\[;,]\s*|\s+)*\\vec\{c\}\s*\\times\s*\\vec\{a\}\s*\\right\]/g

  out = out.replace(
    crossBoxRe,
    formatBoxMatrix([
      '\\vec{a}\\times\\vec{b}',
      '\\vec{b}\\times\\vec{c}',
      '\\vec{c}\\times\\vec{a}',
    ]),
  )

  // Flat [a ; b ; c] — scalar triple product [a  b  c] (no cross products)
  out = out.replace(
    /\\left\[\s*((?:\\vec\{[a-zA-Z]\}\s*(?:\\[;,]\s*)?)+)\s*\\right\]/g,
    (match, inner) => {
      if (inner.includes('\\begin{matrix}') || inner.includes('\\times')) return match
      const cells = [...inner.matchAll(/\\vec\{([a-zA-Z])\}/g)].map((m) => `\\vec{${m[1]}}`)
      if (cells.length < 2) return match
      return formatBoxMatrix(cells)
    },
  )

  return out
}

/**
 * Close math before English: $\left[...\right] is equal to → ...\right]$ is equal to
 * @param {string} text
 */
export function fixUnclosedMathDelimiter(text) {
  return text
    .replace(
      /(\$\$[^$]*\\left\[[\s\S]*?\\right\])(\s+(?:is equal to|equals?|are equal to))/gi,
      '$1$$$2',
    )
    .replace(
      /(\$[^$]*\\left\[[\s\S]*?\\right\])(\s+(?:is equal to|equals?|are equal to))/gi,
      '$1$$$2',
    )
}

/**
 * Repair missing opening $ before vector lists: If \vec{a}, \vec{b}, \vec{c}$
 * Skips segments already inside $...$.
 * @param {string} text
 */
export function fixUnmatchedMathDollars(text) {
  if (!text?.includes('\\')) return text

  return text.replace(
    /((?:\\(?:vec|hat)\{[a-zA-Z]\}\s*,?\s*)+)\$(?!\$)/g,
    (match, chunk, offset, str) => {
      const before = str.slice(0, offset)
      if (before.endsWith('$') || (before.match(/\$/g) || []).length % 2 === 1) return match
      return `$${chunk.replace(/\s*,\s*/g, ', ').trim()}$`
    },
  )
}

/**
 * Wrap vector/LaTeX runs only when the line has no $ delimiters at all.
 * @param {string} text
 */
export function wrapBareLatexSegments(text) {
  if (!text?.includes('\\') || text.includes('$')) return text

  return text.replace(
    /((?:[+-]?\s*\d*\\(?:vec|hat)\{[a-zA-Z]\}\s*)+(?:[=+\-]\s*(?:[+-]?\s*\d*\\(?:vec|hat)\{[a-zA-Z]\}\s*)+)*|\\left\[[^\]]+\\right\])/g,
    (run) => `$${run.trim()}$`,
  )
}

/**
 * Use display math for tall bracket constructs.
 * @param {string} text
 */
export function promoteDisplayMathBlocks(text) {
  if (/\$\$\\left\[\\begin\{matrix\}/.test(text)) return text
  return text.replace(
    /\$([^$\n]*\\left\[\\begin\{matrix\}[^$\n]*\\end\{matrix\}\\right\])\$/g,
    (_, inner) => `$$${inner.trim()}$$`,
  )
}

/**
 * Drop space around $$ without eating a dollar. A replacement string "$$"
 * becomes one dollar, which leaves $x \in \mathbb{R}$ outside math.
 * @param {unknown} text
 * @param {{ keepLineBreaks?: boolean }} [options]
 */
export function normalizeSplitMathDollars(text, options = {}) {
  const keepLineBreaks = Boolean(options.keepLineBreaks)
  const before = keepLineBreaks ? /[ \t]+\$\$/g : /\s+\$\$/g
  const after = keepLineBreaks ? /\$\$[ \t]+/g : /\$\$\s+/g
  return String(text ?? '')
    .replace(/Let\s+\$\$\s*A\s*=\s*/gi, 'Let $$A=')
    .replace(after, () => '$$')
    .replace(before, () => '$$')
    .replace(/\$\$([^$\n]+?)\$(?!\$)/g, (full, inner, offset, whole) => {
      const opens = String(whole).slice(0, offset).split('$$').length - 1
      if (opens % 2 === 1) return full
      return `$${String(inner).trim()}$`
    })
}

/** True when the preview splitter would print a command as text. */
export function commandLeftOutsideMathSegments(text) {
  const normalized = normalizeSplitMathDollars(stripSheetConfigHtml(text))
  const outside = []
  let i = 0
  while (i < normalized.length) {
    if (normalized.startsWith('$$', i)) {
      const end = normalized.indexOf('$$', i + 2)
      if (end !== -1) {
        i = end + 2
        continue
      }
    }
    if (normalized[i] === '$') {
      const end = normalized.indexOf('$', i + 1)
      if (end !== -1) {
        i = end + 1
        continue
      }
    }
    const nextDisplay = normalized.indexOf('$$', i)
    const nextInline = normalized.indexOf('$', i)
    let next = normalized.length
    if (nextDisplay !== -1) next = Math.min(next, nextDisplay)
    if (nextInline !== -1) next = Math.min(next, nextInline)
    if (next > i) outside.push(normalized.slice(i, next))
    i = next === i ? i + 1 : next
  }
  return outside.some((part) => {
    const prose = part.replace(/\\begin\{(?:array|tabular)\}[\s\S]*?\\end\{(?:array|tabular)\}/gi, ' ')
    return /\\(?:mathbb|in)\b/.test(prose)
  })
}

/**
 * Leftover Mathpix chrome that must never reach the student as raw tags.
 * Cheap — safe on the 24k fail-closed path. Hide only commands with no meaning.
 */
export function stripLatexDisplayChrome(text) {
  let s = String(text ?? '')
  s = s.replace(/---\s*page\s*---/gi, ' ')
  s = rewriteLatexItemLabels(s)
  s = s.replace(/<smiles>[\s\S]*?<\/smiles>/gi, ' ')
  s = s.replace(/<\/?smiles>/gi, ' ')
  s = s.replace(/\\captionsetup\{[^}]*\}/gi, ' ')
  s = rewriteCaptionCommands(s)
  s = stripHlineOutsideTables(s)
  return s.replace(/[ \t]{2,}/g, ' ')
}

/** Keep \\hline inside array/tabular (KaTeX draws the rule). Drop leftover prose \\hline. */
function stripHlineOutsideTables(text) {
  const t = String(text ?? '')
  if (!t.includes('\\hline')) return t
  let out = ''
  let i = 0
  while (i < t.length) {
    if (t.startsWith('$$', i)) {
      const end = t.indexOf('$$', i + 2)
      if (end !== -1) {
        out += t.slice(i, end + 2)
        i = end + 2
        continue
      }
    }
    if (t[i] === '$' && t[i + 1] !== '$') {
      const end = t.indexOf('$', i + 1)
      if (end > i && /\\begin\{(?:array|tabular)/i.test(t.slice(i, end + 1))) {
        out += t.slice(i, end + 1)
        i = end + 1
        continue
      }
    }
    if (/^\\begin\{(?:array|tabular|cases)\}/i.test(t.slice(i))) {
      const name = t.slice(i).match(/^\\begin\{([^}]+)\}/i)?.[1]
      const endTok = name ? `\\end{${name}` : ''
      const endEnv = endTok ? t.toLowerCase().indexOf(endTok.toLowerCase(), i) : -1
      if (endEnv > i) {
        const after = t.indexOf('}', endEnv)
        out += t.slice(i, after > 0 ? after + 1 : endEnv)
        i = after > 0 ? after + 1 : endEnv
        continue
      }
    }
    if (t.startsWith('\\hline', i)) {
      i += 6
      continue
    }
    out += t[i]
    i += 1
  }
  return out
}

/** Strip option label; fix short numeric / corrupted fraction options for preview */
export function normalizeMcqOptionForRender(text) {
  if (!text?.trim()) return text ?? ''
  let out = text.trim().replace(/^\([A-D]\)\s*/i, '')
  out = out.replace(/\\text\s*\{\s*frac\s*\}/gi, '\\frac')
  out = out.replace(/^\$\$(\\frac\{[^}]+\}\{[^}]+\})\$$/, '$$$1$')
  out = out.replace(/^\$\$(\\sqrt\{[^}]+\})\$$/, '$$$1$')
  out = out.replace(/^\$\$(\\frac\{[^}]+\}\{[^}]+\}\\sqrt\{[^}]+\})\$$/, '$$$1$')
  if (!out.includes('$')) {
    out = wrapBareFractionsAndRoots(out)
  }
  if (/^0$/.test(out) || out === '$0$' || /^O$/i.test(out)) return '0'
  if (/^\d+$/.test(out)) return out
  if (/^\\(?:frac|sqrt)\{/.test(out) && !out.includes('$')) return `$${out}$`
  return out
}

/** Wrap \\frac / \\sqrt / \\hat / \\vec outside $…$ in mixed text */
function wrapBareFractionsAndRoots(text) {
  if (!text.includes('\\')) return text
  let s = String(text)
  s = s.replace(/\\text\s*\{\s*frac\s*\}/gi, '\\frac')
  let out = ''
  let i = 0
  while (i < s.length) {
    if (s[i] === '$') {
      const end = s.indexOf('$', i + 1)
      if (end !== -1) {
        out += s.slice(i, end + 1)
        i = end + 1
        continue
      }
    }
    const frac = findFracExpression(s, i)
    if (frac && frac.start >= i) {
      out += s.slice(i, frac.start)
      const before = s[frac.start - 1]
      const after = s[frac.end]
      out += before === '$' || after === '$' ? frac.full : `$${frac.full}$`
      i = frac.end
      continue
    }
    out += s[i]
    i += 1
  }
  return out
}

const MATH_UNIT = String.raw`(?:kcal|cal|kJ|J|mol|K|atm|bar|M|mL|L|dm|cm|mm|nm|pm|km|kg|mg|g|s|min|h|Pa|kPa|V|mV|Hz|eV|W)`
const NUMBER_UNIT_RE = new RegExp(String.raw`(\d|\^\{[^{}]*\})\s+\\mathrm\s*\{\s*(${MATH_UNIT})\s*\}`, 'g')
const UNIT_UNIT_RE = new RegExp(
  String.raw`(\\mathrm\s*\{\s*${MATH_UNIT}\s*\}(?:\^\{[^{}]*\})?)\s+\\mathrm\s*\{\s*(${MATH_UNIT})\b`,
  'g',
)

/** KaTeX drops source spaces, so `105 \mathrm{kcal} \mathrm{mol}` would draw as "105kcalmol". */
export function spaceMathUnits(text) {
  let s = String(text ?? '')
  s = s.replace(/\(\s*\\mathrm\s*\{\s*~\s*(g|l|s|aq)\s*\}\s*\)/g, '(\\mathrm{$1})')
  s = s.replace(NUMBER_UNIT_RE, (_, lead, unit) => `${lead}~\\mathrm{${unit}}`)
  s = s.replace(/(\d~\\mathrm\{M\})\s+\\mathrm\s*\{(?!\s*~)/g, '$1~\\mathrm{')
  for (let i = 0; i < 3; i += 1) {
    const next = s.replace(UNIT_UNIT_RE, (_, first, unit) => `${first}~\\mathrm{${unit}`)
    if (next === s) break
    s = next
  }
  return s
}

/**
 * The paper's answer blank "____" inside math is not TeX. A blank that is the whole
 * formula is plain text; one inside a formula becomes a drawn blank line.
 */
export function answerBlanksInMath(text) {
  return String(text ?? '')
    .replace(/(?<!\$)\$\s*(_{2,})\s*\$(?!\$)/g, (_, blank) => blank)
    .replace(/\$[^$\n]*\$/g, (seg) => seg.replace(/(?<![\\_])_{2,}(?![_{])/g, '\\underline{\\hspace{2em}}'))
}

/**
 * Full display pipeline for MathText — sanitize OCR glitches, then KaTeX prep.
 * @param {string} text
 * @param {{ questionContext?: string, optionLetter?: string }} [opts]
 */
export function prepareTextForMathTextDisplay(text, opts = {}) {
  if (!text?.trim()) return text ?? ''
  const raw = String(text).replace(/\uFFFD+/g, '').trim()
  if (raw.length > 24_000) {
    let cheap = sanitizeStemForDisplay(raw)
    cheap = stripLatexDisplayChrome(cheap)
    cheap = convertLatexTabularToArray(cheap)
    cheap = stripDollarsInsideLatexEnvs(cheap)
    cheap = wrapDisplayArrayBlocks(cheap)
    cheap = wrapDisplayCasesBlocks(cheap)
    return cheap
  }
  if (looksLikePolynomialCoeffVmatrix(raw)) {
    return POLY_COEFF_VMATRIX_STEM
  }
  if (looksLikeZ5ImaginaryRootsExpDeterminantMcq(raw)) {
    return Z5_IMAGINARY_ROOTS_DET_STEM
  }
  if (looksLikeLimitGxQuestion(raw)) {
    if (hasGoodLimitGxStem(raw)) return raw
    return LIMIT_GX_STEM
  }
  if (looksLikeT10LimitQuestion(raw)) {
    if (hasGoodT10LimitStem(raw)) return raw
    return T10_LIMIT_STEM
  }

  if (opts.optionLetter && opts.questionContext?.trim()) {
    const ctx = opts.questionContext.trim()
    if (looksLikeLimitGxQuestion(ctx) && hasGoodLimitGxStem(ctx)) {
      const idx = String(opts.optionLetter).toUpperCase().charCodeAt(0) - 65
      if (idx >= 0 && idx < LIMIT_GX_OPTIONS.length) {
        return LIMIT_GX_OPTIONS[idx]
      }
    }
    if (looksLikeT10LimitQuestion(ctx)) {
      const healed = healT10LimitOptions([raw])
      const idx = String(opts.optionLetter).toUpperCase().charCodeAt(0) - 65
      if (idx >= 0 && idx < T10_LIMIT_OPTION_ITEMS.length) {
        return T10_LIMIT_OPTION_ITEMS[idx]
      }
      if (healed[0]) return healed[0]
    }
  }

  let out = repairMatchArrowLatex(raw)
  out = repairNpSpPassageArray(out)
  out = sanitizeStemForDisplay(out)
  out = cleanupBrokenStemDelimiters(normalizeSmashedChemDollars(out))
  out = stripLatexDisplayChrome(out)
  out = answerBlanksInMath(spaceMathUnits(out))
  out = stripMarkdownBoldOutsideMath(out)
  out = healTruncatedLatexForDisplay(out)
  if (/\\text\s*\{\s*frac\s*\}/i.test(out) || /\\frac\s*\\\{/.test(out)) {
    out = normalizeFracLatex(out)
  }
  out = repairMatchArrowLatex(out)
  out = repairNpSpPassageArray(out)
  out = convertLatexTabularToArray(out)
  const stashedSheets = stashSheetConfigHtml(out)
  out = stashedSheets.text
  out = stripDollarsInsideLatexEnvs(out)
  out = repairOrphanPiecewiseArray(out)
  out = repairPiecewiseBraceArray(out)
  out = repairCasesLatex(out)
  out = wrapDisplayArrayBlocks(out)
  out = wrapDisplayCasesBlocks(out)
  out = repairOrphanAlignedBody(out)
  out = latexTextConjunctionsToProse(out)
  out = repairMatrixDeterminantStem(out)
  out = normalizeScalarTripleProduct(out)
  const hasFragileDisplayEnv = /\\begin\{(?:aligned|align\*?|cases)\}/.test(out)
  if (hasFragileDisplayEnv) {
    out = repairInlineMathDelimiters(convertMathpixDelimiters(out))
  } else {
    out = fixRunawayInlineMath(repairInlineMathDelimiters(convertMathpixDelimiters(out)))
  }

  const alreadyHasDisplayMatrix =
    /\$\$\\left\[\\begin\{(?:matrix|pmatrix|bmatrix)/.test(out) ||
    /\$\$A\s*=\s*\\begin\{bmatrix\}/.test(out) ||
    /\$\$[\s\S]*\\begin\{vmatrix\}/.test(out) ||
    /\$\$[\s\S]*\\begin\{(?:cases|aligned|array)\}/.test(out) ||
    /\$[A-Za-z]\s*=\s*\\begin\{(?:bmatrix|pmatrix)\}/.test(out)
  const hasBmatrix = /\\begin\{bmatrix\}/.test(out)
  const hasVmatrix = /\\begin\{vmatrix\}/.test(out)
  const hasCases = /\\begin\{cases\}/.test(out)
  const hasAligned = /\\begin\{aligned\}/.test(out)

  if (opts.optionLetter && opts.questionContext?.trim()) {
    out = repairMcqOptionForDisplay(out, opts.optionLetter, opts.questionContext)
  } else if (!hasBmatrix && !hasVmatrix && !hasCases && !hasAligned && !alreadyHasDisplayMatrix) {
    out = sanitizeMathDelimiters(out)
  } else {
    out = out.replace(/\$\$\$+/g, '$$').replace(/\$\\\$/g, '$').replace(/\\\$\$+/g, '')
  }

  if (!alreadyHasDisplayMatrix && !hasBmatrix && !hasVmatrix && !hasAligned) {
    out = prepareMathForRender(out)
    // Drop stray $/$$ that OCR injects mid-expression, then capture whole
    // bare-LaTeX runs (\int…, \sqrt{\operatorname…}, \left(…\right)^{…}) before
    // the narrow wrappers, so surrounding LaTeX is never stranded.
    out = stripStrayMathDelimiters(out)
    out = wrapBareLatexRuns(out)
    out = normalizeMcqOptionForRender(out)
    out = wrapBareLatexOutsideDollars(out)
  } else {
    // Matrix / cases stems still need bare \\mathrm{mol} and leftover array/cases wrapped.
    out = wrapBareLatexRuns(out)
  }

  out = out.replace(/\bof\$\$/g, 'of $$').replace(/\bof\$/g, 'of $')
  out = fixCapacitorEnergyLatex(out)
  out = repairNestedMathrmUnits(out)
  out = wrapBareFracExpressions(out)
  out = dedupeRepeatedStemPhrase(out)
  out = repairPrematureDollarBeforeLeft(out)
  out = splitEvaluateProseFromLeftSum(out)
  out = repairEvaluateSumMathBlock(out)
  out = repairShatteredLeftRightMath(out)
  out = repairNpSpPassageArray(out)
  out = wrapDisplayArrayBlocks(out)
  out = wrapDisplayCasesBlocks(out)
  out = stripDollarsInsideLatexEnvs(out)
  out = stripLatexDisplayChrome(out)
  out = cleanupBrokenStemDelimiters(out)
  out = ensureMatrixStemDelimiters(out)
  if (hasVmatrix) {
    out = ensureVmatrixStemDelimiters(out)
  }
  out = out.replace(/\$\$\s+\$\s*(?=\])/g, '$$ ')
  // ( $2^{\circ} \pm 40^{\prime}$$ ) — the closer was doubled. Keep one dollar.
  out = out.replace(/(?<!\$)\$([^$\n]{1,200})\$\$(?=\s*\))/g, (_, body) => `$${body}$`)
  // of $\mathbf{X}$$ completely — one opener, a doubled closer, then a word.
  out = out.replace(/(?<!\$)\$([^$\n]{1,200})\$\$(?=\s)/g, (_, body) => `$${body}$`)
  // $$\sin ...=0.035$ ] opened as display and closed with one dollar.
  out = out.replace(/\$\$([^$\n]+)\$\s*(?=\])/g, (_, body) => `$$${body}$$ `)
  // 0.25$\% ($$mass/mass) — the extra dollar is not in the OCR.
  out = out.replace(/\$\\%\s*\(\$\$/g, (full) => full.replace('($$', '($'))
  return restoreSheetConfigHtml(
    keepClosedMath(raw, ensureChemDisplayMathClosed(canonicalizeMatrixDisplayBlocks(out))),
    stashedSheets.blocks,
  )
}

function commandLeftOutsideMath(text) {
  const visible = stripSheetConfigHtml(text)
    .replace(/<table[\s\S]*?<\/table>/gi, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/\\begin\{(?:tabular|array)\}[\s\S]*?\\end\{(?:tabular|array)\}/gi, ' ')
  return /\\(?:mathrm|mathbf|frac|xrightarrow|epsilon)\b/.test(visible)
}

/** If a later step opens math that the stored line had closed, keep the closed line and still draw tables. */
function keepClosedMath(raw, finished) {
  const opened = !hasUnclosedDisplayMath(raw) && hasUnclosedDisplayMath(finished)
  const leaked = !commandLeftOutsideMath(raw) && commandLeftOutsideMath(finished)
  if (!opened && !leaked) return finished
  const safe = answerBlanksInMath(convertLatexTabularToArray(sanitizeStemForDisplay(raw)))
  if (!hasUnclosedDisplayMath(safe) && !commandLeftOutsideMath(safe)) return safe
  if (!hasUnclosedDisplayMath(raw) && !commandLeftOutsideMath(raw)) {
    return answerBlanksInMath(convertLatexTabularToArray(raw))
  }
  return finished
}

/**
 * Bare pi/Pi → \\pi for KaTeX (skip already-correct \\pi; "apple pie" stays).
 * Also heals legacy corruption "|x+ pi|" from double-escape + backslash collapse.
 * @param {string} text
 */
export function repairBarePiConstant(text) {
  if (!text || !/[Pp]i/.test(text)) return text
  let out = String(text)
  // Legacy: "+ pi" / "- pi" / "|x+ pi|" after collapse stripped the backslash
  out = out.replace(/([+\-/=(|]\s*)(?<!\\)[Pp]i(?![a-zA-Z])/g, '$1\\pi')
  out = out.replace(/(?<!\\)(?<![a-zA-Z])[Pp]i(?![a-zA-Z])/g, '\\pi')
  return out
}

/**
 * Full prep before KaTeX render or after OCR normalize.
 * @param {string} text
 */
export function prepareMathForRender(text) {
  if (!text?.trim()) return text
  let out = text.replace(/\r\n/g, '\n')
  out = repairCorruptedLatexRight(out)
  out = repairMatchArrowLatex(out)
  out = repairBarePiConstant(out)
  out = fixDoubleEscapedLatex(out)
  out = fixArrayBoxProduct(out)
  out = fixScalarTripleBoxProduct(out)
  out = fixUnmatchedMathDollars(out)
  out = wrapBareLatexSegments(out)
  out = fixUnclosedMathDelimiter(out)
  out = promoteDisplayMathBlocks(out)
  return out
}


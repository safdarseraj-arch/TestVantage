import { repairGluedEnglishProse } from './fixRunawayInlineMath.js'
import { wrapBareFracExpressions } from './latexBraceMatch.js'

/** @param {string[]} nums */
function expandGluedDigitTokens(nums) {
  if (nums.length >= 7 && nums.length < 9) {
    const expanded = []
    for (const n of nums) {
      if (/^\d{2}$/.test(n)) {
        expanded.push(n[0], n[1])
      } else {
        expanded.push(n)
      }
    }
    return expanded
  }
  return nums
}

/** Flat OCR row: "3 4 54" or "3 \\quad 4 \\quad 54" → digit tokens */
export function parseFlatBracketDigits(raw) {
  return expandGluedDigitTokens(
    String(raw ?? '')
      .replace(/\\quad/g, ' ')
      .replace(/\\\\/g, ' ')
      .replace(/\\\s+/g, ' ')
      .replace(/&/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((t) => /^\d+$/.test(t)),
  )
}

/** @param {string} raw @param {number} [cols] */
export function flatBracketDigitsToBmatrix(raw, cols = 3) {
  const nums = parseFlatBracketDigits(raw)
  if (nums.length < cols * cols) return null
  const slice = nums.slice(0, cols * cols)
  const rows = []
  for (let i = 0; i < slice.length; i += cols) {
    rows.push(slice.slice(i, i + cols).join(' & '))
  }
  return `\\begin{bmatrix}${rows.join(' \\\\ ')}\\end{bmatrix}`
}

/** Restore row breaks when OCR lost \\\\ inside a matrix body */
export function repairMatrixRowBreaks(inner, cols = 3) {
  let body = String(inner ?? '').trim()
  if (!body) return body
  body = body.replace(/\s*\\\\\s*/g, ' \\\\ ')
  if (/\\\\/.test(body)) return body

  body = body.replace(/\\quad/g, ' ').replace(/\\\s+/g, ' ').replace(/\s+/g, ' ').trim()

  const cells = body.split('&').map((s) => s.trim()).filter((s) => s.length > 0)
  if (cells.length < cols || cells.length % cols !== 0) {
    const bySpace = body.split(/\s+/).filter((s) => /^\d+$/.test(s))
    if (bySpace.length >= cols && bySpace.length % cols === 0) {
      const rows = []
      for (let i = 0; i < bySpace.length; i += cols) {
        rows.push(bySpace.slice(i, i + cols).join(' & '))
      }
      return rows.join(' \\\\ ')
    }
    return body
  }

  const rows = []
  for (let i = 0; i < cells.length; i += cols) {
    rows.push(cells.slice(i, i + cols).join(' & '))
  }
  return rows.join(' \\\\ ')
}

/** Entire stem wrongly wrapped in one $…$ pair */
function balancedDollarSpanCount(text) {
  const t = String(text ?? '')
  let i = 0
  let open = false
  let spans = 0
  while (i < t.length) {
    if (t[i] === '\\') {
      i += 2
      continue
    }
    if (t.startsWith('$$', i)) {
      if (open) return 0
      const end = t.indexOf('$$', i + 2)
      if (end < 0) return 0
      spans += 1
      i = end + 2
      continue
    }
    if (t[i] === '$') {
      if (open) spans += 1
      open = !open
      i += 1
      continue
    }
    i += 1
  }
  return open ? 0 : spans
}

export function unwrapOuterDollarWrapper(text) {
  const original = String(text ?? '')
  const t = original.trim()
  if (t.startsWith('$') && t.endsWith('$') && !t.startsWith('$$')) {
    const inner = t.slice(1, -1).trim()
    // `$formula$ and $formula$` is already two spans. Cutting the ends
    // drops the first opener and the last closer, so the formula shows as code.
    if (balancedDollarSpanCount(t) >= 2) return original
    if ((inner.match(/\$/g) || []).length >= 2) return inner
  }
  return original
}

/** Must not contain backslashes — they break RegExp replacement. */
const ROW_BREAK_MARK = '\uE000ROW\uE001'

/** Strip leaked internal markers (shows as □ in textareas). */
export function stripInternalStemMarkers(text) {
  return String(text ?? '')
    .split(ROW_BREAK_MARK)
    .join(' \\\\ ')
    .replace(/\uE000|\uE001/g, '')
}

/** A reaction scheme's numbered steps are lines, not one sentence. */
export function keepNumberedReactionStepLines(text) {
  const t = String(text ?? '')
  if (!/reaction\s+sequence/i.test(t) || !/major\s+products/i.test(t)) return false
  const steps = t.match(/(?:^|\n)\s*(?:\(\s*)?\d{1,2}\s*[.)]\s+\S/g) || []
  if (steps.length < 2) return false
  return /\\(?:xrightarrow|rightarrow|longrightarrow)|→|_{2,}|(?:\\_){2,}|____/.test(t)
}

/**
 * A displayed equation or a Given: block is part of the question layout.
 * Squeezing those lines into one paragraph hides the formula and the meanings.
 */
export function keepStructuredQuestionLines(text) {
  if (keepNumberedReactionStepLines(text)) return true
  const t = String(text ?? '')
  if (/(?:^|\n)\s*\$\$[^\n]*\\(?:frac|dfrac|xrightarrow|longrightarrow)\b[^\n]*\$\$\s*(?:\n|$)/.test(t)) {
    return true
  }
  if (/(?:^|\n)\s*Given\s*:/i.test(t) && /\n/.test(t)) return true
  return false
}

/** Collapse spaces but keep LaTeX row breaks (\\\\). */
function collapseWhitespacePreservingRowBreaks(text) {
  let out = stripInternalStemMarkers(text)
  out = out.replace(/\\\\/g, ROW_BREAK_MARK)
  if (keepStructuredQuestionLines(out)) {
    out = out.replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n')
  } else {
    out = out.replace(/\s+/g, ' ')
  }
  return out.split(ROW_BREAK_MARK).join(' \\\\ ').trim()
}

/**
 * OCR often inserts spaces: \\begin {bmatrix} 2 → breaks matrix on save.
 * @param {string} text
 */
/** OCR + exponent fix corrupts \\begin{bmatrix}2 into \\begin{bmatri x^2 */
export function repairBmatrixOcrCorruption(text) {
  return String(text ?? '')
    .replace(/\\begin\s*\{?\s*bmatri\s*x\s*\^?\s*2/gi, '\\begin{bmatrix}2')
    .replace(/\\begin\s*\{?\s*bmatri(?=[\s&\\])/gi, '\\begin{bmatrix}')
    .replace(/\\begin\s*\$\s*\{?\s*bmatri/gi, '\\begin{bmatrix}')
    .replace(/\bbmatri\s*x\s*\^?\s*2\b/gi, 'bmatrix}2')
}

/** One clean $$…$$ block for KaTeX (fixes M − 1 =$$A= nested dollars). */
export function canonicalizeMatrixDisplayBlocks(text) {
  let out = String(text ?? '')
  out = out.replace(
    /M\s*(?:\^{-1}|[−-]\s*1)\s*=\s*\$\$A=\\begin\{bmatrix\}([\s\S]*?)\\end\{bmatrix\}\$\$/gi,
    (_, body) => `$$M^{-1} = A = \\begin{bmatrix}${String(body).trim()}\\end{bmatrix}$$`,
  )
  out = out.replace(
    /\$M\s*(?:\^{-1}|[−-]\s*1)\s*=\s*A\s*=\s*\\begin\{bmatrix\}([\s\S]*?)\\end\{bmatrix\}\$\$/gi,
    (_, body) => `$$M^{-1} = A = \\begin{bmatrix}${String(body).trim()}\\end{bmatrix}$$`,
  )
  out = out.replace(
    /M\s*(?:\^{-1}|[−-]\s*1)\s*=\s*A\s*=\s*\\begin\{bmatrix\}([\s\S]*?)\\end\{bmatrix\}(?!\$)/gi,
    (_, body) => `$$M^{-1} = A = \\begin{bmatrix}${String(body).trim()}\\end{bmatrix}$$`,
  )
  return out.replace(/\$\$\$+/g, '$$')
}

/** Wrap bare matrix in $$ so KaTeX renders after save (preview already looked fine). */
export function ensureMatrixStemDelimiters(text) {
  let out = String(text ?? '')
  if (!/\\begin\{bmatrix\}/i.test(out)) return out

  out = out.replace(
    /Let\s*\$A=\\begin\{bmatrix\}([\s\S]*?)\\end\{bmatrix\}\$/gi,
    (_, body) => `Let $$A=\\begin{bmatrix}${String(body).trim()}\\end{bmatrix}$$`,
  )

  const hasDisplayBlock = /\$\$[\s\S]*\\begin\{bmatrix\}[\s\S]*\\end\{bmatrix\}[\s\S]*\$\$/.test(out)
  if (!hasDisplayBlock) {
    out = out.replace(
      /((?:Let\s+)?)(?:\$?\s*)?A\s*=\s*\\begin\{bmatrix\}([\s\S]*?)\\end\{bmatrix\}/gi,
      (match, letPart, body, offset, str) => {
        const pre = str.slice(Math.max(0, offset - 24), offset)
        if (/M\s*(?:\^{-1}|[−-]\s*1)\s*=\s*/.test(pre)) return match
        return `${letPart}$$A=\\begin{bmatrix}${String(body).trim()}\\end{bmatrix}$$`
      },
    )
  }

  return canonicalizeMatrixDisplayBlocks(out)
}

export function canonicalizeBeginMatrixEnv(text) {
  return repairBmatrixOcrCorruption(String(text ?? ''))
    .replace(
      /\\begin\s+\{\s*(bmatrix|pmatrix|vmatrix|matrix)\s+(\d)/gi,
      '\\begin{$1}$2',
    )
    .replace(
      /\\begin\s+\{\s*(bmatrix|pmatrix|vmatrix|matrix)\s*\}/gi,
      '\\begin{$1}',
    )
    .replace(
      /\\begin\s*\{\s*(bmatrix|pmatrix|vmatrix|matrix)\s*\}\s*/gi,
      '\\begin{$1}',
    )
}

/** Remove duplicate Let / A= prefixes and broken $…$ from double-processing */
export function cleanupBrokenStemDelimiters(text) {
  let out = unwrapOuterDollarWrapper(String(text ?? ''))
  out = out
    // "$$" in a replacement string is one dollar. Four dollar signs keep the display opener.
    .replace(/Let\s+\$\$\s*A\s*=\s*/gi, 'Let $$$$A=')
    .replace(/\$\s*M\s*\^{-1}\s*=\s*\$\s*\$\$/gi, '$M^{-1} = $$')
    .replace(/\$\s*M\s*\^{-1}\s*=\s*\$\s*A\s*=\s*/gi, '$M^{-1} = A = ')
    .replace(/\\end\{bmatrix\}\s*\$(?!\$)(\s*then\b)/gi, '\\end{bmatrix}$$$1')
    .replace(/\\\$\$+/g, '')
    .replace(/\$\$\$+/g, '$$')
    .replace(/\$\\\$\$/g, '$$')
    .replace(/\$\\\$/g, '$')
    .replace(/\$\$\s*\$(?=\\frac)/g, '$')
    .replace(/\$\$A\s*=\s*\\begin\{bmatrix\}/g, '$$A=\\begin{bmatrix}')
    .replace(
      /Let\s*\\mathbf\{A\}\s*=\s*[^$\\]*\$\s*A=\\begin\{bmatrix\}/gi,
      'Let $$A=\\begin{bmatrix}',
    )
    .replace(
      /(?<!\$)\$((?:A|\\mathbf\{A\})\s*=\s*\\begin\{bmatrix\}[\s\S]*?\\end\{bmatrix\}\$\$)/g,
      '$$$1',
    )
    .replace(/\\mathbf\{A\}(?![^|]*\|)/g, 'A')
    .replace(/Let\s*\\mathbf\{A\}\s*=\s*\\?\s*(?=\$\$A=\\begin\{bmatrix\})/gi, 'Let ')
    .replace(/Let\s*\\mathbf\{A\}\s*=\s*\$+/gi, 'Let ')
    .replace(/Let\s*\\mathrm\{A\}\s*=\s*\$+\s*(?=\$\$?A=)/gi, 'Let ')
    .replace(
      /Let\s*(?:\$[^$]{0,120}\$|\s*\\mathbf\{A\}\s*=\s*[^$\\]*)\s*(\$\$A=\\begin\{bmatrix\})/gi,
      'Let $1',
    )
    .replace(
      /(\$\$A=\\begin\{bmatrix\}[\s\S]*?\\end\{bmatrix\}\$\$)\s*\$\$A=\\begin\{bmatrix\}[\s\S]*?\\end\{bmatrix\}\$\$/g,
      '$1',
    )
  out = out.replace(
    /Let\s+[\s\S]*?A\s*=\s*\\begin\{bmatrix\}([\s\S]*?)\\end\{bmatrix\}(\$\$?)/i,
    (_, body) => `Let $$A=\\begin{bmatrix}${String(body).trim()}\\end{bmatrix}$$ `,
  )
  out = out.replace(
    /(?<!\$)\$A=\\begin\{bmatrix\}([\s\S]*?)\\end\{bmatrix\}(?!\$)/gi,
    (_, body) => `$$A=\\begin{bmatrix}${String(body).trim()}\\end{bmatrix}$$ `,
  )
  out = out.replace(/\\end\{bmatrix\}\$\$\s+\$(then\s+absolute\s+value\s+of\s+)/gi, '\\end{bmatrix}$$ $1')
  out = out.replace(/\\end\{bmatrix\}\$\$(then\s+)/gi, '\\end{bmatrix}$$ $1')
  out = out.replace(/\\end\{bmatrix\}\$\$([a-z])/gi, '\\end{bmatrix}$$ $1')
  out = out.replace(/(?<!\$)\$\s*(then\s+absolute\s+value\s+of\s+)/gi, '$1')
  out = out.replace(/(\$\$[^$]+\$\$)(then)/gi, '$1 $2')
  return collapseWhitespacePreservingRowBreaks(out)
}

/**
 * Fix JEE-style matrix stems: glued English, bare \begin{matrix}, or flat number rows.
 * @param {string} text
 */
/** OCR wraps matrix as [begin{bmatrix}…end{bmatrix}] with missing backslashes */
export function repairBracketWrappedFakeBmatrix(text) {
  let out = String(text ?? '')

  const toBmatrix = (letPart, inner) => {
    let body = String(inner ?? '')
      .replace(/^(?:\\\\)?begin\s*\{?\s*bmatrix\s*\}?/i, '')
      .replace(/(?:\\\\)?end\s*\{?\s*bmatrix\s*\}?$/i, '')
      .trim()
    const fromDigits = flatBracketDigitsToBmatrix(body.replace(/&/g, ' '))
    const core =
      fromDigits ||
      `\\begin{bmatrix}${repairMatrixRowBreaks(body, 3)}\\end{bmatrix}`
    return letPart?.trim() ? `Let $$A=${core}$$` : `$$A=${core}$$`
  }

  out = out.replace(
    /((?:Let\s+)?)(?:\$\$?)?\s*A\s*=\s*\[\s*((?:\\\\)?begin\s*\{?\s*bmatrix\s*\}?[\s\S]*?(?:\\\\)?end\s*\{?\s*bmatrix\s*\}?)\s*\]/gi,
    (match, letPart, inner) => toBmatrix(letPart, inner) || match,
  )

  out = out.replace(
    /((?:Let\s+)?)(?:\$\$?)?\s*A\s*=\s*(?<![\\])begin\s*\{?\s*bmatrix\s*\}?([\s\S]*?)(?<![\\])end\s*\{?\s*bmatrix\s*\}?/gi,
    (match, letPart, inner) => toBmatrix(letPart, inner) || match,
  )

  return out
}

/** Rows glued with spaces: `2 & 0 & 1 1 & 0 & 2 2 & 1 & 1` inside bmatrix */
function repairSpaceGroupedBmatrixRows(inner) {
  const body = String(inner ?? '').trim()
  const rowGroups = body.match(/(?:[-+]?\d+(?:\s*&\s*[-+]?\d+){1,5})/g)
  if (!rowGroups || rowGroups.length < 2) return body
  const normalized = rowGroups.map((r) => r.replace(/\s+/g, ' ').trim()).join(' \\\\ ')
  return normalized.includes('\\\\') ? normalized : body
}

/** Signed integer cells, including a glued "1 1" that used to be a row break. */
function numericMatrixTokens(inner) {
  return String(inner ?? '')
    .replace(/\\quad/g, ' ')
    .replace(/&/g, ' ')
    .replace(/\\\\/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => /^[-+]?\d+$/.test(t))
}

/**
 * \\begin{array}{lll} that lost \\\\ so nine numbers sit on one row.
 * Uses the column spec. Does not invent cells that are not in the text.
 * @param {unknown} text
 */
export function repairArrayBodiesMissingRowBreaks(text) {
  return String(text ?? '').replace(
    /\\begin\{array\}(\{[lcr|]+\})([\s\S]*?)\\end\{array\}/gi,
    (match, spec, inner) => {
      if (/\\\\/.test(inner)) return match
      const cols = (String(spec).match(/[lcr]/gi) || []).length
      if (cols < 2) return match
      const residue = String(inner)
        .replace(/&/g, ' ')
        .replace(/[-+]?\d+/g, ' ')
        .replace(/\s+/g, '')
      if (residue) return match
      const tokens = numericMatrixTokens(inner)
      if (tokens.length < cols * 2 || tokens.length % cols !== 0) return match
      const rows = []
      for (let i = 0; i < tokens.length; i += cols) {
        rows.push(tokens.slice(i, i + cols).join(' & '))
      }
      return `\\begin{array}${spec}${rows.join(' \\\\ ')}\\end{array}`
    },
  )
}

/** A one-column tabular wrapped around an English sentence is not a data table. */
export function unwrapProseTabular(text) {
  return String(text ?? '').replace(
    /\\begin\{tabular\}(?:\[[^\]]*\])?\{l\}([\s\S]*?)(?:\\end\{tabular\}|$)/gi,
    (full, body) => {
      if (/&/.test(body)) return full
      const words = String(body)
        .replace(/\$\$[\s\S]*?\$\$/g, ' ')
        .replace(/\$[^$]*\$/g, ' ')
        .replace(/\\[a-zA-Z]+/g, ' ')
      if (!/[A-Za-z]{4,}/.test(words)) return full
      return String(body)
        .replace(/\\hline/gi, ' ')
        .replace(/^\s*\\\\/g, '')
        .trim()
    },
  )
}

/** Inside gathered, a lost \\\\ glues the next equation onto "=1 c x". */
export function restoreGatheredEquationBreaks(text) {
  return String(text ?? '').replace(
    /\\begin\{gathered\}([\s\S]*?)\\end\{gathered\}/gi,
    (full, body) => {
      if (/\\\\/.test(body)) return full
      const fixed = String(body).replace(/(=\s*[-+]?\d+)\s+(?=[A-Za-z(])/g, '$1 \\\\ ')
      if (fixed === body) return full
      return `\\begin{gathered}${fixed}\\end{gathered}`
    },
  )
}

/** OCR flat bracket [3 4 5] or [3 \\quad 4 \\quad 54 …] → 3×3 bmatrix */
/** 3×3 OCR often keeps nine cells on one row inside \\begin{bmatrix}…\\end{bmatrix}. */
export function repairBmatrixBodiesMissingRowBreaks(text) {
  return String(text ?? '').replace(
    /\\begin\{bmatrix\}([\s\S]*?)\\end\{bmatrix\}/gi,
    (match, inner) => {
      if (/\\\\/.test(inner)) return match
      const spaced = repairSpaceGroupedBmatrixRows(inner)
      if (spaced !== inner && /\\\\/.test(spaced)) {
        return `\\begin{bmatrix}${spaced}\\end{bmatrix}`
      }
      const ampCount = (String(inner).match(/&/g) || []).length
      if (ampCount < 1) return match
      const cells = ampCount + 1
      for (const cols of cells % 2 === 0 ? [2, 3, 4] : [3, 2, 4]) {
        if (cells % cols !== 0) continue
        const body = repairMatrixRowBreaks(inner, cols)
        if (body.includes('\\\\')) return `\\begin{bmatrix}${body}\\end{bmatrix}`
      }
      return match
    },
  )
}

export function repairFlatNumericBracketMatrix(text) {
  let out = String(text ?? '')

  out = out.replace(
    /M\s*(?:\^{-1}|[−-]\s*1)\s*=\s*A\s*=\s*\[\s*([^\]]{8,240}?)\s*\]/gi,
    (_, raw) => {
      const bmatrix = flatBracketDigitsToBmatrix(raw)
      return bmatrix ? `$$M^{-1} = A = ${bmatrix}$$` : `M^{-1} = A = [${raw}]`
    },
  )

  out = out.replace(
    /\$M\^{-1}\s*=\s*\$\s*\$?\s*A\s*=\s*\[\s*([^\]]{8,240}?)\s*\]\s*\$/gi,
    (_, raw) => {
      const bmatrix = flatBracketDigitsToBmatrix(raw)
      return bmatrix ? `$M^{-1} = $$A=${bmatrix}$$` : `$M^{-1} = $A = [${raw}]$`
    },
  )

  out = out.replace(
    /\$M\^{-1}\s*=\s*A\s*=\s*\[\s*([^\]]{8,240}?)\s*\]\s*\$/gi,
    (_, raw) => {
      const bmatrix = flatBracketDigitsToBmatrix(raw)
      return bmatrix ? `$M^{-1} = $$A=${bmatrix}$$` : `$M^{-1} = A = [${raw}]$`
    },
  )

  out = out.replace(
    /Let\s+(?:\$\$?)?\s*A\s*=\s*\[\s*([^\]]{8,240}?)\s*\]\s*(?:\$\$?)?/gi,
    (match, raw) => {
      const bmatrix = flatBracketDigitsToBmatrix(raw)
      return bmatrix ? `Let $$A=${bmatrix}$$` : match
    },
  )

  out = out.replace(
    /(?<![$\\])\bA\s*=\s*\[\s*([^\]]{8,240}?)\s*\]/gi,
    (match, raw, offset, str) => {
      if (/\\begin\{|\\end\{/.test(raw)) return match
      const pre = str.slice(Math.max(0, offset - 20), offset)
      if (/\$M\^{-1}\s*=\s*\$/.test(pre)) return match
      const bmatrix = flatBracketDigitsToBmatrix(raw)
      return bmatrix ? `A=${bmatrix}` : match
    },
  )

  return out.replace(/\$\$\$+/g, '$$')
}

export function repairMatrixDeterminantStem(text) {
  let out = canonicalizeBeginMatrixEnv(
    cleanupBrokenStemDelimiters(repairGluedEnglishProse(String(text ?? '').trim())),
  )
  out = repairBracketWrappedFakeBmatrix(out)
  out = repairFlatNumericBracketMatrix(out)
  out = repairBmatrixBodiesMissingRowBreaks(out)
  out = repairArrayBodiesMissingRowBreaks(out)
  out = restoreGatheredEquationBreaks(out)
  if (!out) return out

  const hasCanonicalMatrix =
    /Let\s*\$\$A\s*=\s*\\begin\{bmatrix\}[\s\S]*?\\end\{bmatrix\}\$\$/i.test(out)
  if (hasCanonicalMatrix) {
    out = repairBmatrixBodiesMissingRowBreaks(out)
    out = out.replace(/\bof\$\$/g, 'of $$').replace(/\bof\$/g, 'of $')
    out = out.replace(
      /(\$\$A=\\begin\{bmatrix\}[\s\S]*?\\end\{bmatrix\}\$\$)\s*(then\s+absolute\s+value\s+of\s+)/gi,
      '$1 $2',
    )
    return wrapBareFracExpressions(out)
  }

  // \text { Let } \mathrm{A}=\left[\begin{matrix}…\right]
  out = out.replace(
    /\\text\s*\{\s*([^}]*)\s*\}\s*(\\mathrm\{[A-Za-z]\}\s*=\s*)?\\left\[\\begin\{(?:matrix|pmatrix|bmatrix)\}([\s\S]*?)\\end\{(?:matrix|pmatrix|bmatrix)\}\\right\]/gi,
    (_, _letWord, prefix, inner) => {
      const body = repairMatrixRowBreaks(inner, 3)
      let assign = prefix ? prefix.replace(/\\mathrm\{([A-Za-z])\}\s*=\s*/, '$1=').trim() : 'A='
      if (!assign.endsWith('=')) assign += '='
      return `Let $$${assign}\\begin{bmatrix}${body}\\end{bmatrix}$$`
    },
  )

  // Let $A =$ … then (matrix already partially in $ but wrong shape)
  out = out.replace(
    /(\\mathrm\{[A-Za-z]\}\s*=\s*)?\\left\[\\begin\{(?:matrix|pmatrix|bmatrix)\}([\s\S]*?)\\end\{(?:matrix|pmatrix|bmatrix)\}\\right\]/gi,
    (_, prefix, inner) => {
      const body = repairMatrixRowBreaks(inner, 3)
      let assign = prefix ? prefix.replace(/\\mathrm\{([A-Za-z])\}\s*=\s*/, '$1=').trim() : 'A='
      if (!assign.endsWith('=')) assign += '='
      return `$$${assign}\\begin{bmatrix}${body}\\end{bmatrix}$$`
    },
  )

  // Single-row bmatrix OCR: all 9 cells on one line
  out = out.replace(
    /\$\\begin\{bmatrix\}([\s\S]*?)\\end\{bmatrix\}\$/g,
    (_, inner) => {
      const body = repairMatrixRowBreaks(inner, 3)
      return `$$A=\\begin{bmatrix}${body}\\end{bmatrix}$$`
    },
  )

  // Let $A =$ [flat digits] before "then" / "absolute" (OCR: [2\ 0\ 1] or [2 \quad 0 \quad 11 …])
  out = out.replace(
    /Let\s*\$?\s*A\s*=\s*\$?\s*(?:\\left)?\[\s*([^\]]{8,120}?)\]\s*\$?\s*(?=\s*then|\s*absolute)/i,
    (match, inner) => {
      if (/\\begin\{|\\end\{/.test(inner)) return match
      const bmatrix = flatBracketDigitsToBmatrix(inner)
      if (bmatrix) return `Let $$A=${bmatrix}$$`
      const flat = String(inner ?? '')
        .replace(/\\quad/g, ' ')
        .replace(/\\\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      const body = repairMatrixRowBreaks(flat, 3)
      if (!body.includes('\\\\')) return `Let $A =$ [${flat}]`
      return `Let $$A=\\begin{bmatrix}${body}\\end{bmatrix}$$`
    },
  )

  out = out.replace(/\bof\$\$/g, 'of $$').replace(/\bof\$/g, 'of $')
  out = ensureMatrixStemDelimiters(cleanupBrokenStemDelimiters(out))
  return canonicalizeMatrixDisplayBlocks(out)
}

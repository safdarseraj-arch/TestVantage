/**
 * Wrap contiguous bare LaTeX expressions (outside existing $…$) in inline math
 * delimiters, so OCR / Mathpix stems that emit raw LaTeX mixed with English
 * prose render correctly. Used for every TestVantages upload (Question Bank
 * Convert, Official PYQ, Word/PDF/JSON/CSV) — never show raw TeX as code.
 *
 * includegraphics / cdn.mathpix.com URLs are copied verbatim (never dropped).
 * Orphan aligned leftovers (`& … \\ & …`) become a $$aligned$$ display block.
 *
 * A "math run" is anchored by a backslash command (e.g. \int, \sqrt, \frac,
 * \left, \ln) and greedily extends through its arguments, nested groups,
 * super/subscripts, math operators, single-letter variables and adjacent
 * commands — stopping at clearly-English prose (a word of 2+ letters that is
 * not a LaTeX command or inside a {…} group) or sentence punctuation.
 *
 * Runs containing \begin{…} (matrices / arrays / cases) are left untouched so
 * the dedicated display-matrix handling keeps owning them.
 */

import { clipIncompleteFracRun, normalizeSmashedChemDollars, splitGluedChemDisplayEquations } from './healTruncatedLatex.js'
import { LATEX_FENCE, stripDollarsInsideLatexEnvs } from './latexTabularDisplay.js'

const LEFT_FENCE_AT_END = new RegExp(String.raw`\\left\s*${LATEX_FENCE}\s*$`)
const BARE_FENCED_ARRAY = new RegExp(
  String.raw`\\left\s*${LATEX_FENCE}\s*\\begin\{array\}[\s\S]{0,1200}?\\end\{array\}\s*\\right\s*${LATEX_FENCE}(?:\s*[\^_](?:\{[^{}$]*\}|\\?[A-Za-z0-9]))*`,
  'g',
)
import {
  consumeIncludeGraphics,
  guardDollarsAroundFigures,
  normalizeBrokenMathpixGraphics,
} from './mathpixMedia.js'

/** OCR sometimes stores `\\begin` / `\\in` (two backslashes). Collapse those, never row-breaks. */
export function unescapeAccidentalDoubleBackslash(text) {
  return String(text ?? '').replace(
    /\\\\(begin|end|in|mathbb|mathbf|mathrm|quad|qquad|text|log|ln|frac|sqrt|neq|leq|geq|left|right|sin|cos|tan|cdot|times|infty|partial|sum|int|rightarrow|leftarrow)(?![a-zA-Z])/g,
    '\\$1',
  )
}

/**
 * Flattened 3×3 set-matrix: rows 1–2 then “: condition”, row 3 after.
 * Rebuilds the pmatrix from the three visible rows. Never invents entries.
 */
export function repairFlattenedSetMatrixOcr(text) {
  const s = String(text ?? '')
  if (!/Let\s+S\s*=/i.test(s) || /\\begin\{(?:pmatrix|bmatrix|array)\}/.test(s)) return s
  return s.replace(
    /Let\s+S\s*=\s*\\?\{?\s*A\s*=\s*\(\s*(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*\)\s*:\s*([\s\S]{8,220}?)\s+(\S+)\s+(\S+)\s+(\S+)\s*(?=\|A\|\s*denotes)/i,
    (_, a11, a12, a13, a21, a22, a23, mid, a31, a32, a33) => {
      const cond = String(mid)
        .replace(/\\?in\s*\\?\{/g, '\\in\\{')
        .replace(/\.and\s*\./gi, ' and ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/,?\s*where$/i, '')
      return `Let $S=\\{A=\\begin{pmatrix}${a11} & ${a12} & ${a13} \\\\ ${a21} & ${a22} & ${a23} \\\\ ${a31} & ${a32} & ${a33}\\end{pmatrix}: ${cond}\\}$, where `
    },
  )
}

/**
 * Skew-symmetric match row: stacked (y/z) and (a12 / 0 / −a23) OCR.
 * Rebuilds the two column vectors from letters already in the stem.
 */
/**
 * Mathpix often splits `{0,1\right.$ and $\left.|A|` inside a set.
 * Rebuild the braces already on the page — never invent entries.
 */
export function repairBrokenLeftRightSetOcr(text) {
  return String(text ?? '')
    // Keep \left\{ … \right\} in ONE math block. OCR often closes early:
    // \in\{0,1\}\right.$ and $|A| \in\{-1,1\}\right\}
    .replace(
      /\\in\s*\\\{\s*0\s*,\s*1\s*\\\}\\right\s*\.\s*\$\s*and\s*\$\s*(\|A\|)\s*\\in\s*\\\{\s*-1\s*,\s*1\s*\\\}\\right\\\}/g,
      '\\in\\{0,1\\}\\text{ and }$1\\in\\{-1,1\\}\\right\\}',
    )
    .replace(
      /\\in\s*\\\{\s*0\s*,\s*1\s*\\right\s*\.\s*\$\s*and\s*\$\s*\\left\s*\.\s*(\|A\|)\s*\\in\s*\\\{\s*-1\s*,\s*1\s*\\\}\\right\\\}/g,
      '\\in\\{0,1\\}\\text{ and }$1\\in\\{-1,1\\}\\right\\}',
    )
    .replace(
      /\\in\s*\\\{\s*0\s*,\s*1\s*\\right\s*\.\s*\$\s*and\s*\$\s*\\left\s*\.\s*(\|A\|)/g,
      '\\in\\{0,1\\}\\text{ and }$1',
    )
    .replace(
      /\\in\s*\\\{\s*0\s*,\s*1\s*\\\}\\right\s*\.\s*\$\s*and\s*\$/g,
      '\\in\\{0,1\\}\\text{ and }',
    )
    .replace(/\\in\s*\\\{\s*0\s*,\s*1\s*\\\}\\right\s*\./g, '\\in\\{0,1\\}')
    .replace(/\\in\s*\\\{\s*0\s*,\s*1\s*\\right\s*\./g, '\\in\\{0,1\\}')
    .replace(/\\in\s*\\\{\s*-1\s*,\s*1\s*\\\}\\right\\\}/g, '\\in\\{-1,1\\}\\right\\}')
    .replace(/\$\\left\s*\.\s*(\|A\|)/g, '$$$1')
    .replace(/\\left\s*\.\s*(\|A\|)/g, '$1')
}

export function repairSmashedXyzColumnOcr(text) {
  let s = String(text ?? '')
  s = s.replace(
    /\\begin\{array\}\{[lc]\}\s*x\s*\\\\\s*y\s*\\\\\s*z\s*\\end\{array\}/gi,
    '\\begin{pmatrix}x \\\\ y \\\\ z\\end{pmatrix}',
  )
  s = s.replace(
    /\\begin\{array\}\{[lc]\}\s*(a_\{12\})\s*\\\\\s*0\s*\\\\\s*(-?a_\{23\})\s*\\end\{array\}/gi,
    (_, a12, a23) => `\\begin{pmatrix}${a12} \\\\ 0 \\\\ ${a23}\\end{pmatrix}`,
  )
  if (!/a_\{?12\}?/.test(s) || !/a_\{?23\}?/.test(s)) return s
  if (/\\begin\{pmatrix\}/.test(s) && /x\s*\\\\\s*y/.test(s)) return s
  if (!/number of elements in the/i.test(s) && !/skew\s*symmetric/i.test(s)) return s
  return s.replace(
    /set\s*\\\{\s*\(\s*y\s*\)[\s\S]{0,140}?mathbb\{R\}[\s\S]{0,80}?M[\s\S]{0,80}?a_\{?12\}?[\s\S]{0,60}?\}[\s\S]{0,24}?is[\s\S]{0,16}?-?a_\{?23\}?/i,
    'set $\\{(x,y,z): x,y,z\\in\\mathbb{R},\\, M\\begin{pmatrix}x \\\\ y \\\\ z\\end{pmatrix}=\\begin{pmatrix}a_{12} \\\\ 0 \\\\ -a_{23}\\end{pmatrix}\\}$ is',
  )
}

const MATH_SYMBOL = /[0-9+\-*/=<>|()[\]!~:&]/

/** Matrix environments that the dedicated $$…$$ display handling owns. */
const DISPLAY_MATRIX_ENV =
  /^\\begin\{(?:bmatrix|pmatrix|vmatrix|Vmatrix|matrix|smallmatrix|aligned|align\*?|array|cases|tabular|itemize|enumerate|figure)\}/

/** Read a balanced {…} or [<bracket>] group starting at `pos` (pointing at the opener). */
function readGroup(text, pos, open, close) {
  if (text[pos] !== open) return -1
  let depth = 1
  pos += 1
  while (pos < text.length && depth > 0) {
    if (text[pos] === open) depth += 1
    else if (text[pos] === close) depth -= 1
    pos += 1
  }
  return depth === 0 ? pos : -1
}

/** Consume a \command (backslash + letters) at `pos`; returns index after it. */
function readCommand(text, pos) {
  // pos points at '\'
  let i = pos + 1
  if (i < text.length && /[a-zA-Z]/.test(text[i])) {
    while (i < text.length && /[a-zA-Z]/.test(text[i])) i += 1
  } else if (i < text.length) {
    // escaped delimiter like \{ \} \| \, \; \.
    i += 1
  }
  return i
}

/**
 * From a '\' at `start`, scan the maximal math run.
 * @returns {{ end: number, wrap: boolean }} `end` is where scanning stopped;
 *   `wrap` is false when the span should be copied verbatim (e.g. it is a
 *   display matrix, or holds no actual LaTeX command).
 */
function mathRunEnd(text, start) {
  let i = start
  let sawCommand = false
  let sawScript = false
  let hasDisplayMatrix = false
  let parenDepth = 0

  while (i < text.length) {
    const c = text[i]

    if (c === '$') break

    if (c === '\\') {
      const cmdEnd = readCommand(text, i)
      const cmd = text.slice(i, cmdEnd)
      if (DISPLAY_MATRIX_ENV.test(text.slice(i))) hasDisplayMatrix = true
      // LaTeX row break `\\` belongs in aligned/array, not inline $…$.
      if (cmd === '\\\\') break
      sawCommand = true
      i = cmdEnd
      // \left / \right take a following delimiter (optionally backslash-escaped)
      if (/^\\(?:left|right)$/.test(cmd)) {
        if (text[i] === '\\') i = readCommand(text, i)
        else if (i < text.length && /[([\]|./)]|\{|\}/.test(text[i])) i += 1
      }
      continue
    }

    if (c === '{') {
      const end = readGroup(text, i, '{', '}')
      if (end === -1) break
      i = end
      continue
    }

    if (c === '^' || c === '_') {
      sawScript = true
      i += 1
      if (text[i] === '{') {
        const end = readGroup(text, i, '{', '}')
        if (end === -1) break
        i = end
      } else if (i < text.length) {
        if (text[i] === '\\') i = readCommand(text, i)
        else i += 1
      }
      continue
    }

    if (c === '.') {
      const prev = text[i - 1]
      const next = text[i + 1]
      if (/[0-9]/.test(prev) && /[0-9]/.test(next)) {
        i += 1
        continue
      }
      break // sentence period
    }

    if (c === ',' || c === ';') {
      // Math separator inside groups (e.g. [-1,0]) but sentence punctuation
      // when trailing prose follows.
      if (/\s/.test(text[i + 1] ?? '')) break
      i += 1
      continue
    }

    if (c === '(' || c === '[') {
      parenDepth += 1
      i += 1
      continue
    }
    if (c === ')' || c === ']') {
      if (parenDepth <= 0) break // closes an opener that lives outside the run
      parenDepth -= 1
      i += 1
      continue
    }

    if (MATH_SYMBOL.test(c)) {
      i += 1
      continue
    }
    if (c === '?' && (text[i - 1] === '{' || text[i - 1] === '_')) {
      i += 1
      continue
    }

    if (/[a-zA-Z]/.test(c)) {
      let j = i
      while (j < text.length && /[a-zA-Z]/.test(text[j])) j += 1
      const word = text.slice(i, j)
      if (word.length === 1) {
        i = j // single-letter variable
        continue
      }
      // Two-letter products stay math (xy, dt). Real prose: if/of/to…
      if (word.length === 2 && !/^(?:if|of|to|is|or|in|as|an|be|by|at|we|on|so|do|no)$/i.test(word)) {
        i = j
        continue
      }
      break // multi-letter English word — prose
    }

    if (/\s/.test(c)) {
      // Include internal whitespace only if more math follows; otherwise stop.
      let j = i
      while (j < text.length && /\s/.test(text[j])) j += 1
      const after = text[j]
      if (after === undefined) break
      const isMathNext =
        after === '\\' ||
        after === '{' ||
        after === '^' ||
        after === '_' ||
        after === '&' ||
        MATH_SYMBOL.test(after) ||
        (/[a-zA-Z]/.test(after) &&
          (j + 1 >= text.length || !/[a-zA-Z]/.test(text[j + 1]))) // lone letter
      if (!isMathNext) break
      i = j
      continue
    }

    break
  }

  // Trim trailing whitespace from the scanned span.
  while (i > start && /\s/.test(text[i - 1])) i -= 1
  return { end: i, wrap: (sawCommand || sawScript) && !hasDisplayMatrix }
}

// A math character is anything that cannot start/end an English word or
// sentence — i.e. it signals we are in the middle of a LaTeX expression.
const MATH_NEIGHBOUR = /[\\{}()[\]|0-9+\-=*/<>^_]/

/**
 * Remove stray `$` / `$$` delimiters that OCR drops into the middle of a LaTeX
 * expression (e.g. `\left($$ \frac{1}{2} \right)` or `\frac{1}{\mathrm{x} $^{1/4}$}`).
 *
 * A delimiter is "stray" only when the non-space characters on BOTH sides are
 * math characters. Real delimiters always border prose (or text start/end) on
 * at least one side, so plain prose math and `$$…$$` display matrices that sit
 * next to words are preserved.
 *
 * @param {string} text
 */
export function stripStrayMathDelimiters(text) {
  const t = String(text ?? '')
  if (!t.includes('$')) return t

  let out = ''
  let i = 0
  while (i < t.length) {
    if (t[i] === '$') {
      const dl = t[i + 1] === '$' ? 2 : 1
      // $$ is a real display closer (e.g. ]^{3+}$$ [Given). Never drop it.
      if (dl === 2) {
        out += '$$'
        i += 2
        continue
      }
      const left = out.replace(/\s+$/, '').slice(-1)
      let j = i + dl
      while (j < t.length && /\s/.test(t[j])) j += 1
      const right = t[j]
      const leftMath = left !== '' && MATH_NEIGHBOUR.test(left)
      // "$ 500 mol" is a closer, then a quantity. A tight "2$3" is still stray.
      const digitAfterSpace = /\s/.test(t[i + dl] || '') && /[0-9]/.test(right || '')
      const rightMath = right !== undefined && MATH_NEIGHBOUR.test(right) && !digitAfterSpace
      // $\mathrm{NaNH}_{2}$ (2 equivalents) and trans- $\mathrm{CH}$ are real
      // closers/openers. "(" and "-" are English here, not stray math.
      // `$...$ )` closes a unit such as (in $\mathrm{J}...$). ")" is English here.
      const closedGroupThenParen =
        (left === '}' && (right === '(' || right === '[' || right === ')')) ||
        (right === '(' && /\s/.test(t[i + 1] || '') && /^\(\s*[A-Za-z]{3,}\b/.test(t.slice(j)))
      const hyphenBeforeCommand =
        (left === '-' || left === '\u2013' || left === '\u2014') && right === '\\'
      // [Given: $9^{1/3}=2.08$ ] and $...mol^{-1}$ ] — the bracket is English.
      const closerBeforeEnglishBracket =
        (right === ']' || right === ')') && (left === '}' || left === ')' || /[0-9]/.test(left))
      // ( $\mathrm{M}_{1}$ and ( $2 a, 2 b$ ) — the dollar after "(" opens a real formula.
      const openerBeforeCommand = right === '\\' || left === '(' || left === '['
      // (P)\n$|z|^{2}$ — a $ that starts a line or follows a row label opens a formula.
      const lineEdge = /\n[ \t]*$/.test(out) || /^[ \t]*\n/.test(t.slice(i + dl))
      const afterRowLabel = /(?:^|\s)\(\s*(?:[A-Z]|[IVX]{1,4}|\d{1,2})\s*\)\s*$/.test(out)
      const beforeRowLabel = /^\s*\(\s*(?:[A-Z]|[IVX]{1,4}|\d{1,2})\s*\)(?:\s|$)/.test(t.slice(i + dl))
      if (
        leftMath &&
        rightMath &&
        !closedGroupThenParen &&
        !hyphenBeforeCommand &&
        !closerBeforeEnglishBracket &&
        !openerBeforeCommand &&
        !lineEdge &&
        !afterRowLabel &&
        !beforeRowLabel
      ) {
        i += dl // drop the stray delimiter
        continue
      }
    }
    out += t[i]
    i += 1
  }
  return out
}

/** Complete short \mathrm / \ce already in the OCR — never invent a closer. */
function isCompleteInlineChem(inner) {
  const t = String(inner ?? '').trim()
  if (!t || t.length > 160) return false
  if ((t.match(/\{/g) || []).length !== (t.match(/\}/g) || []).length) return false
  return /\\(?:mathrm|ce|text)\b/.test(t)
}

/** $$\mathrm{H}_{2}\mathrm{O}_{2}$ → $\mathrm{H}_{2}\mathrm{O}_{2}$ */
function consumeSmashedDisplayOpen(text, i) {
  const next = text.indexOf('$', i + 2)
  if (next > i + 2) {
    const inner = text.slice(i + 2, next)
    if (isCompleteInlineChem(inner)) return { text: `$${inner}$`, end: next + 1 }
  }
  if (text[i + 2] === '\\') {
    const scanned = mathRunEnd(text, i + 2)
    const inner = text.slice(i + 2, scanned.end)
    if (scanned.end > i + 2 && isCompleteInlineChem(inner)) {
      return { text: `$${inner}$`, end: scanned.end }
    }
  }
  return null
}

/** Keep List-I captions / (P) item labels; never wrap them as math or drop them. */
function chromeCommandToProse(chunk) {
  const s = String(chunk ?? '')
  if (/^\\hline/.test(s) || /^\\captionsetup/.test(s)) return ''
  const cap = s.match(/^\\caption\s*\{([\s\S]*)\}$/)
  if (cap) {
    const inner = cap[1].trim()
    if (/^List-I$/i.test(inner)) return '\nList-I\n'
    if (/^List-II$/i.test(inner)) return '\nList-II\n'
    if (/^\(\s*[PQRSABCD1-5]\s*\)$/i.test(inner)) return `\n${inner.replace(/\s+/g, '')}\n`
    return ' '
  }
  const item = s.match(/^\\item\s*\[\s*(\(\s*[PQRSABCD1-5]\s*\)|[PQRSABCD1-5]\s*[.:]?)\s*\]/)
  if (item) {
    const letter = String(item[1]).replace(/[().:.\s]/g, '').toUpperCase()
    return letter ? `\n(${letter}) ` : ' '
  }
  if (/^\\item/.test(s)) return ' '
  return ' '
}

function wrapExistingAlignedEnvs(text) {
  return String(text ?? '').replace(
    /(?<!\$)\\begin\{(aligned|align\*?|eqnarray)\}([\s\S]*?)\\end\{\1\}/g,
    (_, name, body) => `$$\\begin{${name}}${body}\\end{${name}}$$`,
  )
}

/**
 * Drop a printed "Q.8" / "8." that the preview list already shows.
 * Never eats 2.5 g or a real sentence that starts with a number+decimal.
 * @param {unknown} text
 */
export function stripRepeatedQuestionNumberPrefix(text) {
  let s = String(text ?? '').replace(/^\uFEFF/, '')
  s = s.replace(/^\\item\s*\[[^\]]*\]\s*/i, '')
  const lead = /^(?:Q(?:uestion)?\s*\.?\s*)?(\d{1,2})(?!\d)(?:[\.\):]|\s+)/i
  const restOk =
    /^(?:Q(?:uestion)?\s*\.?\s*\d|Let|If|Match|The|A |An |For |Given |Consider |Suppose |In |Which |Find |Four |Two |\$|\\)/i
  for (let n = 0; n < 4; n += 1) {
    const m = s.match(lead)
    if (!m) break
    const rest = s.slice(m[0].length).replace(/^\s+/, '')
    if (!restOk.test(rest)) break
    s = rest
  }
  return s.trim()
}

/**
 * Mathpix often strips \\begin{aligned} and leaves `& … \\\\ & …`.
 * Put that body back in a display aligned block so `&` / `\\\\` never show as code.
 * Never invents missing denominators or list rows.
 * @param {unknown} text
 */
export function repairOrphanAlignedBody(text) {
  let s = unescapeAccidentalDoubleBackslash(text)
  if (!s) return s

  const opens = (s.match(/\\begin\{aligned\}/g) || []).length
  const closes = (s.match(/\\end\{aligned\}/g) || []).length
  if (opens > closes) s += '\\end{aligned}'
  if (closes > opens && !/\\begin\{aligned\}/.test(s)) {
    s = s.replace(/\\end\{aligned\}/g, '')
  }

  if (/\\begin\{(?:aligned|align\*?|eqnarray)\}/.test(s)) {
    return wrapExistingAlignedEnvs(s)
  }

  // Live OCR: $$ 3 x+2 y=$$ \log … \\ & 2 x-y=
  // Bound the leftover span. An unbounded [\s\S]*? here retries on every
  // & / \\ pair and can freeze one card (Approve stuck at ~8%).
  if (/\$\$\s*[^$]{1,80}?=\s*\$\$/.test(s) && /\\\\/.test(s) && s.includes('&')) {
    s = s.replace(
      /\$\$\s*([^$]{1,80}?=)\s*\$\$\s*([\s\S]{0,800}?\\\\\s*&\s*[\s\S]{0,800}?)(?=,?\s*then\b|\s*\.\s|$)/i,
      (_, lhs, rest) => {
        if (/\\begin\{/.test(rest)) return `$$${lhs}$$ ${rest}`
        const inner = `& ${String(lhs).trim()} ${String(rest).trim()}`
        return `$$\\begin{aligned}${inner}\\end{aligned}$$`
      },
    )
    if (/\\begin\{aligned\}/.test(s)) return wrapExistingAlignedEnvs(s)
  }

  if (!s.includes('&')) return s
  if (/\\begin\{(?:tabular|array|cases)\}/.test(s)) return s
  if (/\\hline/.test(s)) return s

  const wrapAlignedBody = (pre, body) => {
    if (/\\begin\{/.test(body)) return `${pre}${body}`
    if (!/=/.test(body) && !/\\(?:log|ln|frac|sqrt|text|quad)/.test(body)) return `${pre}${body}`
    const inner = String(body).trim()
    if (!inner.startsWith('&')) return `${pre}${body}`
    return `${pre}$$\\begin{aligned}${inner}\\end{aligned}$$`
  }

  if (/\\\\/.test(s)) {
    s = s.replace(
      /(^|[\s:])(&\s*[\s\S]{0,800}?\\\\\s*&\s*[\s\S]{0,800}?)(?=,?\s*then\b|\s*\.\s|$)/i,
      (full, pre, body) => wrapAlignedBody(pre, body) === `${pre}${body}` ? full : wrapAlignedBody(pre, body),
    )
    if (/\\begin\{aligned\}/.test(s)) return wrapExistingAlignedEnvs(s)
  }

  // Two aligned rows with no \\ between them: `& 3x+2y= … & 2x-y= … then`
  s = s.replace(
    /(^|[\s:])(&\s*[^&]+?=\s*[^&]+?\s*&\s*[^&]+?=[\s\S]{0,800}?)(?=,?\s*then\b|\s*\.\s|$)/i,
    (full, pre, body) => {
      if (/\\begin\{/.test(body)) return full
      if (!/\\(?:log|ln|frac|sqrt|text|quad)/.test(body)) return full
      const inner = String(body).trim()
      if (!inner.startsWith('&')) return full
      const withBreak = inner.includes('\\\\')
        ? inner
        : inner.replace(/(&\s*[^&]+?)(\s*&\s*)/, '$1 \\\\ $2')
      return `${pre}$$\\begin{aligned}${withBreak}\\end{aligned}$$`
    },
  )
  if (/\\begin\{aligned\}/.test(s)) return wrapExistingAlignedEnvs(s)

  // leftover `& … \\ & …` even when "then" is missing
  s = s.replace(
    /(&\s*[^\n&]{0,140}=\s*[\s\S]{0,280}?\\\\\s*&\s*[^\n&]{0,140}=[\s\S]{0,220}?)(?=\s*(?:,|\.|then\b|is equal|$))/i,
    (body) => {
      if (/\\begin\{/.test(body)) return body
      const inner = String(body).trim()
      if (!inner.startsWith('&')) return body
      return `$$\\begin{aligned}${inner}\\end{aligned}$$`
    },
  )
  if (/\\begin\{aligned\}/.test(s)) return wrapExistingAlignedEnvs(s)

  // leftover `& … \\ & …` without a clear equals (OCR-garbled aligned / eqnarray)
  return s.replace(
    /(&\s*[^\n]{2,160}?\\\\\s*&\s*[^\n]{2,160}?)(?=\s*(?:,|\.|then\b|is equal|$))/i,
    (body) => {
      if (/\\begin\{/.test(body)) return body
      if (!/\\(?:log|ln|frac|sqrt|text|quad|mathrm)/.test(body) && !/=/.test(body)) return body
      const inner = String(body).trim()
      if (!inner.startsWith('&')) return body
      return `$$\\begin{aligned}${inner}\\end{aligned}$$`
    },
  )
}

/**
 * OCR keeps \\end{array} after eating \\begin{array}{…} on a piecewise.
 * Restore a safe {ll} begin from leftover \{ / ={ rows, or drop a stray end
 * after a closed cases block. Never invents cell math.
 * @param {unknown} text
 */
export function repairOrphanPiecewiseArray(text) {
  let s = String(text ?? '')
  if (!/\\end\{array\}/i.test(s) && !/\\begin\{array\}/i.test(s)) return s

  // Mathpix smash: $$M=\left[$$\begin{array}...\end{array}$$$\right]$$ or \left\{…\right.
  // Only strip $ that sit between \left… and \begin{array}, not a real $$ wrap.
  // Determinant bars too: \left|$$\begin{array}…\end{array}$$\right|.
  s = s.replace(new RegExp(String.raw`(\\left\s*${LATEX_FENCE})\s*\$+\s*(?=\\begin\{array\})`, 'gi'), '$1')
  s = s.replace(new RegExp(String.raw`(\\end\{array\})\s*\${2,}(\s*\\right\s*${LATEX_FENCE})`, 'gi'), '$1$2')
  s = s.replace(new RegExp(String.raw`(\\end\{array\})\s*\$+(?=\s*\\right\s*${LATEX_FENCE})`, 'gi'), '$1')
  // Collapse excess $$ after a closed \right] / \right. / \right| matrix
  s = s.replace(/(\\right[\].|])\${3,}/gi, '$1$$')
  s = s.replace(/(\\right\.)\${3,}/gi, '$1$$')

  if (!/\\end\{array\}/i.test(s)) return s

  s = s.replace(/(\\end\{cases\})\s*\\end\{array\}/gi, '$1')

  const unmatchedEnd = () => {
    let depth = 0
    const re = /\\(begin|end)\{array\}/gi
    let m
    while ((m = re.exec(s)) !== null) {
      if (m[1].toLowerCase() === 'begin') depth += 1
      else if (depth > 0) depth -= 1
      else return m.index
    }
    return -1
  }

  for (let n = 0; n < 4; n += 1) {
    const endAt = unmatchedEnd()
    if (endAt < 0) break
    const before = s.slice(0, endAt)
    let insertAt = -1
    const eqBrace = [...before.matchAll(/=\s*\\\{\s*(?!\\begin\{)/g)].pop()
    const eqPlain = [...before.matchAll(/=\s*\{\s*(?!\\begin\{)/g)].pop()
    if (eqBrace && eqBrace.index != null) {
      insertAt = eqBrace.index + eqBrace[0].length
    } else if (eqPlain && eqPlain.index != null) {
      insertAt = eqPlain.index + eqPlain[0].length
    } else {
      const eqFn = [...before.matchAll(/f\s*\(\s*[xt]\s*\)\s*=\s*(?!\\begin\{)/gi)].pop()
      if (eqFn && eqFn.index != null) insertAt = eqFn.index + eqFn[0].length
    }
    const chunk = insertAt >= 0 ? s.slice(insertAt, endAt) : ''
    const looksPiecewise = /\\\\/.test(chunk) || (/&/.test(chunk) && /\bif\b|\\neq|\\ne\b/.test(chunk))
    if (insertAt < 0 || !looksPiecewise) {
      const brace = [...before.matchAll(/\\\{|(?<!\\)\{/g)].pop()
      if (brace && brace.index != null) {
        const chunk2 = s.slice(brace.index + brace[0].length, endAt)
        if (/\\\\/.test(chunk2) || (/&/.test(chunk2) && /\bif\b|\\neq|\\ne\b/.test(chunk2))) {
          insertAt = brace.index + brace[0].length
          s = `${s.slice(0, insertAt)}\\begin{array}{ll}${s.slice(insertAt)}`
          continue
        }
      }
      s = `${s.slice(0, endAt)}${s.slice(endAt + '\\end{array}'.length)}`
      continue
    }
    s = `${s.slice(0, insertAt)}\\begin{array}{ll}${s.slice(insertAt)}`
  }
  return s
}

/**
 * After piecewise repair, wrap a complete array in $$ and drop a leftover
 * \\end{array} that still sits in prose (Q4 / Q13 Rejected cards).
 * @param {unknown} text
 */
export function wrapOrDropLeftoverArray(text) {
  let s = String(text ?? '')
  if (!/\\end\{array\}/i.test(s) && !/\\begin\{array\}/i.test(s)) return s
  s = s.replace(/(?<!\$)\$\s*(\\begin\{array\})/gi, '$1')
  if (/\\end\{array\}/i.test(s) && !/\\begin\{array\}/i.test(s)) {
    s = s.replace(
      /(=\s*\\?\{[\s\S]{8,700}?)\\end\{array\}/i,
      (_, body) => `$$\\begin{array}{ll}${String(body).trim()}\\end{array}$$`,
    )
    s = s.replace(
      /(^|[\n.]\s*)(\{[\s\S]{8,700}?)\\end\{array\}/i,
      (_, pre, body) => `${pre}$$\\begin{array}{ll}${String(body).trim()}\\end{array}$$`,
    )
  }
  s = repairOrphanPiecewiseArray(s)
  const insideInlineDollar = (offset) => {
    let i = 0
    let inInline = false
    while (i < offset) {
      if (s.startsWith('$$', i)) {
        i += 2
        continue
      }
      if (s[i] === '$') {
        inInline = !inInline
        i += 1
        continue
      }
      i += 1
    }
    return inInline
  }
  const insideDisplayDollar = (offset) =>
    ((s.slice(0, offset).replace(/\\\$/g, '').match(/\$\$/g) || []).length % 2) === 1
  // A bare \left<fence> array \right<fence> outside math is one display formula;
  // wrapping only the array leaves \left|$$ … $$\right| smashes.
  s = s.replace(BARE_FENCED_ARRAY, (span, offset) =>
    insideInlineDollar(offset) || insideDisplayDollar(offset) ? span : `$$${span}$$`,
  )
  s = s.replace(/(\\begin\{array\}[\s\S]*?\\end\{array\})/gi, (block, _, offset) => {
    const before = s.slice(0, offset)
    const after = s.slice(offset + block.length)
    // Already a balanced $$…$$ display block.
    if (/\$\$$/.test(before)) return block
    // A determinant or matrix inside an open $$ … $$ formula (f(θ)=½|array|+|array|).
    if (insideDisplayDollar(offset) && /\$\$/.test(after)) return block
    // Inside \left( / \left\{ … \right. inline math (Q10 set notation).
    if (LEFT_FENCE_AT_END.test(before) && (insideInlineDollar(offset) || insideDisplayDollar(offset))) return block
    if (insideInlineDollar(offset)) {
      const nextDollar = after.search(/\$/)
      // Clean $…\begin{array}…\end{array}…$ — leave alone.
      if (
        nextDollar > 0 &&
        !/^\$/.test(after) &&
        !/\\end\{array\}/i.test(after.slice(0, nextDollar))
      ) {
        return block
      }
      // array}$ smash or rogue $ inside piecewise — display-wrap and drop $.
      return `$$${block.replace(/\$+/g, '')}$$`
    }
    return `$$${block}$$`
  })
  if (!/\\end\{array\}/i.test(s.replace(/\$\$[\s\S]*?\$\$/g, ' ').replace(/\$[^$]*\$/g, ' '))) {
    return s
  }
  let out = ''
  let i = 0
  while (i < s.length) {
    if (s.startsWith('$$', i)) {
      const end = s.indexOf('$$', i + 2)
      if (end < 0) {
        out += s.slice(i)
        break
      }
      out += s.slice(i, end + 2)
      i = end + 2
      continue
    }
    if (s[i] === '$') {
      const end = s.indexOf('$', i + 1)
      if (end < 0) {
        out += s.slice(i)
        break
      }
      out += s.slice(i, end + 1)
      i = end + 1
      continue
    }
    if (/^\\end\{array\}/i.test(s.slice(i))) {
      const begins = (out.match(/\\begin\{array\}/gi) || []).length
      const ends = (out.match(/\\end\{array\}/gi) || []).length
      if (begins > ends) out += '\\end{array}'
      i += '\\end{array}'.length
      continue
    }
    out += s[i]
    i += 1
  }
  return out
}

/**
 * Rebuild a two-line f(t)={ … if t= …; … if 2n-1<t<2n+1 } as cases.
 * Uses only the printed rows — never invents an integral bound.
 * @param {unknown} text
 */
export function repairSmashedPiecewiseCases(text) {
  const s = String(text ?? '')
  if (/\\begin\{cases\}/.test(s)) {
    return s.replace(/(\\end\{cases\})\s*\\end\{array\}/gi, '$1')
  }
  if (!/f\s*\(\s*t\s*\)\s*=/.test(s) || !/\bif\s*t\s*=/.test(s) || !/\bif\s*2n\s*-?\s*1\s*<\s*t\s*</i.test(s)) {
    return s
  }
  return s.replace(
    /(f\s*\(\s*t\s*\)\s*=\s*)\\?\{?\s*([\s\S]{6,280}?)\s+if\s*(t\s*=\s*[^.\n]{4,80})\s+([\s\S]{6,280}?)\s+if\s*(2n\s*-?\s*1\s*<\s*t\s*<\s*2n\s*\+?\s*1[^.\n]{0,60})\s*(?:\\end\{array\})?/i,
    (_, eq, row1, cond1, row2, cond2) => {
      const r1 = String(row1)
        .trim()
        .replace(/\\begin\{array\}\{[^}]*\}/g, '')
        .replace(/,\s*$/, '')
      const r2 = String(row2).trim().replace(/,\s*$/, '')
      return `${eq}\\begin{cases}${r1}, & \\text{if } ${String(cond1).trim()} \\\\ ${r2}, & \\text{if } ${String(cond2).trim()}\\end{cases}`
    },
  )
}

/**
 * After the main wrap pass, leftover `\int` / `\alpha` / `\lim` / `\frac` in
 * prose (OCR smashed next to words) still become math. Never invents a bound.
 * @param {string} text
 */
export function wrapOrphanBareMathCommands(text) {
  const s = String(text ?? '')
  if (!s.includes('\\')) return s
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
    if (s[i] === '\\' && /^(?:int|alpha|beta|lim|frac|in|infty|rightarrow|mathbb|to)(?![a-zA-Z])/.test(s.slice(i + 1))) {
      const scanned = mathRunEnd(s, i)
      const end = Math.max(scanned.end, i + 2)
      const chunk = s.slice(i, end)
      out += scanned.wrap || /\\(?:int|alpha|beta|lim|frac)\b/.test(chunk) ? `$${chunk}$` : chunk
      i = end
      continue
    }
    out += s[i]
    i += 1
  }
  return out
}

/**
 * Mathpix smash of T1^{2}/T2^{2} → T_\frac{1}{T_2}^2. Uses only letters already
 * in the run — never invents a new symbol.
 */
export function repairSmashedPeriodSquareRatio(text) {
  return String(text ?? '').replace(
    /\(?\s*([A-Za-z])_\s*\\frac\s*\{\s*1\s*\}\s*\{\s*\1_\{?2\}?\s*\}\s*\^\s*\{?2\}?\s*\)?/g,
    '$\\frac{$1_1^{2}}{$1_2^{2}}$',
  )
}

/**
 * van't Hoff OCR: w1g / w2g → w_1 / w_2 when boiling-point wording is present.
 * Prefer Mathpix \\mathrm{w}_n if the same dump already has it.
 */
export function repairSmashedWeightSubscripts(text, source = '') {
  const s = String(text ?? '')
  if (!/\bw[12]g\b/i.test(s)) return s
  if (!/boiling|van'?t\s*Hoff|elevation|molality|\\mathrm\{w\}/i.test(`${s}\n${source}`)) return s
  const src = String(source ?? '')
  const fromOcr = (n) => {
    const m = src.match(new RegExp(`\\\\mathrm\\{w\\}_\\{?${n}\\}?|\\bw_\\{${n}\\}`, 'i'))
    return m ? m[0] : ''
  }
  return s.replace(/\b([wW])([12])g\b/g, (_, w, n) => {
    const ocr = fromOcr(n)
    return ocr ? `$${ocr}$` : `$${w}_{${n}}$`
  })
}

const SPLIT_ENV = 'pmatrix|bmatrix|vmatrix|matrix|array|cases|aligned'

/**
 * Mathpix / later wraps sometimes drop $$ inside an open formula:
 * $\left($$\begin{pmatrix}...$$ and $$g(x)= $$\begin{cases}...$$\right.
 * Pull the environment back into the formula. Never invents entries.
 * Also collapses $$$ (a stray $ glued to a display closer).
 * @param {unknown} text
 */
export function rejoinSplitMathEnvironments(text) {
  let s = splitGluedChemDisplayEquations(String(text ?? ''))
  s = s.replace(/\${3,}/g, () => '$$')
  const leftEnv = new RegExp(
    String.raw`(\\left\s*${LATEX_FENCE})\s*\$\$(\\begin\{(?:${SPLIT_ENV})\}[\s\S]{0,700}?\\end\{(?:${SPLIT_ENV})\})\s*\$\$`,
    'gi',
  )
  for (let n = 0; n < 6; n += 1) {
    const next = s.replace(leftEnv, (_, left, block) => `${left}${block}`)
    if (next === s) break
    s = next
  }
  s = s.replace(
    /(\\end\{array\}[\s\S]{0,500}?)\$\$\s*(\\begin\{cases\}[\s\S]{0,800}?\\end\{cases\})\s*\$\$(?=\s*\\right)/gi,
    '$1$2',
  )
  // Unclosed inline opener sitting against a final bracket: $\mathrm{Ca}=40 ]
  // A closer already written as $ ] does not match (a $ stops the run).
  if (/\]\s*$/.test(s) && ((s.match(/(?<!\\)\$/g) || []).length % 2 === 1)) {
    s = s.replace(/(\$[^$\n]{1,180})\s*\]\s*$/, (_, inner) => `${inner}$ ]`)
  }
  s = guardDollarsAroundFigures(s)
  return stripDollarsInsideLatexEnvs(s)
}

/** @param {string} text */
function drawnHtmlEnd(text, at) {
  const opener = text.startsWith('<table', at) ? 'table' : 'div'
  let depth = 0
  let j = at
  while (j < text.length) {
    if (text.startsWith(`<${opener}`, j)) {
      depth += 1
      j += opener.length + 1
      continue
    }
    if (text.startsWith(`</${opener}>`, j)) {
      depth -= 1
      j += opener.length + 3
      if (depth === 0) return j
      continue
    }
    j += 1
  }
  return -1
}

export function wrapBareLatexRuns(text) {
  const raw = String(text ?? '')
  if (raw.includes('sheet-config-pair') || raw.includes('class="paper-data-table"')) {
    let out = ''
    let i = 0
    while (i < raw.length) {
      const sheet = raw.indexOf('<div class="sheet-config-pair"', i)
      const table = raw.indexOf('<table class="paper-data-table"', i)
      const at = sheet < 0 ? table : table < 0 ? sheet : Math.min(sheet, table)
      if (at < 0) {
        out += wrapBareLatexRuns(raw.slice(i))
        break
      }
      if (at > i) out += wrapBareLatexRuns(raw.slice(i, at))
      const end = drawnHtmlEnd(raw, at)
      if (end < 0) {
        out += raw.slice(at)
        break
      }
      out += raw.slice(at, end)
      i = end
    }
    return out
  }
  let t = unescapeAccidentalDoubleBackslash(
    normalizeSmashedChemDollars(normalizeBrokenMathpixGraphics(text)),
  )
  // SMILES backslashes (\O, \C) are bonds, not LaTeX. A dollar inside the tag
  // is a previous wrap of that bond and stops the structure from drawing.
  t = t.replace(/<smiles>([\s\S]*?)<\/smiles>/gi, (_, inner) => `<smiles>${String(inner).replace(/\$/g, '')}</smiles>`)
  t = repairSmashedPeriodSquareRatio(t)
  t = repairSmashedWeightSubscripts(t)
  t = repairSmashedPiecewiseCases(t)
  t = wrapOrDropLeftoverArray(t)
  t = t.replace(/\\int_\{\?\}(?!\s*\^)\{([^}]+)\}/g, '\\int_{?}^{$1}')
  t = t.replace(/\bDefine([fgh])\(/gi, 'Define $1(')
  t = repairFlattenedSetMatrixOcr(t)
  t = repairBrokenLeftRightSetOcr(t)
  t = repairSmashedXyzColumnOcr(t)
  t = t.replace(/\bby([fgh])\(/gi, 'by $1(')
  t = repairOrphanAlignedBody(t)
  if (t.length > 24_000) return t
  // Need a LaTeX command or a sub/superscript base to have anything to wrap.
  if (!t.includes('\\') && !/[A-Za-z0-9)\]}|][\^_]/.test(t)) return t

  let out = ''
  let i = 0
  while (i < t.length) {
    if (t.startsWith('<div class="sheet-config-pair"', i) || t.startsWith('<table class="paper-data-table"', i)) {
      const opener = t.startsWith('<table', i) ? 'table' : 'div'
      let depth = 0
      let j = i
      while (j < t.length) {
        if (t.startsWith(`<${opener}`, j)) {
          depth += 1
          j += opener.length + 1
          continue
        }
        if (t.startsWith(`</${opener}>`, j)) {
          depth -= 1
          j += opener.length + 3
          if (depth === 0) break
          continue
        }
        j += 1
      }
      if (depth === 0 && j > i) {
        out += t.slice(i, j)
        i = j
        continue
      }
    }
    if (/^<smiles>/i.test(t.slice(i, i + 8))) {
      const end = t.toLowerCase().indexOf('</smiles>', i)
      if (end !== -1) {
        out += t.slice(i, end + '</smiles>'.length)
        i = end + '</smiles>'.length
        continue
      }
    }
    if (t.startsWith('http://', i) || t.startsWith('https://', i)) {
      const end = t.slice(i).search(/[\s)>\]'"]/)
      const stop = end === -1 ? t.length : i + end
      out += t.slice(i, stop)
      i = stop
      continue
    }
    if (/^\\section/.test(t.slice(i))) {
      const cmdEnd = readCommand(t, i)
      let j = cmdEnd
      if (t[j] === '*') j += 1
      if (t[j] === '{') {
        const end = readGroup(t, j, '{', '}')
        if (end > 0) {
          out += `\n${t.slice(j + 1, end - 1)}\n`
          i = end
          continue
        }
      }
      i = j
      continue
    }
    if (t.startsWith('\\includegraphics', i)) {
      const g = consumeIncludeGraphics(t, i)
      if (g?.url) {
        out += `\\includegraphics{${g.url}}`
        i = g.end
        continue
      }
      const brace = t.indexOf('}', i)
      if (brace > i) {
        out += t.slice(i, brace + 1)
        i = brace + 1
        continue
      }
    }
    if (/^\\(?:captionsetup|caption|item|hline)\b/.test(t.slice(i))) {
      const cmdEnd = readCommand(t, i)
      let j = cmdEnd
      if (t[j] === '[') {
        const end = readGroup(t, j, '[', ']')
        if (end > 0) j = end
      }
      if (t[j] === '{') {
        const end = readGroup(t, j, '{', '}')
        if (end > 0) j = end
      }
      out += chromeCommandToProse(t.slice(i, j))
      i = j
      continue
    }
    if (/^\\begin\{(?:aligned|align\*?|array|cases)\}/.test(t.slice(i))) {
      const name = t.slice(i).match(/^\\begin\{([^}]+)\}/)?.[1]
      const endTok = name ? `\\end{${name}` : ''
      let endEnv = endTok ? t.toLowerCase().indexOf(endTok.toLowerCase(), i) : -1
      if (endEnv < 0 && name) {
        const alt = t.toLowerCase().indexOf(`end{${name.toLowerCase()}`, i)
        if (alt > i) endEnv = alt
      }
      if (endEnv > i) {
        const after = t.indexOf('}', endEnv)
        let block = t.slice(i, after > 0 ? after + 1 : endEnv)
        const pulled = out.match(/\\\{\s*$/)
        if (pulled) {
          out = out.slice(0, -pulled[0].length)
          block = `${pulled[0]}${block}`
        }
        const already = out.endsWith('$$') || t.slice(Math.max(0, i - 2), i) === '$$'
        out += already || /\$\$/.test(block) ? block : `$$${block}$$`
        i = after > 0 ? after + 1 : endEnv
        continue
      }
    }
    if (t.startsWith('\\begin{figure', i)) {
      const endFig = t.toLowerCase().indexOf('\\end{figure', i)
      if (endFig > i) {
        const after = t.indexOf('}', endFig)
        out += t.slice(i, after > 0 ? after + 1 : endFig)
        i = after > 0 ? after + 1 : endFig
        continue
      }
    }
    if (t.startsWith('![', i)) {
      const close = t.indexOf(')', i)
      if (close > i && /cdn\.mathpix\.com/i.test(t.slice(i, close))) {
        out += t.slice(i, close + 1)
        i = close + 1
        continue
      }
    }
    // A whole table is already drawn later. Do not walk into it and leave a
    // closing $ after \end{tabular}, which unbalances the next sentence.
    if (t.startsWith('\\begin{tabular}', i)) {
      const endEnv = t.indexOf('\\end{tabular}', i + 1)
      if (endEnv > i) {
        const after = endEnv + '\\end{tabular}'.length
        out += t.slice(i, after)
        i = after
        continue
      }
    }

    // A data table is drawn later. Do not walk into it and drop a $ after \end{tabular},
    // or the next sentence's math is marked as raw code.
    if (t.startsWith('\\begin{tabular}', i)) {
      const endEnv = t.indexOf('\\end{tabular}', i)
      if (endEnv > i) {
        const after = endEnv + '\\end{tabular}'.length
        out += t.slice(i, after)
        i = after
        continue
      }
    }
    // Skip existing $$…$$ / $…$ blocks verbatim.
    if (t.startsWith('$$', i)) {
      const end = t.indexOf('$$', i + 2)
      if (end !== -1) {
        out += t.slice(i, end + 2)
        i = end + 2
        continue
      }
      const smashed = consumeSmashedDisplayOpen(t, i)
      if (smashed) {
        out += smashed.text
        i = smashed.end
        continue
      }
      // Unclosed $$ — keep the opener. Do not nibble it as an empty $...$ pair.
      out += '$$'
      i += 2
      continue
    }
    if (t[i] === '$') {
      const end = t.indexOf('$', i + 1)
      if (end !== -1) {
        out += t.slice(i, end + 1)
        i = end + 1
        continue
      }
    }

    // Anchor on a backslash command, or on a sub/superscript base such as
    // `p^{\text{th}}` / `a_1` whose base is a plain letter, digit or closer.
    const baseAnchored =
      /[A-Za-z0-9)\]}|]/.test(t[i]) && (t[i + 1] === '^' || t[i + 1] === '_')

    if (t.startsWith('\\{', i) && /^\\\{\s*\\begin\{(?:array|cases)\}/.test(t.slice(i))) {
      out += t.slice(i, i + 2)
      i += 2
      continue
    }

    if (t[i] === '\\' || baseAnchored) {
      const scanned = mathRunEnd(t, i)
      const end = clipIncompleteFracRun(t, i, scanned.end)
      const wrap = scanned.wrap
      if (end > i) {
        let chunk = t.slice(i, end)
        if (wrap && !/\\begin\{/.test(chunk)) {
          chunk = chunk.replace(/\\\\\s*$/, '')
        }
        out += wrap ? `$${chunk}$` : t.slice(i, end)
        i = end
        continue
      }
    }

    out += t[i]
    i += 1
  }
  return rejoinSplitMathEnvironments(
    wrapOrDropLeftoverArray(wrapOrphanBareMathCommands(normalizeSmashedChemDollars(out))),
  )
}

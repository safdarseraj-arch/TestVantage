/**
 * Heal truncated / glued LaTeX in official PYQ stems without inventing missing math.
 * Display + extract time only — never writes the pending queue.
 */

import { findFracExpression } from './latexBraceMatch.js'
import { convertLatexTabularToArray, stripDollarsInsideLatexEnvs } from './latexTabularDisplay.js'
import { guardDollarsAroundFigures } from './mathpixMedia.js'
import {
  looksLikeCutLetMatrixStem,
  looksLikeSmashedProseVmatrix,
} from './repairSmashedProseVmatrixOcr.js'

const TRIG_CMD =
  'arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|cot|sec|csc|ln|log|lim|det|exp'

const TRIG_AFTER_WORD = new RegExp(`([A-Za-z,.;:])(\\\\(?:${TRIG_CMD})\\b)`, 'g')

/**
 * Gemini / OCR often emit \text{frac}\{num\}\{ instead of \frac{num}{.
 * Normalize that class of damage before incomplete-frac detection.
 * Never invent a missing denominator.
 * @param {unknown} text
 */
export function normalizeFracLatex(text) {
  let s = String(text ?? '')
  if (!s) return s
  s = s.replace(/\\backslash\\text\s*\{\s*frac\s*\}/gi, '\\frac')
  s = s.replace(/\\text\s*\{\s*frac\s*\}/gi, '\\frac')
  s = s.replace(/\\backslash\\frac\b/gi, '\\frac')
  s = s.replace(/\\frac\s*\\\{([^\\\n]*)\\\}\\\{([^\\\n]*)\\\}/g, '\\frac{$1}{$2}')
  s = s.replace(/\\frac\s*\\\{([^\\\n]*)\\\}\\\{/g, '\\frac{$1}{')
  s = s.replace(/\\frac\s*\\\{/g, '\\frac{')
  return s
}

/**
 * Apply fn to prose outside $...$ / $$...$$.
 * @param {string} text
 * @param {(chunk: string) => string} fn
 */
function mapOutsideMath(text, fn) {
  const t = String(text ?? '')
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
    if (t[i] === '$') {
      const end = t.indexOf('$', i + 1)
      if (end !== -1) {
        out += t.slice(i, end + 1)
        i = end + 1
        continue
      }
    }
    let next = t.length
    const d = t.indexOf('$$', i)
    const s = t.indexOf('$', i)
    if (d !== -1) next = Math.min(next, d)
    if (s !== -1) next = Math.min(next, s)
    out += fn(t.slice(i, next))
    i = next === i ? i + 1 : next
  }
  return out
}

/** that\cot → that \cot (and sin/tan/…). */
export function spaceLatexCommandsAfterWords(text) {
  return mapOutsideMath(String(text ?? ''), (chunk) =>
    chunk.replace(TRIG_AFTER_WORD, '$1 $2'),
  )
}

/** Unclosed \frac{…}{ or \frac{…} with no denominator. Closed \frac{5}{4} is complete. */
export function hasIncompleteFrac(text) {
  const t = normalizeFracLatex(text)
  if (!t.includes('\\frac')) return false
  const re = /\\frac\s*\{/g
  let m
  while ((m = re.exec(t))) {
    const found = findFracExpression(t, m.index)
    if (!found || found.start !== m.index) return true
  }
  return false
}

/**
 * OCR reagent captions often write $$\mathrm{H}_{2}\mathrm{O}_{2}$
 * (double-open, single-close). Pair that as inline math — never invent.
 * @param {unknown} text
 */
/**
 * Three closed chemistry displays were glued into `$rxn$$rxn$$rxn$`.
 * Split them back. Do not invent reagents.
 */
function reactantChainStart(body, arrowAt) {
  let i = arrowAt
  while (i > 0 && /\s/.test(body[i - 1])) i -= 1
  const pullBraceGroup = () => {
    if (body[i - 1] !== '}') return false
    let depth = 0
    let j = i - 1
    for (; j >= 0; j -= 1) {
      if (body[j] === '}') depth += 1
      else if (body[j] === '{') {
        depth -= 1
        if (depth === 0) break
      }
    }
    if (j < 0) return false
    i = j
    return true
  }
  if (!pullBraceGroup()) return arrowAt
  while (i > 0 && (body[i - 1] === '}' || /\s/.test(body[i - 1]))) {
    if (/\s/.test(body[i - 1])) {
      i -= 1
      continue
    }
    if (!pullBraceGroup()) break
  }
  while (i > 0 && /[A-Za-z]/.test(body[i - 1])) i -= 1
  if (body[i - 1] !== '\\') return arrowAt
  i -= 1
  while (i > 0 && /\s/.test(body[i - 1])) i -= 1
  if (body[i - 1] === '+') {
    i -= 1
    return reactantChainStart(body, i)
  }
  return i
}

/** End of `\xrightarrow[below]{above}` including its optional and brace arguments. */
function arrowArgsEnd(body, arrow) {
  let i = arrow.index + arrow[0].length
  for (;;) {
    let j = i
    while (/\s/.test(body[j] ?? '')) j += 1
    const open = body[j]
    if (open !== '{' && open !== '[') return i
    const close = open === '{' ? '}' : ']'
    let depth = 0
    for (; j < body.length; j += 1) {
      if (body[j] === open) depth += 1
      else if (body[j] === close && (depth -= 1) === 0) break
    }
    if (j >= body.length) return i
    i = j + 1
  }
}

function splitMultiArrowChem(body) {
  const arrows = [...String(body ?? '').matchAll(/\\(?:longrightarrow|xrightarrow)/g)]
  if (arrows.length < 2) return null
  const cuts = [0]
  for (let n = 1; n < arrows.length; n += 1) {
    const at = reactantChainStart(body, arrows[n].index)
    if (at <= cuts[cuts.length - 1] || at >= arrows[n].index) return null
    // A decay chain "U → ^{234}_{90}Th → …": only the next nucleus' mass/atomic numbers
    // sit between the arrow and the cut, so the product is the next step's start.
    const gap = body
      .slice(arrowArgsEnd(body, arrows[n - 1]), at)
      .replace(/\{\s*\}|[_^]\s*(?:\{[^{}]*\}|\w)/g, '')
      .trim()
    if (!gap) return null
    cuts.push(at)
  }
  const parts = cuts.map((c, i) => body.slice(c, cuts[i + 1] ?? body.length).trim())
  if (parts.some((p) => !/\\(?:longrightarrow|xrightarrow)/.test(p))) return null
  return parts
}

function threeChemDisplays(full, a, b, c) {
  const parts = [a, b, c]
  if (!parts.every((p) => /\\(?:longrightarrow|rightarrow|xrightarrow|mathrm|underset|mathbf)/.test(p))) {
    return full
  }
  return parts.map((p) => `$$${p.trim()}$$`).join('\n')
}

export function splitGluedChemDisplayEquations(text) {
  let s = String(text ?? '')
  // A closer glued to the next opener ($$$$) is two reactions. Tables stay one block.
  s = s.replace(
    /\$\$([^$]*\\(?:longrightarrow|xrightarrow)[^$]*)\$\$\$\$([^$]*\\(?:longrightarrow|xrightarrow)[^$]*)\$\$/g,
    (_, a, b) => `$$${a.trim()}$$\n$$${b.trim()}$$`,
  )
  // $$reaction2$$reaction3$  — the second opener was dropped and one closer remains.
  s = s.replace(
    /\$\$([^$]*\\(?:longrightarrow|xrightarrow)[^$]*)\$\$([^$]*\\(?:longrightarrow|xrightarrow)[^$]*)\$(?!\$)/g,
    (_, a, b) => `$$${a.trim()}$$\n$$${b.trim()}$$`,
  )
  s = s.replace(/\(1:\s*5\s*ratio\s+\)/gi, '(1: 5 ratio)')
  s = s.replace(/(?<!\$)\$([^$]*)\$\$([^$]*)\$(?!\$)/g, (full, a, b) => {
    const parts = [...(splitMultiArrowChem(a) || [a]), ...(splitMultiArrowChem(b) || [b])]
      .map((p) => String(p).trim())
      .filter(Boolean)
    if (parts.length < 2 || !parts.every((p) => /\\(?:longrightarrow|xrightarrow)/.test(p))) return full
    return parts.map((p) => `$$${p}$$`).join('\n')
  })
  s = s.replace(
    /(?<!\$)\$([^$]+?)\$\$([^$]+?)\$\$([^$]+?)\$(?!\$)/g,
    threeChemDisplays,
  )
  s = s.replace(
    /(?<!\$)\$([^$]*\\(?:longrightarrow|xrightarrow)[^$]*)\$\s*\$\$([^$]*\\(?:longrightarrow|xrightarrow)[^$]*)\$\s*\$\$([^$]*\\(?:longrightarrow|xrightarrow)[^$]*)\$\$/g,
    threeChemDisplays,
  )
  s = s.replace(
    /\$\$([^$]*\\(?:longrightarrow|xrightarrow)[^$]*)\$\s*\$\$([^$]*\\(?:longrightarrow|xrightarrow)[^$]*)\$\s*\$\$([^$]*\\(?:longrightarrow|xrightarrow)[^$]*)\$\$/g,
    threeChemDisplays,
  )
  s = s.replace(/\$\$([^$]+)\$\$/g, (full, body) => {
    const parts = splitMultiArrowChem(body)
    if (!parts || parts.length < 2) return full
    return parts.map((p) => `$$${p}$$`).join('\n')
  })
  s = s.replace(/(?<!\$)\$([^$]+)\$/g, (full, body) => {
    const parts = splitMultiArrowChem(body)
    if (!parts || parts.length < 2) return full
    return parts.map((p) => `$$${p}$$`).join('\n')
  })
  const reactionInline = /(?<!\$)\$([^$]*\\(?:longrightarrow|xrightarrow)[^$]*)\$/g
  const reactionArrows = (s.match(/\\(?:longrightarrow|xrightarrow)/g) || []).length
  if (reactionArrows >= 2) {
    s = s.replace(reactionInline, (_, body) => `$$${String(body).trim()}$$`)
  }
  return s
}

export function normalizeSmashedChemDollars(text) {
  let s = splitGluedChemDisplayEquations(text)
  if (!s.includes('$')) return s
  s = s.replace(/^\s*\$\s*$/gm, '')
  // $$\mathrm{H}_{2}O_{2}$ (double-open, single-close). Never eat a real $$…$$ block.
  s = s.replace(
    /\$\$(\s*\\(?:mathrm|ce|text)\b[^$]{0,160})\$(?!\$)/g,
    (_, inner) => `$${inner}$`,
  )
  // $\mathrm{Ca}=40$$ ]  — never nibble a real $$display$$ block
  s = s.replace(/(?<!\$)\$([^$\n]{2,160})\$\$(?=\s*[\];,]|\s*$)/g, '$$$1$')
  s = s.replace(
    /\$((?:\\mathrm\{[^}]+\}(?:_\{[^}]+\})?(?:\s*\^\{[^}]+\})?\s*)+)\s*(?=\n\s*(?:\(|\\includegraphics))/g,
    (_, inner) => `$${inner.trim()}$`,
  )
  s = s.replace(
    /(\(\s*[PQRS]\s*\)\s*)(?:\n\s*)_\{[0-9]+\}\s*\$+\s*,?\s*(?:[a-z]\)\s*)?(?:\$+\\(?:mathrm|ce)\b[\s\S]{0,80}?\$+\s*,?\s*)+\$*\}?/gi,
    '$1\n',
  )
  s = s.replace(/\$+\}(?=\s*\\includegraphics)/g, '')
  s = s.replace(/(\\mathrm\{[^}]+\}(?:_\{[^}]+\})?)\s*\$\$(?=\s|$)/g, (full, inner, offset, whole) => {
    const before = String(whole).slice(0, offset)
    let displays = 0
    for (let i = 0; i < before.length; i += 1) {
      if (before[i] === '\\') {
        i += 1
        continue
      }
      if (before.startsWith('$$', i)) {
        displays += 1
        i += 1
      }
    }
    if (displays % 2 === 1) return full
    return `${inner}$`
  })
  // Persist/wrapBare sometimes stores Given weights as $$\mathrm{H}=1$$ … ]$
  s = s.replace(/\$\$(\s*\\mathrm\{[^}]{1,32}\}\s*=\s*~?\d{1,3}\s*)\$\$/g, '$$$1$')
  // OCR splits a unit: $1.40 $\times 10^{-6} \mathrm{...}$$
  s = s.replace(/\$([^$\n]{1,80})\s\$(\\[^$]{1,240})\$\$/g, (_, a, b) => `$${a} ${b}$`)
  s = s.replace(/(?<!\\right)\]\s+\$+\s*$/g, ']')
  return ensureChemDisplayMathClosed(s)
}

/** Restore $$ closers on chemistry display lists — never invent reagents. */
export function ensureChemDisplayMathClosed(text) {
  let s = String(text ?? '')
  s = s.replace(
    /(\$\$\\left\[[^$]{20,800}?\\right\]\^\{[^}]+\})\$?(?=\s*\[Given)/,
    '$1$$',
  )
  s = s.replace(
    /(\$\$\\text\s*\{\s*en\s*\}[\s\S]{8,200}?\\right\])\$(?!\$)/,
    '$1$$',
  )
  s = s.replace(
    /(?<!\$)\$(\\text\s*\{\s*en\s*\}[\s\S]{8,200}?\\right\])\$(?!\$)/,
    '$$$$$1$$$$',
  )
  return s
}

/**
 * A chemistry scheme that already draws: every \\mathrm / \\xrightarrow sits
 * inside balanced $$ and nothing is left over as source. Not a cut-off fraction.
 * @param {unknown} text
 */
export function closedChemReactionDisplays(text) {
  const t = String(text ?? '')
  if (!/\\(?:xrightarrow|stackrel)\b/.test(t)) return false
  if (hasUnclosedDisplayMath(t)) return false
  const dollars = (t.match(/(?<!\\)\$/g) || []).length
  if (!dollars || dollars % 2 === 1) return false
  const visible = t
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
  return !/\\(?:mathrm|mathbf|xrightarrow|stackrel|underset|frac|begin|end)\b/.test(visible)
}

/** Opening $$ without a close — even $ count still swallows the rest of the stem. */
export function hasUnclosedDisplayMath(text) {
  const t = String(text ?? '')
  let i = 0
  let inDisplay = false
  let inInline = false
  while (i < t.length) {
    if (t[i] === '\\') {
      i += 2
      continue
    }
    if (t.startsWith('$$', i)) {
      if (inInline) inInline = false
      inDisplay = !inDisplay
      i += 2
      continue
    }
    if (t[i] === '$') {
      if (!inDisplay) inInline = !inInline
      i += 1
      continue
    }
    i += 1
  }
  return inDisplay || inInline
}

/** Unbalanced \\begin{env} vs \\end{env} for display math. */
function hasUnbalancedMathEnv(text) {
  const t = String(text ?? '')
  for (const env of ['vmatrix', 'bmatrix', 'pmatrix', 'aligned', 'cases']) {
    const open = (t.match(new RegExp(`\\\\begin\\{${env}\\}`, 'g')) || []).length
    const close = (t.match(new RegExp(`\\\\end\\{${env}\\}`, 'g')) || []).length
    if (open > close) return true
  }
  return false
}

/**
 * OCR opened math and the body was cut: “… the value is $$”. The dollar count
 * stays even, so the parity check below cannot see it.
 * @param {unknown} text
 */
export function endsWithDanglingMathOpen(text) {
  const t = String(text ?? '')
  if (!/\$\s*$/.test(t)) return false
  /** @type {{ token: string, at: number } | null} */
  let open = null
  let i = 0
  while (i < t.length) {
    if (t[i] === '\\') {
      i += 2
      continue
    }
    if (t[i] === '$') {
      const token = t[i + 1] === '$' ? '$$' : '$'
      open = open ? null : { token, at: i }
      i += token.length
      continue
    }
    i += 1
  }
  return Boolean(open) && !t.slice(open.at + open.token.length).trim()
}

/** Cut-off formula / unclosed fraction / smashed OCR — do not approve. Never silently shorten. */
export function finishedMathReviewView(text) {
  let s = String(text ?? '')
  // $$h(x)=$\left is a stray dollar in front of a finished command, not a cut-off.
  s = s.replace(/(\$\$[A-Za-z]+\([^)]*\)=)\$(\\left)/g, '$1$2')
  // $$\ldots\right),$ x$ closes the display. The formula itself is complete.
  s = s.replace(/(\\right(?:\]|\)|\.))\s*,\s*\$(?!\$)/g, (_, close) => `${close},$$ $`)
  s = s.replace(/\$\$([A-Za-z](?:_\{[^{}]+\})?)\$,/g, (_, body) => `$${body}$,`)
  s = s.replace(/\$\$([a-z]\(x\)=)\$\$(\\sum)/g, (_, eq, sum) => `$$${eq}${sum}`)
  // $$\xrightarrow{...}$ $$(2) is a finished arrow, then the next list row.
  s = s.replace(
    /\$\$(\\xrightarrow\{(?:[^{}]|\{[^{}]*\})*\})\$\s*\$\$(?=\s*\([1-5]\))/g,
    (_, body) => `$${body}$ `,
  )
  // $...$\n$$(2) is a closed inline formula, then the next list row.
  s = s.replace(/\$[ \t]*\n?[ \t]*\$\$(?=\s*\([1-5]\))/g, '$ ')
  return s
}

export function latexExtractionIncomplete(text) {
  if (closedChemReactionDisplays(text)) return false
  const t = stripDollarsInsideLatexEnvs(
    convertLatexTabularToArray(normalizeSmashedChemDollars(normalizeFracLatex(text))),
  )
  if (!t.trim()) return false
  if (closedChemReactionDisplays(t)) return false
  if (hasIncompleteFrac(t)) return true
  if (/\\frac\s*\{[^}]*$/.test(t)) return true
  if (/\\frac\s*\{[^}]*\}\s*\{\s*$/.test(t)) return true
  if (/\bThen\s*$/i.test(t.trim())) return true
  if (/\/\s*(?:…|\.{2,})\s*$/.test(t.trim())) return true
  const view = finishedMathReviewView(t)
  const dollars = (guardDollarsAroundFigures(view).match(/(?<!\\)\$/g) || []).length
  if (dollars % 2 === 1) return true
  if (endsWithDanglingMathOpen(view)) return true
  if (hasUnclosedDisplayMath(view) && !/\$\$[\s\S]*\\(?:left|begin)[\s\S]*\)\s*\$/.test(view)) return true
  if (hasUnbalancedMathEnv(view)) return true
  if (looksLikeSmashedProseVmatrix(view)) return true
  if (looksLikeCutLetMatrixStem(view)) return true
  const alignedOpen = (view.match(/\\begin\{aligned\}/g) || []).length
  const alignedClose = (view.match(/\\end\{aligned\}/g) || []).length
  if (alignedOpen > alignedClose) return true
  return false
}

/** Spacing only — never rewrite an unclosed \frac as “num / …”. */
export function healTruncatedLatexForDisplay(text) {
  return spaceLatexCommandsAfterWords(text)
}

function readBraceGroup(s, i) {
  if (s[i] !== '{') return null
  let depth = 0
  for (let j = i; j < s.length; j += 1) {
    if (s[j] === '\\') {
      j += 1
      continue
    }
    if (s[j] === '{') depth += 1
    else if (s[j] === '}') {
      depth -= 1
      if (depth === 0) return { inner: s.slice(i + 1, j), end: j + 1 }
    }
  }
  return null
}

function emptyStackrelLabel(base) {
  const m = String(base ?? '').trim().match(/^\\stackrel\{([\s\S]*)\}\{\s*\}$/)
  return m ? m[1].trim() : null
}

/**
 * Mathpix nests a reaction scheme inside \\underset / \\stackrel.
 * Pull each arrow onto its own line. Do not rename a species.
 * @param {string} piece
 * @param {string[]} notes
 */
function unwrapChemUndersets(piece, notes) {
  const s = String(piece ?? '')
  let out = ''
  let i = 0
  while (i < s.length) {
    if (s.startsWith('\\underset', i)) {
      let j = i + '\\underset'.length
      while (s[j] === ' ') j += 1
      const under = readBraceGroup(s, j)
      if (!under) {
        out += s[i]
        i += 1
        continue
      }
      let k = under.end
      while (s[k] === ' ') k += 1
      const base = readBraceGroup(s, k)
      if (!base) {
        out += s[i]
        i += 1
        continue
      }
      const underL = unwrapChemUndersets(under.inner, notes).trim()
      const baseL = unwrapChemUndersets(base.inner, notes).trim()
      const cond = emptyStackrelLabel(baseL)
      if (/ratio/i.test(underL) && !/\\(?:stackrel|xrightarrow|mathrm|mathbf)\b/.test(underL)) {
        notes.push(underL.replace(/\\text\s*\{([^{}]*)\}/g, '$1').replace(/\s+/g, ' ').trim())
        out += baseL
      } else if (cond != null) {
        out += `${underL} \\xrightarrow{${cond}}`
      } else if (baseL === '-' || baseL === '') {
        out += underL
      } else {
        const plus = baseL.match(/^\+\s*([\s\S]+)$/)
        if (plus) out += `${underL} + ${plus[1].trim()}`
        else out += `\\underset{${underL}}{${baseL}}`
      }
      i = base.end
      continue
    }
    out += s[i]
    i += 1
  }
  return out
}

/**
 * A chemistry aligned-block is one reaction per line.
 * An equation aligned-block (with =) is left as written.
 * @param {unknown} text
 */
export function linearizeChemReactionAligned(text) {
  return String(text ?? '').replace(
    /\$\$\s*\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}\s*\$\$/g,
    (full, body) => {
      if (!/\\(?:xrightarrow|stackrel|underset)\b/.test(body)) return full
      if (!/\\(?:mathrm|mathbf)\b/.test(body)) return full
      if (/=/.test(body.replace(/\\text\s*\{[^{}]*\}/g, ''))) return full
      const rows = String(body)
        .split(/\\\\/)
        .map((row) => row.replace(/&/g, ' ').trim())
        .filter(Boolean)
      if (rows.length < 2) return full
      const blocks = []
      for (const row of rows) {
        const notes = []
        let line = unwrapChemUndersets(row, notes).replace(/[ \t]+/g, ' ').trim()
        line = line.replace(/\\stackrel\{([^{}]+)\}\{\s*\}/g, '\\xrightarrow{$1}')
        if (!line || /\\underset\b/.test(line)) return full
        blocks.push(`$$${line}$$`)
        for (const note of notes) {
          const plain = note
            .replace(/\\text\s*\{([^{}]*)\}/g, '$1')
            .replace(/\\[a-zA-Z]+\s*/g, '')
            .replace(/[{}]/g, '')
            .replace(/\s+/g, ' ')
            .replace(/\(\s+/g, '(')
            .replace(/\s+\)/g, ')')
            .trim()
          if (plain) blocks.push(plain)
        }
      }
      return blocks.join('\n')
    },
  )
}

/** If a math-run would swallow a one-argument \frac, clip to just before it. */
export function clipIncompleteFracRun(text, start, end) {
  const slice = String(text ?? '').slice(start, end)
  const frac = slice.lastIndexOf('\\frac')
  if (frac < 0) return end
  const found = findFracExpression(slice, frac)
  if (found && found.start === frac) return end
  return start + frac
}

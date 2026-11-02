import { findFracExpression } from './latexBraceMatch.js'

/** Common English in stems — not math variables */
const ENGLISH_IN_MATH =
  /\b(?:the|and|of|between|with|from|to|at|is|are|was|were|if|then|than|that|this|two|three|angle|line|lines|vector|vectors|dot|product|parallel|perpendicular|containing|given|find|value|calculate|compute|determine|acute|obtuse|right|straight|reflex|side|sides|vertex|vertices)\b/i

const ISOLATE_LATEX_CMD =
  /\\(angle|theta|phi|pi|alpha|beta|gamma|cdot|times|vec\{[a-zA-Z]\}|hat\{[a-zA-Z]\}|frac\{[^}]+\}\{[^}]+\}|sqrt\{[^}]+\}|mathbb\{R\}(?:\^{?\+?}?)?|sin|cos|tan|log|ln|leq|geq|neq|pm|perp|parallel)\b/g

/** OCR / math-mode glue: andtheanglebetween → and the angle between */
const GLUED_WORD_MARKERS =
  'between|angle|vectors|vector|lines|acute|obtuse|parallel|perpendicular|containing|calculate|compute|determine|value|find|from|with|and|the|of|is|are|if|then'

/**
 * @param {string} latex
 */
export function isEnglishHeavyMath(latex) {
  const t = String(latex ?? '').trim()
  if (!t) return false
  if (/\\text\s*\{/.test(t)) return false
  if (/\\begin\{(?:aligned|align\*?|array|cases|pmatrix|bmatrix|vmatrix|matrix)\}/.test(t)) {
    return false
  }
  // Never shatter \left…\right chains (e.g. "then evaluate: F\left(…\right)+…").
  if (/\\(?:left|right)\b/.test(t)) return false
  // Strip LaTeX command tokens first, so command names that are also English
  // words (\left, \right, \sin, \cos, \in, \to, …) are NOT counted as prose —
  // otherwise valid blocks like $\left(\sin x\right)$ get mistaken for English
  // and shattered with stray $.
  const prose = t.replace(/\\[a-zA-Z]+/g, ' ')
  if (
    /\\(?:frac|sqrt|vec|hat|sum|int|mathbb|left|right|begin|end)\b/.test(t) &&
    !ENGLISH_IN_MATH.test(prose)
  ) {
    return false
  }
  if (/\\angle\b/.test(t) && ENGLISH_IN_MATH.test(prose)) return true
  const english = prose.match(/\b[a-z]{2,}\b/gi) ?? []
  const commands = t.match(/\\[a-zA-Z]+/g) ?? []
  if (english.length >= 2 && english.length > commands.length) return true
  if (t.length >= 12 && ENGLISH_IN_MATH.test(prose)) return true
  return false
}

/**
 * @param {string} text
 */
export function repairGluedEnglishProse(text) {
  let out = String(text ?? '')
  if (!out.trim()) return out

  out = out
    .replace(/\bthenabsolutevalueof\b/gi, 'then absolute value of')
    .replace(/\babsolutevalueof\b/gi, 'absolute value of')
    .replace(/\bthenabsolute\b/gi, 'then absolute')
    .replace(/\bvalueof\b/gi, 'value of')

  const needsRepair =
    /\bandthe|\btheangle|\banglebetween|\bandtheangle/i.test(out) ||
    (/[a-z]{14,}/i.test(out) && !/\s/.test(out))

  if (!needsRepair) return out

  const words = GLUED_WORD_MARKERS.split('|').sort((a, b) => b.length - a.length)
  for (const word of words) {
    out = out.replace(new RegExp(`(${word})(?=[a-z])`, 'gi'), '$1 ')
    out = out.replace(new RegExp(`(?<=[a-z])(${word})`, 'gi'), ' $1')
  }
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * @param {string} inner
 */
function unwrapEnglishInlineInner(inner) {
  if (/\\(?:left|right)\b/.test(inner)) return inner
  // Keep scalar-triple / cross-product blocks intact (do not isolate \times)
  if (/\\times\s*\d*\\vec|\\vec\{[a-z]\}\s*\\times/i.test(inner)) return inner
  if (!isEnglishHeavyMath(inner)) return inner
  if (!/\\[a-zA-Z]+/.test(inner)) return inner.trim()
  return inner.replace(ISOLATE_LATEX_CMD, (m) => `$${m}$`).trim()
}

/**
 * Fix stems where "then evaluate:" and an F\left sum were one $…$ block and got shattered
 * into F$\left(…$, $…$\right) (shows as red \\backslash\\text{left} in KaTeX).
 * @param {string} text
 */
/** Merge `+F$\\left` / `F$\\left` OCR shards into one math expression. */
export function repairPrematureDollarBeforeLeft(text) {
  if (!text?.includes('$') || !/\\left/.test(text)) return text ?? ''
  return text
    .replace(/\+F\$+\s*(?=\\left)/gi, '+F\\left')
    .replace(/\bF\$+\s*(?=\\left)/gi, 'F\\left')
    .replace(/\\left\\left/g, '\\left')
}

/**
 * `then evaluate: $F(...)+F$\\left…` → single $…$ block for the full sum.
 * @param {string} text
 */
export function repairEvaluateSumMathBlock(text) {
  if (!/\bthen\s+evaluate\s*:/i.test(text) || !/\\left/.test(text)) return text ?? ''

  return text.replace(
    /(\bthen\s+evaluate\s*:\s*)([\s\S]*?)(?=\s+Consider\s+the\b|$)/gi,
    (_, label, chunk) => {
      let c = chunk.trim()
      c = c.replace(/^\$+/, '').replace(/\$+$/, '')
      c = repairPrematureDollarBeforeLeft(c)
      c = c.replace(/\+F\$+\s*/gi, '+F')
      c = c.replace(/\$+\s*(?=\\left)/gi, '')
      c = c.replace(/\$+\s*(?=\\right)/gi, '')
      c = c.replace(/\$\s*\+/g, '+')
      c = c.replace(/\$/g, '')
      if (!c.trim()) return label + chunk
      return `${label}$${c.trim()}$`
    },
  )
}

export function repairShatteredLeftRightMath(text) {
  if (!text?.includes('$') || !/\\left/.test(text)) return text ?? ''
  let out = repairPrematureDollarBeforeLeft(text)
  let prev
  do {
    prev = out
    out = out.replace(
      /\$\\left\(([^$]*)\$,\s*\$([^$]*)\\right\)/g,
      (_, a, b) => `$\\left(${a}, ${b}\\right)`,
    )
    out = out.replace(
      /([A-Za-z])?\$\\left\(([^$]*)\$,\s*\$([^$]*)\\right\)/g,
      (_, fn, a, b) => `${fn ?? ''}$\\left(${a}, ${b}\\right)`,
    )
    out = out.replace(
      /\$\\left\(([^$]*)\$([^$\\]*?)\\right\)/g,
      (_, a, b) => `$\\left(${a}${b}\\right)`,
    )
  } while (out !== prev)
  return out
}

/**
 * Pull "then evaluate:" prose out of a $…$ block that also contains F\left(…\right)+….
 * @param {string} text
 */
export function splitEvaluateProseFromLeftSum(text) {
  if (!text?.includes('$') || !/\\left/.test(text)) return text ?? ''
  return text.replace(/\$([^$]+)\$/g, (full, inner) => {
    if (!/\bthen\s+evaluate\s*:/i.test(inner) || !/\\left\b/.test(inner)) return full
    const leftAt = inner.search(/\\left\b/i)
    if (leftAt < 0) return full
    const fnStart = inner.lastIndexOf('F', leftAt)
    const mathStart = fnStart >= 0 ? fnStart : leftAt
    let prose = inner.slice(0, mathStart).trim()
    const math = inner.slice(mathStart).trim()
    const evalMatch = prose.match(/^(.*\bthen\s+evaluate\s*:)\s*$/i)
    if (evalMatch) prose = evalMatch[1].trim()
    else if (/\bthen\s+evaluate\s*:/i.test(prose)) {
      const m = prose.match(/(.*\bthen\s+evaluate\s*:)/i)
      if (m) prose = m[1].trim()
    }
    return `${prose} $${math}$`
  })
}

/**
 * @param {string} text
 */
export function unwrapEnglishDollarBlocks(text) {
  if (!text?.includes('$')) return text ?? ''

  let out = ''
  let i = 0
  while (i < text.length) {
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
        const inner = text.slice(i + 1, end)
        out += `$${unwrapEnglishInlineInner(inner)}$`
        i = end + 1
        continue
      }
    }
    out += text[i]
    i += 1
  }
  return out
}

/**
 * Keep English words outside $…$; only isolate LaTeX commands (e.g. \angle).
 * @param {string} text
 */
export function embedInlineLatexInProse(text) {
  let out = repairGluedEnglishProse(String(text ?? ''))
  if (!out.includes('$') && !/\\[a-zA-Z]+/.test(out)) return out

  out = unwrapEnglishDollarBlocks(out)

  if (!/\\[a-zA-Z]+/.test(out)) return out

  if (ENGLISH_IN_MATH.test(out)) {
    out = out.replace(
      /(^|[^$])([^$\n]*\b(?:and|the|of|between|with|from)\s+[^$\n]*\\angle[^$\n]*)/gi,
      (full, before, chunk) => {
        if (chunk.includes('$')) return full
        return before + chunk.replace(ISOLATE_LATEX_CMD, (m) => `$${m}$`)
      },
    )
  }

  return out
}

/**
 * Unwrap one inline $…$ block when it mixes English prose with \frac / determinant.
 * @param {string} inner
 */
function unwrapInlineDollarInner(inner) {
  const evalIdx = inner.search(/\bthen\s+evaluate\s*:/i)
  if (evalIdx >= 0 && /\\left\b/.test(inner)) {
    const afterEval = inner.slice(evalIdx)
    const fIdx = afterEval.search(/F\s*(?:\\left|\\sqrt|\()/i)
    if (fIdx >= 0) {
      const prose = inner.slice(0, evalIdx + fIdx).trim()
      const math = inner.slice(evalIdx + fIdx).trim()
      return `${prose} $${math}$`
    }
  }

  const fracAt = inner.search(/\\(?:frac|left|det|begin\{)/)
  if (fracAt < 0) return inner
  const prose = repairGluedEnglishProse(inner.slice(0, fracAt))
  const math = inner.slice(fracAt).trim()
  if (!/absolute|value|then|is\s*$/i.test(prose) && !/thenabsolute/i.test(prose)) return inner
  const tail = inner.slice(fracAt + math.length).trim()
  const tailProse = /^(?:is\.?|equals?)\s*$/i.test(tail) ? ` ${tail}` : ''
  return `${prose.trim()} $${math}$${tailProse}`
}

/**
 * Pull English prose out of $…$ when followed by \frac / determinant (KaTeX drops spaces).
 * Skips $$…$$ display blocks so matrix stems are not split on the first inner $.
 * @param {string} text
 */
export function unwrapProseBeforeDisplayMath(text) {
  if (!text?.includes('$')) return text ?? ''

  let out = ''
  let i = 0
  while (i < text.length) {
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
        const inner = text.slice(i + 1, end)
        const unwrapped = unwrapInlineDollarInner(inner)
        out += unwrapped !== inner && unwrapped.includes('$') ? unwrapped : `$${unwrapped}$`
        i = end + 1
        continue
      }
    }
    out += text[i]
    i += 1
  }
  return out
}

/**
 * Prevent long English prose from staying inside $…$ (KaTeX drops spaces in math mode).
 * @param {string} text
 */
export function fixRunawayInlineMath(text) {
  if (!text?.includes('$') && !/\\[a-zA-Z]+/.test(text ?? '')) {
    return repairGluedEnglishProse(text ?? '')
  }

  const t = String(text)
  const alreadyRepaired =
    /Let\s*\$\$A\s*=\s*\\begin\{bmatrix\}/i.test(t) &&
    /then\s+absolute\s+value\s+of\s+(?:\$)?\\frac/i.test(t)

  let out = alreadyRepaired
    ? unwrapProseBeforeDisplayMath(t)
    : unwrapProseBeforeDisplayMath(embedInlineLatexInProse(t))

  if ((out.match(/\$/g) || []).length % 2 === 1) {
    out = out.replace(/\$\s*$/g, '').replace(/^\s*\$/g, '')
  }

  out = out.replace(/\bis:\s*\$\s*(?=\()/gi, 'is: ')
  out = splitEvaluateProseFromLeftSum(out)
  out = repairEvaluateSumMathBlock(out)
  out = repairShatteredLeftRightMath(out)
  return repairGluedEnglishProse(out)
}

/**
 * Bare OCR segment: "then absolute value of \frac{…}{…} is" (no $ delimiters).
 * @param {string} text
 * @returns {{ prose: string, math: string, suffix: string } | null}
 */
export function splitBareProseFromLatex(text) {
  const repaired = repairGluedEnglishProse(String(text ?? '').trim())
  if (!repaired.includes('\\')) return null

  const frac = findFracExpression(repaired)
  if (!frac) return null

  const prose = repaired.slice(0, frac.start).trim()
  const math = frac.full
  const suffix = repaired.slice(frac.end).trim()
  if (!math || !/\\frac/.test(math)) return null
  if (!prose) return null
  if (!/\s/.test(prose) && !/then|absolute|value|of|let\b/i.test(prose)) return null

  return { prose, math, suffix }
}

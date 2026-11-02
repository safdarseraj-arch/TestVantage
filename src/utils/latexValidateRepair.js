/**
 * Layer 5 — Validation & repair: KaTeX render check + common OCR LaTeX fixes.
 * Conservative: only patch segments that fail KaTeX, never collapse valid $$ pairs.
 */
import katex from 'katex'

/** @param {string} latex */
function katexRenders(latex) {
  const t = String(latex ?? '').trim()
  if (!t) return true
  try {
    const html = katex.renderToString(t, { throwOnError: false, displayMode: false })
    return !html.includes('katex-error')
  } catch {
    return false
  }
}

/**
 * Heal OCR / JS `\r` escape corruption: `\right` → ` ight`, `\ight`, or `\`+CR+`ight`.
 * @param {string} text
 */
export function repairCorruptedLatexRight(text) {
  return String(text ?? '')
    .replace(/\\\r+\s*ight(?=[)\].]|$)/g, '\\right')
    .replace(/\\ight(?=[)\].]|$)/g, '\\right')
    .replace(/(\}|\d)\s*ight(?=[)\].]|$)/g, '$1\\right')
}

/**
 * Matching-list option codes often arrive as shattered arrows:
 * `(P) \rightarrow \quad \right (2)` or `(Q) \r (4)`.
 * Do not touch a real `\right)` / `\right]` pair.
 * @param {string} text
 */
export function repairMatchArrowLatex(text) {
  let s = String(text ?? '')
  if (!s.includes('\\')) return s
  s = s.replace(/\\rightarrow\s*(?:\\quad\s*)?\\right\s*(?=\()/g, '\\rightarrow ')
  s = s.replace(/\\quad\s*\\right\s*(?=\(\s*(?:\d|[PQRS]))/g, '\\rightarrow ')
  s = s.replace(/\\right\s*(?=\(\s*(?:\d|[PQRS]))/g, '\\rightarrow ')
  s = s.replace(/\\r(?![a-zA-Z])\s*(?=\(\s*(?:\d|[PQRS]))/g, '\\rightarrow ')
  s = s.replace(/\\\s*$/g, '')
  s = s.replace(/\s+\\\s+/g, ' ')
  return s
}

/** @param {string} latex */
function repairLatexFragment(latex) {
  let s = String(latex ?? '').trim()
  if (!s) return s

  s = repairCorruptedLatexRight(s)

  s = s
    .replace(/\\neq\s*\^/g, '\\neq')
    .replace(/\\times\s*\^/g, '\\times')
    .replace(/\\left\s*\(\s*\\right\./g, '\\left(')
    .replace(/\\left\.\s*\\right\)/g, '\\right)')
    .replace(/\\frac\s*\{([^}]*)\}\s*([^{\s/\\])/g, '\\frac{$1}{$2}')
    .replace(/\\sqrt\s*([^{\s])/g, '\\sqrt{$1}')
    .replace(/\\pi\s*\^/g, '\\pi')
    .replace(/\^\s*\{\s*\}/g, '')
    .replace(/_\s*\{\s*\}/g, '')

  const open = (s.match(/\{/g) || []).length
  const close = (s.match(/\}/g) || []).length
  if (open > close) s += '}'.repeat(open - close)

  if (!katexRenders(s) && /\\begin\{cases\}/.test(s) && !/\\end\{cases\}/.test(s)) {
    s = `${s} \\end{cases}`
  }

  return s
}

/**
 * Fix stray triple+ dollar runs (OCR artifact) without breaking valid $$ … $$ pairs.
 * @param {string} text
 */
function fixStrayDollarRuns(text) {
  return String(text ?? '')
    .replace(/\$\$\$\$/g, '$$')
    .replace(/\\end\{cases\}\$\$\$/g, '\\end{cases}$$')
    .replace(/\\end\{cases\}\$\s*\$/g, '\\end{cases}$$')
}

/**
 * Validate and repair inline/display math segments in mixed text.
 * @param {string} text
 * @returns {{ text: string, repaired: number, invalid: number }}
 */
export function validateAndRepairLatexInText(text) {
  let raw = fixStrayDollarRuns(String(text ?? ''))
  if (!raw.trim()) return { text: raw, repaired: 0, invalid: 0 }

  let repaired = 0
  let invalid = 0

  /** @param {string} segment */
  const fixSegment = (segment) => {
    const before = segment
    if (katexRenders(before)) return before
    const after = repairLatexFragment(before)
    if (after !== before) repaired += 1
    if (!katexRenders(after)) invalid += 1
    return after
  }

  // $$ display blocks
  let out = raw.replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => {
    const fixed = fixSegment(inner)
    return `$$${fixed}$$`
  })

  // $ inline (non-greedy)
  out = out.replace(/(?<!\\)\$([^$\n]+?)(?<!\\)\$/g, (_, inner) => {
    const fixed = fixSegment(inner)
    return `$${fixed}$`
  })

  return { text: out, repaired, invalid }
}

/**
 * Quick pass for upload pipeline — returns repaired text only.
 * @param {string} text
 */
export function repairLatexForUpload(text) {
  return validateAndRepairLatexInText(text).text
}

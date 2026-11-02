/**
 * Read one {…} group with nested braces. Leading whitespace before `{` is
 * skipped (OCR/Mathpix sometimes emits "\frac {x} {y}").
 * @param {string} text
 * @param {number} pos
 * @returns {{ inner: string, end: number } | null}
 */
function readBraceGroup(text, pos) {
  while (pos < text.length && /\s/.test(text[pos])) pos += 1
  if (text[pos] !== '{') return null
  let depth = 1
  const start = pos + 1
  pos += 1
  while (pos < text.length && depth > 0) {
    if (text[pos] === '{') depth += 1
    else if (text[pos] === '}') depth -= 1
    pos += 1
  }
  if (depth !== 0) return null
  return { inner: text.slice(start, pos - 1), end: pos }
}

/**
 * Find \\frac{…}{…} with nested braces (e.g. \\left|…\\right|). Tolerates
 * whitespace after \\frac and between the numerator/denominator groups.
 * @param {string} text
 * @param {number} [from]
 * @returns {{ start: number, end: number, full: string } | null}
 */
export function findFracExpression(text, from = 0) {
  const t = String(text ?? '')
  const re = /\\frac\s*\{/g
  re.lastIndex = Math.max(0, from)
  const m = re.exec(t)
  if (!m) return null
  const idx = m.index

  // Position at the opening `{` of the numerator (after "\frac" + optional ws).
  const num = readBraceGroup(t, idx + 5)
  if (!num) return null
  const den = readBraceGroup(t, num.end)
  if (!den) return null

  return { start: idx, end: den.end, full: t.slice(idx, den.end) }
}

/**
 * Wrap bare \\frac{…}{…} (not already in $…$) in inline math delimiters.
 * @param {string} text
 */
export function wrapBareFracExpressions(text) {
  if (!text?.includes('\\frac')) return text ?? ''

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
        out += text.slice(i, end + 1)
        i = end + 1
        continue
      }
    }

    const frac = findFracExpression(text, i)
    if (frac && frac.start === i) {
      const before = text[i - 1]
      const after = text[frac.end]
      const alreadyWrapped = before === '$' || after === '$'
      out += alreadyWrapped ? frac.full : `$${frac.full}$`
      i = frac.end
      continue
    }

    out += text[i]
    i += 1
  }
  return out
}

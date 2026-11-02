/**
 * Gemini often dumps TeX with single backslashes into JSON.
 * JSON treats \f \n \t \b \r as control chars and \s \p \l as invalid,
 * which silently chops stems at \frac{…}{ .
 * Double backslashes that start LaTeX commands so JSON.parse keeps the full stem.
 */

const JSON_SLASH_QUOTES = new Set(['"', '\\', '/'])

/**
 * @param {string} raw
 * @returns {string}
 */
export function repairLatexBackslashesInJson(raw) {
  const s = String(raw ?? '')
  let out = ''
  let inString = false
  let escape = false
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]
    if (!inString) {
      out += ch
      if (ch === '"') inString = true
      continue
    }
    if (escape) {
      out += ch
      escape = false
      continue
    }
    if (ch === '\\') {
      const next = s[i + 1]
      if (next == null) {
        out += '\\\\'
        continue
      }
      if (next === 'u' && /[0-9a-fA-F]{4}/.test(s.slice(i + 2, i + 6))) {
        out += '\\'
        escape = true
        continue
      }
      if (JSON_SLASH_QUOTES.has(next)) {
        out += '\\'
        escape = true
        continue
      }
      const after = s[i + 2] ?? ''
      if ('bfnrt'.includes(next) && /[a-zA-Z]/.test(after)) {
        out += '\\\\'
        continue
      }
      if ('bfnrt'.includes(next) && !/[a-zA-Z]/.test(after)) {
        out += '\\'
        escape = true
        continue
      }
      if (/[a-zA-Z]/.test(next)) {
        out += '\\\\'
        continue
      }
      out += '\\'
      escape = true
      continue
    }
    if (ch === '"') {
      inString = false
      out += ch
      continue
    }
    out += ch
  }
  return out
}

/**
 * JSON.parse, then the same after TeX-backslash salvage.
 * @param {string} text
 * @returns {unknown}
 */
export function jsonParseWithLatexSalvage(text) {
  const s = String(text ?? '')
  try {
    return JSON.parse(s)
  } catch {
    /* fall through */
  }
  try {
    return JSON.parse(repairLatexBackslashesInJson(s))
  } catch {
    return null
  }
}

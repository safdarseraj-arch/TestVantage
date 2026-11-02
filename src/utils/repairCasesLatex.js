/**
 * Light, safe repairs for \\begin{cases}…\\end{cases} from Gemini / OCR.
 * Preserves Gemini LaTeX — never strips row-break \\\\ inside cases.
 * Heals: missing \\\\ between rows, bare "a sgn" / "asgn", over-escaped \\\\\\\\.
 */

/** Bare / glued sgn → \\operatorname{sgn} (never invent new math). */
export function repairBareSgnOperator(text) {
  let s = String(text ?? '')
  if (!s) return s
  s = s.replace(/\basgn\s*\(/gi, 'a\\operatorname{sgn}(')
  s = s.replace(/\ba\s+sgn\s*\(/gi, 'a\\operatorname{sgn}(')
  // OCR: "a sgn (x" or "a  sgn("
  s = s.replace(/\ba\s+sgn\s+(?=\()/gi, 'a\\operatorname{sgn}')
  // Bare sgn( not already \\operatorname{sgn} / \\mathrm{sgn} / \\text{sgn}
  s = s.replace(
    /(?<!\\)(?<!operatorname\{)(?<!mathrm\{)(?<!text\{)\bsgn\s*\(/gi,
    '\\operatorname{sgn}(',
  )
  return s
}

/**
 * True when a cases body already has at least one KaTeX row break (\\\\).
 * @param {string} inner
 */
export function casesBodyHasRowBreak(inner) {
  return /\\\\/.test(String(inner ?? ''))
}

/**
 * Collapse over-escaped consecutive row breaks inside cases (\\\\\\\\ → \\\\)
 * and insert missing \\\\ between classic two-piece rows.
 * @param {string} text
 */
export function repairCasesRowBreaks(text) {
  return String(text ?? '').replace(
    /\\begin\{cases\}([\s\S]*?)\\end\{cases\}/gi,
    (_full, inner) => {
      let body = String(inner ?? '')
      // Over-escaped: multiple \\\\ in a row → single row break
      body = body.replace(/(?:\\\\[ \t]*){2,}/g, '\\\\')

      if (!casesBodyHasRowBreak(body)) {
        // Glued second piece after interval: "... 0\\le x\\le 1 a\\operatorname..." or "...1 a sgn..."
        const glued = body.replace(
          /(&\s*[^\\&]*?(?:\\le|\\leq|\\ge|\\geq|[<>≤≥=])[^\\&]*?)(\s+)(?=[a-zA-Z0-9\\])/i,
          '$1 \\\\ ',
        )
        if (glued !== body) {
          body = glued
        } else {
          // Newline-separated rows without \\\\
          body = body.replace(/([^\\\s])[ \t]*\n[ \t]*(?=[a-zA-Z0-9\\])/g, '$1 \\\\ ')
        }
        // Still no break but 2+ & cells: split before the piece that follows the first interval row
        if (!casesBodyHasRowBreak(body)) {
          const ampCount = (body.match(/&/g) || []).length
          if (ampCount >= 2) {
            // After first ", & …interval" block, force \\\\ before next expression
            body = body.replace(
              /(,\s*&\s*[^,\\]+?)(\s+)(?=[^,]*&)/,
              '$1 \\\\ ',
            )
          }
        }
      }

      return `\\begin{cases}${body}\\end{cases}`
    },
  )
}

/**
 * Structural + sgn heal for cases environments. Idempotent.
 * @param {string} text
 */
export function repairCasesLatex(text) {
  let s = String(text ?? '')
  if (!s.trim()) return s
  s = repairBareSgnOperator(s)
  if (/\\begin\s*\{\s*cases\s*\}/i.test(s)) {
    s = repairCasesRowBreaks(s)
  }
  return s
}

/**
 * True when every \\begin{cases}…\\end{cases} has a row break and no bare "a sgn".
 * @param {string} text
 */
export function casesLatexLooksValid(text) {
  const s = String(text ?? '')
  if (/\ba\s+sgn\s*\(/i.test(s) || /\basgn\s*\(/i.test(s)) return false
  const re = /\\begin\{cases\}([\s\S]*?)\\end\{cases\}/gi
  let m
  let found = false
  while ((m = re.exec(s)) !== null) {
    found = true
    if (!casesBodyHasRowBreak(m[1])) return false
  }
  return found ? true : !/\\begin\s*\{\s*cases\s*\}/i.test(s)
}

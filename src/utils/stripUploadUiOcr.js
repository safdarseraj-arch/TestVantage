/**
 * Remove TestVantages upload-screen chrome accidentally captured in screenshots.
 * @param {string} text
 */
export function stripUploadUiOcr(text) {
  if (!text?.trim()) return text

  const uiLine =
    /^(?:Drop image|Convert image|Re-extract|Parse question|Fix math|Split passage|Re-parse match|Built-in hybrid|Hybrid OCR \+ LaTeX|OCR text|LaTeX source|Source screenshot|Question diagram|Paste full|Upload diagram|Upload full|Screenshot\s+\d|dropzone|Cancel OCR|Reset upload|Extracting|Loading OCR|Choose your question|Best format|symbol bar|Question text|Options A|Attach graph|Save to question bank|Preview refreshed|Matrix match the column|Row [A-D]\s*[—–-]\s*LaTeX|Video solution URL|Step-by-step solution|Solution\s*\/\s*explanation|Column I \(4 rows\)|Column li\b)/i

  const uiInline =
    /\b(?:Drop image or PDF|Convert image → text|Parse question & options|Fix math symbols|Split passage \(2\+ Q\)|Built-in hybrid OCR|Hybrid OCR \+ LaTeX|OCR text \/ LaTeX source|Source screenshot|Preview refreshed|Matrix match the column|Row [A-D] — LaTeX OK)\b/gi

  let out = text.replace(/\r\n/g, '\n')

  // Screenshot captured the upload form below the question — keep only the question block.
  const formBleed = out.search(
    /\n(?:Match the Column\s*\n\s*Step-by-step|Solution\s*\/\s*explanation|Matrix match the column|Column I \(4 rows\))/i,
  )
  if (formBleed > 120) out = out.slice(0, formBleed).trim()

  out = out
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      if (!t) return true
      if (uiLine.test(t)) return false
      if (/^(?:\(A\)|\(B\)|\(C\)|\(D\))\s*\.?\s*$/.test(t) && t.length < 6) return false
      return true
    })
    .join('\n')

  out = out.replace(uiInline, ' ')
  out = out.replace(/\n{3,}/g, '\n\n').trim()
  return out
}

/**
 * OCR often emits single-letter tokens: "L e t", "f o r a l l".
 * Collapse word-like runs without gluing the next variable ("L e t A" → "Let A").
 * @param {string} text
 */
export function collapseSpacedOcrLetters(text) {
  if (!text?.trim()) return text

  let out = text

  // Capitalized word: L e t → Let (keep trailing variable / math separate)
  out = out.replace(
    /\b([A-Z](?: [a-z]){2,})(?=\s+(?:[A-Za-z0-9=(\[$\\]|$))/g,
    (m) => m.split(' ').join(''),
  )

  // Lowercase prose: f o r a l l → forall
  out = out.replace(/\b([a-z](?: [a-z]){3,})\b/g, (m) => m.split(' ').join(''))

  // Common OCR: f o r a l l x → for all x (not LaTeX \forall x)
  out = out.replace(/(?<!\\)\bforall\s*x\b/gi, 'for all x')

  return out
}

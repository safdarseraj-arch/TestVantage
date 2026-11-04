/**
 * Mathpix sometimes prints only some MCQ letters: (B) and (D) are captions on
 * option pictures while (A) and (C) are bare structures. The splitter then keeps
 * the bare ones as options and leaves the labelled pictures at the end of the
 * stem. Put every option back in its letter slot. Nothing is invented: the
 * pictures and the bare options are the card's own (or the scan's).
 */

const LABELLED_FIGURE =
  /\n\s*\(\s*([A-D])\s*\)\s*\n+\s*(\\includegraphics(?:\[[^\]]*\])?\{[^}\s]+\}|!\[[^\]]*\]\([^)\s]+\))[ \t]*(?=\n|$)/g

const OPTION_TOKEN_RE =
  /<smiles>[\s\S]*?<\/smiles>|\\includegraphics(?:\[[^\]]*\])?\{[^}\s]+\}|!\[[^\]]*\]\([^)\s]+\)/gi

const LETTERS = ['A', 'B', 'C', 'D']

/** @param {string} figure */
function asOptionFigure(figure) {
  return figure.replace(/^\\includegraphics\[[^\]]*\]/, '\\includegraphics')
}

/** @param {string} token */
function tokenKey(token) {
  const url = token.match(/\{([^}\s]+)\}$|\(([^)\s]+)\)$/)
  return url ? url[1] || url[2] : token.replace(/\s+/g, '')
}

/**
 * Four options where SMILES and pictures alternate (2021 P1 Chemistry Q2).
 * Returns null unless the text after the first SMILES is exactly four option
 * tokens plus figure chrome and (A)-(D) labels.
 * @param {unknown} raw
 * @returns {{ stem: string, options: string[] } | null}
 */
export function mixedSmilesFigureOptions(raw) {
  const t = String(raw ?? '')
  const tokens = [...t.matchAll(OPTION_TOKEN_RE)]
  const firstSmiles = tokens.findIndex((m) => /^<smiles>/i.test(m[0]))
  if (firstSmiles < 0) return null
  const tail = tokens.slice(firstSmiles)
  if (tail.length !== 4 || tail.every((m) => /^<smiles>/i.test(m[0]))) return null
  const at = tail[0].index ?? 0
  const between = t
    .slice(at)
    .replace(OPTION_TOKEN_RE, '')
    .replace(/\\(?:begin|end)\{figure\*?\}|\\captionsetup\{[^}]*\}|\\caption\{\s*(?:\(\s*[A-D]\s*\))?\s*\}/gi, '')
    .replace(/\(\s*[A-D]\s*\)|\\(?:begin|end)\{itemize\}|\\item\b/gi, '')
  if (between.trim()) return null
  const stem = t
    .slice(0, at)
    .replace(/(?:^|\n)\s*\(\s*A\s*\)\s*$/i, '')
    .trim()
  return { stem, options: tail.map((m) => asOptionFigure(m[0])) }
}

/** This question's slice of the scan, from its opening words to the next question. */
function scanSliceForStem(stem, source) {
  const src = String(source ?? '')
  const head = String(stem ?? '').split(/\n|\$|\\includegraphics/)[0].trim().slice(0, 60)
  if (head.length < 20) return ''
  const at = src.indexOf(head)
  if (at < 0 || src.indexOf(head, at + 1) >= 0) return ''
  const rest = src.slice(at + head.length)
  const next = rest.search(/\\item\s*\[\s*Q\.?\s*\]|(?:^|\n)\s*Q\s*\.\s*\d{1,2}\b|\\section\*?\{/)
  return src.slice(at, at + head.length + (next >= 0 ? next : Math.min(rest.length, 2500)))
}

/** The labels were already peeled off the stem: rebuild the options from the scan. */
function restoreFromScan(q, source) {
  const text = String(q.text ?? '')
  const scan = mixedSmilesFigureOptions(scanSliceForStem(text, source))
  if (!scan) return q
  const cardTokens = [
    ...[...text.matchAll(OPTION_TOKEN_RE)].map((m) => m[0]),
    ...(Array.isArray(q.options) ? q.options : []).map((o) => String(o ?? '')).filter((o) => o.trim()),
  ].map(tokenKey)
  const scanKeys = scan.options.map(tokenKey)
  if (!scanKeys.every((key) => cardTokens.includes(key))) return q
  const stem = text
    .replace(OPTION_TOKEN_RE, (token) => (scanKeys.includes(tokenKey(token)) ? '\n' : token))
    .replace(/(?:^|\n)\s*\(\s*[A-D]\s*\)\s*(?=\n|$)/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (stem.length < 20) return q
  return { ...q, text: stem, options: scan.options }
}

/**
 * @template {Record<string, any>} T
 * @param {T} q
 * @param {unknown} [source] stored OCR of the paper
 * @returns {T}
 */
export function restoreLabelledFigureOptions(q, source = '') {
  if (!q || typeof q !== 'object') return q
  if (!/single_correct|multiple_correct/.test(String(q.questionType ?? ''))) return q
  const text = String(q.text ?? '')
  const bare = (Array.isArray(q.options) ? q.options : []).map((o) => String(o ?? '')).filter((o) => o.trim())
  if (bare.length >= LETTERS.length) return q
  const matches = [...text.matchAll(LABELLED_FIGURE)]
  if (!matches.length) return restoreFromScan(q, source)
  const first = matches[0].index ?? 0
  const tail = text.slice(first).replace(/\s+/g, '')
  if (tail !== matches.map((m) => m[0]).join('').replace(/\s+/g, '')) return q
  const labelled = new Map(matches.map((m) => [m[1].toUpperCase(), asOptionFigure(m[2])]))
  if (labelled.size !== matches.length) return q
  if (labelled.size + bare.length !== LETTERS.length) return q
  const stem = text.slice(0, first).trim()
  if (stem.length < 20) return q
  const options = LETTERS.map((letter) => labelled.get(letter) ?? String(bare.shift()))
  return { ...q, text: stem, options }
}

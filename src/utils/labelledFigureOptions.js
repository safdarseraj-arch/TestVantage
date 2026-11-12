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

/** "," / "and" left in an option slot when a printed key "(B), (C) and (D)" was split as options. */
export const SCRAP_OPTION_RE = /^[\s,;.]*(?:and|or)?[\s,;.]*$/i

const LETTER_PAIR = String.raw`\(\s*[A-D]\s*\)\s+(?:and|or)\s+\(\s*[A-D]\s*\)`
/** A page's printed answers "(A) and (B); (A) and (D); (A) and (C)" glued after the last option. */
const OPTION_LETTER_TAIL_RE = new RegExp(String.raw`\s+${LETTER_PAIR}(?:\s*;\s*${LETTER_PAIR})+\s*$`, 'i')

/** @param {unknown} opt */
export function trimOptionLetterTail(opt) {
  const s = String(opt ?? '')
  const trimmed = s.replace(OPTION_LETTER_TAIL_RE, '')
  return trimmed.trim() ? trimmed : s
}

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
    // 2017 papers print "[A]" where later ones print "(A)".
    .replace(/\(\s*[A-D]\s*\)|\[\s*[A-D]\s*\]|\\(?:begin|end)\{itemize\}|\\item\b/gi, '')
  if (between.trim()) return null
  const stem = t
    .slice(0, at)
    .replace(/(?:^|\n)\s*(?:\(\s*A\s*\)|\[\s*A\s*\])\s*$/i, '')
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
  const next = rest.search(/\\item\s*\[\s*Q\.?\s*\]\s*\$?\s*\d|(?:^|\n)\s*Q\s*\.\s*\d{1,2}\b|\\section\*?\{/)
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

const FIGURE_RE = /\\includegraphics(?:\[[^\]]*\])?\{([^}\s]+)\}|!\[[^\]]*\]\(([^)\s]+)\)/g
const ASKS_FOR_A_PICTURE_RE =
  /\bwill\s+(?:look\s+like|be)\b|\b(?:which\s+(?:one\s+)?of|among)\s+the\s+following\b|\bcorrect\s+(?:shape|plot|graph|figure|option|variation)|\bis\s*\(\s*are\s*\)\s+correct\b|\brepresent(?:s|ed\s+by)?\b/i

function cropBox(url) {
  const num = (key) => Number((String(url).match(new RegExp(`[?&]${key}=(\\d+)`)) || [])[1])
  const box = { x: num('top_left_x'), y: num('top_left_y'), h: num('height') }
  return Object.values(box).every((n) => Number.isFinite(n) && n > 0) ? box : null
}

/**
 * All four (A)-(D) labels were lost and the option pictures sit at the end of
 * the stem (2020 Physics Q3, Q5; Chemistry Q8). Four same-size crops in one row
 * or a 2×2 grid, after a question that asks which picture is right, are the
 * options in reading order. A fifth, earlier picture stays in the stem.
 * @param {string} text
 * @returns {{ stem: string, options: string[] } | null}
 */
function trailingFigureOptions(text) {
  const figures = [...text.matchAll(FIGURE_RE)]
  if (figures.length < 4 || figures.length > 5) return null
  const tail = figures.slice(-4)
  const firstAt = tail[0].index ?? 0
  const between = text.slice(firstAt).replace(FIGURE_RE, '')
  if (between.trim()) return null
  const prose = text.slice(0, firstAt).replace(FIGURE_RE, ' ')
  if (!ASKS_FOR_A_PICTURE_RE.test(prose)) return null
  const boxes = tail.map((m) => cropBox(m[1] || m[2]))
  if (boxes.some((b) => !b)) return null
  const heights = boxes.map((b) => b.h)
  if (Math.max(...heights) > Math.min(...heights) * 1.35) return null
  const rows = []
  for (const [i, b] of boxes.entries()) {
    const row = rows.find((r) => Math.abs(r.y - b.y) < 60)
    if (row) row.items.push({ ...b, i })
    else rows.push({ y: b.y, items: [{ ...b, i }] })
  }
  const shape = rows.map((r) => r.items.length).join('x')
  if (shape !== '4' && shape !== '2x2') return null
  const order = rows
    .sort((a, b) => a.y - b.y)
    .flatMap((r) => r.items.sort((a, b) => a.x - b.x).map((item) => item.i))
  return {
    stem: text.slice(0, firstAt).trim(),
    options: order.map((i) => asOptionFigure(tail[i][0])),
  }
}

const PICTURE_ONLY_RE = /^\s*(?:\\includegraphics(?:\[[^\]]*\])?\{[^}\s]+\}|!\[[^\]]*\]\([^)\s]+\))\s*$/

/**
 * Four picture options are already filled (e.g. page crops) but the stem still ends with
 * the same four pictures from the scan.
 * @param {Record<string, any>} q
 */
export function stemRepeatsOptionPictures(q) {
  if (!/single_correct|multiple_correct/.test(String(q?.questionType ?? ''))) return null
  const options = (Array.isArray(q.options) ? q.options : []).map((o) => String(o ?? ''))
  if (options.length !== LETTERS.length || !options.every((o) => PICTURE_ONLY_RE.test(o))) return null
  const trailing = trailingFigureOptions(String(q.text ?? ''))
  return trailing && trailing.stem.length >= 20 ? trailing.stem : null
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
  const bare = (Array.isArray(q.options) ? q.options : [])
    .map((o) => String(o ?? ''))
    .filter((o) => !SCRAP_OPTION_RE.test(o))
  if (bare.length >= LETTERS.length) {
    const stem = stemRepeatsOptionPictures(q)
    return stem ? { ...q, text: stem } : q
  }
  const matches = [...text.matchAll(LABELLED_FIGURE)]
  if (!matches.length && !bare.length) {
    const trailing = trailingFigureOptions(text)
    if (trailing && trailing.stem.length >= 20) return { ...q, text: trailing.stem, options: trailing.options }
  }
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

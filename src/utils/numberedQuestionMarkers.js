/**
 * Some scans print questions as "12. During …" or "\item[43.] Let …" instead of "Q. 12".
 * When a paper has no "Q." markers at all, a run of line-start numbers that counts
 * 1, 2, 3 … (restarting at 1 only after a SECTION / PART heading) is the question numbering,
 * and becomes "Q. N" so every reader splits and counts the same questions.
 */

const Q_MARKER_RE = /\\item\s*\[\s*Q\s*\.?\s*\d{0,3}\s*\]|(?:^|\n)[ \t]*(?:\\section\*?\{\s*)?Q\s*\.?\s*\d{1,3}\b/g
const NUMBERED_RE = /(^|\n)([ \t]*)(?:(\d{1,3})\.[ \t]+(?=\S)|\\item\s*\[\s*(\d{1,3})\s*\.\s*\][ \t]*)/g
const BOUNDARY_RE = /\\section\*?\{[^}]*\b(?:SECTION|PART)\b|(?:^|\n)[ \t]*(?:SECTION|PART)\b/i
/** A real paper has many questions; a short run of "1. 2. 3." is a list inside one question. */
const MIN_RUN = 8

let lastIn = ''
let lastOut = ''

/** @param {unknown} raw */
export function labelNumberedQuestions(raw) {
  const text = String(raw ?? '')
  if (text === lastIn) return lastOut
  lastIn = text
  lastOut = labelOnce(text)
  return lastOut
}

function labelOnce(text) {
  if ((text.match(Q_MARKER_RE) || []).length >= 2) return text
  const accepted = []
  let last = 0
  let lastEnd = 0
  for (const m of text.matchAll(NUMBERED_RE)) {
    const n = Number(m[3] || m[4])
    const restart = n === 1 && last > 0 && BOUNDARY_RE.test(text.slice(lastEnd, m.index))
    if (n !== last + 1 && !restart) continue
    accepted.push({ at: m.index + m[1].length + m[2].length, end: m.index + m[0].length, n, item: Boolean(m[4]) })
    last = n
    lastEnd = m.index + m[0].length
  }
  if (accepted.length < MIN_RUN) return text
  let out = ''
  let from = 0
  for (const a of accepted) {
    out += `${text.slice(from, a.at)}${a.item ? `\\item[Q.] ${a.n} ` : `Q. ${a.n} `}`
    from = a.end
  }
  return out + text.slice(from)
}

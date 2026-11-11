/**
 * Some scans print questions as "12. During …" or "\item[43.] Let …" instead of "Q. 12".
 * When a paper has no "Q." markers at all, a run of line-start numbers that counts
 * 1, 2, 3 … (restarting at 1 only after a SECTION / PART heading) is the question numbering,
 * and becomes "Q. N" so every reader splits and counts the same questions.
 */

import { stripEndAnswerSection } from './printedEndSolutions.js'

/** A bare "\item[Q.]" with no number is row Q of a P/Q/R/S matching list, not a question marker. */
const Q_MARKER_RE = /\\item\s*\[\s*Q\s*\.?\s*(?:\d{1,3}\s*\]|\][ \t]*\d{1,3}\b)|(?:^|\n)[ \t]*(?:\\section\*?\{\s*)?Q\s*\.?\s*\d{1,3}\b/g
/** "58." alone on its line (a matching-list question whose lists start below) counts too. */
const NUMBERED_RE = /(^|\n)([ \t]*)(?:(\d{1,3})\.(?:[ \t]+(?=\S)|[ \t]*(?=\r?\n))|\\item\s*\[\s*(\d{1,3})\s*\.\s*\][ \t]*)/g
const BOUNDARY_RE = /\\section\*?\{[^}]*\b(?:SECTION|PART)\b|(?:^|\n)[ \t]*(?:SECTION|PART)\b/i
/** A real paper has many questions; a short run of "1. 2. 3." is a list inside one question. */
const MIN_RUN = 8

let lastIn = ''
let lastOut = ''

/**
 * Every reader that splits or counts questions goes through here, so an answer / solution part
 * printed after the last question ("ANSWER KEY 1. (B) …") is cut off here and never counted.
 * @param {unknown} raw
 */
export function labelNumberedQuestions(raw) {
  const text = String(raw ?? '')
  if (text === lastIn) return lastOut
  lastIn = text
  lastOut = restorePassageHeadings(labelOnce(stripEndAnswerSection(text)))
  return lastOut
}

const PASSAGE_SECTION_RE = /This section contains\s+(?:\w+\s+)?paragraphs?\b|Comprehension\s+Type|Paragraph\s+Type/i
const SECTION_START_RE = /This section contains|\\section\*?\{[^}]*\bSECTION\b|(?:^|\n)[ \t]*SECTION\b/gi
const PER_PARAGRAPH = { two: 2, three: 3, four: 4, 2: 2, 3: 3, 4: 4 }
const MARK = String.raw`(?:Q\s*\.\s*|\\item\s*\[\s*Q\s*\.?\s*\]\s*)`
const ANSWER_LINE = String.raw`(?:\\section\*?\{\s*)?Answer\b`
const HEADLESS_GAP_RE = new RegExp(
  String.raw`(\n[ \t]*${ANSWER_LINE}[^\n]*)((?:(?!\n[ \t]*(?:${MARK}\d|${ANSWER_LINE}))[\s\S]){150,4000}?)(?=\n[ \t]*${MARK}(\d{1,3})\b)`,
  'g',
)

/**
 * "Paragraph For Questions 11 \& 12" reads as "11 and 12", and "Paragraphs for Questions 35 and 36"
 * (2013 P2) as "Paragraph for …": every passage reader matches the singular heading only, so the
 * plural one became a card of its own. In a comprehension section the scan
 * can also drop the heading, leaving the paragraph between one question's printed answer and
 * the next question (2014 P2 Q33–36); the heading is put back so the paragraph is the passage of
 * the questions after it, not the tail of the question before.
 * A bilingual heading keeps only the numbers of its Hindi half ("… 9 and 10 \\ 9 10"); they are dropped,
 * or they open the paragraph as broken math.
 * @param {string} text
 */
function restorePassageHeadings(text) {
  const out = text
    .replace(/\b(Paragraph)s(\s+for\s+(?:Questions?|Q\.?)\s*\d)/gi, '$1$2')
    .replace(/(Paragraph\s+for\s+(?:Questions?|Q\.?)\s*\d{1,3})\s*(?:\\&|&)\s*(\d{1,3})/gi, '$1 and $2')
    .replace(/(Paragraph\s+for\s+(?:Questions?|Q\.?)[^\n{}\\]*?\d)\s*\\\\[\s\d,&]*(?=\})/gi, '$1')
  if (!PASSAGE_SECTION_RE.test(out)) return out
  return out.replace(HEADLESS_GAP_RE, (whole, answer, gap, num, at) => {
    if (/Paragraph|Passage|This section contains|(?<!\\)\bSECTION\b|\bPART\b/i.test(gap)) return whole
    if (/^\s*(?:\\section\*?\{\s*)?(?:Sol(?:ution)?|Explanation|Hint)\b/i.test(gap)) return whole
    const prose = gap.replace(/!\[[^\]]*\]\([^)]*\)|\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}|\$[^$]*\$/g, ' ')
    if ((prose.match(/[A-Za-z]{3,}/g) || []).length < 20) return whole
    const before = out.slice(0, at)
    const sectionAt = Math.max(-1, ...[...before.matchAll(SECTION_START_RE)].map((m) => m.index))
    const head = before.slice(sectionAt, sectionAt + 600)
    if (sectionAt < 0 || !PASSAGE_SECTION_RE.test(head)) return whole
    const word = head.match(/\b(two|three|four|[234])\s+questions\s+(?:on|per|relate\s+to)\s+each\s+paragraph/i)?.[1]
    const per = PER_PARAGRAPH[String(word ?? 'two').toLowerCase()] || 2
    const nums = Array.from({ length: per }, (_, i) => Number(num) + i)
    const label = nums.length > 1 ? `${nums.slice(0, -1).join(', ')} and ${nums[nums.length - 1]}` : String(nums[0])
    return `${answer}\n\\section*{Paragraph For Questions ${label}}\n${gap}`
  })
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

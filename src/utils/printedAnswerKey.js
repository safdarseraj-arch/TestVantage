/**
 * Some official archive PDFs (JEE Advanced 2017) print the key after each group:
 * "Answer(s) for the above question(s)" then "Ans for Q.6: (B) and (C)", as a line,
 * a heading, a table row, a table caption, or inside a figure caption.
 * Read that key, then cut the boxes out so they never land in a stem or an option.
 */

// Two boxes can share a line ("Ans for Q.3: (D) Ans for Q.4: (A)"), and a box can accept
// either of two answers ("Ans for Q.14: \{(C)\} or \{(C) and (D)\}") — both 2017 P2.
const EITHER = String.raw`\\\{[^{}\n]*?\\\}`
const ENTRY_RE = new RegExp(
  String.raw`\bAns\s+for\s+Q\s*\.?\s*(\d{1,3})\s*:[ \t]*(${EITHER}(?:\s*or\s*${EITHER})*|(?:(?!\bAns\s+for\s+Q)[^&\n}\\])*)`,
  'gi',
)
const HEADING = String.raw`Answers?\s+for\s+the\s+above\s+questions?`

/** @param {unknown} raw @returns {Map<number, string>} */
export function readPrintedAnswerKey(raw) {
  const text = String(raw ?? '')
  /** @type {Map<number, string>} */
  const key = new Map()
  for (const m of text.matchAll(ENTRY_RE)) {
    const n = Number(m[1])
    const value = String(m[2] ?? '').trim()
    // Either of two answers scores: no single key to put on the card.
    if (/\\\{|\bor\b/i.test(value)) continue
    if (n > 0 && value && !key.has(n)) key.set(n, value)
  }
  return key
}

/**
 * "Q.44: Due to internal review, all candidates are awarded +4 marks." is a key note, not
 * question 44 a second time — left in, it is counted as a question and sticks to a card.
 * @param {unknown} raw
 */
export function stripAwardedToAllNotes(raw) {
  return String(raw ?? '')
    .replace(
      /^[^\n]*\b(?:marks\s+will\s+be\s+awarded\s+to\s+all\s+candidates|all\s+candidates\s+(?:are|were|will\s+be)\s+awarded)\b[^\n]*$/gim,
      '',
    )
    // Text stored by the older cleaner kept the "\{(C)\} or \{(C) and (D)\}" half of an either-or box.
    .replace(new RegExp(String.raw`^[ \t]*${EITHER}(?:\s*or\s*${EITHER})+[ \t]*$`, 'gim'), '')
}

/** @param {unknown} raw */
export function stripPrintedAnswerBoxes(raw) {
  let t = stripAwardedToAllNotes(raw)
  if (!/\bAns\s+for\s+Q\s*\.?\s*\d/i.test(t) && !new RegExp(HEADING, 'i').test(t)) return t
  t = t
    .replace(ENTRY_RE, '')
    .replace(new RegExp(String.raw`\\(?:section\*?|caption)\{\s*${HEADING}\s*\}`, 'gi'), '')
    .replace(new RegExp(HEADING, 'gi'), '')
  for (let pass = 0; pass < 2; pass += 1) {
    t = t
      .replace(/\\begin\{tabular\}(?:\[[a-z]\])?\{[^{}]*\}(?:\s|&|\\\\|\\hline)*\\end\{tabular\}/g, '')
      .replace(/\\caption\{\s*\}/g, '')
      .replace(/\\begin\{table\}(?:\s|\\captionsetup\{[^{}]*\})*\\end\{table\}/g, '')
  }
  return t.replace(/\n{3,}/g, '\n\n')
}

/**
 * The key in its printed form, kept after the paper so a re-parse of the stored text still has it.
 * The page-text cleaner removes it again before any split or check reads the text.
 * @param {Map<number, string>} key
 */
export function formatStoredPrintedAnswerKey(key) {
  if (!key?.size) return ''
  const lines = [...key.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, v]) => `Ans for Q.${n}: ${String(v).replace(/[&}\\\n]/g, ' ').trim()}`)
  return `\n\n\\section*{Answers for the above questions}\n${lines.join('\n')}\n`
}

/**
 * Answer fields for one card from a printed value such as "(A), (B), and (D)" or "(6)".
 * @param {string} value
 * @param {string} questionType
 */
export function printedAnswerFields(value, questionType) {
  const v = String(value ?? '').trim()
  const type = String(questionType ?? '')
  if (type === 'integer' || type === 'numerical') {
    const num = v.match(/-?\d+(?:\.\d+)?/)
    if (!num) return null
    const n = Number(num[0])
    if (!Number.isFinite(n)) return null
    return type === 'integer' && Number.isInteger(n) ? { correctInteger: n } : { correctNumerical: n }
  }
  const letters = [...v.matchAll(/[([]\s*([A-D])\s*[)\]]/g)].map((m) => m[1].charCodeAt(0) - 65)
  const unique = [...new Set(letters)].sort((a, b) => a - b)
  if (!unique.length) return null
  if (type === 'multiple_correct') return { correctIndices: unique }
  if (unique.length !== 1) return null
  return { correctIndex: unique[0] }
}

/**
 * Put the printed key on cards by printed question number. Cards the key does not
 * name lose any guessed answer, so nothing reads "from the paper" unless it was.
 * @param {Array<Record<string, unknown>>} questions
 * @param {Map<number, string>} key
 */
export function applyPrintedAnswerKey(questions, key) {
  if (!key?.size) return questions
  const printed = (q) => Number(q?.printedNumber ?? q?.questionNumber ?? q?.pyqSlot)
  const nums = questions.map(printed).filter((n) => n > 0)
  // Numbers that restart per subject would hand one subject's key to another.
  if (new Set(nums).size !== nums.length) return questions
  return questions.map((q) => {
    const n = printed(q)
    const fields = key.has(n) ? printedAnswerFields(key.get(n), String(q?.questionType ?? '')) : null
    const next = { ...q }
    delete next.correctIndex
    delete next.correctIndices
    delete next.correctInteger
    delete next.correctNumerical
    if (!fields) return { ...next, answerSource: 'unknown' }
    return { ...next, ...fields, answerSource: 'from_paper' }
  })
}

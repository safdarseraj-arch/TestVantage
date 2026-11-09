/**
 * Final shape of a match-the-list card read from the scan (2014 P2 Q37–Q40, Q57–Q60):
 * a lowercase "(s)" row, List headings printed in the wrong place or swapped, List-II rows
 * printed as "3.1" / "4.0", and answer codes printed as a "P Q R S" table ("1 & 3 & 4 & 2",
 * "1243") instead of "P-1, Q-3, R-4, S-2". Pure functions only.
 */

const HEADING_RE = /^[ \t]*(?:\\textbf\{\s*)?(?:List|Column)[ \t]*[-–]?[ \t]*(II|I)\b[ \t]*\}?[ \t]*:?[ \t]*$/i
const LETTER_ROW_RE = /^[ \t]*(?:\(\s*([PQRST])\s*\)|([PQRST])\.(?=\s|$))/
const NUMBER_ROW_RE = /^([ \t]*)(?:\(\s*([1-5])\s*\)|([1-5])\.)([ \t]*)(.*)$/
const CODE_HEADER_RE = /^[ \t]*(?:&[ \t]*)?P[ \t&]*Q[ \t&]*R[ \t&]*S(?:[ \t&]*T)?[ \t]*$/i
const CODES_LINE_RE = /^[ \t]*Codes?[ \t]*:?[ \t]*$/i

const headingLevel = (line) => HEADING_RE.exec(line)?.[1]?.toUpperCase() || ''
const letterRow = (line) => {
  const m = LETTER_ROW_RE.exec(line)
  return m ? m[1] || m[2] : ''
}
const numberRow = (line) => {
  const m = NUMBER_ROW_RE.exec(line)
  return m ? Number(m[2] || m[3]) : 0
}

/** Index of the next non-blank line at or after `from`, or -1. */
function nextFilled(lines, from) {
  for (let k = from; k < lines.length; k += 1) if (lines[k].trim()) return k
  return -1
}

/** "(s)" / "s." beside upper-case "(P)" / "P." rows is row S. */
function upperCaseRowLetters(text) {
  if (!/^[ \t]*(?:\(\s*P\s*\)|P\.(?=\s|$))/m.test(text)) return text
  return text
    .replace(/^([ \t]*)\(\s*([qrst])\s*\)/gm, (_, space, letter) => `${space}(${letter.toUpperCase()})`)
    .replace(/^([ \t]*)([qrst])\.(?=\s|$)/gm, (_, space, letter) => `${space}${letter.toUpperCase()}.`)
}

/** "List II" over the P–S rows and "List I" over the numbered rows (2014 P2 Q60): headings swap. */
function swapReversedHeadings(lines) {
  const heads = lines.map((line, i) => (headingLevel(line) ? i : -1)).filter((i) => i >= 0)
  if (heads.length !== 2) return lines
  const [a, b] = heads
  if (headingLevel(lines[a]) !== 'II' || headingLevel(lines[b]) !== 'I') return lines
  const firstA = nextFilled(lines, a + 1)
  const firstB = nextFilled(lines, b + 1)
  if (firstA < 0 || firstB < 0 || !letterRow(lines[firstA]) || !numberRow(lines[firstB])) return lines
  const out = [...lines]
  out[a] = lines[a].replace(/II\b/i, 'I')
  out[b] = lines[b].replace(/\bI\b/i, 'II')
  return out
}

/**
 * Rows "(1)", "(2)" under List-I after its P–S rows, with "List-II" printed before row 3
 * (2014 P2 Q37): the List-II heading moves up to row 1.
 */
function moveLateListTwoHeading(lines) {
  const one = lines.findIndex((line) => headingLevel(line) === 'I')
  const two = lines.findIndex((line) => headingLevel(line) === 'II')
  if (one < 0 || two <= one) return lines
  let lastLetter = -1
  let firstNumber = -1
  let numbers = 0
  for (let k = one + 1; k < two; k += 1) {
    if (letterRow(lines[k])) {
      if (firstNumber >= 0) return lines
      lastLetter = k
    } else if (numberRow(lines[k])) {
      if (lastLetter < 0) return lines
      if (firstNumber < 0) firstNumber = k
      numbers += 1
    }
  }
  if (firstNumber < 0 || numberRow(lines[firstNumber]) !== 1) return lines
  const after = nextFilled(lines, two + 1)
  if (after < 0 || numberRow(lines[after]) !== numbers + 1) return lines
  const out = [...lines]
  const [heading] = out.splice(two, 1)
  out.splice(firstNumber, 0, heading, '')
  return out
}

/**
 * "3.1" / "4.0" / "1.1" where the List-II row number is due: the label gets its space. Beside
 * "(P)" rows (or other "(1)" rows) the label is written "(3)", so "1. Scheme I" followed by its
 * reaction pictures stays one row (2014 P2 Q38).
 */
function labelListTwoRows(lines) {
  const two = lines.findIndex((line) => headingLevel(line) === 'II')
  if (two < 0) return lines
  const bracketed =
    lines.slice(two + 1).some((line) => /^[ \t]*\(\s*[1-5]\s*\)/.test(line)) ||
    lines.slice(0, two).some((line) => /^[ \t]*\(\s*[PQRS]\s*\)/.test(line))
  const out = [...lines]
  let due = 1
  for (let k = two + 1; k < out.length; k += 1) {
    const m = NUMBER_ROW_RE.exec(out[k])
    if (!m) continue
    const n = Number(m[2] || m[3])
    if (n !== due) continue
    due += 1
    if (!m[3]) continue
    if (bracketed) out[k] = `${m[1]}(${n})${m[5] ? ` ${m[5]}` : ''}`
    else if (!m[4] && m[5]) out[k] = `${m[1]}${n}. ${m[5]}`
  }
  return out
}

const PICTURE_ROW_RE =
  /^[ \t]*\(\s*[PQRS1-5]\s*\)[ \t]*(?:\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}|!\[[^\]]*\]\(([^)]+)\))[ \t]*$/

/**
 * A row that is only a picture the card already shows above it: a second List-II copied in
 * after the real rows (2014 P2 Q38 repeated its scheme pictures as rows 2–5).
 */
function withoutRepeatedPictureRows(lines) {
  const out = []
  for (const line of lines) {
    const m = PICTURE_ROW_RE.exec(line)
    const url = m ? m[1] || m[2] : ''
    if (url && out.some((kept) => kept.includes(url))) continue
    out.push(line)
  }
  return out
}

/**
 * List text with row letters, headings and row labels put right. Text without both List
 * headings is returned unchanged.
 * @param {unknown} text
 */
export function tidyMatchListText(text) {
  const t = String(text ?? '')
  if (!/(?:^|\n)[ \t]*(?:\\textbf\{\s*)?(?:List|Column)[ \t]*[-–]?[ \t]*I/i.test(t)) return t
  let lines = upperCaseRowLetters(t).split('\n')
  lines = swapReversedHeadings(lines)
  lines = moveLateListTwoHeading(lines)
  lines = labelListTwoRows(lines)
  lines = withoutRepeatedPictureRows(lines)
  return lines.join('\n').replace(/\n{3,}/g, '\n\n')
}

const CODE_OPTION_RE = /^\(?\s*[1-5]\s*\)?(?:\s*[&,]?\s*\(?\s*[1-5]\s*\)?){3,4}$/

/**
 * Options printed as answer codes under a "P Q R S" table, written out as "P-1, Q-3, R-4, S-2".
 * null when the options are not all codes or the card has no P–S rows.
 * @param {unknown[]} options
 * @param {unknown} text
 * @returns {string[] | null}
 */
export function codeOptionsAsPairs(options, text) {
  const list = Array.isArray(options) ? options.map((o) => String(o ?? '').replace(/[$\\]/g, '').trim()) : []
  if (list.length < 2 || !list.every((o) => CODE_OPTION_RE.test(o))) return null
  const t = String(text ?? '')
  const lettersPrinted = t.split('\n').some((line) => CODE_HEADER_RE.test(line))
  if (!lettersPrinted && !/^[ \t]*(?:\(\s*S\s*\)|S\.(?=\s|$))/im.test(t)) return null
  const digits = list.map((o) => o.replace(/\D/g, ''))
  const width = digits[0].length
  if (!digits.every((d) => d.length === width)) return null
  const letters = ['P', 'Q', 'R', 'S', 'T'].slice(0, width)
  return digits.map((d) => letters.map((letter, i) => `${letter}-${d[i]}`).join(', '))
}

/** The card text without the "P Q R S" code-table heading and a bare "Codes:" line. */
export function withoutCodeTableHeading(text) {
  const lines = String(text ?? '').split('\n')
  const kept = lines.filter((line) => !CODE_HEADER_RE.test(line) && !CODES_LINE_RE.test(line))
  return kept.length === lines.length ? String(text ?? '') : kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * A card with its lists and answer codes in final shape. The same object when nothing changes.
 * @template T
 * @param {T & { text?: unknown, options?: unknown[] }} q
 * @returns {T}
 */
export function tidyMatchListCard(q) {
  if (!q || typeof q !== 'object') return q
  const text = tidyMatchListText(q.text)
  const pairs = codeOptionsAsPairs(q.options, text)
  const finalText = pairs ? withoutCodeTableHeading(text) : text
  if (finalText === String(q.text ?? '') && !pairs) return q
  return { ...q, text: finalText, ...(pairs ? { options: pairs } : {}) }
}

/**
 * Printed keys the single answer fields cannot hold:
 * - "0.5 OR 0.75", "[75 to 79] OR [94 to 95]": either answer scores (numericalAlternatives).
 * - "ABCD or BCD" on a one-or-more-correct question: either option set scores (correctIndicesAlternatives).
 * - "MARKS TO ALL": a bonus question, full marks to every candidate (bonusMarksToAll).
 */

const NUM = String.raw`-?\d+(?:\.\d+)?`
const PART_RE = new RegExp(String.raw`^\[?\s*(${NUM})\s*(?:(?:to|–|—)\s*(${NUM})\s*)?\]?$`, 'i')

/** "MARKS TO ALL" printed where the key would be (2025 P2 Q20). */
export const BONUS_MARKS_TO_ALL_RE =
  /(?:^|\n)[ \t]*(?:\\section\*?\{\s*)?(?:(?:FULL\s+)?MARKS\s+(?:AWARDED\s+)?TO\s+ALL|BONUS(?:\s+QUESTION)?)[ \t]*\}?[ \t]*(?=\n|$)/i

/**
 * One numeric answer: "6", "0.75" or a band "[0.7 to 0.8]" (value ± tolerance).
 * @param {string} part
 * @returns {{ value: number, tolerance?: number } | null}
 */
export function parseNumericAnswer(part) {
  const m = String(part ?? '').trim().replace(/\.$/, '').match(PART_RE)
  if (!m) return null
  const low = Number(m[1])
  if (m[2] == null) return Number.isFinite(low) ? { value: low } : null
  const high = Number(m[2])
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) return null
  return {
    value: Number(((low + high) / 2).toFixed(6)),
    tolerance: Number(((high - low) / 2).toFixed(6)),
  }
}

/**
 * Two or more numeric answers joined by OR. Null when it is not that shape.
 * @param {string} text
 */
export function parseNumericAnswerChoices(text) {
  const parts = String(text ?? '').split(/\s+OR\s+/i)
  if (parts.length < 2) return null
  const choices = parts.map(parseNumericAnswer)
  return choices.every(Boolean) ? /** @type {{ value: number, tolerance?: number }[]} */ (choices) : null
}

/**
 * Card fields for "a OR b": the first answer in the usual fields, the rest as alternatives.
 * @param {{ value: number, tolerance?: number }[]} choices
 */
export function numericChoiceFields(choices) {
  const [first, ...rest] = choices
  return {
    correctNumerical: first.value,
    ...(first.tolerance != null ? { numericalTolerance: first.tolerance } : {}),
    numericalAlternatives: rest.map((c) => (c.tolerance != null ? { value: c.value, tolerance: c.tolerance } : { value: c.value })),
  }
}

/** @param {{ value: number, tolerance?: number }} choice */
export function formatNumericChoice(choice) {
  const v = Number(choice?.value)
  const t = Number(choice?.tolerance)
  if (Number.isFinite(t) && t > 0) return `${Number((v - t).toFixed(6))} to ${Number((v + t).toFixed(6))}`
  return String(v)
}

/** @param {any} q */
export function numericalAlternativesOf(q) {
  return (Array.isArray(q?.numericalAlternatives) ? q.numericalAlternatives : []).filter((c) =>
    Number.isFinite(Number(c?.value)),
  )
}

const LETTER_GROUP_RE = /^\(?[A-H]\)?(?:\s*(?:,|&|and)?\s*\(?[A-H]\)?)*$/i

/**
 * Two or more option-letter sets joined by OR ("ABCD or BCD", "(A), (C) or (A)"), each as sorted
 * 0-based indices. Null when it is not that shape.
 * @param {string} text
 * @returns {number[][] | null}
 */
export function parseLetterAnswerChoices(text) {
  const parts = String(text ?? '').trim().split(/\s+OR\s+/i)
  if (parts.length < 2) return null
  const sets = []
  for (const part of parts) {
    const p = part.trim()
    if (!LETTER_GROUP_RE.test(p)) return null
    const letters = p.replace(/\band\b/gi, ' ').toUpperCase().match(/[A-H]/g) || []
    sets.push([...new Set(letters.map((l) => l.charCodeAt(0) - 65))].sort((a, b) => a - b))
  }
  return sets
}

/** @param {any} q @returns {number[][]} */
export function letterAlternativesOf(q) {
  return (Array.isArray(q?.correctIndicesAlternatives) ? q.correctIndicesAlternatives : [])
    .filter((set) => Array.isArray(set) && set.length && set.every((i) => Number.isInteger(Number(i)) && Number(i) >= 0))
    .map((set) => set.map(Number))
}

/** @param {number[]} set */
export function formatLetterChoice(set) {
  return set.map((i) => String.fromCharCode(65 + Number(i))).join(', ')
}

/**
 * Does n match the main numeric answer or any printed alternative?
 * Band edges: 0.33 - 0.30 is a hair above 0.03 in floating point.
 * @param {any} q
 * @param {number} n
 * @param {number} [defaultTol]
 */
export function numericAnswerMatches(q, n, defaultTol = 0.01) {
  const near = (value, tol) => Math.abs(n - Number(value)) <= Number(tol ?? defaultTol) + 1e-9
  const main = q?.correctNumerical ?? q?.correctInteger
  if (main != null && near(main, q?.correctNumerical != null ? q?.numericalTolerance : 0)) return true
  return numericalAlternativesOf(q).some((c) => near(c.value, c.tolerance ?? defaultTol))
}

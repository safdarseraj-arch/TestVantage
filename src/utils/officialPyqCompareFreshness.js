/**
 * A "Compare with original paper" report judges the card wording it was run on.
 * Once that wording changes (re-parse, count rebuild, a fix, approve), the report
 * describes a card that no longer exists and must not be shown or acted on.
 */

/** Fingerprint of the wording a compare judged. @param {any} card */
export function officialPyqCompareCardKey(card) {
  const raw = JSON.stringify([
    String(card?.text ?? ''),
    String(card?.passageText ?? ''),
    (Array.isArray(card?.options) ? card.options : []).map((o) => String(o ?? '')),
  ])
  let h = 0
  for (let i = 0; i < raw.length; i += 1) h = (Math.imul(h, 31) + raw.charCodeAt(i)) | 0
  return `${raw.length}:${(h >>> 0).toString(36)}`
}

/** @param {unknown} text */
function wordsOf(text) {
  return new Set(
    String(text ?? '')
      .replace(/<smiles>[\s\S]*?<\/smiles>/gi, ' ')
      .replace(/\\[a-zA-Z]+/g, ' ')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  )
}

/** Share of the suggested words already on the card, or null when either side is too short to tell. */
function suggestionCoverage(card, compare) {
  const list = (v) => (Array.isArray(v) ? v.map((o) => String(o ?? '')).join(' ') : '')
  const theirs = wordsOf(
    `${compare?.suggestedPassage ?? ''} ${compare?.suggestedText ?? ''} ${list(compare?.suggestedOptions)}`,
  )
  const mine = wordsOf(`${card?.passageText ?? ''} ${card?.text ?? ''} ${list(card?.options)}`)
  if (theirs.size < 6 || !mine.size) return null
  let same = 0
  for (const w of theirs) if (mine.has(w)) same += 1
  return same / theirs.size
}

/**
 * Whether the card's stored compare report still describes this card.
 * Reports saved with a fingerprint must match it. Older reports have none, so a
 * "differs" report counts as stale when the card already reads like the suggested
 * original (fixed since), when the suggestion is a different question and the
 * quality check no longer flags the card (the card moved), or when it names no
 * difference and suggests nothing.
 * @param {any} card
 * @param {{ flagged?: boolean }} [opts] flagged: the local quality check flags this card now
 */
export function officialPyqCompareIsCurrent(card, opts = {}) {
  const compare = card?.originalCompare
  if (!compare || typeof compare !== 'object') return false
  if (compare.cardKey) return compare.cardKey === officialPyqCompareCardKey(card)
  if (compare.verdict !== 'differs') return true
  const coverage = suggestionCoverage(card, compare)
  if (coverage != null && coverage >= 0.85) return false
  if (coverage != null && coverage <= 0.25 && !opts.flagged) return false
  const saysSomething =
    (Array.isArray(compare.differences) && compare.differences.length > 0) ||
    Boolean(String(compare.suggestedText ?? '').trim()) ||
    (Array.isArray(compare.suggestedOptions) && compare.suggestedOptions.some((o) => String(o ?? '').trim()))
  return saysSomething
}

/**
 * The card's compare report, or null when it no longer describes the card.
 * @param {any} card @param {{ flagged?: boolean }} [opts]
 */
export function officialPyqCurrentCompare(card, opts = {}) {
  return officialPyqCompareIsCurrent(card, opts) ? card.originalCompare : null
}

/**
 * Cards with stale compare reports removed; the same array when nothing was stale.
 * @param {any[]} questions
 * @param {Iterable<number>} [flaggedGoTo] 1-based numbers the local check flags now
 */
export function dropStaleOfficialPyqCompares(questions, flaggedGoTo = []) {
  if (!Array.isArray(questions)) return questions
  const flagged = new Set(Array.from(flaggedGoTo ?? [], Number))
  let changed = false
  const out = questions.map((q, i) => {
    if (!q?.originalCompare || officialPyqCompareIsCurrent(q, { flagged: flagged.has(i + 1) })) return q
    changed = true
    const next = { ...q }
    delete next.originalCompare
    return next
  })
  return changed ? out : questions
}

/**
 * Which official card each institute entry belongs to. Institutes often number their copy in
 * their own way (1–54 straight through, Chemistry first, another set's order), so an entry that
 * repeats its question is matched by wording and numbers, one entry per card; the printed number
 * only adds a small bonus. An entry without question text (answer key only) is matched by number,
 * and only while the numbers agree with the wording matches. A match not clearly better than the
 * next candidate is reported as unsure — unless the printed number also points at the same card,
 * in which case it is applied so an institute upload keeps the maximum solutions. No Gemini.
 */
import { endSectionEntriesForCards } from './printedEndSolutions.js'

const SURE_SCORE = 0.5
const MIN_SCORE = 0.3
const SURE_MARGIN = 0.1
const NUMBER_BONUS = 0.03
const SUBJECT_PENALTY = 0.3
const TYPE_PENALTY = 0.15
/** Share of wording matches whose printed number points at the same card, for numbers to be trusted. */
const NUMBER_TRUST = 0.8

const OPTION_SURE = 0.6
const OPTION_MARGIN = 0.15

const STOP_WORDS = new Set(
  (
    'the and for with that are from its this these those which what when where then than there their ' +
    'into onto has have had been being was were will would can could shall should may might also such ' +
    'following given find value correct statement statements option options choose each any all not ' +
    'frac left right mathrm mathbf mathit text textbf textit operatorname times cdot quad qquad prime ' +
    'circ displaystyle limits array begin end item hline'
  ).split(' '),
)
const FORMAT_RE = /\\(?:mathrm|mathbf|mathit|mathsf|mathbb|mathcal|text|textbf|textit|textrm|operatorname|boldsymbol)\s*\{([^{}]*)\}/g
const PICTURE_RE = /\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}|!\[[^\]]*\]\([^)]*\)|https?:\/\/\S+/g
const OPTION_LABEL_RE = /(^|\s)\(\s*(?:[A-Da-d]|[1-4])\s*\)/g
const MATH_RE = /\$\$?([^$]+)\$\$?|\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g
const LETTERS = 'ABCDEFGH'

function subjectName(raw) {
  const s = String(raw ?? '').toLowerCase()
  if (/^math/.test(s)) return 'mathematics'
  return ['physics', 'chemistry', 'biology'].includes(s) ? s : ''
}

function unwrap(text) {
  let s = String(text ?? '')
    .replace(PICTURE_RE, ' ')
    .replace(/\\(?:begin|end)\{[^}]*\}|\\item\b(?:\s*\[[^\]]*\])?/g, ' ')
  for (let k = 0; k < 3; k += 1) s = s.replace(FORMAT_RE, '$1')
  return s
}

/**
 * Words (stop words and LaTeX layout left out), numbers, chemical formulae as Mathpix spells them
 * in either PDF ("\mathrm{Al}_{2} \mathrm{O}_{3}" and "Al_2O_3" are both "al2o3"), and each maths
 * expression without its spacing — a maths question may have hardly any words.
 * @param {unknown} text
 */
export function matchTokensOf(text) {
  const s = unwrap(text)
  /** @type {Set<string>} */
  const words = new Set()
  for (const m of s.matchAll(MATH_RE)) {
    const compact = String(m[1] ?? m[2] ?? m[3] ?? '').replace(/\\[,;:! ]|[\s{}_~]/g, '')
    for (const f of compact.match(/(?:[A-Z][a-z]?\d*){2,}/g) || []) words.add(`=${f.toLowerCase()}`)
    if (compact.length >= 3 && /[a-z]/i.test(compact) && /[=+\-*/^()<>]/.test(compact)) words.add(`~${compact.toLowerCase()}`)
  }
  const plain = s
    .replace(OPTION_LABEL_RE, ' ')
    .replace(/\\([a-zA-Z]+)/g, ' $1 ')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
  for (const w of plain.toLowerCase().match(/[a-z]{3,}/g) || []) if (!STOP_WORDS.has(w)) words.add(w)
  const numbers = new Set((plain.match(/\d+(?:\.\d+)?/g) || []).map((n) => String(Number(n))))
  return { words, numbers }
}

/** @param {{ words: Set<string>, numbers: Set<string> }} t */
function hasQuestionText(t) {
  return t.words.size >= 4 || (t.words.size >= 2 && t.numbers.size >= 2)
}

/** @param {Set<string>} a @param {Set<string>} b */
function dice(a, b) {
  if (!a.size && !b.size) return null
  let both = 0
  for (const x of a) if (b.has(x)) both += 1
  return (2 * both) / (a.size + b.size)
}

/** How alike two questions read, 0…1: wording and numbers weigh the same. */
function textScore(a, b) {
  const w = dice(a.words, b.words) ?? 0
  const n = dice(a.numbers, b.numbers)
  if (n == null) return w
  if (!a.numbers.size || !b.numbers.size) return w * 0.85
  return 0.5 * w + 0.5 * n
}

function cardText(q) {
  return [
    q?.text ?? q?.stem,
    ...(Array.isArray(q?.options) ? q.options : []),
    ...(Array.isArray(q?.matrixRows) ? q.matrixRows : []),
    ...(Array.isArray(q?.matrixCols) ? q.matrixCols : []),
  ]
    .map((part) => String(part ?? ''))
    .join('\n')
}

/** 'choice' for option letters, 'number' for a value, '' when unknown ("3" may name option 3). @param {unknown} answer */
function answerKind(answer) {
  const a = String(answer ?? '').trim()
  if (!a || /^[1-4]$/.test(a)) return ''
  return /^[A-H](?:, [A-H])*$/.test(a) ? 'choice' : 'number'
}

function cardKind(q) {
  const filled = (Array.isArray(q?.options) ? q.options : []).filter((o) => String(o ?? '').trim()).length
  if (Array.isArray(q?.matrixRows) && q.matrixRows.length) return ''
  return filled >= 2 ? 'choice' : 'number'
}

/** "Chemistry Q.12" for a subject entry, "Q.12" for a numbered one. @param {string} key */
export function instituteEntryLabel(key) {
  const at = String(key).lastIndexOf(':')
  const head = String(key).slice(0, at)
  const n = String(key).slice(at + 1)
  return head && !head.startsWith('#') ? `${head[0].toUpperCase()}${head.slice(1)} Q.${n}` : `Q.${n}`
}

/**
 * @typedef {{ answer: string, solution: string, question: string }} InstituteEntry
 * @typedef {{ key: string, label: string, entry: InstituteEntry, how: 'content' | 'number', score?: number }} InstituteMatch
 */

/**
 * One institute entry per card (cards with a printed number filled in).
 * @param {any[]} cards
 * @param {{ entries: Map<string, InstituteEntry>, subjects: string[] }} read
 * @param {{ skip?: (q: any) => boolean }} [opts] cards that take nothing (placeholders, empty cards)
 * @returns {{
 *   matches: Array<InstituteMatch | null>,
 *   unsure: Array<{ card: number, key: string, label: string, entry: InstituteEntry, score: number }>,
 *   unmatched: string[],
 *   byContent: number,
 *   byNumber: number,
 *   numbersAgree: boolean,
 * }}
 */
export function matchInstituteEntries(cards, read, opts = {}) {
  const list = Array.isArray(cards) ? cards : []
  const skip = (q) => !q || typeof q !== 'object' || Boolean(opts.skip?.(q))
  const entries = [...(read?.entries ?? new Map())].map(([key, entry]) => {
    const head = key.slice(0, key.lastIndexOf(':'))
    return {
      key,
      entry,
      label: instituteEntryLabel(key),
      subject: head.startsWith('#') ? '' : subjectName(head),
      tokens: matchTokensOf(entry.question),
      kind: answerKind(entry.answer),
    }
  })

  const byNumberFound = endSectionEntriesForCards(list, read)
  /** @type {Map<string, number>} */
  const numberCardOf = new Map()
  byNumberFound.forEach((found, i) => {
    if (!found || skip(list[i])) return
    for (const k of found.keys) if (!numberCardOf.has(k)) numberCardOf.set(k, i)
  })

  const candidates = list.map((q, i) =>
    skip(q) ? null : { i, tokens: matchTokensOf(cardText(q)), subject: subjectName(q.subject), kind: cardKind(q) },
  )
  const textual = entries.filter((e) => hasQuestionText(e.tokens))
  const scores = textual.map((e) =>
    candidates.map((c) => {
      if (!c) return -1
      let s = textScore(e.tokens, c.tokens)
      if (e.subject && c.subject && e.subject !== c.subject) s -= SUBJECT_PENALTY
      if (e.kind && c.kind && e.kind !== c.kind) s -= TYPE_PENALTY
      if (numberCardOf.get(e.key) === c.i) s += NUMBER_BONUS
      return s
    }),
  )

  /** @type {Array<{ a: number, b: number, s: number }>} */
  const pairs = []
  scores.forEach((row, a) => row.forEach((s, b) => s >= MIN_SCORE && pairs.push({ a, b, s })))
  pairs.sort((x, y) => y.s - x.s || x.a - y.a || x.b - y.b)
  const cardOf = textual.map(() => -1)
  const entryOf = list.map(() => -1)
  for (const p of pairs) {
    if (cardOf[p.a] >= 0 || entryOf[p.b] >= 0) continue
    cardOf[p.a] = p.b
    entryOf[p.b] = p.a
  }
  const own = (a) => (cardOf[a] >= 0 ? scores[a][cardOf[a]] : -1)
  // A near-tied rival counts unless it is clearly explained by its own match.
  const sure = (a, b) => {
    const s = scores[a][b]
    if (s < SURE_SCORE) return false
    for (let c = 0; c < list.length; c += 1) {
      if (c === b || scores[a][c] < 0) continue
      const holder = entryOf[c]
      if (holder >= 0 && scores[holder][c] >= scores[a][c] + SURE_MARGIN) continue
      if (scores[a][c] > s - SURE_MARGIN) return false
    }
    for (let e = 0; e < textual.length; e += 1) {
      if (e === a) continue
      if (cardOf[e] >= 0 && own(e) >= scores[e][b] + SURE_MARGIN) continue
      if (scores[e][b] > s - SURE_MARGIN) return false
    }
    return true
  }

  /** @type {Array<InstituteMatch | null>} */
  const matches = list.map(() => null)
  /** @type {Array<{ card: number, key: string, label: string, entry: InstituteEntry, score: number }>} */
  const unsure = []
  const used = new Set()
  let agree = 0
  textual.forEach((e, a) => {
    const b = cardOf[a]
    if (b < 0) return
    const score = Number(scores[a][b].toFixed(3))
    const numberAgrees = numberCardOf.get(e.key) === b
    // Wording alone is fuzzy, but the printed number points here → keep the institute solution.
    if (!sure(a, b) && !numberAgrees) {
      unsure.push({ card: b, key: e.key, label: e.label, entry: e.entry, score })
      return
    }
    matches[b] = {
      key: e.key,
      label: e.label,
      entry: e.entry,
      how: sure(a, b) ? 'content' : 'content+number',
      score,
    }
    used.add(e.key)
    if (numberAgrees) agree += 1
  })
  const byContent = matches.filter(Boolean).length
  const numbersAgree = byContent < 3 || agree / byContent >= NUMBER_TRUST

  const textKeys = new Set(textual.map((e) => e.key))
  const unsureCards = new Set(unsure.map((u) => u.card))
  let byNumber = 0
  if (numbersAgree) {
    byNumberFound.forEach((found, i) => {
      if (!found || matches[i] || skip(list[i])) return
      // Unsure wording that is the same entry the numbers pick → apply it (max institute sols).
      if (unsureCards.has(i)) {
        const guess = unsure.find((u) => u.card === i)
        if (!guess || !found.keys.includes(guess.key)) return
        matches[i] = {
          key: guess.key,
          label: guess.label,
          entry: guess.entry,
          how: 'number',
          score: guess.score,
        }
        used.add(guess.key)
        byNumber += 1
        return
      }
      if (found.keys.some((k) => textKeys.has(k) || used.has(k))) return
      found.keys.forEach((k) => used.add(k))
      matches[i] = { key: found.keys[0], label: instituteEntryLabel(found.keys[0]), entry: found, how: 'number' }
      byNumber += 1
    })
  }
  // Drop unsure rows that were promoted to matches above.
  for (let i = unsure.length - 1; i >= 0; i -= 1) {
    if (matches[unsure[i].card]) unsure.splice(i, 1)
  }
  const unsureKeys = new Set(unsure.map((u) => u.key))
  const unmatched = entries.filter((e) => !used.has(e.key) && !unsureKeys.has(e.key)).map((e) => e.label)
  return { matches, unsure, unmatched, byContent, byNumber, numbersAgree }
}

/**
 * The options printed in the institute's copy of a question ("(A) … (B) …", "(1) … (4)" or a
 * \begin{enumerate} list), or null.
 * @param {unknown} question
 * @returns {string[] | null}
 */
export function instituteOptionsOf(question) {
  const text = String(question ?? '')
  const env = text.match(/\\begin\{(?:enumerate|itemize)\}([\s\S]*?)\\end\{(?:enumerate|itemize)\}/)
  if (env) {
    // Prefer labelled items "\item[(1)] …" / "\item[(A)] …" so a missing (1) still lands in the right slot.
    /** @type {(string | null)[]} */
    const byLabel = []
    let labelled = 0
    for (const m of env[1].matchAll(/\\item\s*\[\s*\(\s*([A-Da-d]|[1-4])\s*\)\s*\]\s*([\s\S]*?)(?=\\item\b|\\end\{|$)/g)) {
      const idx = /\d/.test(m[1]) ? Number(m[1]) - 1 : m[1].toUpperCase().charCodeAt(0) - 65
      if (idx < 0 || idx > 3) continue
      byLabel[idx] = String(m[2] ?? '')
        .replace(/\\end\{(?:itemize|enumerate)\}\s*$/i, '')
        .trim()
      labelled += 1
    }
    if (labelled >= 2) {
      const out = [0, 1, 2, 3].map((i) => String(byLabel[i] ?? '').trim())
      // Keep empty slots so Ans. (2)/(3)/(4) still map to the right index when Mathpix skipped (1).
      if (out.filter(Boolean).length >= 2) return out
    }
    const items = env[1]
      .split(/\\item\b(?:\s*\[[^\]]*\])?/)
      .slice(1)
      .map((s) =>
        s
          .replace(/\\end\{(?:itemize|enumerate)\}\s*$/i, '')
          .trim(),
      )
      .filter(Boolean)
    if (items.length >= 2 && items.length <= 5) return items
  }
  /** @type {RegExpMatchArray[]} */
  let run = []
  let digits = false
  // Trailing [ \t]* only — do not let \s* eat the newline before the next "(2)" / "(B)".
  for (const m of text.matchAll(/(^|[\s$])\(\s*([A-Da-d]|[1-4])\s*\)[ \t]*/g)) {
    const isDigit = /\d/.test(m[2])
    const idx = isDigit ? Number(m[2]) - 1 : m[2].toUpperCase().charCodeAt(0) - 65
    if (idx < 0 || idx > 3) continue
    if (idx === 0) {
      // Mid-line "(A)" / "(R)" inside Assertion–Reason choice text must not smash a (1)–(4) run.
      if (digits && run.length >= 1 && !isDigit) continue
      run = [m]
      digits = isDigit
    } else if (run.length && idx === run.length && isDigit === digits) {
      run.push(m)
    }
  }
  if (run.length < 2) return null
  return run.map((m, k) => {
    const from = /** @type {number} */ (m.index) + m[0].length
    const to = k + 1 < run.length ? /** @type {number} */ (run[k + 1].index) : text.length
    return text.slice(from, to).trim()
  })
}

function optionCompact(s) {
  return unwrap(s)
    .replace(/\\\(|\\\)|\\\[|\\\]/g, '')
    .replace(/\\[,;:! ]|\\(?:left|right|quad|qquad|displaystyle)\b/g, '')
    .replace(/\\([a-zA-Z]+)/g, '$1')
    .replace(/[\s$~{}]/g, '')
    .replace(/[.;,]+$/, '')
    .toLowerCase()
}

function optionScore(a, b) {
  const x = optionCompact(a)
  const y = optionCompact(b)
  if (!x || !y) return 0
  if (x === y) return 1
  return dice(new Set(x.match(/[a-z]+|\d+(?:\.\d+)?/g) || []), new Set(y.match(/[a-z]+|\d+(?:\.\d+)?/g) || [])) ?? 0
}

/**
 * Where the institute's options sit among the card's, by option text.
 * `{ same: true }` when the order is the card's, or the copy has no options to judge;
 * `{ order }` (institute index → card index) when shuffled and every option is placed;
 * null when the options do not line up.
 * @param {unknown} question institute copy @param {unknown} cardOptions
 * @returns {{ same: true } | { order: number[] } | null}
 */
export function instituteOptionOrder(question, cardOptions) {
  const inst = instituteOptionsOf(question)
  const own = (Array.isArray(cardOptions) ? cardOptions : []).map((o) => String(o ?? ''))
  if (!inst || own.filter((o) => o.trim()).length < 2) return { same: true }
  const judged = inst.filter((o) => optionCompact(o)).length
  if (judged < 2) return { same: true }
  const s = inst.map((a) => own.map((b) => optionScore(a, b)))
  const order = inst.map((_, i) => {
    const row = s[i]
    const j = row.indexOf(Math.max(...row))
    if (row[j] < OPTION_SURE) return -1
    const rivalInRow = row.some((v, k) => k !== j && v > row[j] - OPTION_MARGIN)
    const rivalInCol = s.some((r, k) => k !== i && r[j] > row[j] - OPTION_MARGIN)
    return rivalInRow || rivalInCol ? -1 : j
  })
  const placed = order.filter((j) => j >= 0).length
  if (!order.some((j, i) => j >= 0 && j !== i)) return placed * 2 >= judged ? { same: true } : null
  if (inst.length !== own.length) return null
  const free = own.map((_, j) => j).filter((j) => !order.includes(j))
  const open = order.map((j, i) => (j < 0 ? i : -1)).filter((i) => i >= 0)
  if (open.length === 1 && free.length === 1) order[open[0]] = free[0]
  return order.every((j) => j >= 0) && new Set(order).size === order.length ? { order } : null
}

/**
 * The institute's option answer in the card's order ("C" → "A", "(3)" read as option 3); ''
 * when an option has no place.
 * @param {string} answer normalised ("A, C" or "3") @param {number[]} order
 */
export function mapInstituteAnswerLetters(answer, order) {
  const a = String(answer ?? '').trim()
  const letters = /^[1-4]$/.test(a) ? [LETTERS[Number(a) - 1]] : a.match(/[A-H]/g) || []
  if (!letters.length) return ''
  const mapped = letters.map((l) => order[LETTERS.indexOf(l)])
  if (mapped.some((j) => !(j >= 0))) return ''
  return [...new Set(mapped)]
    .sort((x, y) => x - y)
    .map((j) => LETTERS[j])
    .join(', ')
}

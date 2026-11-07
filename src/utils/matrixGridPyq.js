/**
 * Matrix-match grid questions (JEE Advanced / IIT-JEE 2006–2015): Column I has rows
 * (A)–(D), Column II has entries (P)–(T), and each row may match one or more entries.
 * There are no (A)–(D) options; the answer is a grid of ticks on the ORS.
 *
 * Cards keep the bank's grid shape: questionType 'matrix_match', matrixResponseMode 'grid',
 * matrixRows, matrixCols, matrixColLabels and matrixAnswerKey (row index → column indexes).
 * matrixAnswerAlternates holds other column sets the printed key also accepts ("(R) OR (R) and (T)").
 * matrixMarking { perRow, correct, wrong, unattempted } is the section's printed scheme.
 */

export const MATRIX_GRID_FACT_TYPE = 'matrix_grid'
export const MATRIX_GRID_DEFAULT_ROWS = 4
export const MATRIX_GRID_DEFAULT_COLS = 5

/** @param {any} q */
export function isMatrixGridCard(q) {
  return q?.questionType === 'matrix_match' && q?.matrixResponseMode === 'grid'
}

/** Card fields that make up a grid question (lists, key, marking). */
export const MATRIX_GRID_FIELDS = [
  'matrixResponseMode',
  'matrixRows',
  'matrixCols',
  'matrixColLabels',
  'matrixColCount',
  'matrixAnswerKey',
  'matrixAnswerAlternates',
  'matrixMarking',
]

/** Grid fields of a card, set to undefined when the card has none. @param {any} q */
export function gridFieldsOf(q) {
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const field of MATRIX_GRID_FIELDS) out[field] = q?.[field]
  if (isMatrixGridCard(q)) out.questionType = q.questionType
  return out
}

/** The paper-facts type of a card ('matrix_grid' for grid cards). @param {any} q */
export function factTypeOfCard(q) {
  return isMatrixGridCard(q) ? MATRIX_GRID_FACT_TYPE : String(q?.questionType || '')
}

/**
 * Card fields for a paper-facts type. A grid slot is a 'matrix_match' card in grid mode;
 * any other type drops the grid mode so an options card is never read as a grid.
 * @param {string} type
 */
export function cardTypeFieldsForFactType(type) {
  if (type === MATRIX_GRID_FACT_TYPE) return { questionType: 'matrix_match', matrixResponseMode: 'grid' }
  return { questionType: type }
}

/**
 * Put a facts type on a card. Leaving a grid slot removes the grid mode.
 * @param {any} q
 * @param {string} type
 */
export function withFactType(q, type) {
  const next = { ...q, ...cardTypeFieldsForFactType(type) }
  if (type !== MATRIX_GRID_FACT_TYPE && next.matrixResponseMode === 'grid') delete next.matrixResponseMode
  return next
}

const WORD = { two: 2, three: 3, four: 4, five: 5, six: 6 }

/** Instruction wording only a grid (many-to-many) section prints. */
const GRID_WORDING_RE = new RegExp(
  [
    String.raw`one\s+or\s+more\s+entr(?:y|ies)\s+in\s+column\s*[-–]?\s*I\b[^.\n]{0,60}?\bmay\s+match`,
    String.raw`darken\s+the\s+bubbles?\s+of\s+all\s+the\s+matching\s+entr`,
    String.raw`can\s+have\s+correct\s+matching\s+with\s+one\s+or\s+more\s+statement`,
    String.raw`\b\d\s*\$?\s*(?:×|\\times|x)\s*\$?\s*\d\s*\$?\s+matrix\b`,
  ].join('|'),
  'i',
)

const SECTION_START_RE =
  /This\s+section\s+contains|\\section\*?\{\s*(?:SECTION\s*[-–]?\s*\d|PART\b|Answers?\s+for\s+the\s+above)|(?:^|\n)[ \t]*(?:SECTION\s*[-–]?\s*\d|PART\s+[IVX]+\s*:)/gi

/** "Column I" / "Column II" on a line of its own (a heading), not "given in column I with". */
const COLUMN_HEADING_RE =
  /(?:^|\n)[ \t]*(?:\\section\*?\{\s*)?(?:\\textbf\{\s*)?Column\s*[-–]?\s*(II|I|2|1)\b\s*\}?\s*\}?[ \t]*(?=\n|$)/gi

const Q_MARKER_RE = /\\item\s*\[\s*Q\.?\s*\]\s*(\d{1,3})(?!\d)|\\item\s*\[\s*Q\.?\s*(\d{1,3})\s*\]|(?<![A-Za-z\\])Q\s*\.\s*(\d{1,3})(?!\d)/g

const ANSWER_LINE_RE =
  /(?:\\item\s*\[\s*)?\(\s*([A-D])\s*\)\s*\]?\s*Match(?:es)?\s+(?:to|with)\s+([^\n]*)/gi

const ITEM_RE = /\\item\s*\[\s*\(?\s*([A-Za-z]|\d)\s*\)?\s*\]|(?:^|\n)[ \t]*\(\s*([A-Za-z]|\d)\s*\)(?=[ \t])/g

/** @param {RegExp} re @param {string} src */
function matchesOf(re, src) {
  re.lastIndex = 0
  return [...src.matchAll(re)]
}

function markerNumber(m) {
  return Number(m[1] || m[2] || m[3]) || 0
}

function cleanPiece(text) {
  return String(text ?? '')
    .replace(/\\(?:begin|end)\{(?:itemize|enumerate)\}/g, '\n')
    .replace(/(?:^|\n)[ \t]*END\s+OF\s+(?:THE\s+)?(?:PART|QUESTION\s+PAPER)[^\n]*/gi, '\n')
    .replace(/\\section\*?\{\s*(?:Space\s+for\s+rough\s+work)?\s*\}/gi, '\n')
    .replace(/(?:^|\n)[ \t]*Space\s+for\s+rough\s+work[ \t]*(?=\n|$)/gi, '\n')
    .replace(/^\s*(?:\\quad\s*)+/, '')
    .replace(/^\s*\$\s*(?:\\quad\s*)+/, '$')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Items of one list: `\item[(A)] …` or `(A) …` at a line start.
 * @param {string} block
 * @returns {{ label: string, text: string }[]}
 */
function listItems(block) {
  const src = String(block ?? '')
  const marks = matchesOf(ITEM_RE, src)
  return marks.map((m, i) => {
    const start = (m.index ?? 0) + m[0].length
    const end = i + 1 < marks.length ? marks[i + 1].index ?? src.length : src.length
    return { label: String(m[1] || m[2] || ''), text: cleanPiece(src.slice(start, end)) }
  })
}

/** "four entries (A)…" / "4 × 5 matrix" → grid size. */
function gridSize(instructions) {
  const t = String(instructions ?? '')
  const n = (w) => WORD[String(w).toLowerCase()] || Number(w) || 0
  const dims = t.match(/\b(\d)\s*\$?\s*(?:×|\\times|x)\s*\$?\s*(\d)\s*\$?\s+matrix/i)
  const rowsWord = t.match(/Column\s*[-–]?\s*I\s+has\s+([A-Za-z]+|\d)\s+(?:entries|statements|items)/i)
  const colsWord = t.match(/Column\s*[-–]?\s*II\s+has\s+([A-Za-z]+|\d)\s+(?:entries|statements|items)/i)
  return {
    rows: n(rowsWord?.[1] || '') || Number(dims?.[1]) || MATRIX_GRID_DEFAULT_ROWS,
    cols: n(colsWord?.[1] || '') || Number(dims?.[2]) || MATRIX_GRID_DEFAULT_COLS,
  }
}

/**
 * The printed marking for a grid section, when it is given per Column I entry.
 * "+2 If only the bubble(s) … 0 If none … -1 In all other cases".
 * @param {string} instructions
 */
export function readMatrixGridMarking(instructions) {
  const t = String(instructions ?? '')
  if (!/for\s+each\s+(?:entry|row|statement)\s+in\s+column\s*[-–]?\s*I\b/i.test(t)) return null
  const correct = t.match(/\+\s*(\d+)\s*(?:marks?\s*)?(?:\\?\]\s*)?If\s+only\s+the\s+bubble/i)
  const wrong = t.match(/[-−–]\s*(\d+)\s*(?:marks?\s*)?(?:\\?\]\s*)?In\s+all\s+other\s+cases/i)
  if (!correct) return null
  return {
    perRow: true,
    correct: Number(correct[1]),
    wrong: wrong ? -Number(wrong[1]) : 0,
    unattempted: 0,
  }
}

/**
 * Sections of the scan whose instructions describe a grid answer.
 * @param {string} src
 */
function gridSpans(src) {
  const starts = matchesOf(SECTION_START_RE, src).map((m) => m.index ?? 0)
  const bounds = [...new Set([...starts, src.length])].sort((a, b) => a - b)
  const spans = []
  for (let i = 0; i + 1 < bounds.length; i += 1) {
    const start = bounds[i]
    const end = bounds[i + 1]
    const body = src.slice(start, end)
    const firstHeading = matchesOf(COLUMN_HEADING_RE, body)[0]
    const firstMarker = matchesOf(Q_MARKER_RE, body)[0]
    const instrEnd = Math.min(
      firstHeading ? firstHeading.index ?? body.length : body.length,
      firstMarker ? firstMarker.index ?? body.length : body.length,
    )
    const instructions = body.slice(0, instrEnd)
    if (!GRID_WORDING_RE.test(instructions) || !firstHeading) continue
    spans.push({ start, end, instructions })
  }
  return spans
}

function parseAnswerValue(value, labels) {
  const alternatives = String(value ?? '')
    .split(/\bOR\b/)
    .map((part) =>
      [...part.matchAll(/\(\s*([A-Za-z]|\d)\s*\)/g)]
        .map((m) => labels.indexOf(m[1].toUpperCase()))
        .filter((c) => c >= 0),
    )
    .map((cols) => [...new Set(cols)].sort((a, b) => a - b))
    .filter((cols) => cols.length)
  return alternatives
}

/**
 * Grid questions read from the scan: stem, the two lists, and the printed answers
 * ("(A) Matches to (P) and (S)") when the scan carries them.
 * @param {unknown} raw
 */
export function readMatrixGridQuestions(raw) {
  const src = String(raw ?? '').replace(/\r\n/g, '\n')
  const out = []
  for (const span of gridSpans(src)) {
    const body = src.slice(span.start, span.end)
    const size = gridSize(span.instructions)
    const marking = readMatrixGridMarking(span.instructions)
    const matchLine = span.instructions.match(/Match\s+the\s+entries\s+in\s+Column\s*[-–]?\s*I\s+with\s+the\s+entries\s+in\s+Column\s*[-–]?\s*II/i)
    const headings = matchesOf(COLUMN_HEADING_RE, body).map((m) => ({
      at: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
      two: /^(?:II|2)$/i.test(m[1]),
    }))
    const pairs = []
    headings.forEach((h, i) => {
      if (h.two) return
      const next = headings.slice(i + 1).find((x) => x.two)
      const nextOne = headings.slice(i + 1).find((x) => !x.two)
      if (next && (!nextOne || next.at < nextOne.at)) pairs.push({ one: h, two: next, nextOne })
    })
    const markers = matchesOf(Q_MARKER_RE, body).map((m) => ({ at: m.index ?? 0, end: (m.index ?? 0) + m[0].length, n: markerNumber(m) }))
    const before = matchesOf(Q_MARKER_RE, src.slice(0, span.start)).map(markerNumber).filter((n) => n > 0)
    let lastNumber = before.length ? before[before.length - 1] : 0
    let prevEnd = span.instructions.length
    pairs.forEach((pair, k) => {
      const nextQuestionAt = pairs[k + 1]
        ? (() => {
            const mk = markers.filter((m) => m.at > pair.two.end && m.at < pairs[k + 1].one.at).pop()
            return mk ? mk.at : pairs[k + 1].one.at
          })()
        : body.length
      const marker = markers.filter((m) => m.at >= prevEnd && m.at < pair.one.at).pop()
      let stem = ''
      if (marker) stem = cleanPiece(body.slice(marker.end, pair.one.at))
      else if (k > 0) {
        const loose = cleanPiece(body.slice(prevEnd, pair.one.at))
        if (loose.replace(/\s+/g, ' ').length >= 20 && !/\(\s*[A-D]\s*\)\s*\]?\s*Match/i.test(loose)) stem = loose
      }
      const printedNumber = marker?.n || lastNumber + 1
      lastNumber = printedNumber
      const tail = body.slice(pair.two.end, nextQuestionAt)
      const answerMatches = matchesOf(ANSWER_LINE_RE, tail)
      const colIIEnd = answerMatches.length ? answerMatches[0].index ?? tail.length : tail.length
      const rows = listItems(body.slice(pair.one.end, pair.two.at)).filter((r) => /^[A-Za-z]$/.test(r.label))
      const cols = listItems(tail.slice(0, colIIEnd))
      const labels = cols.map((c) => c.label.toUpperCase())
      /** @type {Record<number, number[]>} */
      const key = {}
      /** @type {Record<number, number[][]>} */
      const alternates = {}
      for (const m of answerMatches) {
        const row = m[1].toUpperCase().charCodeAt(0) - 65
        if (row < 0 || row >= rows.length || key[row]) continue
        const sets = parseAnswerValue(m[2], labels)
        if (!sets.length) continue
        key[row] = sets[0]
        if (sets.length > 1) alternates[row] = sets.slice(1)
      }
      const answered = rows.length > 0 && rows.every((_, r) => key[r]?.length)
      const lastAnswer = answerMatches[answerMatches.length - 1]
      prevEnd = lastAnswer
        ? pair.two.end + (lastAnswer.index ?? 0) + lastAnswer[0].length
        : pair.two.end + colIIEnd
      out.push({
        printedNumber,
        text: stem || (matchLine ? `${matchLine[0]}.` : ''),
        matrixRows: rows.map((r) => r.text),
        matrixCols: cols.map((c) => c.text),
        matrixColLabels: labels,
        expectedRows: size.rows,
        expectedCols: size.cols,
        ...(answered ? { matrixAnswerKey: key } : {}),
        ...(answered && Object.keys(alternates).length ? { matrixAnswerAlternates: alternates } : {}),
        ...(marking ? { matrixMarking: marking } : {}),
        sourceAt: span.start + pair.one.at,
      })
    })
  }
  return out
}

/** Paper-facts reading of a grid section's instructions. @param {string} window */
export function matrixGridSectionFacts(window) {
  const t = String(window ?? '')
  if (!GRID_WORDING_RE.test(t)) return null
  return gridSize(t)
}

const OPTION_ANSWER_FIELDS = ['correctIndex', 'correctIndices', 'optionImages', 'optionsImage']

/**
 * Grid fields for a card from one read grid question. The answer is only set when the
 * scan printed it; otherwise any earlier grid answer is removed, never guessed.
 * @param {any} card
 * @param {ReturnType<typeof readMatrixGridQuestions>[number]} grid
 */
export function gridCardFrom(card, grid) {
  const next = { ...card }
  for (const field of OPTION_ANSWER_FIELDS) delete next[field]
  delete next.matrixAnswerKey
  delete next.matrixAnswerAlternates
  return {
    ...next,
    text: grid.text,
    options: [],
    questionType: 'matrix_match',
    matrixResponseMode: 'grid',
    matrixRows: grid.matrixRows,
    matrixCols: grid.matrixCols,
    matrixColLabels: grid.matrixColLabels,
    matrixColCount: grid.matrixCols.length,
    ...(grid.matrixAnswerKey
      ? { matrixAnswerKey: grid.matrixAnswerKey, answerSource: 'from_paper' }
      : { answerSource: 'unknown' }),
    ...(grid.matrixAnswerAlternates ? { matrixAnswerAlternates: grid.matrixAnswerAlternates } : {}),
    ...(grid.matrixMarking ? { matrixMarking: grid.matrixMarking } : {}),
  }
}

/**
 * Replace (or add, when the scan printed no "Q." number) the grid questions in a split.
 * Cards come back in printed order, numbered 1…n.
 * @param {any[]} items
 * @param {unknown} raw
 */
export function applyMatrixGridQuestions(items, raw) {
  const list = Array.isArray(items) ? items.slice() : []
  const grids = readMatrixGridQuestions(raw)
  if (!grids.length) return list
  const printed = (q) => Number(q?.printedNumber ?? q?.questionNumber) || 0
  for (const grid of grids) {
    const same = list.findIndex((q) => printed(q) === grid.printedNumber)
    if (same >= 0) {
      if (list[same]?.adminEdited === true) continue
      list[same] = gridCardFrom(list[same], grid)
      continue
    }
    let at = list.findIndex((q) => printed(q) > grid.printedNumber)
    if (at < 0) at = list.length
    const neighbour = list[at - 1] || list[at] || {}
    const card = gridCardFrom(
      {
        id: `${String(neighbour.id || 'grid')}-g${grid.printedNumber}`,
        subject: neighbour.subject,
        bankStatus: neighbour.bankStatus,
        printedNumber: grid.printedNumber,
      },
      grid,
    )
    list.splice(at, 0, card)
  }
  return list.map((q, i) => ({ ...q, questionNumber: i + 1, pyqSlot: i + 1 }))
}

/** A grid card's own content, laid over whatever a clean-up step made of it. @param {any} g */
function gridContent(g) {
  return {
    text: g.text,
    options: [],
    questionType: 'matrix_match',
    ...gridFieldsOf(g),
    answerSource: g.answerSource,
    correctIndex: undefined,
    correctIndices: undefined,
  }
}

/**
 * Option and list clean-ups read a grid card as a broken match-the-list card (no options,
 * "Matches to" lines in the scan) and rebuild it. Put each grid card back after them:
 * same id, else same printed number (and subject when numbers repeat); a dropped one is re-added.
 * @param {any[]} before
 * @param {any[]} after
 */
export function keepMatrixGridCards(before, after) {
  const grids = (Array.isArray(before) ? before : []).filter(isMatrixGridCard)
  const list = Array.isArray(after) ? after.slice() : []
  if (!grids.length) return list
  const printed = (q) => Number(q?.printedNumber) || 0
  const nums = list.map(printed).filter((n) => n > 0)
  const unique = new Set(nums).size === nums.length
  const used = new Set()
  const missing = []
  for (const g of grids) {
    const free = (i) => !used.has(i)
    let at = g.id ? list.findIndex((q, i) => free(i) && q?.id === g.id) : -1
    if (at < 0 && printed(g) > 0) {
      at = list.findIndex(
        (q, i) =>
          free(i) &&
          printed(q) === printed(g) &&
          (unique || !g.subject || !q?.subject || String(q.subject) === String(g.subject)),
      )
    }
    if (at < 0) {
      missing.push(g)
      continue
    }
    used.add(at)
    if (!isMatrixGridCard(list[at]) || list[at].text !== g.text || (list[at].options || []).length) {
      list[at] = { ...list[at], ...gridContent(g) }
    }
  }
  if (!missing.length) return list
  for (const g of missing) {
    let at = list.findIndex((q) => printed(q) > printed(g))
    if (at < 0) at = list.length
    list.splice(at, 0, g)
  }
  return list.map((q, i) => ({ ...q, questionNumber: i + 1, pyqSlot: i + 1 }))
}

/** Column sets the key accepts for one row (the main one first). @param {any} q @param {number} row */
export function acceptedGridSets(q, row) {
  const key = q?.matrixAnswerKey?.[row]
  const main = Array.isArray(key) ? key : Number.isInteger(key) ? [key] : []
  const alts = Array.isArray(q?.matrixAnswerAlternates?.[row]) ? q.matrixAnswerAlternates[row] : []
  return [main, ...alts]
    .map((cols) => [...new Set((cols || []).map(Number).filter(Number.isInteger))].sort((a, b) => a - b))
    .filter((cols) => cols.length)
}

/**
 * Per-row score for a grid answer under the printed per-entry scheme:
 * a row scores `correct` when exactly an accepted set is ticked, `unattempted` when
 * nothing is ticked, and `wrong` otherwise.
 * @param {unknown} answer row → ticked columns
 * @param {any} q
 * @param {{ correct: number, wrong: number, unattempted?: number }} marking
 */
export function scoreMatrixGridRows(answer, q, marking) {
  const rows = Array.isArray(q?.matrixRows) ? q.matrixRows.length : 0
  const map = answer && typeof answer === 'object' ? /** @type {Record<string, unknown>} */ (answer) : {}
  let marks = 0
  let right = 0
  let tried = 0
  for (let r = 0; r < rows; r += 1) {
    const picked = [...new Set((Array.isArray(map[r]) ? map[r] : []).map(Number).filter(Number.isInteger))].sort(
      (a, b) => a - b,
    )
    if (!picked.length) {
      marks += marking.unattempted ?? 0
      continue
    }
    tried += 1
    const ok = acceptedGridSets(q, r).some((set) => set.join(',') === picked.join(','))
    if (ok) {
      right += 1
      marks += marking.correct
    } else marks += marking.wrong
  }
  return { marks, rowsRight: right, rowsTried: tried, rows }
}

/** "A → R (or R, T) · B → P, S" from the key. @param {any} q */
export function formatMatrixGridKey(q) {
  const rows = Array.isArray(q?.matrixRows) ? q.matrixRows.length : 0
  const labels = gridColLabels(q)
  const parts = []
  for (let r = 0; r < rows; r += 1) {
    const sets = acceptedGridSets(q, r)
    if (!sets.length) continue
    const show = (cols) => cols.map((c) => labels[c] ?? String(c + 1)).join(', ')
    const [main, ...alts] = sets
    parts.push(`${String.fromCharCode(65 + r)} → ${show(main)}${alts.length ? ` (or ${alts.map(show).join(' / ')})` : ''}`)
  }
  return parts.join(' · ')
}

/** Column II labels without brackets (P, Q, R, S, T). @param {any} q */
export function gridColLabels(q) {
  const n =
    (Array.isArray(q?.matrixCols) ? q.matrixCols.length : 0) ||
    Number(q?.matrixColCount) ||
    MATRIX_GRID_DEFAULT_COLS
  const stored = (Array.isArray(q?.matrixColLabels) ? q.matrixColLabels : []).map((l) =>
    String(l ?? '').replace(/[()\s]/g, '').toUpperCase(),
  )
  return Array.from({ length: n }, (_, i) => stored[i] || 'PQRSTUVW'[i] || String(i + 1))
}

/**
 * Grid answer from a model reply or a typed key: { "A": ["P","R"], … } or "A-P,R; B-Q".
 * Returns null unless every row names at least one known column.
 * @param {unknown} value
 * @param {any} q
 */
export function parseMatrixGridAnswer(value, q) {
  const rows = Array.isArray(q?.matrixRows) ? q.matrixRows.length : MATRIX_GRID_DEFAULT_ROWS
  const labels = gridColLabels(q)
  /** @type {Record<number, number[]>} */
  const key = {}
  const put = (rowLabel, cols) => {
    const r = String(rowLabel).trim().toUpperCase().charCodeAt(0) - 65
    if (r < 0 || r >= rows) return
    const idx = (Array.isArray(cols) ? cols : String(cols ?? '').split(/[\s,;/&]+|\band\b/i))
      .map((c) => labels.indexOf(String(c ?? '').replace(/[()\s]/g, '').toUpperCase()))
      .filter((c) => c >= 0)
    if (idx.length) key[r] = [...new Set(idx)].sort((a, b) => a - b)
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [row, cols] of Object.entries(value)) put(row, cols)
  } else {
    for (const m of String(value ?? '').matchAll(/\(?\s*([A-D])\s*\)?\s*(?:[-:→=]|->|Matches?\s+to)\s*([^;|\n]+)/gi)) put(m[1], m[2])
  }
  for (let r = 0; r < rows; r += 1) if (!key[r]?.length) return null
  return key
}

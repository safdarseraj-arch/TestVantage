/** @typedef {'grid' | 'options'} MatrixResponseMode */
/** @typedef {Record<number, number | number[]>} MatrixAnswerKey */

export const MATRIX_ROW_COUNT = 4
export const MATRIX_COL_LABELS = ['(P)', '(Q)', '(R)', '(S)', '(T)']

/** Default P–T column labels for `count` (4 or 5) entries. */
export function defaultMatrixColLabels(count = 4) {
  return MATRIX_COL_LABELS.slice(0, Math.min(5, Math.max(4, count)))
}

/** Use the stored labels unless they are the numeric OCR fallback, then P–T. */
export function normalizeMatrixColLabels(labels, count = 4) {
  const n = Math.min(5, Math.max(4, count))
  if (labels?.length) {
    const allNumeric = labels.every((l) => /^\(?\s*\d+\s*\)?$/.test(String(l).trim()))
    if (!allNumeric) {
      return labels.slice(0, n).map((l) => (String(l).startsWith('(') ? l : `(${l})`))
    }
  }
  return defaultMatrixColLabels(n)
}

/** @param {import('../data/tests').Question} q */
export function inferMatrixColCount(q) {
  const fromStored = Number(q?.matrixColCount)
  let n = Number.isFinite(fromStored) && fromStored >= 5 ? 5 : 4
  if ((q?.matrixCols ?? []).length >= 5) n = 5
  if ((q?.matrixColLabels ?? []).length >= 5) n = 5
  const key = q?.matrixAnswerKey
  if (key && typeof key === 'object') {
    const values = Object.values(key).flatMap((v) => (Array.isArray(v) ? v : [v]))
    if (values.some((c) => Number(c) >= 4)) n = 5
  }
  return n
}

export { normalizeMatrixItemText } from './normalizeMathText.js'

/** Row/column cell has enough text to count as filled (OCR noise excluded). */
export function matrixRowHasContent(text) {
  return String(text ?? '').replace(/\s/g, '').length > 8
}

/** Column-II entry — often a single digit (1, 2, …) or short label. */
export function matrixColHasContent(text) {
  const bare = String(text ?? '')
    .trim()
    .replace(/\$/g, '')
    .replace(/\s/g, '')
  return bare.length >= 1
}

/** @param {import('../data/tests').Question} q */
export function getMatrixColHeadLabels(q) {
  const n = inferMatrixColCount(q)
  if (q.matrixColLabels?.length) {
    // Numeric labels (1)–(5) are an OCR fallback — show the P–T convention instead.
    const allNumeric = q.matrixColLabels.every((l) => /^\(?\s*\d+\s*\)?$/.test(String(l).trim()))
    if (!allNumeric) {
      const labels = q.matrixColLabels.map((l) => (l.startsWith('(') ? l : `(${l})`))
      while (labels.length < n) labels.push(MATRIX_COL_LABELS[labels.length] ?? `(${labels.length + 1})`)
      return labels.slice(0, n)
    }
  }
  return MATRIX_COL_LABELS.slice(0, n)
}

/** @param {import('../data/tests').Question} q */
export function getMatrixResponseMode(q) {
  if (q.matrixResponseMode === 'grid' || q.matrixResponseMode === 'options') {
    return q.matrixResponseMode
  }
  const opts = (q.options ?? []).filter((o) => String(o ?? '').trim())
  return opts.length >= 2 ? 'options' : 'grid'
}

/** @param {number} colCount */
export function matrixGridSize(colCount) {
  const cols = colCount >= 5 ? 5 : 4
  return { rows: MATRIX_ROW_COUNT, cols }
}

/**
 * Normalize legacy single-column-per-row keys to number[].
 * @param {MatrixAnswerKey | null | undefined} key
 * @returns {Record<number, number[]>}
 */
export function normalizeMatrixAnswerKey(key) {
  if (!key || typeof key !== 'object') return {}
  /** @type {Record<number, number[]>} */
  const out = {}
  for (const [rowStr, val] of Object.entries(key)) {
    const row = Number(rowStr)
    if (Number.isNaN(row)) continue
    if (Array.isArray(val)) {
      out[row] = [...val].filter((c) => Number.isInteger(c)).sort((a, b) => a - b)
    } else if (typeof val === 'number' && !Number.isNaN(val)) {
      out[row] = [val]
    }
  }
  return out
}

/**
 * @param {unknown} answer
 * @param {import('../data/tests').Question} q
 */
export function matrixAnswersEqual(answer, q) {
  const mode = getMatrixResponseMode(q)
  if (mode === 'options') {
    return typeof answer === 'number' && answer === (q.correctIndex ?? 0)
  }
  const key = normalizeMatrixAnswerKey(q.matrixAnswerKey)
  const map = normalizeMatrixAnswerKey(
    /** @type {MatrixAnswerKey} */ (answer),
  )
  const rows = q.matrixRows ?? []
  for (let i = 0; i < rows.length; i++) {
    const a = [...(map[i] ?? [])].sort((x, y) => x - y).join(',')
    const k = [...(key[i] ?? [])].sort((x, y) => x - y).join(',')
    if (a !== k) return false
  }
  return true
}

/**
 * @param {unknown} answer
 * @param {import('../data/tests').Question} q
 */
export function formatMatrixUserAnswer(answer, q) {
  const mode = getMatrixResponseMode(q)
  if (mode === 'options') {
    const idx = typeof answer === 'number' ? answer : null
    if (idx == null || q.options?.[idx] == null) return '—'
    return `${String.fromCharCode(65 + idx)}) ${q.options[idx]}`
  }
  const map = normalizeMatrixAnswerKey(/** @type {MatrixAnswerKey} */ (answer))
  const rows = q.matrixRows ?? []
  const cols = q.matrixCols ?? []
  return rows
    .map((row, i) => {
      const heads = getMatrixColHeadLabels(q)
      const picks = (map[i] ?? []).map((c) => cols[c] ?? heads[c] ?? `(${c + 1})`)
      const label = String.fromCharCode(65 + i)
      return picks.length ? `${label} → ${picks.join(', ')}` : `${label} → —`
    })
    .join(' | ')
}

/** @param {import('../data/tests').Question} q */
export function formatMatrixCorrectAnswer(q) {
  const mode = getMatrixResponseMode(q)
  if (mode === 'options') {
    const idx = q.correctIndex ?? 0
    return q.options?.[idx] != null
      ? `${String.fromCharCode(65 + idx)}) ${q.options[idx]}`
      : String.fromCharCode(65 + idx)
  }
  return formatMatrixUserAnswer(q.matrixAnswerKey, q)
}

/**
 * @param {Record<number, number[]>} map
 * @param {number} row
 * @param {number} col
 */
export function toggleMatrixGridCell(map, row, col) {
  const next = { ...map }
  const set = new Set(next[row] ?? [])
  if (set.has(col)) set.delete(col)
  else set.add(col)
  const arr = [...set].sort((a, b) => a - b)
  if (arr.length) next[row] = arr
  else delete next[row]
  return next
}

/** @param {import('../data/tests').Question} q @param {unknown} answer */
export function isMatrixAnswerAttempted(answer, q) {
  const mode = getMatrixResponseMode(q)
  if (mode === 'options') {
    return typeof answer === 'number' && !Number.isNaN(answer)
  }
  const map = normalizeMatrixAnswerKey(/** @type {MatrixAnswerKey} */ (answer))
  const rows = q.matrixRows ?? []
  if (!rows.length) return Object.keys(map).length > 0
  return rows.every((_, i) => (map[i]?.length ?? 0) > 0)
}

import { digitsOnly } from '../components/IntegerAnswerInput.jsx'

/** @typedef {{ questionId: string, value: string | null }} ExamIntegerAnswerDetail */

export const EXAM_INTEGER_ANSWER_EVENT = 'testvantage-integer-answer'
export const EXAM_MATRIX_ANSWER_EVENT = 'testvantage-matrix-answer'
export const EXAM_MCQ_ANSWER_EVENT = 'testvantage-mcq-answer'
export const BANK_MATRIX_GRID_EVENT = 'testvantage-bank-matrix-grid'
export const EXAM_ACTION_EVENT = 'testvantage-exam-action'

const displayByQuestion = new Map()
let lastActionKey = ''
let lastActionAt = 0

/** @param {string} action @param {string} [arg] */
export function runExamAction(action, arg) {
  const key = `${action}:${arg ?? ''}`
  const now = Date.now()
  if (key === lastActionKey && now - lastActionAt < 350) return
  lastActionKey = key
  lastActionAt = now

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(EXAM_ACTION_EVENT, { detail: { action, arg } }),
    )
  }
}

/** @param {string} questionId */
export function getIntegerDisplay(questionId) {
  return displayByQuestion.get(questionId) ?? ''
}

/** @param {string} questionId @param {string} raw */
function paintIntegerDisplay(questionId, raw) {
  const s = digitsOnly(raw)
  displayByQuestion.set(questionId, s)
  const el = document.querySelector(`[data-exam-display="${questionId}"]`)
  if (el) el.textContent = s || '—'
  return s
}

/** @param {string} questionId @param {string | null} value */
export function publishExamIntegerAnswer(questionId, value) {
  if (typeof window === 'undefined' || !questionId) return
  window.dispatchEvent(
    new CustomEvent(EXAM_INTEGER_ANSWER_EVENT, {
      detail: /** @type {ExamIntegerAnswerDetail} */ ({ questionId, value }),
    }),
  )
}

/** @param {string} questionId @param {string} key */
export function applyIntegerKey(questionId, key) {
  let s = displayByQuestion.get(questionId) ?? ''
  if (key === 'back') s = s.slice(0, -1)
  else if (key === 'clear') s = ''
  else s = digitsOnly(s + key)

  if (s !== '') {
    const n = parseInt(s, 10)
    if (!Number.isNaN(n) && n > 9999) s = '9999'
  }

  paintIntegerDisplay(questionId, s)
  const out = s === '' ? null : s
  publishExamIntegerAnswer(questionId, out)
  return out
}

/** @param {string} questionId @param {string | number | null | undefined} value */
export function syncIntegerDisplay(questionId, value) {
  paintIntegerDisplay(questionId, digitsOnly(value))
}

/** @param {Event} e @param {HTMLElement} btn */
function handleIntegerClick(e, btn) {
  const pad = btn.closest('[data-exam-question-id]')
  if (!pad) return false
  const qid = pad.getAttribute('data-exam-question-id')
  const key = btn.getAttribute('data-exam-key')
  if (!qid || !key) return false
  e.preventDefault()
  e.stopPropagation()
  applyIntegerKey(qid, key)
  return true
}

/** @param {Event} e */
function handleActionClick(e) {
  const btn = /** @type {HTMLElement | null} */ (e.target)?.closest?.('[data-exam-action]')
  if (!btn) return false
  if (btn.classList.contains('exam-nav-disabled')) return false
  if (btn.hasAttribute('disabled') || /** @type {HTMLButtonElement} */ (btn).disabled) return false
  const action = btn.getAttribute('data-exam-action')
  if (!action) return false
  const arg = btn.getAttribute('data-exam-arg') ?? undefined
  e.preventDefault()
  e.stopPropagation()
  runExamAction(action, arg)
  return true
}

/** @param {string} questionId @param {number} row @param {number} col */
export function publishExamMatrixGridToggle(questionId, row, col) {
  if (typeof window === 'undefined' || !questionId) return
  window.dispatchEvent(
    new CustomEvent(EXAM_MATRIX_ANSWER_EVENT, {
      detail: { questionId, mode: 'grid', row, col },
    }),
  )
}

/** @param {string} questionId @param {number} optionIndex */
export function publishExamMatrixOption(questionId, optionIndex) {
  if (typeof window === 'undefined' || !questionId) return
  window.dispatchEvent(
    new CustomEvent(EXAM_MATRIX_ANSWER_EVENT, {
      detail: { questionId, mode: 'option', optionIndex },
    }),
  )
}

/** @param {number} row @param {number} col */
export function publishBankMatrixGridToggle(row, col) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(BANK_MATRIX_GRID_EVENT, {
      detail: { row, col },
    }),
  )
}

/** @param {Event} e */
function handleBankMatrixGridClick(e) {
  const cell = /** @type {HTMLElement | null} */ (e.target)?.closest?.(
    '[data-bank-matrix-cell]',
  )
  if (!cell) return false
  if (cell.getAttribute('data-bank-matrix-disabled') === '1') return false
  const row = Number(cell.getAttribute('data-bank-matrix-row'))
  const col = Number(cell.getAttribute('data-bank-matrix-col'))
  if (Number.isNaN(row) || Number.isNaN(col)) return false
  e.preventDefault()
  e.stopPropagation()
  publishBankMatrixGridToggle(row, col)
  return true
}

/** @param {Event} e */
function handleMatrixClick(e) {
  if (/** @type {HTMLElement} */ (e.target)?.closest?.('[data-exam-action], [data-exam-key]')) {
    return false
  }
  const cell = /** @type {HTMLElement | null} */ (e.target)?.closest?.(
    '.exam-layout [data-exam-matrix-cell]',
  )
  if (cell) {
    if (cell.getAttribute('data-exam-matrix-disabled') === '1') return false
    const qid = cell.getAttribute('data-exam-question-id')
    const row = Number(cell.getAttribute('data-exam-matrix-row'))
    const col = Number(cell.getAttribute('data-exam-matrix-col'))
    if (!qid || Number.isNaN(row) || Number.isNaN(col)) return false
    e.preventDefault()
    e.stopPropagation()
    publishExamMatrixGridToggle(qid, row, col)
    return true
  }
  const opt = /** @type {HTMLElement | null} */ (e.target)?.closest?.(
    '.exam-layout [data-exam-matrix-option]',
  )
  if (!opt) return false
  if (opt.getAttribute('data-exam-matrix-disabled') === '1') return false
  const qid = opt.getAttribute('data-exam-question-id')
  const optionIndex = Number(opt.getAttribute('data-exam-matrix-option'))
  if (!qid || Number.isNaN(optionIndex)) return false
  e.preventDefault()
  e.stopPropagation()
  publishExamMatrixOption(qid, optionIndex)
  return true
}

/** @param {string} questionId @param {number} optionValue original option index @param {'single' | 'multi'} mode */
export function publishExamMcqAnswer(questionId, optionValue, mode) {
  if (typeof window === 'undefined' || !questionId) return
  window.dispatchEvent(
    new CustomEvent(EXAM_MCQ_ANSWER_EVENT, {
      detail: { questionId, value: optionValue, mode },
    }),
  )
}

/** @param {Event} e */
function handleMcqClick(e) {
  if (
    /** @type {HTMLElement} */ (e.target)?.closest?.(
      '[data-exam-action], [data-exam-key], [data-exam-matrix-cell], [data-exam-matrix-option]',
    )
  ) {
    return false
  }
  const row = /** @type {HTMLElement | null} */ (e.target)?.closest?.(
    '.exam-layout [data-exam-mcq-option]',
  )
  if (!row) return false
  const qid = row.getAttribute('data-exam-question-id')
  const mode = row.getAttribute('data-exam-mcq-mode') === 'multi' ? 'multi' : 'single'
  const value = Number(row.getAttribute('data-exam-mcq-value'))
  if (!qid || Number.isNaN(value)) return false
  e.preventDefault()
  e.stopPropagation()
  publishExamMcqAnswer(qid, value, mode)
  return true
}

/** @param {Event} e */
function onDocumentPointer(e) {
  const keyBtn = /** @type {HTMLElement | null} */ (e.target)?.closest?.('[data-exam-key]')
  if (keyBtn && handleIntegerClick(e, keyBtn)) return
  if (handleActionClick(e)) return
  if (handleMatrixClick(e)) return
  if (handleBankMatrixGridClick(e)) return
  handleMcqClick(e)
}

let wired = false

export function ensureExamClickBridge() {
  if (wired || typeof document === 'undefined') return
  wired = true
  document.addEventListener('click', onDocumentPointer, true)
  document.addEventListener('touchend', onDocumentPointer, true)
}

ensureExamClickBridge()

/** @deprecated use document delegation */
export function refreshExamActionBindings() {}

export function registerExamClickHandler() {}

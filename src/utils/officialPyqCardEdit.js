/**
 * Admin "Edit question" on a PENDING Official PYQ card.
 * Saves into the same pending store the preview reads, marks the card as
 * edited by admin (re-parse / heal / quality fix then leave it alone), and
 * re-runs the shared local quality check for that card. Never publishes.
 */

import {
  getOfficialPyqPendingOcrText,
  getOfficialPyqPendingPaper,
  officialPyqCardIsAdminEdited,
  updateOfficialPyqPendingPaper,
} from './officialPyqPendingStore.js'
import { LOCAL_QUALITY_REVISION, localOfficialPyqQualityCheck } from './officialPyqLocalQuality.js'

export const OFFICIAL_PYQ_CARD_CHANGED_EVENT = 'testvantage:official-pyq-card-changed'

const LETTERS = 'ABCDEFGH'

/** @param {any} q */
export function officialPyqCardHasAnswerKey(q) {
  if (!q || typeof q !== 'object') return false
  if (Array.isArray(q.correctIndices) && q.correctIndices.length) return true
  return [q.correctIndex, q.correctInteger, q.correctNumerical].some(
    (v) => v != null && String(v).trim() !== '' && Number.isFinite(Number(v)),
  )
}

/** @param {any} q */
export function formatOfficialPyqAnswerKey(q) {
  if (!q || typeof q !== 'object') return ''
  if (Array.isArray(q.correctIndices) && q.correctIndices.length) {
    return q.correctIndices.map((i) => LETTERS[Number(i)] ?? String(i)).join(', ')
  }
  if (q.correctIndex != null && Number.isFinite(Number(q.correctIndex))) {
    return LETTERS[Number(q.correctIndex)] ?? String(q.correctIndex)
  }
  if (q.correctNumerical != null && String(q.correctNumerical).trim() !== '') return String(q.correctNumerical)
  if (q.correctInteger != null && String(q.correctInteger).trim() !== '') return String(q.correctInteger)
  return ''
}

/**
 * Letters (A / A, C) for option questions, a number for numeric ones.
 * @param {string} raw
 * @param {any} card
 * @returns {{ ok: true, patch: Record<string, unknown> } | { ok: false, error: string }}
 */
export function parseOfficialPyqAnswerKey(raw, card) {
  const text = String(raw ?? '').trim()
  const cleared = {
    correctIndex: undefined,
    correctIndices: undefined,
    correctInteger: undefined,
    correctNumerical: undefined,
  }
  if (!text) return { ok: true, patch: cleared }
  const letters = text.toUpperCase().match(/^[A-H](?:\s*[,/&\s]\s*[A-H])*$/)
  if (letters) {
    const idx = Array.from(new Set(text.toUpperCase().match(/[A-H]/g) || [])).map((l) => LETTERS.indexOf(l))
    const multi = idx.length > 1 || Array.isArray(card?.correctIndices)
    return {
      ok: true,
      patch: multi
        ? { ...cleared, correctIndices: idx.sort((a, b) => a - b) }
        : { ...cleared, correctIndex: idx[0] },
    }
  }
  const num = Number(text)
  if (Number.isFinite(num)) {
    const integerCard = card?.correctInteger != null && card?.correctNumerical == null
    return {
      ok: true,
      patch: integerCard && Number.isInteger(num)
        ? { ...cleared, correctInteger: num }
        : { ...cleared, correctNumerical: num },
    }
  }
  return { ok: false, error: 'Answer key: use option letters (A or A, C) or a number.' }
}

/** @param {Record<string, unknown>} obj */
function dropUndefined(obj) {
  const out = { ...obj }
  for (const key of Object.keys(out)) if (out[key] === undefined) delete out[key]
  return out
}

/**
 * Card with the draft applied — used for the live preview and for Save.
 * @param {any} card
 * @param {{ text: string, options: string[], answerKey?: string, removeFigure?: boolean, passageText?: string }} draft
 */
export function applyOfficialPyqCardDraft(card, draft) {
  const base = card && typeof card === 'object' ? card : {}
  const next = { ...base, text: String(draft.text ?? '') }
  if (Object.prototype.hasOwnProperty.call(base, 'stem')) next.stem = next.text
  if (Array.isArray(draft.options)) next.options = draft.options.map((o) => String(o ?? ''))
  if (draft.removeFigure) delete next.questionImage
  if (typeof draft.passageText === 'string') {
    const passage = draft.passageText.trim()
    if (passage) next.passageText = passage
    else delete next.passageText
  }
  return next
}

/**
 * 0-based indexes of the cards that share this card's passage (itself included).
 * @param {any[]} questions
 * @param {number} index
 */
export function officialPyqPassageGroupIndexes(questions, index) {
  const list = Array.isArray(questions) ? questions : []
  const card = list[index]
  const id = String(card?.passageId || card?.passageGroup || '').trim()
  if (!id) return [index]
  const out = []
  list.forEach((q, i) => {
    if (String(q?.passageId || q?.passageGroup || '').trim() === id) out.push(i)
  })
  return out.includes(index) ? out : [index]
}

/**
 * @param {string} paperId
 * @param {number} index 0-based card index on the paper
 * @param {{ text: string, options: string[], answerKey?: string, removeFigure?: boolean }} draft
 */
export function saveOfficialPyqCardEdit(paperId, index, draft) {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { ok: false, error: 'Paper not found.' }
  if (String(paper.status) !== 'pending_review') {
    return { ok: false, error: 'Only a pending paper can be edited here. Published questions stay locked.' }
  }
  const questions = Array.isArray(paper.questions) ? paper.questions.slice() : []
  const card = questions[index]
  if (!card) return { ok: false, error: 'Question not found on this paper.' }
  if (!String(draft.text ?? '').trim()) return { ok: false, error: 'Question text cannot be empty.' }
  let next = applyOfficialPyqCardDraft(card, draft)
  if (officialPyqCardHasAnswerKey(card) || String(draft.answerKey ?? '').trim()) {
    const parsed = parseOfficialPyqAnswerKey(draft.answerKey ?? '', card)
    if (!parsed.ok) return parsed
    next = { ...next, ...parsed.patch }
    if (String(draft.answerKey ?? '').trim() !== formatOfficialPyqAnswerKey(card)) {
      next.answerSource = 'admin_edit'
    }
  }
  const prevAt = Number(card.adminEditedAt) || 0
  const editedAt = Math.max(Date.now(), prevAt + 1)
  const passageChanged =
    typeof draft.passageText === 'string' &&
    draft.passageText.trim() !== String(card.passageText ?? '').trim()
  next = dropUndefined({
    ...next,
    ...(passageChanged ? { passageSource: 'admin_edit' } : {}),
    pyqSlot: card.pyqSlot ?? index + 1,
    adminEdited: true,
    adminEditedAt: editedAt,
    originalCompare: undefined,
  })
  questions[index] = next
  if (passageChanged) {
    for (const i of officialPyqPassageGroupIndexes(questions, index)) {
      if (i === index || !questions[i]) continue
      const mate = { ...questions[i], passageSource: 'admin_edit', adminEdited: true }
      if (next.passageText) mate.passageText = next.passageText
      else delete mate.passageText
      mate.adminEditedAt = Math.max(editedAt, (Number(questions[i].adminEditedAt) || 0) + 1)
      questions[i] = mate
    }
  }
  const saved = updateOfficialPyqPendingPaper(paper.id, { questions })
  if (!saved) return { ok: false, error: 'Could not save — browser storage may be full.' }
  const mates = passageChanged ? officialPyqPassageGroupIndexes(questions, index).filter((i) => i !== index) : []
  for (const i of mates) recheckOfficialPyqCardQuality(paper.id, i)
  const checked = recheckOfficialPyqCardQuality(paper.id, index) || saved
  const card2 = (checked.questions || saved.questions || [])[index] || next
  for (const i of mates) notifyOfficialPyqCardChanged(paper.id, i)
  notifyOfficialPyqCardChanged(paper.id, index)
  return { ok: true, paper: checked, card: card2, passageShared: mates.map((i) => i + 1) }
}

/**
 * Re-run the shared local check for ONE card and update that card's entry in
 * the paper's list mark. Never repairs or rewrites cards. A hand-edited card
 * is checked as typed (no OCR heal).
 * @param {string} paperId
 * @param {number} index 0-based card index
 */
export function recheckOfficialPyqCardQuality(paperId, index) {
  const full = getOfficialPyqPendingPaper(paperId)
  if (!full || String(full.status ?? '') !== 'pending_review') return null
  const questions = Array.isArray(full.questions) ? full.questions : []
  const paperOcr = getOfficialPyqPendingOcrText(paperId) || String(full.preparedText ?? '')
  const cardFails = (i) => {
    const q = questions[i]
    if (!q) return false
    const ocr = officialPyqCardIsAdminEdited(q) ? '' : paperOcr
    return localOfficialPyqQualityCheck({ questions: [q], preparedText: ocr }).failedGoTo.length > 0
  }
  let prior = full.localQuality
  if (!prior || prior.revision !== LOCAL_QUALITY_REVISION) {
    prior = localOfficialPyqQualityCheck({ ...full, preparedText: paperOcr })
    const failed = new Set(prior.failedGoTo)
    questions.forEach((q, i) => {
      if (!officialPyqCardIsAdminEdited(q)) return
      if (cardFails(i)) failed.add(i + 1)
      else failed.delete(i + 1)
    })
    prior = { ...prior, failedGoTo: Array.from(failed) }
  }
  const go = index + 1
  const failed = new Set(
    (Array.isArray(prior.failedGoTo) ? prior.failedGoTo : []).filter((n) => n !== go && n <= questions.length),
  )
  if (cardFails(index)) failed.add(go)
  const failedGoTo = Array.from(failed).sort((a, b) => a - b)
  return updateOfficialPyqPendingPaper(full.id, {
    localQuality: {
      ...prior,
      passed: failedGoTo.length === 0 && questions.length > 0,
      failedGoTo,
      checkedAt: Date.now(),
      questionCount: questions.length,
    },
  })
}

/** @param {string} paperId @param {number} index */
export function notifyOfficialPyqCardChanged(paperId, index) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(
      new CustomEvent(OFFICIAL_PYQ_CARD_CHANGED_EVENT, { detail: { paperId, index } }),
    )
  } catch {
    /* listeners are optional */
  }
}

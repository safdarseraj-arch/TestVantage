import { getQuestionType } from '../data/questionTypes.js'
import { filterBankQuestions } from './bankListFilters.js'
import {
  getPassageParentId,
  getPassageSetQuestions,
  isPassageLinkedQuestion,
} from './passage.js'

/** Row to open in viewer / editor (always parent for passage sets). */
export function bankListActionTargetId(q) {
  return getPassageParentId(q) ?? q.id
}

/** @param {import('../data/tests').Question} q */
export function isPassageChildRow(q) {
  return !!q?.passageId && !q?.passageText
}

/**
 * Bank list shows one row per passage set (parent only), not each sub-question.
 * @param {import('../data/tests').Question[]} questions
 */
export function collapsePassageChildrenForBankList(questions) {
  return questions.filter((q) => !isPassageChildRow(q))
}

/** @param {import('../data/tests').Question} q @param {import('../data/tests').BankListFilters} filters */
function questionMatchesBankFilters(q, filters) {
  return filterBankQuestions([q], filters).length > 0
}

/**
 * Filter + hide passage children; include parent when any sub-question matches filters.
 * @param {import('../data/tests').Question[]} questions
 * @param {import('../data/tests').BankListFilters} filters
 */
export function bankListVisibleQuestions(questions, filters = {}) {
  const parentIdsFromMatchingChildren = new Set()
  for (const q of questions) {
    if (!isPassageChildRow(q)) continue
    const pid = q.passageId
    if (pid && questionMatchesBankFilters(q, filters)) {
      parentIdsFromMatchingChildren.add(pid)
    }
  }
  return collapsePassageChildrenForBankList(questions).filter((q) => {
    if (q.passageText && parentIdsFromMatchingChildren.has(q.id)) return true
    return questionMatchesBankFilters(q, filters)
  })
}

/**
 * @param {import('../data/tests').Question} q
 * @param {import('../data/tests').Question[]} bank
 */
export function getPassageSetListLabel(q, bank) {
  const set = getPassageSetQuestions(q, bank)
  if (!set || set.length < 2) return null
  const typeId = set[0]?.questionType ?? 'passage_scq'
  const short = getQuestionType(typeId).shortName
  return `${short} set · ${set.length} questions`
}

/**
 * @param {import('../data/tests').Question} parent
 * @param {import('../data/tests').Question[]} bank
 */
export function getPassageSetPreviewSnippet(parent, bank) {
  const set = getPassageSetQuestions(parent, bank)
  if (!set?.length) return parent.text ?? ''
  const passage = String(parent.passageText ?? '').trim()
  const stems = set
    .filter((x) => x.passageId)
    .map((x, i) => `Q${i + 1}: ${String(x.text ?? '').trim().slice(0, 60)}`)
  if (passage && stems.length) {
    return `${passage.slice(0, 100)}${passage.length > 100 ? '…' : ''} — ${stems.join(' · ')}`
  }
  return stems.join(' · ') || passage || (parent.text ?? '')
}

/**
 * @param {import('../data/tests').Question} q
 * @param {import('../data/tests').Question[]} bank
 * @returns {import('../data/tests').Question[] | null}
 */
export function getPassageSetForAction(q, bank) {
  if (!isPassageLinkedQuestion(q)) return null
  const set = getPassageSetQuestions(q, bank)
  return set?.length ? set : null
}

/**
 * @param {import('../data/tests').Question} q
 * @param {import('../data/tests').Question[]} bank
 * @param {(id: string) => boolean} patchFn
 * @param {Partial<import('../data/tests').Question>} updates
 */
export function applyMetadataToPassageSet(q, bank, patchFn, updates) {
  const set = getPassageSetForAction(q, bank)
  if (!set || set.length <= 1) return patchFn(q.id, updates)
  let ok = true
  for (const row of set) {
    const rowUpdates = { ...updates }
    if (row.passageId) delete rowUpdates.passageText
    if (!patchFn(row.id, rowUpdates)) ok = false
  }
  return ok
}

/**
 * @param {import('../data/tests').Question} q
 * @param {import('../data/tests').Question[]} bank
 * @param {(id: string) => void} removeFn
 */
export function removePassageSetFromBank(q, bank, removeFn) {
  const set = getPassageSetForAction(q, bank)
  if (!set || set.length <= 1) {
    removeFn(q.id)
    return 1
  }
  for (const row of set) removeFn(row.id)
  return set.length
}

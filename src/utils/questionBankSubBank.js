/**
 * Sub-bank tabs on staff Question Bank (mirrors Postgres sub_bank_type).
 */
import {
  normalizeSubBankType,
  resolveSubBankType,
  SUB_BANK_TYPE_AI,
  SUB_BANK_TYPE_NORMAL,
  SUB_BANK_TYPE_PYQ,
  SUB_BANK_TYPE_SIMILAR_PYQ,
} from './subBankType.js'
import { effectiveBankStatus } from './questionUploadFilter.js'

/** Empty string = show all sub-banks */
export const SUB_BANK_FILTER_ALL = ''

export const QUESTION_BANK_SUB_BANK_TABS = /** @type {const} */ ([
  { id: SUB_BANK_FILTER_ALL, label: 'All', short: 'Every slice' },
  { id: SUB_BANK_TYPE_NORMAL, label: 'Main', short: 'Teacher uploads & compose' },
  { id: SUB_BANK_TYPE_PYQ, label: 'Official PYQ', short: 'Imported NTA papers' },
  { id: SUB_BANK_TYPE_AI, label: 'Hybrid AI', short: 'Postgres AI sub_bank' },
  { id: SUB_BANK_TYPE_SIMILAR_PYQ, label: 'Similar PYQ', short: 'AI similar / clone rows' },
])

/** @param {string | null | undefined} raw URL ?subBank= */
export function parseQuestionBankSubBank(raw) {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed || trimmed === 'all') return SUB_BANK_FILTER_ALL
  const normalized = normalizeSubBankType(trimmed)
  if (normalized) return normalized
  return SUB_BANK_FILTER_ALL
}

/** @param {import('../data/tests').Question[]} questions */
export function countQuestionsBySubBank(questions) {
  /** @type {Record<string, number>} */
  const counts = {
    [SUB_BANK_FILTER_ALL]: questions.length,
    [SUB_BANK_TYPE_NORMAL]: 0,
    [SUB_BANK_TYPE_PYQ]: 0,
    [SUB_BANK_TYPE_AI]: 0,
    [SUB_BANK_TYPE_SIMILAR_PYQ]: 0,
  }
  for (const q of questions ?? []) {
    counts[resolveSubBankType(q)]++
  }
  return counts
}

/** @param {import('../data/tests').Question[]} questions @param {string} subBankFilter */
export function filterQuestionsForSubBankTab(questions, subBankFilter) {
  const want = parseQuestionBankSubBank(subBankFilter)
  if (!want) return questions ?? []
  return (questions ?? []).filter((q) => resolveSubBankType(q) === want)
}

/** Hybrid AI drafts synced from Postgres or TV-AI-* ids. */
export function isHybridAiBankQuestion(q) {
  if (!q) return false
  if (q.hybridSyncedFromPostgres === true) return true
  if (/^Hybrid AI/i.test(String(q.source ?? '').trim())) return true
  if (/^TV-AI-/i.test(String(q.id ?? '').trim())) return true
  const bank = String(q.bankSource ?? '').trim()
  return bank === 'ai_hybrid' || bank === 'ai_similar_pyq'
}

/** Failed completeness check. Separate from ready Hybrid AI drafts. */
export function isNeedsActionDraft(q) {
  if (!q) return false
  if (q.needsAction === true || q.needs_action === true) return true
  const status = String(q.approval_status ?? q.approvalStatus ?? '').trim().toUpperCase()
  return status === 'NEEDS_ACTION' || status === 'NEEDS_FIX'
}

/**
 * On the Hybrid AI sub-bank, keep Needs action out of the ready list.
 * Other sub-banks are unchanged.
 * @param {import('../data/tests').Question[]} questions
 * @param {string} subBank
 * @param {'ready' | 'needs-action'} tray
 */
export function filterHybridAiDraftTray(questions, subBank, tray) {
  const list = questions ?? []
  if (parseQuestionBankSubBank(subBank) !== SUB_BANK_TYPE_AI) return list
  if (tray === 'needs-action') return list.filter((q) => isNeedsActionDraft(q))
  return list.filter((q) => !isNeedsActionDraft(q))
}

/** @param {import('../data/tests').Question[]} questions */
export function countHybridAiDraftTrays(questions) {
  let ready = 0
  let needsAction = 0
  for (const q of questions ?? []) {
    if (effectiveBankStatus(q) !== 'draft') continue
    if (isNeedsActionDraft(q)) needsAction += 1
    else ready += 1
  }
  return { ready, needsAction }
}

/** @param {import('../data/tests').Question[]} questions */
export function countHybridAiDrafts(questions) {
  let n = 0
  for (const q of questions ?? []) {
    if (effectiveBankStatus(q) !== 'draft') continue
    if (!isHybridAiBankQuestion(q)) continue
    n++
  }
  return n
}

/**
 * Sub-bank slices of the master question pool (mirrors Postgres sub_bank_type).
 */

import {
  isOfficialPyq,
  isPyqStyleAi,
  isSimilarToPyq,
  isPyqLike,
  SAMPLE_PRACTICE_BANK_SOURCE,
} from './pyqDetect.js'

/** @typedef {'normal' | 'pyq' | 'ai' | 'similar_pyq'} SubBankType */

export const SUB_BANK_TYPE_NORMAL = /** @type {const} */ ('normal')
export const SUB_BANK_TYPE_PYQ = /** @type {const} */ ('pyq')
export const SUB_BANK_TYPE_AI = /** @type {const} */ ('ai')
export const SUB_BANK_TYPE_SIMILAR_PYQ = /** @type {const} */ ('similar_pyq')

export const PRACTICE_SUB_BANKS = /** @type {const} */ ([
  SUB_BANK_TYPE_PYQ,
  SUB_BANK_TYPE_SIMILAR_PYQ,
])

/** @param {string | undefined | null} raw */
export function normalizeSubBankType(raw) {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
  if (v === SUB_BANK_TYPE_PYQ) return SUB_BANK_TYPE_PYQ
  if (v === SUB_BANK_TYPE_SIMILAR_PYQ || v === 'similarpyq') return SUB_BANK_TYPE_SIMILAR_PYQ
  if (v === SUB_BANK_TYPE_AI) return SUB_BANK_TYPE_AI
  if (v === SUB_BANK_TYPE_NORMAL) return SUB_BANK_TYPE_NORMAL
  return ''
}

/**
 * Resolve sub_bank_type for a bank / catalog row (explicit field wins).
 * @param {import('../data/tests').Question & { sub_bank_type?: string, subBankType?: string }} q
 * @returns {SubBankType}
 */
export function resolveSubBankType(q) {
  if (!q) return SUB_BANK_TYPE_NORMAL
  const explicit = normalizeSubBankType(q.sub_bank_type ?? q.subBankType)
  if (explicit) return explicit

  if (q.hybridSyncedFromPostgres === true) {
    if (q.similarToPyq === true || q.bankSource === 'ai_similar_pyq') {
      return SUB_BANK_TYPE_SIMILAR_PYQ
    }
    return SUB_BANK_TYPE_AI
  }
  if (/^Hybrid AI/i.test(String(q.source ?? '').trim())) return SUB_BANK_TYPE_AI

  const bankEarly = String(q.bankSource ?? '').trim()
  if (bankEarly === 'ai_hybrid') return SUB_BANK_TYPE_AI
  if (bankEarly === 'ai_similar_pyq') return SUB_BANK_TYPE_SIMILAR_PYQ

  if (isSimilarToPyq(q)) return SUB_BANK_TYPE_SIMILAR_PYQ
  if (isPyqStyleAi(q)) return SUB_BANK_TYPE_AI
  if (isOfficialPyq(q)) return SUB_BANK_TYPE_PYQ
  if (q.imported === true && q.pyqYear != null) return SUB_BANK_TYPE_PYQ
  if (
    isPyqLike(q) &&
    q.isDemo !== true &&
    String(q.bankSource ?? '').trim() !== SAMPLE_PRACTICE_BANK_SOURCE
  ) {
    const bank = String(q.bankSource ?? '').trim()
    if (bank === 'official_pyq' || bank === 'pyq') return SUB_BANK_TYPE_PYQ
  }
  return SUB_BANK_TYPE_NORMAL
}

/** @param {import('../data/tests').Question} q @param {SubBankType} subBankType */
export function questionMatchesSubBankType(q, subBankType) {
  return resolveSubBankType(q) === subBankType
}

/** @param {SubBankType} subBankType */
export function subBankPracticeRoutePrefix(subBankType) {
  return subBankType === SUB_BANK_TYPE_SIMILAR_PYQ ? '/practice/similar-pyq' : '/practice/pyq'
}

/** @param {SubBankType} subBankType */
export function subBankPracticeLabel(subBankType) {
  return subBankType === SUB_BANK_TYPE_SIMILAR_PYQ ? 'Similar PYQ' : 'PYQ'
}

/**
 * Unified master question pool — published bank + imported PYQ catalog (deduped by id).
 */

import { getAllPyqQuestions } from '../data/pyqCatalog.js'
import { peekUploadedQuestions } from './questionBank.js'
import { isQuestionPublished } from './questionUploadFilter.js'
import { filterQuestionsBySyllabus, syllabusSelectionEmpty } from './syllabusMeta.js'
import { getAnswerableQuestions } from './passage.js'
import {
  questionMatchesSubBankType,
  SUB_BANK_TYPE_PYQ,
  SUB_BANK_TYPE_SIMILAR_PYQ,
} from './subBankType.js'
import { filterQuestionsByBloom } from './bloomFilter.js'
import { enforce_parent_child_exclusion } from './enforceParentChildExclusion.js'

/** @typedef {import('./subBankType.js').SubBankType} SubBankType */

let _masterCache = /** @type {import('../data/tests').Question[] | null} */ (null)
let _masterCacheAt = 0
const MASTER_CACHE_MS = 2500

/**
 * Full master pool (all sub-banks). Prefer filterMasterPoolBySubBank for practice slices.
 * @param {{ fresh?: boolean }} [opts]
 */
export function getMasterQuestionPool(opts = {}) {
  const now = Date.now()
  if (!opts.fresh && _masterCache && now - _masterCacheAt < MASTER_CACHE_MS) {
    return _masterCache
  }
  const bank = (peekUploadedQuestions() ?? []).filter((q) => isQuestionPublished(q))
  const pyqs = getAllPyqQuestions()
  const seen = new Set(bank.map((q) => q.id))
  /** @type {import('../data/tests').Question[]} */
  const merged = [...bank]
  for (const q of pyqs) {
    if (!seen.has(q.id)) merged.push(q)
  }
  _masterCache = merged
  _masterCacheAt = now
  return merged
}

/** Invalidate after bank / PYQ import in the same tab session. */
export function bumpMasterPoolCache() {
  _masterCache = null
  _masterCacheAt = 0
}

/**
 * @param {import('../data/tests').Question[]} pool
 * @param {SubBankType} subBankType
 */
export function filterMasterPoolBySubBank(pool, subBankType) {
  return (pool ?? []).filter((q) => questionMatchesSubBankType(q, subBankType))
}

/**
 * Master pool slice for one practice sub-bank + optional exam + syllabus.
 * @param {SubBankType} subBankType
 * @param {string} [examPatternId]
 * @param {import('./syllabusMeta.js').SyllabusSelection} [syllabus]
 * @param {import('../data/tests').Question[]} [sourcePool]
 */
export function getSubBankPracticePool(
  subBankType,
  examPatternId,
  syllabus,
  sourcePool,
  bloomLevels,
) {
  let rows = filterMasterPoolBySubBank(sourcePool ?? getMasterQuestionPool(), subBankType)
  if (examPatternId) {
    rows = rows.filter((q) => {
      const ids = Array.isArray(q.examIds) ? q.examIds.map(String) : []
      if (ids.includes(examPatternId)) return true
      return String(q.examPatternId ?? '') === examPatternId
    })
  }
  if (syllabus && !syllabusSelectionEmpty(syllabus)) {
    rows = filterQuestionsBySyllabus(rows, syllabus)
  }
  rows = filterQuestionsByBloom(rows, bloomLevels)
  return getAnswerableQuestions(enforce_parent_child_exclusion(rows))
}

/** @param {string} examPatternId @param {SubBankType} subBankType */
export function getSubBankYears(examPatternId, subBankType) {
  const years = new Set(
    getSubBankPracticePool(subBankType, examPatternId)
      .map((q) => q.pyqYear)
      .filter((y) => y != null),
  )
  return [...years].sort((a, b) => b - a)
}

export { SUB_BANK_TYPE_PYQ, SUB_BANK_TYPE_SIMILAR_PYQ }

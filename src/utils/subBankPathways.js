/**
 * Six PYQ study pathways × pyq + mirror × similar_pyq (shared sub_bank_type + bloom filter).
 */

import { filterQuestionsByBloom } from './bloomFilter.js'
import { getSubBankPracticePool } from './masterPool.js'
import {
  SUB_BANK_TYPE_PYQ,
  SUB_BANK_TYPE_SIMILAR_PYQ,
  questionMatchesSubBankType,
} from './subBankType.js'

/** @typedef {'syllabus-practice' | 'full' | 'part' | 'chapter' | 'calibrated' | 'year-wise-paper'} SubBankPathwayId */

/** @typedef {import('./subBankType.js').SubBankType} SubBankType */

export const SUB_BANK_PATHWAY_IDS = /** @type {const} */ ([
  'syllabus-practice',
  'full',
  'part',
  'chapter',
  'calibrated',
  'year-wise-paper',
])

/** Six modes for each practice sub-bank slice. */
export const SUB_BANK_PATHWAYS = /** @type {const} */ ({
  [SUB_BANK_TYPE_PYQ]: SUB_BANK_PATHWAY_IDS,
  [SUB_BANK_TYPE_SIMILAR_PYQ]: SUB_BANK_PATHWAY_IDS,
})

/** @param {SubBankPathwayId} pathwayId */
export function subBankPathwayLabel(pathwayId) {
  const labels = {
    'syllabus-practice': 'Syllabus practice',
    full: 'Full paper mock',
    part: 'Part test',
    chapter: 'Chapter test',
    calibrated: 'Calibrated adaptive',
    'year-wise-paper': 'Year-wise paper',
  }
  return labels[pathwayId] ?? pathwayId
}

/**
 * Master pool rows for one sub-bank pathway (exam + syllabus + optional Bloom).
 * @param {SubBankType} subBankType
 * @param {string} [examPatternId]
 * @param {import('./syllabusMeta.js').SyllabusSelection} [syllabus]
 * @param {string[] | null | undefined} [bloomLevels]
 * @param {import('../data/tests').Question[]} [sourcePool]
 */
export function poolForSubBankPathway(
  subBankType,
  examPatternId,
  syllabus,
  bloomLevels,
  sourcePool,
) {
  const rows = getSubBankPracticePool(subBankType, examPatternId, syllabus, sourcePool, bloomLevels)
  return filterQuestionsByBloom(rows, bloomLevels).filter((q) => questionMatchesSubBankType(q, subBankType))
}

/** @param {SubBankType} subBankType @param {SubBankPathwayId} pathwayId */
export function pathwaySupportedForSubBank(subBankType, pathwayId) {
  const list = SUB_BANK_PATHWAYS[subBankType] ?? SUB_BANK_PATHWAY_IDS
  return list.includes(pathwayId)
}

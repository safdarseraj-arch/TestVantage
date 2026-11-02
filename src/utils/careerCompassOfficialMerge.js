/**
 * Merge curated baseline catalog + marks history with official source attribution.
 * Used by API, adaptive brain, and fetch script.
 */

import { CAREER_COMPASS_BASELINE } from '../data/careerCompassCatalog.js'
import { COUNSELLING_YEARS, HISTORY_YEARS, MARKS_RANK_HISTORY, NTA_MARKS_YEARS } from '../data/careerCompassHistory.js'
import {
  OFFICIAL_DATA_SOURCES,
  OFFICIAL_SNAPSHOT_VERSION,
  primaryCutoffSourceForType,
} from '../data/careerCompassOfficial/manifest.js'

/** @param {string} year @param {string} collegeType */
function cutoffSourceForYear(year, collegeType) {
  const primary = primaryCutoffSourceForType(collegeType)
  if (primary === 'mcc') return 'mcc'
  if (year === '2026' && ['nit', 'iiit', 'gfti'].includes(collegeType)) return 'josaa'
  return primary
}

/**
 * Tag college + branch rows with counselling source per year.
 * @param {import('../data/careerCompassCatalog.js').CollegeRow[]} colleges
 */
export function tagCatalogWithOfficialSources(colleges) {
  return (colleges ?? []).map((college) => {
    const collegeSource = primaryCutoffSourceForType(college.type)
    return {
      ...college,
      dataSource: collegeSource,
      dataSourceLabel:
        OFFICIAL_DATA_SOURCES.find((s) => s.id === collegeSource)?.label ?? collegeSource,
      nirfSource: college.nirfRank != null && college.nirfYear ? 'nirf' : null,
      placementSource: college.placement?.placementSource ?? college.placementSource ?? null,
      branches: (college.branches ?? []).map((branch) => {
        /** @type {Record<string, string>} */
        const cutoffSources = {}
        for (const y of HISTORY_YEARS) {
          if (branch.cutoffs?.[y] != null) {
            cutoffSources[y] = cutoffSourceForYear(y, college.type)
          }
        }
        return {
          ...branch,
          cutoffSources,
          dataSource: collegeSource,
        }
      }),
    }
  })
}

/**
 * Tag NTA-style marks curves per exam.
 * @param {typeof MARKS_RANK_HISTORY} history
 */
export function tagMarksHistoryWithOfficialSources(history) {
  /** @type {Record<string, { source: string, sourceLabel: string, years: string[], anchors: Record<string, unknown[]> }>} */
  const meta = {}
  const tagged = {}
  for (const [examId, years] of Object.entries(history ?? {})) {
    tagged[examId] = {}
    meta[examId] = {
      source: 'nta',
      sourceLabel: 'NTA',
      years: [...NTA_MARKS_YEARS],
      anchors: {},
    }
    for (const [year, anchors] of Object.entries(years)) {
      tagged[examId][year] = (anchors ?? []).map((a) => ({
        ...a,
        source: 'nta',
      }))
      meta[examId].anchors[year] = tagged[examId][year]
    }
  }
  return { history: tagged, meta }
}

/**
 * Build merged official bundle (curated benchmarks + source tags).
 * @param {{ pulledAt?: number, note?: string }} [opts]
 */
export function buildOfficialCareerCompassBundle(opts = {}) {
  const { history: marksHistory, meta: marksMeta } = tagMarksHistoryWithOfficialSources(
    MARKS_RANK_HISTORY,
  )
  const colleges = tagCatalogWithOfficialSources(CAREER_COMPASS_BASELINE)
  const pulledAt = opts.pulledAt ?? Date.now()
  return {
    version: OFFICIAL_SNAPSHOT_VERSION,
    pulledAt,
    dataQuality: 'curated-official-benchmarks',
    sources: OFFICIAL_DATA_SOURCES,
    sourcesUsed: ['NTA', 'JoSAA', 'CSAB', 'MCC'],
    historyYears: [...COUNSELLING_YEARS],
    ntaMarksYears: [...NTA_MARKS_YEARS],
    colleges,
    marksHistory,
    marksMeta,
    collegeCount: colleges.length,
    branchCount: colleges.reduce((n, c) => n + (c.branches?.length ?? 0), 0),
    note:
      opts.note ??
      'Curated from published NTA score distributions (2016–2026) and JoSAA / CSAB / MCC counselling closing ranks (2024–2026). Not a live government API feed — verify on official portals.',
    liveFetchAvailable: false,
  }
}

/** @param {import('../data/careerCompassCatalog.js').CollegeRow} college */
export function collegeHasOfficialCutoffTags(college) {
  return (college.branches ?? []).some((b) =>
    HISTORY_YEARS.some((y) => b.cutoffSources?.[y] || b.cutoffs?.[y] != null),
  )
}

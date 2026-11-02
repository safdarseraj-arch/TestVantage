/**
 * Career Compass prediction engine:
 * - 2027 marks → percentile / AIR from the latest two complete NTA years (trend-extrapolated)
 * - JEE Main & NEET: AIR + State Rank
 * - College match from 3-year JoSAA / CSAB / MCC-style cutoffs
 * - Branch explore / compare helpers
 */

import {
  BRANCH_OPTIONS,
  COUNSELLING_SOURCES,
  COUNSELLING_YEARS,
  EXAM_POOL_BY_YEAR,
  getExamPoolForYear,
  HISTORY_YEARS,
  INDIAN_STATES,
  MARKS_RANK_HISTORY,
  NTA_DATA_SOURCES,
  NTA_MARKS_YEARS,
  PREDICT_TARGET_YEAR,
  RECENT_NTA_YEARS,
  TREND_NTA_YEARS,
  extrapolateTwoYearTrend,
} from '../data/careerCompassHistory.js'
import { FEE_SOURCE_NOTE, NIRF_SOURCE_NOTE } from '../data/careerCompassCatalog.js'
import { CAREER_EXAMS, CAREER_COMPASS_SOURCES } from '../data/careerCompassCatalog.js'
import { getCareerCompassColleges, getAdaptiveMarksHistory } from './careerCompassBrain.js'
import {
  buildBranchProvenance,
  DATA_UNAVAILABLE_LABEL,
  DATA_INDICATIVE_HINT,
  GO_LIVE_DATA_POLICY,
  provenanceBadgeLabel,
  resolvePlacementFieldProvenance,
} from './careerCompassProvenance.js'
import { buildRoundChanceBoard, normalizePlacementPackage } from './counsellingPredictor.js'

/** Projected 2027 national candidate pools (extrapolated from 2024–2026 NTA registration trend). */
export const EXAM_POOL_SIZE = {
  'jee-main': EXAM_POOL_BY_YEAR['jee-main'][PREDICT_TARGET_YEAR],
  'jee-advanced': EXAM_POOL_BY_YEAR['jee-advanced'][PREDICT_TARGET_YEAR],
  neet: EXAM_POOL_BY_YEAR.neet[PREDICT_TARGET_YEAR],
}

/** @param {string} examId @param {string|number} [year] */
export function getExamPoolSize(examId, year = PREDICT_TARGET_YEAR) {
  return getExamPoolForYear(examId, year)
}

/** Cap display percentile — only rank 1 may show 100.00. */
export function capDisplayPercentile(percentile, rank) {
  if (rank === 1) return 100
  return Math.min(99.99, Math.max(0.01, Math.round(percentile * 100) / 100))
}

/** @param {number} pool @param {number} air */
export function percentileFromAirPool(pool, air) {
  if (!pool || air < 1) return 99.99
  if (air <= 1) return 100
  return capDisplayPercentile(((pool - air + 1) / pool) * 100, air)
}

/** @param {number} pool @param {number} percentile */
export function airFromPercentilePool(pool, percentile) {
  if (percentile >= 100) return 1
  const p = Math.min(99.99, Math.max(0.01, percentile))
  return Math.max(1, Math.round((pool * (100 - p)) / 100))
}

/** Keep percentile and AIR mathematically consistent for a given exam pool. */
export function reconcilePercentileAir(examId, percentile, air) {
  const pool = getExamPoolSize(examId)
  const reconciledAir = air != null ? Math.max(1, Math.round(air)) : airFromPercentilePool(pool, percentile)
  const reconciledPct = percentileFromAirPool(pool, reconciledAir)
  return { percentile: reconciledPct, air: reconciledAir, poolSize: pool }
}

export {
  DATA_UNAVAILABLE_LABEL,
  DATA_INDICATIVE_HINT,
  GO_LIVE_DATA_POLICY,
  provenanceBadgeLabel,
  buildBranchProvenance,
  resolvePlacementFieldProvenance,
}

/**
 * @typedef {{ band: 'safe'|'match'|'reach'|'dream', score: number, rankDistance: number, college: import('../data/careerCompassCatalog.js').CollegeRow, branch: import('../data/careerCompassCatalog.js').BranchRow, avgCutoff: number, latestCutoff: number, trend: 'up'|'down'|'flat', cutoffs: Record<string, number>, preferredMatch?: boolean }} CollegeMatch
 */

/** @param {string} examId */
export function getExamMeta(examId) {
  return CAREER_EXAMS.find((e) => e.id === examId) ?? CAREER_EXAMS[0]
}

export {
  HISTORY_YEARS,
  COUNSELLING_YEARS,
  NTA_MARKS_YEARS,
  RECENT_NTA_YEARS,
  TREND_NTA_YEARS,
  NTA_DATA_SOURCES,
  PREDICT_TARGET_YEAR,
  INDIAN_STATES,
  BRANCH_OPTIONS,
  COUNSELLING_SOURCES,
}

/** Exam paper toughness — NTA-style: easy paper = same marks worth less (worse rank). */
export const EXAM_TOUGHNESS_OPTIONS = [
  {
    id: 'easy',
    label: 'Easy',
    rankSpread: 0.2,
    pctSpreadLow: 0.52,
    pctSpreadHigh: 0.22,
    rankBias: 1.14,
    percentileBias: -0.85,
    hint: 'Easy paper — many students scored well, so your marks translate to a lower percentile and worse rank.',
  },
  {
    id: 'moderate',
    label: 'Moderate',
    rankSpread: 0.18,
    pctSpreadLow: 0.38,
    pctSpreadHigh: 0.38,
    rankBias: 1,
    percentileBias: 0,
    hint: 'Typical session — balanced rank & percentile range.',
  },
  {
    id: 'tough',
    label: 'Tough',
    rankSpread: 0.22,
    pctSpreadLow: 0.22,
    pctSpreadHigh: 0.52,
    rankBias: 0.86,
    percentileBias: 0.85,
    hint: 'Tough paper — fewer high scores, so the same marks can mean a higher percentile and better rank.',
  },
]

export const TOUGHNESS_DROPDOWN_HINT =
  'Easy paper = same marks count for less (more competition). Tough paper = same marks count for more.'

/** Category quota hints — aligned with JoSAA / MCC counselling (market predictor style). */
export const CATEGORY_QUOTA_HINTS = {
  general: 'General / UR — matches use published General category closing ranks.',
  ews: 'EWS — typically ~15% easier closing ranks than General (10% seats). Verify on JoSAA / MCC.',
  obc: 'OBC-NCL — typically ~35% easier closing ranks than General (27% seats). Home-state quota may help further.',
  sc: 'SC — typically ~2.8× easier closing ranks than General (15% seats). Check state quota on official portal.',
  st: 'ST — typically ~4× easier closing ranks than General (7.5% seats). Check state quota on official portal.',
}

/** @param {string} [categoryId] */
export function getCategoryQuotaHint(categoryId) {
  return CATEGORY_QUOTA_HINTS[categoryId] ?? CATEGORY_QUOTA_HINTS.general
}

export const SESSION_NOTE_TEMPLATE =
  '{year} session · Rank from {historyYears} NTA-style curves · Colleges from JoSAA / CSAB / MCC closing ranks'

export const RANK_PREDICTOR_DISCLAIMER =
  'Estimated rank and percentile — Indicative, not a live NTA API and not your official scorecard. Rank trend uses the latest two complete NTA years (marks vs percentile); older years are history only. Actual AIR depends on candidates, paper difficulty, and normalization. Always verify on the NTA portal when results are out.'

/** Approximate share of national pool by category (for category-rank estimate). */
const CATEGORY_POOL_SHARE = {
  general: 1,
  ews: 0.1,
  obc: 0.27,
  sc: 0.15,
  st: 0.075,
}

const CATEGORIES_LABEL = {
  general: 'General / UR',
  ews: 'EWS',
  obc: 'OBC-NCL',
  sc: 'SC',
  st: 'ST',
}

/**
 * Estimated category rank from AIR (NTA-style: position within category pool).
 * @param {number} air
 * @param {string} category
 */
export function estimateCategoryRank(air, category) {
  if (!air || air < 1 || !category || category === 'general') return null
  const share = CATEGORY_POOL_SHARE[category] ?? 0.2
  return Math.max(1, Math.round(air * share))
}

/**
 * Published-style marks → percentile → AIR bands from latest curve (market predictor tables).
 * @param {string} examId
 * @param {number} [highlightMarks]
 */
export function getMarksRankBands(examId, highlightMarks) {
  const hist = getAdaptiveMarksHistory()[examId] ?? getAdaptiveMarksHistory()['jee-main']
  const curve = hist['2026'] ?? hist['2025'] ?? []
  if (!curve.length) return []
  const pool = getExamPoolSize(examId)
  // Sample every other anchor for a readable table (plus neighbors of user marks)
  const marksSet = new Set(curve.map((p) => p.marks))
  if (highlightMarks != null) {
    const sorted = [...curve].sort((a, b) => a.marks - b.marks)
    const idx = sorted.findIndex((p) => p.marks >= highlightMarks)
    if (idx > 0) marksSet.add(sorted[idx - 1].marks)
    if (idx >= 0 && idx < sorted.length) marksSet.add(sorted[idx].marks)
    if (idx >= 0 && idx + 1 < sorted.length) marksSet.add(sorted[idx + 1].marks)
    marksSet.add(highlightMarks)
  }
  return [...curve]
    .filter((p) => marksSet.has(p.marks) || p.marks % (examId === 'neet' ? 50 : 20) === 0)
    .sort((a, b) => b.marks - a.marks)
    .map((p) => {
      const air = Math.max(1, Math.round(p.air))
      const pct = capDisplayPercentile(
        p.percentile ?? percentileFromAirPool(pool, air),
        air,
      )
      return {
        marks: p.marks,
        percentile: pct,
        air,
        isHighlight:
          highlightMarks != null && Math.abs(p.marks - highlightMarks) < (examId === 'neet' ? 5 : 2),
      }
    })
}

/** @param {number|string} year @param {number|null|undefined} closingRank */
export function formatClosingCutoff(closingRank) {
  if (closingRank == null || !Number.isFinite(Number(closingRank))) return DATA_UNAVAILABLE_LABEL
  return Number(closingRank).toLocaleString('en-IN')
}

/**
 * Opening / closing display — we only have official closing ranks; opening is not in snapshot.
 * @param {number|string} year
 * @param {number|null|undefined} closingRank
 */
export function formatCutoffRound(year, closingRank) {
  return {
    year: String(year),
    opening: null,
    openingLabel: DATA_UNAVAILABLE_LABEL,
    closing: closingRank != null && Number.isFinite(Number(closingRank)) ? Number(closingRank) : null,
    closingLabel: formatClosingCutoff(closingRank),
    hasOfficialClosing: closingRank != null && Number.isFinite(Number(closingRank)),
  }
}

/** @param {string} [toughnessId] */
export function getToughnessOption(toughnessId) {
  return EXAM_TOUGHNESS_OPTIONS.find((t) => t.id === toughnessId) ?? EXAM_TOUGHNESS_OPTIONS[1]
}

/**
 * Build rank / percentile ranges around a point estimate (exam toughness widens or narrows).
 * @param {{ examId: string, rank: number, percentile: number, toughness?: string, stateId?: string }} input
 */
export function computeRankPercentileRange(input) {
  const { examId, rank, stateId } = input
  const pool = getExamPoolSize(examId)
  const t = getToughnessOption(input.toughness)
  const biasedRank = Math.max(1, Math.round(rank * (t.rankBias ?? 1)))
  const rankLow = Math.max(1, Math.round(biasedRank * (1 - t.rankSpread)))
  const rankHigh = Math.max(rankLow + 1, Math.round(biasedRank * (1 + t.rankSpread)))
  const basePct =
    input.curvePercentile != null
      ? input.curvePercentile + (t.percentileBias ?? 0)
      : percentileFromAirPool(pool, biasedRank)
  const percentileMid = capDisplayPercentile(basePct, biasedRank)
  const percentileLow = capDisplayPercentile(percentileFromAirPool(pool, rankHigh), rankHigh)
  const percentileHigh = capDisplayPercentile(percentileFromAirPool(pool, rankLow), rankLow)
  const supportsState = examId === 'jee-main' || examId === 'neet'
  const stateRankMid =
    supportsState && stateId ? estimateStateRank(biasedRank, stateId, examId) : null
  return {
    rank: biasedRank,
    rankMid: biasedRank,
    rankLow,
    rankHigh,
    percentileMid,
    percentileLow,
    percentileHigh,
    stateRankMid,
    stateRankLow: supportsState && stateId ? estimateStateRank(rankHigh, stateId, examId) : null,
    stateRankHigh: supportsState && stateId ? estimateStateRank(rankLow, stateId, examId) : null,
    toughness: t.id,
    toughnessLabel: t.label,
    toughnessHint: t.hint,
    poolSize: pool,
  }
}

/** @param {number|null|undefined} low @param {number|null|undefined} high @param {(n:number)=>string} [fmt] */
export function formatRange(low, high, fmt = (n) => n.toLocaleString('en-IN')) {
  if (low == null || high == null) return '—'
  if (low === high) return fmt(low)
  return `${fmt(low)} – ${fmt(high)}`
}

/** Monotonic piecewise-linear interpolation on sorted {x,y} points. */
function lerpSeries(points, x) {
  if (!points?.length) return null
  const sorted = [...points].sort((a, b) => a.x - b.x)
  if (x <= sorted[0].x) return sorted[0].y
  if (x >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].y
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (x >= a.x && x <= b.x) {
      const t = (x - a.x) / Math.max(1e-9, b.x - a.x)
      return a.y + t * (b.y - a.y)
    }
  }
  return sorted[sorted.length - 1].y
}

/** Log-linear interpolation for percentile ↔ AIR (coaching predictor standard). */
function lerpLogAirSeries(points, air) {
  if (!points?.length) return null
  const sorted = [...points].sort((a, b) => a.x - b.x)
  const logAir = Math.log10(Math.max(1, air))
  if (logAir <= sorted[0].x) return sorted[0].y
  if (logAir >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].y
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (logAir >= a.x && logAir <= b.x) {
      const t = (logAir - a.x) / Math.max(1e-9, b.x - a.x)
      return a.y + t * (b.y - a.y)
    }
  }
  return sorted[sorted.length - 1].y
}

function trendYearPair(hist) {
  const lastYear = TREND_NTA_YEARS[TREND_NTA_YEARS.length - 1]
  const prevYear = TREND_NTA_YEARS[0]
  return {
    prevYear,
    lastYear,
    prevCurve: hist[prevYear],
    lastCurve: hist[lastYear] ?? hist[prevYear],
  }
}

/**
 * Marks → percentile on a single year's anchor curve.
 * @param {{ marks: number, percentile: number }[]} curve
 * @param {number} marks
 */
export function interpolateMarksToPercentile(curve, marks) {
  if (!curve?.length) return null
  return lerpSeries(
    curve.map((p) => ({ x: p.marks, y: p.percentile })),
    marks,
  )
}

/**
 * Percentile → AIR on a single year's curve (log-linear on AIR axis).
 * @param {{ percentile: number, air: number }[]} curve
 * @param {number} percentile
 */
export function interpolatePercentileToAir(curve, percentile) {
  if (!curve?.length) return null
  const pts = curve
    .map((p) => ({ x: p.percentile, y: p.air }))
    .sort((a, b) => a.x - b.x)
  return lerpSeries(pts, percentile)
}

/**
 * AIR → percentile on a single year's curve (log-linear on AIR axis).
 * @param {{ percentile: number, air: number }[]} curve
 * @param {number} air
 */
export function interpolateAirToPercentile(curve, air) {
  if (!curve?.length) return null
  const pts = curve
    .map((p) => ({ x: Math.log10(Math.max(1, p.air)), y: p.percentile }))
    .sort((a, b) => a.x - b.x)
  return lerpLogAirSeries(pts, air)
}

/**
 * Extrapolate 2027 marks → percentile / AIR from the latest two complete NTA years.
 * Older years are filled into byYear for history display only.
 * @param {string} examId
 * @param {number} marks
 * @returns {{ percentile: number, air: number, byYear: Record<string, { percentile: number, air: number }>, ntaYearsUsed: string[], poolSize: number }}
 */
export function projectMarksToRank2027(examId, marks) {
  const hist = getAdaptiveMarksHistory()[examId] ?? getAdaptiveMarksHistory()['jee-main']
  /** @type {Record<string, { percentile: number, air: number }>} */
  const byYear = {}

  for (const year of NTA_MARKS_YEARS) {
    const curve = hist[year]
    if (!curve?.length) continue
    const pct = interpolateMarksToPercentile(curve, marks)
    if (pct == null) continue
    const air = interpolatePercentileToAir(curve, pct)
    if (air == null) continue
    byYear[year] = { percentile: pct, air }
  }

  const ntaYearsUsed = TREND_NTA_YEARS.filter((year) => byYear[year])
  const { prevYear, lastYear } = trendYearPair(hist)
  const yPrev = byYear[prevYear]
  const yLast = byYear[lastYear]

  if (!yPrev && !yLast) {
    return { percentile: 50, air: 500_000, byYear, ntaYearsUsed, poolSize: getExamPoolSize(examId) }
  }

  let percentile = extrapolateTwoYearTrend(yPrev?.percentile, yLast?.percentile)
  if (percentile == null) percentile = 50
  percentile = Math.max(0.01, Math.min(99.99, percentile))

  let air = extrapolateTwoYearTrend(yPrev?.air, yLast?.air)
  if (air == null) {
    air = airFromPercentilePool(getExamPoolSize(examId, PREDICT_TARGET_YEAR), percentile)
  } else {
    air = Math.max(1, Math.round(air))
  }

  const reconciled = reconcilePercentileAir(examId, percentile, air)
  return {
    percentile: reconciled.percentile,
    air: reconciled.air,
    byYear,
    ntaYearsUsed,
    poolSize: reconciled.poolSize,
  }
}

/**
 * Percentile → AIR using the latest two complete years + 2027 pool.
 * @param {string} examId
 * @param {number} percentile
 */
export function percentileToAir2027(examId, percentile) {
  const hist = getAdaptiveMarksHistory()[examId] ?? getAdaptiveMarksHistory()['jee-main']
  const { prevCurve, lastCurve } = trendYearPair(hist)
  if (!lastCurve?.length && !prevCurve?.length) {
    return airFromPercentilePool(getExamPoolSize(examId), percentile)
  }
  const airLast = lastCurve?.length ? interpolatePercentileToAir(lastCurve, percentile) : null
  const airPrev = prevCurve?.length ? interpolatePercentileToAir(prevCurve, percentile) : null
  const air = extrapolateTwoYearTrend(airPrev, airLast)
  return reconcilePercentileAir(examId, percentile, air != null ? Math.max(1, Math.round(air)) : 500_000).air
}

/**
 * AIR → percentile using the latest two complete years.
 * @param {string} examId
 * @param {number} air
 */
export function airToPercentile2027(examId, air) {
  const hist = getAdaptiveMarksHistory()[examId] ?? getAdaptiveMarksHistory()['jee-main']
  const { prevCurve, lastCurve } = trendYearPair(hist)
  if (!lastCurve?.length && !prevCurve?.length) {
    return capDisplayPercentile(percentileFromAirPool(getExamPoolSize(examId), air), air)
  }
  const pctLast = lastCurve?.length ? interpolateAirToPercentile(lastCurve, air) : null
  const pctPrev = prevCurve?.length ? interpolateAirToPercentile(prevCurve, air) : null
  const blended = extrapolateTwoYearTrend(pctPrev, pctLast)
  return capDisplayPercentile(blended ?? 50, air)
}

/**
 * State rank from AIR using state share of national pool (NTA-style both ranks).
 * @param {number} air
 * @param {string} stateId
 * @param {string} examId
 */
export function estimateStateRank(air, stateId, examId) {
  if (!air || air < 1) return null
  if (examId === 'jee-advanced') return null // Adv publishes AIR primarily
  const state = INDIAN_STATES.find((s) => s.id === stateId) ?? INDIAN_STATES.find((s) => s.id === 'other')
  const share = Math.max(0.003, state?.share ?? 0.02)
  // State rank ≈ position among state candidates ≈ AIR * share (with floor)
  return Math.max(1, Math.round(air * share))
}

/**
 * @param {{ examId: string, marks?: number|null, percentile?: number|null, rank?: number|null, category?: string, stateId?: string, targetYear?: number, toughness?: string }} input
 */
export function predictRankPercentile(input) {
  const examId = input.examId || 'jee-main'
  const meta = getExamMeta(examId)
  const targetYear = input.targetYear ?? PREDICT_TARGET_YEAR
  const stateId = input.stateId || 'uttar-pradesh'
  const toughness = input.toughness || 'moderate'
  let percentile = input.percentile != null && input.percentile > 0 ? Number(input.percentile) : null
  let rank = input.rank != null && input.rank > 0 ? Math.round(Number(input.rank)) : null
  let marks = input.marks != null && input.marks >= 0 ? Number(input.marks) : null
  const userProvidedRank = input.rank != null && input.rank > 0
  /** @type {Record<string, { percentile: number, air: number }> | null} */
  let historyAtMarks = null

  /** @type {number | null} */
  let curvePercentile = null

  if (percentile == null && marks != null) {
    const proj = projectMarksToRank2027(examId, marks)
    percentile = proj.percentile
    curvePercentile = proj.percentile
    if (rank == null) rank = proj.air
    historyAtMarks = proj.byYear
  }
  if (rank == null && percentile != null) {
    rank = percentileToAir2027(examId, percentile)
  }
  if (percentile == null && rank != null) {
    percentile = airToPercentile2027(examId, rank)
  }

  const poolSize = getExamPoolSize(examId)

  if (rank != null && percentile != null && marks != null && !userProvidedRank) {
    const synced = reconcilePercentileAir(examId, percentile, rank)
    percentile = synced.percentile
    rank = synced.air
  }

  /** @type {ReturnType<typeof computeRankPercentileRange> | null} */
  let range = null
  if (rank != null && percentile != null) {
    range = computeRankPercentileRange({
      examId,
      rank,
      percentile,
      curvePercentile: curvePercentile ?? undefined,
      toughness,
      stateId,
    })
    if (!userProvidedRank && marks != null) {
      rank = range.rank
      percentile = range.percentileMid
    }
  }

  const stateRank =
    rank != null && (examId === 'jee-main' || examId === 'neet')
      ? estimateStateRank(rank, stateId, examId)
      : null

  const categoryId = input.category || 'general'
  const categoryRank =
    rank != null && categoryId !== 'general' ? estimateCategoryRank(rank, categoryId) : null
  const categoryRankLow =
    range?.rankHigh != null && categoryId !== 'general'
      ? estimateCategoryRank(range.rankHigh, categoryId)
      : null
  const categoryRankHigh =
    range?.rankLow != null && categoryId !== 'general'
      ? estimateCategoryRank(range.rankLow, categoryId)
      : null

  const stateLabel = INDIAN_STATES.find((s) => s.id === stateId)?.label ?? 'State'

  const confidence =
    userProvidedRank
      ? 'high'
      : input.percentile != null
        ? 'medium'
        : marks != null
          ? 'historical'
          : 'low'

  const toughnessOpt = getToughnessOption(toughness)

  const percentileMid =
    percentile != null ? Math.round(percentile * 100) / 100 : null
  const rankMid = rank
  const stateRankMid = stateRank

  return {
    examId,
    examLabel: meta.label,
    rankLabel: meta.rankLabel,
    marks,
    marksMax: meta.marksMax,
    percentile: percentileMid,
    percentileMid,
    percentileLow: range?.percentileLow ?? null,
    percentileHigh: range?.percentileHigh ?? null,
    rank,
    rankMid,
    rankLow: range?.rankLow ?? rank,
    rankHigh: range?.rankHigh ?? rank,
    air: rank,
    stateRank,
    stateRankMid,
    stateRankLow: range?.stateRankLow ?? stateRank,
    stateRankHigh: range?.stateRankHigh ?? stateRank,
    categoryRank,
    categoryRankMid: categoryRank,
    categoryRankLow,
    categoryRankHigh,
    categoryLabel: CATEGORIES_LABEL[categoryId] ?? categoryId,
    stateId,
    stateLabel,
    supportsStateRank: examId === 'jee-main' || examId === 'neet',
    targetYear,
    historyYears: [...RECENT_NTA_YEARS],
    ntaMarksYears: [...NTA_MARKS_YEARS],
    ntaTrendYears: [...TREND_NTA_YEARS],
    historyAtMarks,
    poolSize,
    confidence,
    category: categoryId,
    toughness,
    toughnessLabel: toughnessOpt.label,
    toughnessHint: toughnessOpt.hint,
    counsellingNote: `College matches use ${HISTORY_YEARS.join('–')} JoSAA / CSAB / MCC closing ranks.`,
    note:
      confidence === 'historical'
        ? `${targetYear} rank trend from the latest two NTA years (${TREND_NTA_YEARS.join(' and ')}); older years are history only (paper: ${toughnessOpt.label}). Indicative — not a live NTA API.`
        : confidence === 'high'
          ? `Using your AIR; ${targetYear} college bands from ${COUNSELLING_YEARS.join('–')} counselling.`
          : confidence === 'medium'
            ? `Percentile → ${targetYear} AIR via the latest two NTA years (${TREND_NTA_YEARS.join(' and ')}). Indicative — not a live NTA API.`
            : 'Enter marks first to predict rank & percentile range.',
  }
}

/** @param {Record<string, number>} cutoffs */
export function avgCutoff(cutoffs) {
  const years = Object.keys(cutoffs || {}).sort()
  if (!years.length) return null
  const vals = years.map((y) => cutoffs[y]).filter((n) => Number.isFinite(n))
  if (!vals.length) return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

/** Prefer last-three counselling years when present */
export function counsellingAvgCutoff(cutoffs) {
  const keys = HISTORY_YEARS.filter((y) => Number.isFinite(cutoffs?.[y]))
  if (keys.length) {
    const vals = keys.map((y) => cutoffs[y])
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  }
  return avgCutoff(cutoffs)
}

/** @param {Record<string, number>} cutoffs */
export function cutoffTrend(cutoffs) {
  const years = HISTORY_YEARS.filter((y) => Number.isFinite(cutoffs?.[y]))
  if (years.length < 2) {
    const all = Object.keys(cutoffs || {}).sort()
    if (all.length < 2) return 'flat'
    const first = cutoffs[all[0]]
    const last = cutoffs[all[all.length - 1]]
    if (!Number.isFinite(first) || !Number.isFinite(last)) return 'flat'
    const delta = (last - first) / Math.max(1, first)
    if (delta > 0.06) return 'up'
    if (delta < -0.06) return 'down'
    return 'flat'
  }
  const first = cutoffs[years[0]]
  const last = cutoffs[years[years.length - 1]]
  const delta = (last - first) / Math.max(1, first)
  if (delta > 0.06) return 'up'
  if (delta < -0.06) return 'down'
  return 'flat'
}

const CATEGORY_FACTOR = {
  general: 1,
  ews: 1.15,
  obc: 1.35,
  sc: 2.8,
  st: 4.2,
}

/** @param {string} branchId @param {string} branchName */
function branchMatchesFilter(branchId, branchName, filterId) {
  if (!filterId || filterId === 'all') return true
  const id = String(branchId || '').toLowerCase()
  const name = String(branchName || '').toLowerCase()
  if (filterId === 'cse') {
    return (
      id === 'cse' ||
      id === 'it' ||
      id === 'ai' ||
      id === 'mt' ||
      /computer|information tech|math.*comput|artificial intelligence|mnc|m\&c/i.test(name)
    )
  }
  if (filterId === 'ece') return id === 'ece' || /electronics|communication/i.test(name)
  if (filterId === 'ee') return id === 'ee' || (/electrical/i.test(name) && !/electronics/i.test(name))
  if (filterId === 'me') return id === 'me' || /mechanical/i.test(name)
  if (filterId === 'ce') return id === 'ce' || /^civil/i.test(name)
  if (filterId === 'ae') return id === 'ae' || /aerospace/i.test(name)
  if (filterId === 'ai') return id === 'ai' || id === 'mt' || /artificial|math.*comput|mnc/i.test(name)
  if (filterId === 'mbbs') return id === 'mbbs' || /mbbs/i.test(name)
  if (filterId === 'bds') return id === 'bds' || /bds/i.test(name)
  return id === filterId || name.includes(filterId)
}

/** Band from predicted rank range vs counselling avg cutoff (lower rank = better). */
function bandFromRankRange(effectiveRankLow, effectiveRankHigh, avg) {
  if (effectiveRankHigh <= avg * 0.85) return 'safe'
  if (effectiveRankLow <= avg * 1.05) return 'match'
  if (effectiveRankLow <= avg * 1.35) return 'reach'
  if (effectiveRankLow <= avg * 2.4) return 'dream'
  return null
}

function collegeMatchesQuery(college, query) {
  if (!query) return true
  const q = query.toLowerCase()
  return (
    college.name.toLowerCase().includes(q) ||
    college.shortName.toLowerCase().includes(q) ||
    college.city.toLowerCase().includes(q) ||
    college.state.toLowerCase().includes(q)
  )
}

/**
 * @param {number} rank
 * @param {string} examId
 * @param {{ category?: string, type?: string, branchId?: string, preferredBranchId?: string, preferredCollegeQuery?: string, rankLow?: number, rankHigh?: number, limit?: number }} [opts]
 * @returns {CollegeMatch[]}
 */
export function predictColleges(rank, examId, opts = {}) {
  if (!rank || rank < 1) return []
  const category = opts.category || 'general'
  const factor = CATEGORY_FACTOR[category] ?? 1
  const effectiveRank = rank * factor
  const effectiveRankLow = (opts.rankLow ?? rank) * factor
  const effectiveRankHigh = (opts.rankHigh ?? rank) * factor
  const branchFilter = opts.branchId || opts.preferredBranchId
  const collegeQuery = String(opts.preferredCollegeQuery ?? '').trim()
  const colleges = getCareerCompassColleges().filter((c) => c.exams.includes(examId))
  const typed = opts.type && opts.type !== 'all' ? colleges.filter((c) => c.type === opts.type) : colleges

  /** @type {CollegeMatch[]} */
  const matches = []
  for (const college of typed) {
    if (!collegeMatchesQuery(college, collegeQuery)) continue
    for (const branch of college.branches ?? []) {
      if (!branchMatchesFilter(branch.id, branch.name, branchFilter)) continue
      const avg = counsellingAvgCutoff(branch.cutoffs)
      const years = Object.keys(branch.cutoffs || {}).sort()
      const latestYear = [...HISTORY_YEARS].reverse().find((y) => Number.isFinite(branch.cutoffs?.[y]))
      const latest = latestYear ? branch.cutoffs[latestYear] : years.length ? branch.cutoffs[years[years.length - 1]] : avg
      if (!avg || !latest) continue

      const band = bandFromRankRange(effectiveRankLow, effectiveRankHigh, avg)
      if (!band) continue

      const ratio = effectiveRank / avg
      let score = 0
      if (band === 'safe') score = 95 - ratio * 20
      else if (band === 'match') score = 85 - (ratio - 0.75) * 40
      else if (band === 'reach') score = 55 - (ratio - 1.05) * 50
      else score = 30 - (ratio - 1.35) * 15

      const rankDistance = Math.abs(avg - effectiveRank)
      const preferredMatch =
        (opts.preferredBranchId &&
          opts.preferredBranchId !== 'all' &&
          branchMatchesFilter(branch.id, branch.name, opts.preferredBranchId)) ||
        (collegeQuery && collegeMatchesQuery(college, collegeQuery))

      matches.push({
        band,
        score: Math.max(5, Math.min(99, Math.round(score))),
        rankDistance,
        college,
        branch,
        branchProfile: buildBranchProfile(college, branch),
        branchPlacement: branchPlacementStats(college.placement ?? {}, branch.id),
        avgCutoff: avg,
        latestCutoff: latest,
        trend: cutoffTrend(branch.cutoffs),
        cutoffs: { ...branch.cutoffs },
        roundChances: buildRoundChanceBoard(rank, college, branch),
        preferredMatch: !!preferredMatch,
      })
    }
  }

  matches.sort((a, b) => {
    if (a.preferredMatch !== b.preferredMatch) return a.preferredMatch ? -1 : 1
    if (a.rankDistance !== b.rankDistance) return a.rankDistance - b.rankDistance
    const order = { safe: 0, match: 1, reach: 2, dream: 3 }
    if (order[a.band] !== order[b.band]) return order[a.band] - order[b.band]
    return b.score - a.score
  })

  return matches.slice(0, opts.limit ?? 40)
}

/**
 * Explore all colleges offering a branch (optional rank filter).
 * @param {string} examId
 * @param {string} branchId
 * @param {{ rank?: number|null, category?: string, type?: string, limit?: number }} [opts]
 */
export function exploreCollegesByBranch(examId, branchId, opts = {}) {
  if (opts.rank) {
    return predictColleges(opts.rank, examId, {
      category: opts.category,
      type: opts.type,
      branchId,
      limit: opts.limit ?? 50,
    })
  }
  const colleges = getCareerCompassColleges().filter((c) => c.exams.includes(examId))
  const typed = opts.type && opts.type !== 'all' ? colleges.filter((c) => c.type === opts.type) : colleges
  /** @type {CollegeMatch[]} */
  const out = []
  for (const college of typed) {
    for (const branch of college.branches ?? []) {
      if (!branchMatchesFilter(branch.id, branch.name, branchId)) continue
      const avg = counsellingAvgCutoff(branch.cutoffs) ?? 0
      const latestYear = [...HISTORY_YEARS].reverse().find((y) => Number.isFinite(branch.cutoffs?.[y]))
      out.push({
        band: 'match',
        score: 50,
        rankDistance: Math.abs(avg - (opts.rank ?? 0) * (CATEGORY_FACTOR[opts.category || 'general'] ?? 1)),
        college,
        branch,
        branchProfile: buildBranchProfile(college, branch),
        avgCutoff: avg,
        latestCutoff: latestYear ? branch.cutoffs[latestYear] : avg,
        trend: cutoffTrend(branch.cutoffs),
        cutoffs: { ...branch.cutoffs },
        roundChances: opts.rank ? buildRoundChanceBoard(opts.rank, college, branch) : null,
      })
    }
  }
  out.sort((a, b) => (a.avgCutoff || 0) - (b.avgCutoff || 0))
  return out.slice(0, opts.limit ?? 60)
}

/**
 * Side-by-side compare rows for selected college+branch pairs.
 * @param {{ collegeId: string, branchId: string }[]} picks
 */
export function buildBranchCompareRows(picks) {
  const colleges = getCareerCompassColleges()
  return (picks ?? [])
    .slice(0, 5)
    .map((p) => {
      const college = colleges.find((c) => c.id === p.collegeId)
      if (!college) return null
      const branch =
        college.branches.find((b) => b.id === p.branchId) ||
        college.branches.find((b) => branchMatchesFilter(b.id, b.name, p.branchId)) ||
        college.branches[0]
      if (!branch) return null
      return buildBranchProfile(college, branch)
    })
    .filter(Boolean)
}

/** @param {string} collegeId */
export function getCollegeById(collegeId) {
  return getCareerCompassColleges().find((c) => c.id === collegeId) ?? null
}

/** @param {string} query */
export function searchColleges(query, examId) {
  const q = String(query ?? '')
    .trim()
    .toLowerCase()
  let list = getCareerCompassColleges()
  if (examId) list = list.filter((c) => c.exams.includes(examId))
  if (!q) return list
  return list.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.shortName.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.state.toLowerCase().includes(q) ||
      c.type.includes(q),
  )
}

export function bandLabel(band) {
  return (
    {
      safe: 'Safe',
      match: 'Good match',
      reach: 'Reach',
      dream: 'Dream',
    }[band] ?? band
  )
}

/** Standard placement salary rows — fixed label order for UI. */
export const PLACEMENT_SALARY_ROWS = [
  { label: 'Lowest salary', field: 'lowestLpa' },
  { label: 'Average Salary', field: 'avgLpa' },
  { label: 'Median Salary', field: 'medianLpa' },
  { label: 'Highest Salary (Domestic)', field: 'highestDomesticLpa' },
  { label: 'Highest Salary (International)', field: 'highestIntlLpa' },
]

export const PLACEMENT_DISCLAIMER =
  'Official = published TPO / NIRF. Indicative/unverified is labelled. Missing stays Not available — never a guessed typical package. Always verify on the college site.'

/**
 * Branch placement for display. Published overlay/institute figures are copied as-is.
 * Do not invent CSE vs ME multipliers for published packages.
 */
export function branchPlacementStats(institute, _branchId) {
  if (!institute || typeof institute !== 'object') return { placementSource: null }
  const hasBase = ['avgLpa', 'medianLpa', 'lowestLpa', 'pctPlaced', 'highestLpa', 'highestDomesticLpa'].some(
    (f) => institute[f] != null && Number.isFinite(Number(institute[f])),
  )
  if (!hasBase) {
    return {
      placementSource: institute.placementSource ?? null,
      indicative: institute.indicative,
      sourceNote: institute.sourceNote,
      sourceUrl: institute.sourceUrl ?? null,
      sourceYear: institute.sourceYear ?? null,
    }
  }
  const stats = normalizePlacementPackage({
    ...institute,
    indicative: institute.placementSource !== 'official',
    placementSource: institute.placementSource ?? 'indicative',
    sourceNote: institute.sourceNote ?? PLACEMENT_DISCLAIMER,
  })
  return stats
}

const BRANCH_SHORT = {
  cse: 'CSE',
  it: 'IT',
  ai: 'AI',
  mt: 'MnC',
  ece: 'ECE',
  ee: 'EE',
  me: 'ME',
  ce: 'CE',
  che: 'Chem',
  ae: 'Aero',
  min: 'Mining',
  design: 'Design',
  arch: 'Arch',
  mbbs: 'MBBS',
  bds: 'BDS',
}

/** @param {{ id: string, name: string }} branch */
export function shortBranchCode(branch) {
  if (!branch) return '—'
  return BRANCH_SHORT[branch.id] ?? branch.name.split(/[\s&(/]/)[0] ?? branch.id.toUpperCase()
}

/**
 * @param {import('../data/careerCompassCatalog.js').CollegeRow} college
 * @param {import('../data/careerCompassCatalog.js').BranchRow} branch
 */
export function formatBranchLabel(college, branch) {
  return `${shortBranchCode(branch)} @ ${college.shortName}`
}

/**
 * Full branch-scoped profile for compare / predictor / detail views.
 * @param {import('../data/careerCompassCatalog.js').CollegeRow} college
 * @param {import('../data/careerCompassCatalog.js').BranchRow} branch
 */
export function buildBranchProfile(college, branch) {
  const institutePlacement = college.placement ?? {}
  const placement = normalizePlacementPackage(
    branch.placement ?? branchPlacementStats(institutePlacement, branch.id),
  )
  const cutoffs = branch.cutoffs ?? {}
  const feeAnnualLakh = branch.feeAnnualLakh ?? college.feeAnnualLakh ?? null
  const provenance = buildBranchProvenance(college, branch)
  /** @type {Record<string, ReturnType<typeof formatCutoffRound>>} */
  const cutoffRounds = {}
  for (const y of HISTORY_YEARS) {
    cutoffRounds[y] = formatCutoffRound(y, cutoffs[y])
  }
  return {
    collegeId: college.id,
    branchId: branch.id,
    branchLabel: formatBranchLabel(college, branch),
    branchName: branch.name,
    branchCode: shortBranchCode(branch),
    collegeName: college.shortName,
    collegeFullName: college.name,
    name: college.shortName,
    fullName: college.name,
    type: college.type,
    city: college.city,
    state: college.state,
    nirfRank: provenance.nirf.status === 'official' ? provenance.nirf.value : null,
    nirfYear: college.nirfYear ?? null,
    nirfNote: NIRF_SOURCE_NOTE,
    nirfSource: college.nirfSource ?? null,
    feeAnnualLakh,
    feeNote: branch.feeAnnualLakh != null ? 'Branch-specific fee where available' : FEE_SOURCE_NOTE,
    placement,
    placementSource: placement?.placementSource ?? college.placementSource ?? null,
    provenance,
    cutoffs,
    cutoffRounds,
    avgCutoff: counsellingAvgCutoff(cutoffs),
    trend: cutoffTrend(cutoffs),
    officialLinks: getCollegeOfficialLinks(college),
  }
}

/** @param {number|null|undefined} n */
export function formatPlacementLpa(n) {
  if (n == null || Number.isNaN(Number(n))) return DATA_UNAVAILABLE_LABEL
  return `₹${Number(n).toFixed(1)} L`
}

/**
 * @param {import('../data/careerCompassCatalog.js').PlacementStats | null | undefined} placement
 * @param {string} field
 */
export function formatPlacementField(placement, field) {
  const prov = resolvePlacementFieldProvenance(field, placement)
  if (prov.status === 'unavailable') return DATA_UNAVAILABLE_LABEL
  return formatPlacementLpa(prov.value)
}

/** @param {import('../data/careerCompassCatalog.js').PlacementStats | null | undefined} placement @param {string} field */
export function placementSalaryValue(placement, field) {
  if (!placement || typeof placement !== 'object') return null
  const val = placement[field]
  return val != null && Number.isFinite(Number(val)) ? Number(val) : null
}

/** @param {string} sourceId */
export function getCounsellingSourceById(sourceId) {
  return COUNSELLING_SOURCES.find((s) => s.id === sourceId) ?? null
}

/** @param {string} sourceId */
export function getCompassSourceById(sourceId) {
  return (
    CAREER_COMPASS_SOURCES.find((s) => s.id === sourceId) ??
    COUNSELLING_SOURCES.find((s) => s.id === sourceId) ??
    null
  )
}

/** @param {{ type?: string, exams?: string[] }} college */
export function getCollegeCounsellingSource(college) {
  if (!college) return COUNSELLING_SOURCES[0]
  if (college.type === 'medical') return getCounsellingSourceById('mcc') ?? COUNSELLING_SOURCES[0]
  return getCounsellingSourceById('josaa') ?? COUNSELLING_SOURCES[0]
}

/** @param {string} examId */
export function getCounsellingSourcesForExam(examId) {
  const matched = COUNSELLING_SOURCES.filter(
    (s) => s.dataTypes?.includes('cutoff') && (!s.exams?.length || s.exams.includes(examId)),
  )
  if (examId === 'neet') return matched.filter((s) => s.id === 'mcc' || s.id === 'nta')
  const out = matched.filter((s) => s.id === 'josaa' || s.id === 'csab')
  const nta = getCounsellingSourceById('nta')
  return nta ? [...out, nta] : out
}

/** @param {string} examId */
export function getRankPredictionSources(examId) {
  const nta = getCounsellingSourceById('nta')
  const sources = nta ? [nta] : []
  if (examId === 'neet') return sources
  return sources
}

/**
 * Official links for a college detail panel.
 * @param {import('../data/careerCompassCatalog.js').CollegeRow | null | undefined} college
 */
export function getCollegeOfficialLinks(college) {
  if (!college) return []
  /** @type {{ id: string, label: string, url: string, verifyLabel?: string, verifyUrl?: string, kind: string }[]} */
  const links = []
  const counselling = getCollegeCounsellingSource(college)
  links.push({
    id: counselling.id,
    label: `${counselling.fullLabel ?? counselling.label} (${HISTORY_YEARS.join('–')})`,
    url: counselling.url,
    verifyUrl: counselling.verifyUrl ?? counselling.url,
    verifyLabel: counselling.verifyLabel ?? 'Verify on official site',
    kind: 'counselling',
  })
  if (college.type !== 'medical') {
    const csab = getCounsellingSourceById('csab')
    if (csab && ['nit', 'iiit', 'gfti'].includes(college.type)) {
      links.push({
        id: csab.id,
        label: `${csab.fullLabel ?? csab.label} (${HISTORY_YEARS.join('–')})`,
        url: csab.url,
        verifyUrl: csab.verifyUrl ?? csab.url,
        verifyLabel: csab.verifyLabel ?? 'Verify on official site',
        kind: 'counselling',
      })
    }
  }
  if (college.website && college.website !== 'https://josaa.nic.in' && college.website !== 'https://mcc.nic.in') {
    links.push({
      id: 'college-site',
      label: `${college.shortName} — official website`,
      url: college.website,
      verifyLabel: 'Open college website',
      kind: 'college',
    })
  }
  const tpUrl = college.placementPageUrl ?? college.website
  if (tpUrl && college.type !== 'medical') {
    links.push({
      id: 'tpo',
      label: `${college.shortName} — Training & Placement`,
      url: tpUrl,
      verifyUrl: tpUrl,
      verifyLabel: 'Verify placement on college site',
      kind: 'placement',
    })
  }
  const nirf = getCompassSourceById('nirf')
  if (nirf && college.nirfRank != null) {
    links.push({
      id: nirf.id,
      label: `NIRF rank ${college.nirfRank} (${college.nirfYear ?? 'latest'})`,
      url: nirf.verifyUrl ?? nirf.url,
      verifyUrl: nirf.verifyUrl ?? nirf.url,
      verifyLabel: nirf.verifyLabel ?? 'Verify on NIRF',
      kind: 'nirf',
    })
  }
  return links
}

/** @param {string} examId @param {'rank'|'colleges'|'compare'} context */
export function getOfficialReferenceBundle(examId, context) {
  if (context === 'rank') {
    const nta = getCounsellingSourceById('nta')
    const newestTrendYear = Number(TREND_NTA_YEARS[TREND_NTA_YEARS.length - 1])
    const heldBack = NTA_MARKS_YEARS.filter((y) => Number(y) > newestTrendYear)
    const heldBackNote = heldBack.length
      ? ` ${heldBack.join(', ')} is not published in full yet, so it stays out of the trend.`
      : ''
    return {
      title: 'Official reference — rank prediction',
      note: `Marks → percentile → AIR trend uses the latest two complete NTA years (${TREND_NTA_YEARS.join(' and ')}), projected for ${PREDICT_TARGET_YEAR}.${heldBackNote} Indicative — not a live NTA API. Always verify your scorecard.`,
      sources: nta ? [nta] : [],
    }
  }
  const counselling = getCounsellingSourcesForExam(examId).filter((s) => s.dataTypes?.includes('cutoff'))
  const nirf = getCompassSourceById('nirf')
  const sources = [...counselling]
  if (context === 'compare' && nirf) sources.push(nirf)
  return {
    title: context === 'compare' ? 'Official reference — compare data' : 'Official reference — college cutoffs',
    note: `Closing ranks from official JoSAA / CSAB / MCC counselling (${HISTORY_YEARS.join('–')}). Placement & fee figures are indicative — verify on college T&P / NIRF sites.`,
    sources,
  }
}

export function bandHint(band) {
  return (
    {
      safe: 'Your rank is comfortably inside recent JoSAA/CSAB/MCC closing trends.',
      match: 'Close to the 3-year counselling average — realistic target.',
      reach: 'Slightly tougher than recent cutoffs — possible with category / home-state.',
      dream: 'Ambitious vs recent counselling years — keep as stretch goal.',
    }[band] ?? ''
  )
}

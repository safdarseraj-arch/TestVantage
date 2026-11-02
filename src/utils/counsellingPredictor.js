/**
 * Local counselling predictor: 0.5 percentile lookup, round-wise chances, overlay merge.
 * Does not call Gemini at page-load. Gemini only fills src/data/generated/counsellingFill.js.
 */

import {
  COUNSELLING_BODY_BY_TYPE,
  COUNSELLING_TREND_YEARS,
  CSAB_ROUNDS,
  GEMINI_FILL_HINT,
  JOSAA_ROUNDS,
  KNOWN_COLLEGE_FACTS,
  KNOWN_COLLEGE_WEBSITES,
  MCC_ROUNDS,
  PERCENTILE_GRID_SOURCE_NOTE,
  PERCENTILE_CURVE_TITLE,
  PERCENTILE_GRID_STEP,
  PERCENTILE_GRID_YEARS,
  PLACEMENT_PACKAGE_FIELDS,
  PLACEMENT_OFFICIAL_NOTE,
  PLACEMENT_PACKAGE_NOTE,
  PLACEMENT_UNVERIFIED_NOTE,
  QUOTAS_BY_TYPE,
  ROUND_CHANCE_SOURCE_NOTE,
  TYPE_LABELS,
} from '../data/counsellingConstants.js'
import { COUNSELLING_PERCENTILE_GRIDS } from '../data/counsellingPercentileGrids.js'
import { COUNSELLING_FILL } from '../data/generated/counsellingFill.js'
import { extrapolateTwoYearTrend } from '../data/careerCompassHistory.js'
import {
  TREND_GRID_YEARS,
  percentileCurveSourceNote,
  percentileCurveTitle,
  yearColumnKind,
} from '../data/ntaPublishedMarks.js'

export {
  PERCENTILE_GRID_YEARS,
  PERCENTILE_GRID_STEP,
  PERCENTILE_GRID_SOURCE_NOTE,
  PERCENTILE_CURVE_TITLE,
  TREND_GRID_YEARS,
  ROUND_CHANCE_SOURCE_NOTE,
  PLACEMENT_PACKAGE_FIELDS,
  PLACEMENT_PACKAGE_NOTE,
  PLACEMENT_OFFICIAL_NOTE,
  PLACEMENT_UNVERIFIED_NOTE,
  GEMINI_FILL_HINT,
  COUNSELLING_TREND_YEARS,
}

function snapHalf(percentile) {
  return Math.round(Number(percentile) * 2) / 2
}

export function getCounsellingFillMeta() {
  const fill = COUNSELLING_FILL ?? {}
  return {
    filledAt: fill.filledAt ?? 0,
    source: fill.source ?? 'local-seed',
    hint: fill.hint || GEMINI_FILL_HINT,
    collegeCount: Object.keys(fill.colleges ?? {}).length,
  }
}

/** True when a 0.5-pt row exists (e.g. 99.0 and 99.5). */
export function hasHalfPointPercentileLookup(examId = 'jee-main', percentile = 99.5, year = '2024') {
  const grid = COUNSELLING_PERCENTILE_GRIDS[examId]?.[year] ?? []
  const want = snapHalf(percentile)
  return grid.some((row) => Math.abs(row.percentile - want) < 1e-9)
}

/**
 * @param {string} examId
 * @param {number} percentile
 * @param {string} [year]
 */
export function lookupPercentileGrid(examId, percentile, year = '2026') {
  const grid = COUNSELLING_PERCENTILE_GRIDS[examId]?.[year] ?? COUNSELLING_PERCENTILE_GRIDS['jee-main']?.[year] ?? []
  if (!grid.length) return null
  const want = snapHalf(percentile)
  const exact = grid.find((row) => Math.abs(row.percentile - want) < 1e-9)
  if (exact) return exact
  let best = grid[0]
  let bestDist = Math.abs(grid[0].percentile - want)
  for (const row of grid) {
    const d = Math.abs(row.percentile - want)
    if (d < bestDist) {
      best = row
      bestDist = d
    }
  }
  return best
}

function marksForToughness(row, toughness) {
  if (!row) return null
  if (toughness === 'easy') return row.marksEasy ?? null
  if (toughness === 'tough') return row.marksTough ?? null
  return row.marks ?? null
}

function publishedMarksRow(row) {
  return row && row.marks != null && Number.isFinite(Number(row.marks)) ? row : null
}

function roundMarks1(n) {
  if (n == null || !Number.isFinite(Number(n))) return null
  return Math.round(Number(n) * 10) / 10
}

/**
 * Slice of the 0.5 grid around a percentile.
 * Year columns keep history (including older years). Est. AIR / easy / tough use the latest two years.
 * @param {string} examId
 * @param {{ highlightPercentile?: number|null, toughness?: string, radius?: number }} [opts]
 */
export function getPercentileCurveTable(examId, opts = {}) {
  const toughness = opts.toughness || 'moderate'
  const years = PERCENTILE_GRID_YEARS
  const trendYears = TREND_GRID_YEARS
  const highlight = opts.highlightPercentile != null ? snapHalf(opts.highlightPercentile) : null
  const radius = opts.radius ?? 2.5
  const lastYear = trendYears[trendYears.length - 1]
  const prevYear = trendYears[0]
  const baseGrid =
    COUNSELLING_PERCENTILE_GRIDS[examId]?.[lastYear] ??
    COUNSELLING_PERCENTILE_GRIDS[examId]?.[years[years.length - 1]] ??
    []
  const lo = highlight != null ? highlight - radius : 90
  const hi = highlight != null ? highlight + radius : 100
  const yearKind = Object.fromEntries(years.map((y) => [y, yearColumnKind(examId, y)]))
  const rows = baseGrid
    .filter((row) => row.percentile >= lo - 1e-9 && row.percentile <= hi + 1e-9)
    .map((row) => {
      const byYear = {}
      for (const y of years) {
        const hit = lookupPercentileGrid(examId, row.percentile, y)
        if (hit) byYear[y] = hit
      }
      const prev = publishedMarksRow(byYear[prevYear])
      const last = publishedMarksRow(byYear[lastYear]) ?? prev
      const airTrend = extrapolateTwoYearTrend(prev?.air, last?.air)
      const easyTrend = extrapolateTwoYearTrend(prev?.marksEasy, last?.marksEasy)
      const toughTrend = extrapolateTwoYearTrend(prev?.marksTough, last?.marksTough)
      const marksTrend = extrapolateTwoYearTrend(
        prev ? marksForToughness(prev, toughness) : null,
        last ? marksForToughness(last, toughness) : null,
      )
      return {
        percentile: row.percentile,
        air: airTrend != null ? Math.max(1, Math.round(airTrend)) : last?.air ?? row.air,
        marks: marksTrend != null ? roundMarks1(marksTrend) : last ? marksForToughness(last, toughness) : null,
        marksModerate: last?.marks ?? null,
        marksEasy: easyTrend != null ? roundMarks1(easyTrend) : last?.marksEasy ?? null,
        marksTough: toughTrend != null ? roundMarks1(toughTrend) : last?.marksTough ?? null,
        byYear,
        isHighlight: highlight != null && Math.abs(row.percentile - highlight) < 1e-9,
      }
    })
  return {
    examId,
    years,
    trendYears,
    yearKind,
    toughness,
    highlightPercentile: highlight,
    title: percentileCurveTitle(examId) || PERCENTILE_CURVE_TITLE,
    sourceNote: percentileCurveSourceNote(examId) || PERCENTILE_GRID_SOURCE_NOTE,
    rows,
  }
}

function roundsForCollegeType(type) {
  if (type === 'medical') return MCC_ROUNDS
  if (type === 'iit') return JOSAA_ROUNDS
  return [...JOSAA_ROUNDS, ...CSAB_ROUNDS]
}

function chanceBand(userRank, closingRank) {
  if (!userRank || !closingRank || closingRank < 1) return null
  if (userRank <= closingRank * 0.85) return 'safe'
  if (userRank <= closingRank * 1.05) return 'match'
  if (userRank <= closingRank * 1.35) return 'reach'
  if (userRank <= closingRank * 2.4) return 'dream'
  return 'dream'
}

function bandChanceLabel(band) {
  return (
    {
      safe: 'Safe',
      match: 'Match',
      reach: 'Reach',
      dream: 'Dream',
    }[band] ?? band
  )
}

function derivedClosing(finalClosing, factor) {
  if (!Number.isFinite(finalClosing) || finalClosing < 1) return null
  return Math.max(1, Math.round(finalClosing * factor))
}

/**
 * Round-wise chance board for a college+branch vs the user's AIR.
 * @param {number} userRank
 * @param {{ type?: string, id?: string }} college
 * @param {{ id?: string, cutoffs?: Record<string, number>, roundCutoffs?: Record<string, Record<string, number>> }} branch
 */
export function buildRoundChanceBoard(userRank, college, branch) {
  const type = college?.type ?? 'nit'
  const rounds = roundsForCollegeType(type)
  const years = COUNSELLING_TREND_YEARS.filter((y) => Number.isFinite(branch?.cutoffs?.[y]))
  const yearList = years.length ? years : COUNSELLING_TREND_YEARS
  const latestYear = yearList[yearList.length - 1]
  /** @type {{ id: string, label: string, byYear: Record<string, { closing: number|null, band: string|null, chanceLabel: string }> }[]} */
  const roundRows = rounds.map((round) => {
    /** @type {Record<string, { closing: number|null, band: string|null, chanceLabel: string }>} */
    const byYear = {}
    for (const y of yearList) {
      const override = branch?.roundCutoffs?.[y]?.[round.id]
      const finalClosing = branch?.cutoffs?.[y]
      const closing =
        override != null && Number.isFinite(Number(override))
          ? Math.round(Number(override))
          : derivedClosing(finalClosing, round.factor)
      const band = userRank && closing ? chanceBand(userRank, closing) : null
      byYear[y] = {
        closing,
        band,
        chanceLabel: band ? bandChanceLabel(band) : '—',
      }
    }
    return { id: round.id, label: round.label, byYear }
  })
  const latestChips = roundRows
    .filter((r) => !String(r.id).startsWith('csab') || type !== 'iit')
    .slice(0, 6)
    .map((r) => ({
      id: r.id,
      label: r.label.replace(' (final)', '').replace(' (stray / later)', ''),
      band: r.byYear[latestYear]?.band,
      chanceLabel: r.byYear[latestYear]?.chanceLabel,
      closing: r.byYear[latestYear]?.closing,
    }))
  return {
    years: yearList,
    latestYear,
    rounds: roundRows,
    latestChips,
    sourceNote: ROUND_CHANCE_SOURCE_NOTE,
  }
}

export function emptyUnverifiedPlacement() {
  return {
    pctPlaced: null,
    avgLpa: null,
    medianLpa: null,
    lowestLpa: null,
    highestLpa: null,
    highestDomesticLpa: null,
    highestIntlLpa: null,
    indicative: true,
    placementSource: 'unverified',
    sourceNote: PLACEMENT_UNVERIFIED_NOTE,
    sourceUrl: null,
    sourceYear: null,
    scope: null,
  }
}

function placementHasPublishedNumber(placement) {
  if (!placement || typeof placement !== 'object') return false
  return ['pctPlaced', 'avgLpa', 'medianLpa', 'lowestLpa', 'highestLpa', 'highestDomesticLpa'].some(
    (f) => placement[f] != null && Number.isFinite(Number(placement[f])),
  )
}

export function isOfficialPlacement(placement) {
  const url = String(placement?.sourceUrl ?? '')
  return (
    placement?.placementSource === 'official' &&
    /^https:\/\//i.test(url) &&
    !/vertexaisearch|grounding-api-redirect|shiksha|collegedunia|careers360/i.test(url) &&
    placementHasPublishedNumber(placement)
  )
}

/** Copy institute-level published figures as-is. Do not invent CSE vs ME multipliers. */
function localBranchPlacement(institute) {
  if (!institute || typeof institute !== 'object') return null
  if (institute.placementSource === 'unverified' && !placementHasPublishedNumber(institute)) {
    return emptyUnverifiedPlacement()
  }
  if (!placementHasPublishedNumber(institute)) return null
  return normalizePlacementPackage({
    ...institute,
    indicative: institute.placementSource !== 'official',
    placementSource: institute.placementSource ?? 'indicative',
    sourceNote: institute.sourceNote ?? PLACEMENT_PACKAGE_NOTE,
    scope: institute.scope ?? 'institute',
  })
}

function mergePlacement(base, extra) {
  if (!extra && !base) return base
  if (extra?.placementSource === 'unverified' || extra?.placementSource === 'official') {
    const merged = normalizePlacementPackage({ ...(extra ?? {}) })
    if (merged.placementSource === 'official') {
      merged.indicative = extra.indicative === true
      merged.sourceNote = extra.sourceNote ?? PLACEMENT_OFFICIAL_NOTE
    } else {
      merged.indicative = true
      merged.sourceNote = extra.sourceNote ?? PLACEMENT_UNVERIFIED_NOTE
    }
    return merged
  }
  const merged = { ...(base ?? {}), ...(extra ?? {}) }
  if (merged.highestLpa == null && merged.highestDomesticLpa != null) {
    merged.highestLpa = merged.highestDomesticLpa
  }
  if (merged.highestDomesticLpa == null && merged.highestLpa != null) {
    merged.highestDomesticLpa = merged.highestLpa
  }
  if (extra) {
    merged.indicative = extra.indicative !== false
    merged.placementSource = extra.placementSource ?? 'indicative'
    merged.sourceNote = extra.sourceNote ?? PLACEMENT_PACKAGE_NOTE
    if (extra.sourceUrl) merged.sourceUrl = extra.sourceUrl
    if (extra.sourceYear != null) merged.sourceYear = extra.sourceYear
  }
  return merged
}

function isGenericWebsite(url) {
  if (!url) return true
  return /josaa\.nic\.in|mcc\.nic\.in|www\.(iit|nit|iiit)[a-z0-9]+\.ac\.in$/i.test(String(url))
}

function deriveRoundCutoffs(branch, extraRounds, type) {
  /** @type {Record<string, Record<string, number>>} */
  const out = { ...(branch.roundCutoffs ?? {}) }
  const rounds = roundsForCollegeType(type)
  for (const y of COUNSELLING_TREND_YEARS) {
    const finalClosing = branch.cutoffs?.[y]
    if (!out[y]) out[y] = {}
    for (const round of rounds) {
      const override = extraRounds?.[y]?.[round.id]
      if (override != null && Number.isFinite(Number(override))) {
        out[y][round.id] = Math.round(Number(override))
      } else if (out[y][round.id] == null) {
        const derived = derivedClosing(finalClosing, round.factor)
        if (derived != null) out[y][round.id] = derived
      }
    }
    let prev = 0
    for (const round of rounds) {
      const v = out[y][round.id]
      if (v == null) continue
      if (v < prev) out[y][round.id] = prev
      prev = out[y][round.id]
    }
  }
  return out
}

/**
 * Merge Gemini/local fill onto a catalog college without dropping official year cutoffs.
 * @param {import('../data/careerCompassCatalog.js').CollegeRow} college
 * @param {object} [fill]
 */
export function enrichCollegeWithCounsellingFill(college, fill) {
  const extra = fill ?? COUNSELLING_FILL?.colleges?.[college.id] ?? {}
  const facts = KNOWN_COLLEGE_FACTS[college.id] ?? {}
  const website =
    extra.website ||
    KNOWN_COLLEGE_WEBSITES[college.id] ||
    (!isGenericWebsite(college.website) ? college.website : college.website)
  const quotas = extra.quotas?.length ? extra.quotas : QUOTAS_BY_TYPE[college.type] ?? []
  const branches = (college.branches ?? []).map((branch) => {
    const bFill = extra.branches?.[branch.id] ?? extra.branches?.[branch.id?.toLowerCase()] ?? {}
    const localPlace = localBranchPlacement(college.placement)
    const placement = mergePlacement(branch.placement ?? localPlace, bFill.placement)
    return {
      ...branch,
      placement,
      feeAnnualLakh: bFill.feeAnnualLakh ?? branch.feeAnnualLakh,
      roundCutoffs: deriveRoundCutoffs(branch, bFill.roundClosing ?? bFill.roundCutoffs, college.type),
    }
  })
  return {
    ...college,
    website,
    placement: extra.placement
      ? mergePlacement(college.placement, extra.placement)
      : college.placement,
    placementSource: extra.placement?.placementSource ?? college.placementSource,
    placementPageUrl: extra.placementPageUrl ?? facts.placementPageUrl ?? college.placementPageUrl,
    quotas,
    typeLabel: extra.typeLabel ?? TYPE_LABELS[college.type] ?? college.type,
    counsellingBody: extra.counsellingBody ?? COUNSELLING_BODY_BY_TYPE[college.type],
    establishedYear: extra.establishedYear ?? facts.establishedYear ?? college.establishedYear ?? null,
    affiliation: extra.affiliation ?? facts.affiliation ?? college.affiliation ?? null,
    city: extra.city || college.city,
    state: extra.state || college.state,
    feeAnnualLakh: extra.feeAnnualLakh ?? college.feeAnnualLakh,
    hostelFeeLakh:
      extra.hostelFeeLakh ??
      facts.hostelFeeLakh ??
      college.hostelFeeLakh ??
      (college.type === 'iit' ? 0.24 : college.type === 'iiit' ? 0.28 : college.type === 'medical' ? 0.12 : 0.2),
    branches,
    counsellingFillSource: extra.source ?? COUNSELLING_FILL?.source ?? 'local-seed',
  }
}

/** @param {import('../data/careerCompassCatalog.js').CollegeRow[]} colleges */
export function applyCounsellingFillOverlay(colleges) {
  const map = COUNSELLING_FILL?.colleges ?? {}
  return (colleges ?? []).map((c) => enrichCollegeWithCounsellingFill(c, map[c.id]))
}

/** Normalize overlay placement so all five package fields exist when any salary is present. */
export function normalizePlacementPackage(placement) {
  if (!placement || typeof placement !== 'object') return placement
  const highest = placement.highestLpa ?? placement.highestDomesticLpa
  return {
    ...placement,
    highestLpa: highest,
    highestDomesticLpa: placement.highestDomesticLpa ?? highest,
  }
}

export function placementPackageHasFiveFields(placement) {
  const p = normalizePlacementPackage(placement)
  if (!p) return false
  return PLACEMENT_PACKAGE_FIELDS.every((row) => {
    const v = p[row.field]
    return v != null && Number.isFinite(Number(v))
  })
}

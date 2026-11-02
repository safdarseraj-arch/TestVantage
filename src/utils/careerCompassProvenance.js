/**
 * Career Compass — honest data provenance for go-live display.
 * Each field is tagged official | indicative | unavailable.
 */

/** @typedef {'official' | 'indicative' | 'unavailable'} DataProvenance */

export const DATA_UNAVAILABLE_LABEL = 'Not available'
export const DATA_INDICATIVE_HINT = 'Indicative (verify on college site)'

export const GO_LIVE_DATA_POLICY =
  'After go-live we show official figures when verified from NTA / JoSAA / CSAB / MCC / NIRF snapshots. Ballpark estimates are labelled Indicative. Missing fields show as Not available — never placeholder numbers.'

/** @type {Record<DataProvenance, string>} */
export const PROVENANCE_BADGE_LABEL = {
  official: 'Official',
  indicative: 'Indicative',
  unavailable: 'Not available',
}

/**
 * @param {DataProvenance} status
 * @returns {string}
 */
export function provenanceBadgeLabel(status) {
  return PROVENANCE_BADGE_LABEL[status] ?? PROVENANCE_BADGE_LABEL.unavailable
}

/**
 * @param {number|null|undefined} value
 * @param {DataProvenance} status
 * @param {(n: number) => string} [fmt]
 */
export function formatProvenancedNumber(value, status, fmt = (n) => String(n)) {
  if (status === 'unavailable' || value == null || !Number.isFinite(Number(value))) {
    return DATA_UNAVAILABLE_LABEL
  }
  return fmt(Number(value))
}

/**
 * NIRF rank — official only when sourced from NIRF snapshot.
 * @param {{ nirfRank?: number|null, nirfYear?: number|null, nirfSource?: string|null }} college
 */
export function resolveNirfProvenance(college) {
  if (college?.nirfRank != null && college.nirfSource === 'nirf') {
    return { status: /** @type {DataProvenance} */ ('official'), source: 'nirf', value: college.nirfRank }
  }
  return { status: /** @type {DataProvenance} */ ('unavailable'), source: null, value: null }
}

/** @param {string} field @param {import('../data/careerCompassCatalog.js').PlacementStats | null | undefined} placement */
export function resolvePlacementFieldProvenance(field, placement) {
  if (!placement || placement[field] == null || !Number.isFinite(Number(placement[field]))) {
    return { status: /** @type {DataProvenance} */ ('unavailable'), source: null, value: null }
  }
  if (placement.source === 'official' || placement.placementSource === 'official') {
    return {
      status: /** @type {DataProvenance} */ ('official'),
      source: placement.placementSource ?? 'official',
      value: Number(placement[field]),
    }
  }
  return {
    status: /** @type {DataProvenance} */ ('indicative'),
    source: placement.placementSource ?? 'indicative',
    value: Number(placement[field]),
  }
}

/**
 * @param {import('../data/careerCompassCatalog.js').PlacementStats | null | undefined} placement
 */
export function resolvePlacementProvenance(placement) {
  /** @type {Record<string, { status: DataProvenance, source: string|null, value: number|null }>} */
  const fields = {}
  for (const field of [
    'lowestLpa',
    'avgLpa',
    'medianLpa',
    'highestDomesticLpa',
    'highestLpa',
    'highestIntlLpa',
    'pctPlaced',
  ]) {
    fields[field] = resolvePlacementFieldProvenance(field, placement)
  }
  const hasOfficial = Object.values(fields).some((f) => f.status === 'official')
  const hasIndicative = Object.values(fields).some((f) => f.status === 'indicative')
  const status = hasOfficial ? 'official' : hasIndicative ? 'indicative' : 'unavailable'
  return {
    status: /** @type {DataProvenance} */ (status),
    source: placement?.placementSource ?? (hasIndicative ? 'indicative' : null),
    fields,
  }
}

/**
 * Cutoff provenance from JoSAA / CSAB / MCC tags.
 * @param {Record<string, number>|null|undefined} cutoffs
 * @param {Record<string, string>|null|undefined} cutoffSources
 */
export function resolveCutoffProvenance(cutoffs, cutoffSources) {
  /** @type {Record<string, DataProvenance>} */
  const byYear = {}
  let hasAny = false
  for (const [year, rank] of Object.entries(cutoffs ?? {})) {
    if (rank == null || !Number.isFinite(Number(rank))) {
      byYear[year] = 'unavailable'
      continue
    }
    hasAny = true
    byYear[year] = cutoffSources?.[year] ? 'official' : 'official'
  }
  return {
    status: /** @type {DataProvenance} */ (hasAny ? 'official' : 'unavailable'),
    source: cutoffSources ? Object.values(cutoffSources)[0] ?? null : null,
    byYear,
  }
}

/**
 * @param {import('../data/careerCompassCatalog.js').CollegeRow} college
 * @param {import('../data/careerCompassCatalog.js').BranchRow} branch
 */
export function buildBranchProvenance(college, branch) {
  const placement = branch.placement ?? college.placement
  return {
    nirf: resolveNirfProvenance(college),
    placement: resolvePlacementProvenance(placement),
    cutoffs: resolveCutoffProvenance(branch.cutoffs, branch.cutoffSources),
  }
}

/**
 * Career Compass — Choice Filling Guide (AI-guided)
 * Rank bands stay primary; within each band, local AI ranks by placement/salary,
 * cutoff trend, and user preferences. Gemini narrates when ready.
 */

import { runAiAssistWithFallback } from './aiProviderAssist.js'
import { bandLabel, formatPlacementLpa, DATA_UNAVAILABLE_LABEL } from './careerCompassPredict.js'
import { CAREER_COMPASS_SOURCES } from '../data/careerCompassCatalog.js'

/** @typedef {'josaa' | 'csab' | 'mcc'} CounsellingTypeId */
/** @typedef {'dream' | 'reach' | 'match' | 'safe'} ChanceBand */

export const CHOICE_FILLING_TAB = {
  id: 'choice-guide',
  label: '5 · Choice Filling Guide',
  name: 'Choice Filling Guide',
  subtitle:
    'AI-guided preference order for JoSAA / CSAB / MCC — rank safety first, then placement, salary & your preferences',
}

export const COUNSELLING_TYPE_OPTIONS = [
  {
    id: /** @type {CounsellingTypeId} */ ('josaa'),
    label: 'JoSAA',
    short: 'JoSAA',
    exams: ['jee-main', 'jee-advanced'],
    collegeTypes: ['iit', 'nit', 'iiit', 'gfti'],
    portalId: 'josaa',
  },
  {
    id: /** @type {CounsellingTypeId} */ ('csab'),
    label: 'CSAB (special rounds)',
    short: 'CSAB',
    exams: ['jee-main'],
    collegeTypes: ['nit', 'iiit', 'gfti'],
    portalId: 'csab',
  },
  {
    id: /** @type {CounsellingTypeId} */ ('mcc'),
    label: 'MCC (NEET UG)',
    short: 'MCC',
    exams: ['neet'],
    collegeTypes: ['medical'],
    portalId: 'mcc',
  },
]

export const CHOICE_FILLING_DISCLAIMER =
  'This is AI study guidance only — not official counselling and not a seat guarantee. Always verify choice lists, rules, and allotment on JoSAA / CSAB / MCC.'

export const OFFICIAL_VS_AI_NOTE =
  'Official cutoff data = closing ranks from counselling reports. Placement / salary figures are often Indicative (college TPO / NIRF style) — never invent missing numbers. AI = ordering help + wording only.'

/** Fill the longest honest list the portal allows. */
export const MAX_FILL_ADVICE =
  'Fill as many preferences as the counselling portal allows — not a short list of dream colleges only. A longer mix of reach, match, and safe options gives you more chances across rounds and lowers the risk of ending with no seat.'

/** Past data cannot lock future outcomes. */
export const PAST_NOT_FUTURE_WARNING =
  'Past cutoffs and placements cannot guarantee future seats or packages. Use them as a guide only — closing ranks and salaries change every year.'

/** Preference-list principles (everyday language). */
export const CHOICE_ORDER_PRINCIPLES = [
  'Fill as many choices as the portal allows (maximum list). A short dream-only list wastes chances across rounds.',
  'List options in the order you truly prefer — counselling allots the highest preference you are eligible for.',
  'Do not put only dream colleges at the top with nothing realistic below. Mix reach, match, and safe.',
  'Keep a cushion of safe choices near the bottom so you are less likely to end with no seat.',
  'Within the same rank band, we lean toward stronger placement/salary signals and your stated preferences when data exists.',
  'Past cutoffs and placements help you plan — they do not guarantee this year’s seat or package.',
  'Re-check opening/closing ranks and category/home-state rules on the official portal before locking.',
]

/** Band order stays fixed for feasibility. */
const BAND_SEQUENCE = /** @type {ChanceBand[]} */ (['dream', 'reach', 'match', 'safe'])

/**
 * @param {string} examId
 * @returns {CounsellingTypeId}
 */
export function defaultCounsellingTypeForExam(examId) {
  if (examId === 'neet') return 'mcc'
  return 'josaa'
}

/**
 * @param {string} examId
 * @returns {typeof COUNSELLING_TYPE_OPTIONS}
 */
export function counsellingTypesForExam(examId) {
  return COUNSELLING_TYPE_OPTIONS.filter((t) => t.exams.includes(examId))
}

/**
 * @param {CounsellingTypeId | string} typeId
 */
export function getCounsellingTypeOption(typeId) {
  return COUNSELLING_TYPE_OPTIONS.find((t) => t.id === typeId) ?? COUNSELLING_TYPE_OPTIONS[0]
}

/**
 * Filter college matches for a counselling portal.
 * @param {Array<{ college?: { type?: string }, band?: string }>} matches
 * @param {CounsellingTypeId | string} counsellingType
 */
export function filterMatchesForCounselling(matches, counsellingType) {
  const opt = getCounsellingTypeOption(counsellingType)
  const allowed = new Set(opt.collegeTypes)
  return (matches ?? []).filter((m) => allowed.has(m.college?.type))
}

/**
 * @param {unknown} n
 * @returns {number | null}
 */
function finiteOrNull(n) {
  const v = Number(n)
  return Number.isFinite(v) ? v : null
}

/**
 * Placement / salary signals from a match — never invent numbers.
 * @param {{
 *   branchPlacement?: Record<string, unknown>
 *   branchProfile?: { placement?: Record<string, unknown>, placementSource?: string | null }
 *   college?: { placement?: Record<string, unknown>, placementSource?: string | null, state?: string }
 * }} match
 */
export function extractPlacementSignals(match) {
  const p =
    match?.branchPlacement && typeof match.branchPlacement === 'object'
      ? match.branchPlacement
      : match?.branchProfile?.placement && typeof match.branchProfile.placement === 'object'
        ? match.branchProfile.placement
        : match?.college?.placement && typeof match.college.placement === 'object'
          ? match.college.placement
          : {}

  const avgLpa = finiteOrNull(p.avgLpa)
  const medianLpa = finiteOrNull(p.medianLpa)
  const lowestLpa = finiteOrNull(p.lowestLpa)
  const highestDomesticLpa = finiteOrNull(p.highestDomesticLpa)
  const pctPlaced = finiteOrNull(p.pctPlaced)
  const rawSource =
    p.placementSource ??
    match?.branchProfile?.placementSource ??
    match?.college?.placementSource ??
    null
  /** @type {'official' | 'indicative' | null} */
  let source = null
  if (rawSource === 'official') source = 'official'
  else if (rawSource === 'indicative' || p.indicative === true) source = 'indicative'
  else if (avgLpa != null || medianLpa != null || pctPlaced != null) source = 'indicative'

  const hasSalary = avgLpa != null || medianLpa != null || highestDomesticLpa != null
  const hasPlacement = hasSalary || pctPlaced != null

  return {
    avgLpa,
    medianLpa,
    lowestLpa,
    highestDomesticLpa,
    pctPlaced,
    source,
    hasSalary,
    hasPlacement,
    salaryLabel:
      avgLpa != null
        ? `Avg ${formatPlacementLpa(avgLpa)}`
        : medianLpa != null
          ? `Median ${formatPlacementLpa(medianLpa)}`
          : DATA_UNAVAILABLE_LABEL,
    pctLabel: pctPlaced != null ? `${pctPlaced}% placed` : DATA_UNAVAILABLE_LABEL,
  }
}

/**
 * @param {{
 *   preferredBranchId?: string | null
 *   preferredCollegeQuery?: string | null
 *   homeStateLabel?: string | null
 *   homeStateId?: string | null
 * }} [prefs]
 * @param {{
 *   preferredMatch?: boolean
 *   branch?: { id?: string, name?: string }
 *   college?: { name?: string, shortName?: string, city?: string, state?: string }
 * }} match
 */
export function scorePreferenceFit(match, prefs = {}) {
  /** @type {string[]} */
  const labels = []
  let score = 0

  const branchId = String(prefs.preferredBranchId ?? '').trim()
  if (branchId && branchId !== 'all') {
    const id = String(match.branch?.id ?? '').toLowerCase()
    const name = String(match.branch?.name ?? '').toLowerCase()
    const want = branchId.toLowerCase()
    const hit =
      id === want ||
      name.includes(want) ||
      (want === 'cse' &&
        (id === 'it' || id === 'ai' || id === 'mt' || /computer|information|artificial|mnc/i.test(name)))
    if (hit) {
      score += 40
      labels.push('Preferred branch')
    }
  }

  const q = String(prefs.preferredCollegeQuery ?? '').trim().toLowerCase()
  if (q) {
    const blob = [match.college?.name, match.college?.shortName, match.college?.city, match.college?.state]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (blob.includes(q)) {
      score += 35
      labels.push('Preferred college')
    }
  }

  if (match.preferredMatch) {
    score += 15
    if (!labels.includes('Preferred branch') && !labels.includes('Preferred college')) {
      labels.push('Matches your filters')
    }
  }

  const stateHint = String(prefs.homeStateLabel ?? '').trim().toLowerCase()
  const collegeState = String(match.college?.state ?? '').trim().toLowerCase()
  if (stateHint && collegeState && (collegeState === stateHint || collegeState.includes(stateHint) || stateHint.includes(collegeState))) {
    score += 12
    labels.push('Home-state campus')
  }

  return { score, labels, fit: labels.length > 0 }
}

/**
 * Local AI score within a rank band (higher = list earlier inside that band).
 * Cutoff proximity still matters; placement/salary/prefs break ties among similar cutoffs.
 *
 * @param {{
 *   avgCutoff?: number
 *   score?: number
 *   rankDistance?: number
 *   trend?: string
 *   preferredMatch?: boolean
 *   branch?: { id?: string, name?: string }
 *   college?: { name?: string, shortName?: string, city?: string, state?: string, placement?: object }
 *   branchPlacement?: object
 *   branchProfile?: object
 * }} match
 * @param {{
 *   preferredBranchId?: string | null
 *   preferredCollegeQuery?: string | null
 *   homeStateLabel?: string | null
 *   bandMedianCutoff?: number | null
 * }} [prefs]
 */
export function scoreChoiceCandidate(match, prefs = {}) {
  const placement = extractPlacementSignals(match)
  const pref = scorePreferenceFit(match, prefs)

  const avg = finiteOrNull(match.avgCutoff)
  const median = finiteOrNull(prefs.bandMedianCutoff)
  // Selectivity: lower closing rank → slightly higher (within band)
  let cutoffScore = 40
  if (avg != null && median != null && median > 0) {
    const ratio = avg / median
    cutoffScore = Math.max(5, Math.min(55, 55 - (ratio - 0.7) * 40))
  } else if (avg != null) {
    cutoffScore = 35
  }

  let placementScore = 0
  if (placement.avgLpa != null) placementScore += Math.min(28, placement.avgLpa * 0.7)
  else if (placement.medianLpa != null) placementScore += Math.min(24, placement.medianLpa * 0.65)
  if (placement.highestDomesticLpa != null) placementScore += Math.min(8, placement.highestDomesticLpa * 0.08)
  if (placement.pctPlaced != null) placementScore += Math.min(14, (placement.pctPlaced - 70) * 0.45)
  if (placement.source === 'official') placementScore += 4

  let trendScore = 0
  if (match.trend === 'up') trendScore = 6 // demand rising / harder cutoffs
  else if (match.trend === 'down') trendScore = 3
  else if (match.trend === 'flat') trendScore = 4

  const baseFit = finiteOrNull(match.score) ?? 0
  const total =
    cutoffScore * 0.45 +
    placementScore * 0.35 +
    pref.score * 0.55 +
    trendScore +
    baseFit * 0.08

  return {
    total,
    cutoffScore,
    placementScore,
    preferenceScore: pref.score,
    trendScore,
    placement,
    preference: pref,
  }
}

/**
 * Build short “why this pick” notes — only real data.
 * @param {Parameters<typeof scoreChoiceCandidate>[0]} match
 * @param {ReturnType<typeof scoreChoiceCandidate>} scored
 */
export function buildWhyNotes(match, scored) {
  /** @type {string[]} */
  const notes = []
  const p = scored.placement
  if (p.hasSalary) {
    const bits = []
    if (p.avgLpa != null) bits.push(`avg ${formatPlacementLpa(p.avgLpa)}`)
    if (p.medianLpa != null) bits.push(`median ${formatPlacementLpa(p.medianLpa)}`)
    if (p.highestDomesticLpa != null) bits.push(`high ${formatPlacementLpa(p.highestDomesticLpa)}`)
    notes.push(`Salary signal (${p.source === 'official' ? 'Official' : 'Indicative'}): ${bits.join(', ')}`)
  } else {
    notes.push(`Salary: ${DATA_UNAVAILABLE_LABEL}`)
  }
  if (p.pctPlaced != null) {
    notes.push(`Placement: ${p.pctPlaced}% (${p.source === 'official' ? 'Official' : 'Indicative'})`)
  }
  if (match.trend === 'up') notes.push('Cutoff trend: tighter lately (higher demand)')
  else if (match.trend === 'down') notes.push('Cutoff trend: eased vs recent years')
  else if (match.trend === 'flat') notes.push('Cutoff trend: fairly stable')
  for (const label of scored.preference.labels) notes.push(`Preference: ${label}`)
  if (match.avgCutoff != null) {
    notes.push(`Feasibility: ~cutoff ${Number(match.avgCutoff).toLocaleString('en-IN')} · ${bandLabel(match.band)}`)
  }
  return notes
}

/**
 * Sort within a band using AI signals (placement / salary / prefs among similar cutoffs).
 * @param {Array<Parameters<typeof scoreChoiceCandidate>[0]>} list
 * @param {Parameters<typeof scoreChoiceCandidate>[1]} [prefs]
 */
export function sortBandByAiSignals(list, prefs = {}) {
  const cutoffs = list.map((m) => finiteOrNull(m.avgCutoff)).filter((n) => n != null)
  const bandMedianCutoff =
    cutoffs.length > 0
      ? [...cutoffs].sort((a, b) => a - b)[Math.floor(cutoffs.length / 2)]
      : null
  const scored = list.map((m) => {
    const s = scoreChoiceCandidate(m, { ...prefs, bandMedianCutoff })
    return { match: m, scored: s }
  })
  scored.sort((a, b) => {
    if (b.scored.total !== a.scored.total) return b.scored.total - a.scored.total
    const ca = finiteOrNull(a.match.avgCutoff) ?? 1e12
    const cb = finiteOrNull(b.match.avgCutoff) ?? 1e12
    return ca - cb
  })
  return scored
}

/** @deprecated Prefer sortBandByAiSignals — kept for older tests / callers */
export function sortBandByPreference(list) {
  return sortBandByAiSignals(list).map((s) => s.match)
}

/**
 * Build ordered preference list: Dream → Reach → Match → Safe (capped),
 * AI-ranked inside each band by placement/salary/prefs.
 *
 * @param {Array<Parameters<typeof scoreChoiceCandidate>[0] & { band?: ChanceBand | string }>} matches
 * @param {{
 *   maxDream?: number
 *   maxReach?: number
 *   maxMatch?: number
 *   maxSafe?: number
 *   maxTotal?: number
 *   counsellingType?: CounsellingTypeId | string
 *   preferredBranchId?: string | null
 *   preferredCollegeQuery?: string | null
 *   homeStateLabel?: string | null
 *   homeStateId?: string | null
 *   categoryLabel?: string | null
 * }} [opts]
 */
export function buildChoiceFillingOrder(matches, opts = {}) {
  const maxDream = opts.maxDream ?? 4
  const maxReach = opts.maxReach ?? 6
  const maxMatch = opts.maxMatch ?? 12
  const maxSafe = opts.maxSafe ?? 10
  const maxTotal = opts.maxTotal ?? 28

  const prefs = {
    preferredBranchId: opts.preferredBranchId,
    preferredCollegeQuery: opts.preferredCollegeQuery,
    homeStateLabel: opts.homeStateLabel,
    homeStateId: opts.homeStateId,
  }

  const filtered = opts.counsellingType
    ? filterMatchesForCounselling(matches, opts.counsellingType)
    : [...(matches ?? [])]

  /** @type {Record<ChanceBand, typeof filtered>} */
  const byBand = { dream: [], reach: [], match: [], safe: [] }
  for (const m of filtered) {
    const band = /** @type {ChanceBand} */ (m.band)
    if (byBand[band]) byBand[band].push(m)
  }

  const caps = {
    dream: maxDream,
    reach: maxReach,
    match: maxMatch,
    safe: maxSafe,
  }

  /** @type {Array<typeof filtered[number] & {
   *   preference: number
   *   bandLabel: string
   *   aiScore: number
   *   whyNotes: string[]
   *   preferenceLabels: string[]
   *   placementSignals: ReturnType<typeof extractPlacementSignals>
   *   placementBadge: 'official' | 'indicative' | 'unavailable'
   * }>} */
  const ordered = []
  /** @type {Record<ChanceBand, ReturnType<typeof sortBandByAiSignals>>} */
  const scoredGroups = {
    dream: sortBandByAiSignals(byBand.dream, prefs),
    reach: sortBandByAiSignals(byBand.reach, prefs),
    match: sortBandByAiSignals(byBand.match, prefs),
    safe: sortBandByAiSignals(byBand.safe, prefs),
  }

  for (const band of BAND_SEQUENCE) {
    const picked = scoredGroups[band].slice(0, caps[band])
    for (const { match: m, scored } of picked) {
      if (ordered.length >= maxTotal) break
      const placementBadge =
        scored.placement.source === 'official'
          ? 'official'
          : scored.placement.hasPlacement
            ? 'indicative'
            : 'unavailable'
      ordered.push({
        ...m,
        preference: ordered.length + 1,
        bandLabel: bandLabel(band),
        aiScore: Math.round(scored.total * 10) / 10,
        whyNotes: buildWhyNotes(m, scored),
        preferenceLabels: scored.preference.labels,
        placementSignals: scored.placement,
        placementBadge,
      })
    }
  }

  const counts = {
    dream: ordered.filter((o) => o.band === 'dream').length,
    reach: ordered.filter((o) => o.band === 'reach').length,
    match: ordered.filter((o) => o.band === 'match').length,
    safe: ordered.filter((o) => o.band === 'safe').length,
    total: ordered.length,
  }

  const prefHits = ordered.filter((o) => (o.preferenceLabels?.length ?? 0) > 0).length
  const withSalary = ordered.filter((o) => o.placementSignals?.hasSalary).length

  return {
    ordered,
    counts,
    preferenceFit: {
      matchedCount: prefHits,
      total: ordered.length,
      summary:
        prefHits > 0
          ? `${prefHits} of ${ordered.length} picks align with your branch/college/home-state preferences.`
          : ordered.length
            ? 'No explicit branch/college preference applied — order leans on rank band, then placement/salary where available.'
            : 'Add a preferred branch or college in Rank & college for a tighter preference fit.',
    },
    placementCoverage: {
      withSalary,
      total: ordered.length,
    },
    bandGroups: {
      dream: scoredGroups.dream.map((s) => s.match),
      reach: scoredGroups.reach.map((s) => s.match),
      match: scoredGroups.match.map((s) => s.match),
      safe: scoredGroups.safe.map((s) => s.match),
    },
    strategy:
      'AI-guided fill: use the longest honest list the portal allows. Rank bands stay Dream → Reach → Match → Safe. Inside each band we boost stronger placement/salary signals and your preferences when data exists — never inventing missing salaries. Past cutoffs/placements guide planning only; they cannot guarantee future seats or packages.',
  }
}

/**
 * Mini guide copy for each counselling type (everyday language).
 * @param {CounsellingTypeId | string} counsellingType
 */
export function getCounsellingGuideSections(counsellingType) {
  const type = getCounsellingTypeOption(counsellingType)
  const sharedWhat = {
    id: 'what',
    title: 'What is choice filling?',
    body: [
      'Choice filling means you submit an ordered list of college + course (branch) options.',
      'In each round, the system tries to give you the highest preference you are eligible for based on your rank and category.',
      'Fill as many preferences as the portal allows — a longer honest list gives more chances across rounds than a short dream-only list.',
      'Past cutoffs and placements help you plan; they cannot guarantee this year’s seat or package.',
    ],
  }

  const mistakes = {
    id: 'mistakes',
    title: 'Common mistakes',
    body: [
      'Filling only a short list of dream colleges with no safe options.',
      'Stopping early instead of using the maximum choices the portal allows.',
      'Copying a friend’s list without checking your own rank and category.',
      'Ignoring home-state / category / quota differences.',
      'Treating last year’s cutoff or placement figures as a guarantee for this year.',
      'Freezing too early (or floating forever) without reading that round’s rules.',
      'Trusting unofficial “guarantees” — always re-check the official portal.',
    ],
  }

  if (type.id === 'mcc') {
    return [
      sharedWhat,
      {
        id: 'rounds',
        title: 'MCC (NEET) round basics',
        body: [
          'MCC runs All-India quota counselling for NEET UG medical seats (and related streams as listed on the portal).',
          'There are usually multiple rounds — each has registration, choice filling/editing, allotment, and reporting steps.',
          'Dates and seat types change by year — follow the current MCC schedule only.',
        ],
      },
      {
        id: 'options',
        title: 'After allotment — what you can do',
        body: [
          'Accept / report for the allotted seat when required, or follow upgrade / exit options shown for that round.',
          'MCC wording differs from JoSAA’s Freeze / Float / Slide — read the round instructions carefully.',
          'If you skip a required step, you can lose the seat or further rounds — check MCC notices.',
        ],
      },
      mistakes,
    ]
  }

  if (type.id === 'csab') {
    return [
      sharedWhat,
      {
        id: 'rounds',
        title: 'CSAB special-round basics',
        body: [
          'CSAB special rounds fill vacant NIT / IIIT / GFTI seats after JoSAA ends.',
          'You usually need to be eligible under CSAB rules and complete fresh choice filling for special rounds.',
          'Cutoffs can move a lot vs JoSAA — treat CSAB as a second chance, not a copy of your JoSAA list.',
        ],
      },
      {
        id: 'options',
        title: 'Freeze / float style choices',
        body: [
          'JoSAA-style Freeze / Float / Slide language mainly applies during JoSAA rounds.',
          'In CSAB, follow the special-round acceptance and reporting rules on csab.nic.in for that year.',
          'If you already have a JoSAA seat, read carefully whether participating in CSAB will cancel or replace it.',
        ],
      },
      mistakes,
    ]
  }

  return [
    sharedWhat,
    {
      id: 'rounds',
      title: 'JoSAA round flow (simple)',
      body: [
        'JoSAA runs several rounds for IIT / NIT / IIIT / GFTI seats.',
        'Typical loop: register → fill/edit choices → seat allotment → choose Freeze / Float / Slide → report if needed.',
        'Later rounds can upgrade you only if you keep Float/Slide options open (as per that year’s rules).',
      ],
    },
    {
      id: 'options',
      title: 'Freeze / Float / Slide',
      body: [
        'Freeze — you accept this seat and leave further upgrades for that counselling path.',
        'Float — you keep this seat for now but stay open to a better preference in later rounds (often for non-IIT seats — check current rules).',
        'Slide — you stay in the same institute but remain open to a preferred branch there in later rounds.',
        'Exact eligibility for Float/Slide can depend on institute type and year — confirm on josaa.nic.in.',
      ],
    },
    mistakes,
  ]
}

/**
 * Official portal links for the guide.
 * @param {CounsellingTypeId | string} [counsellingType]
 */
export function getCounsellingOfficialLinks(counsellingType) {
  const wanted = counsellingType
    ? [getCounsellingTypeOption(counsellingType).portalId]
    : ['josaa', 'csab', 'mcc']
  return CAREER_COMPASS_SOURCES.filter((s) => wanted.includes(s.id)).map((s) => ({
    id: s.id,
    label: s.label,
    url: s.url,
    verifyUrl: s.verifyUrl ?? s.url,
    verifyLabel: s.verifyLabel ?? 'Verify on official site',
    description: s.description,
  }))
}

/**
 * Parse a positive integer All India Rank from user text.
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parsePositiveAir(raw) {
  const s = String(raw ?? '').trim()
  if (!/^\d+$/.test(s)) return null
  const n = Number(s)
  if (!Number.isInteger(n) || n < 1) return null
  return n
}

/**
 * Local AI narrative — personalized order + rationale.
 * @param {{
 *   counsellingLabel?: string
 *   examLabel?: string
 *   rank?: number | null
 *   rankSource?: 'predicted' | 'actual'
 *   categoryRank?: number | null
 *   percentile?: number | null
 *   category?: string
 *   stateLabel?: string
 *   preferredBranchLabel?: string | null
 *   preferredCollegeQuery?: string | null
 *   order?: ReturnType<typeof buildChoiceFillingOrder>
 * }} input
 */
export function buildCounsellingGuideLocal(input = {}) {
  const order = input.order
  const rankSource = input.rankSource === 'actual' ? 'actual' : 'predicted'
  const lines = []
  lines.push(`**${CHOICE_FILLING_TAB.name}** — ${input.counsellingLabel ?? 'counselling'} (AI)`)
  if (input.examLabel) lines.push(`Exam: **${input.examLabel}**`)
  if (input.rank != null) {
    const rankLabel =
      rankSource === 'actual' ? 'Actual AIR (from scorecard)' : 'Predicted AIR (mid)'
    lines.push(`${rankLabel}: **${Number(input.rank).toLocaleString('en-IN')}**`)
  }
  if (input.categoryRank != null && input.categoryRank > 0) {
    lines.push(`Category rank: **${Number(input.categoryRank).toLocaleString('en-IN')}**`)
  }
  if (input.percentile != null && Number.isFinite(Number(input.percentile))) {
    lines.push(`Percentile: **${Number(input.percentile).toFixed(2)}**`)
  }
  if (input.category) lines.push(`Category: **${input.category}**`)
  if (input.stateLabel) lines.push(`Home state: **${input.stateLabel}**`)
  if (input.preferredBranchLabel) lines.push(`Preferred branch: **${input.preferredBranchLabel}**`)
  if (input.preferredCollegeQuery) lines.push(`Preferred college hint: **${input.preferredCollegeQuery}**`)

  lines.push('')
  lines.push('**Fill as many as you can**')
  lines.push(`- ${MAX_FILL_ADVICE}`)
  lines.push(`- This table is a starter order — on the official portal, keep adding honest preferences up to the maximum allowed.`)

  lines.push('')
  lines.push('**How this AI guide works**')
  lines.push(`- ${order?.strategy ?? CHOICE_ORDER_PRINCIPLES[0]}`)
  if (order?.counts) {
    lines.push(
      `- Suggested mix: Dream ${order.counts.dream}, Reach ${order.counts.reach}, Match ${order.counts.match}, Safe ${order.counts.safe} (total ${order.counts.total}).`,
    )
  }
  if (order?.preferenceFit?.summary) lines.push(`- Preference fit: ${order.preferenceFit.summary}`)
  if (order?.placementCoverage) {
    lines.push(
      `- Salary data present on ${order.placementCoverage.withSalary}/${order.placementCoverage.total} picks (others show ${DATA_UNAVAILABLE_LABEL}).`,
    )
  }

  const top = (order?.ordered ?? []).slice(0, 10)
  if (top.length) {
    lines.push('')
    lines.push('**Suggested fill order**')
    for (const row of top) {
      const name = row.college?.shortName ?? row.college?.name ?? 'College'
      const branch = row.branch?.name ?? 'Branch'
      lines.push(
        `${row.preference}. ${name} — ${branch} · ${row.bandLabel ?? bandLabel(row.band)}` +
          (row.avgCutoff ? ` · ~cutoff ${Number(row.avgCutoff).toLocaleString('en-IN')}` : ''),
      )
      const why = (row.whyNotes ?? []).slice(0, 2)
      for (const w of why) lines.push(`   · ${w}`)
    }
    if ((order?.ordered?.length ?? 0) > top.length) {
      lines.push(`…and ${order.ordered.length - top.length} more in the table.`)
    }
  } else {
    lines.push('')
    lines.push(
      rankSource === 'actual'
        ? 'Enter your **actual AIR** above so we can build a concrete AI-guided list.'
        : 'Enter marks or AIR in **Rank & college** first so we can build a concrete AI-guided list.',
    )
  }

  lines.push('')
  lines.push('**Order principles**')
  for (const p of CHOICE_ORDER_PRINCIPLES) lines.push(`- ${p}`)

  lines.push('')
  lines.push(`**Important:** ${PAST_NOT_FUTURE_WARNING}`)
  lines.push(OFFICIAL_VS_AI_NOTE)

  return {
    text: lines.join('\n'),
    disclaimer: `${CHOICE_FILLING_DISCLAIMER} ${PAST_NOT_FUTURE_WARNING}`,
  }
}

/**
 * Gemini-first guide; local order + placement facts stay the source of truth.
 * @param {Parameters<typeof buildCounsellingGuideLocal>[0] & {
 *   examId?: string
 *   counsellingType?: CounsellingTypeId | string
 * }} input
 */
export async function explainCounsellingChoiceGuide(input = {}) {
  const local = buildCounsellingGuideLocal(input)
  const context = {
    task: 'career_compass_choice_filling',
    examId: input.examId,
    examLabel: input.examLabel,
    counsellingType: input.counsellingType,
    counsellingLabel: input.counsellingLabel,
    official: {
      rank: input.rank ?? null,
      rankSource: input.rankSource === 'actual' ? 'actual' : 'predicted',
      categoryRank: input.categoryRank ?? null,
      percentile: input.percentile ?? null,
      category: input.category ?? null,
      stateLabel: input.stateLabel ?? null,
      preferredBranch: input.preferredBranchLabel ?? null,
      preferredCollege: input.preferredCollegeQuery ?? null,
    },
    counts: input.order?.counts ?? null,
    preferenceFit: input.order?.preferenceFit ?? null,
    strategy: input.order?.strategy ?? null,
    topPreferences: (input.order?.ordered ?? []).slice(0, 12).map((r) => ({
      preference: r.preference,
      college: r.college?.shortName ?? r.college?.name,
      branch: r.branch?.name,
      band: r.band,
      avgCutoff: r.avgCutoff ?? null,
      trend: r.trend ?? null,
      whyNotes: (r.whyNotes ?? []).slice(0, 3),
      preferenceLabels: r.preferenceLabels ?? [],
      placement: {
        avgLpa: r.placementSignals?.avgLpa ?? null,
        medianLpa: r.placementSignals?.medianLpa ?? null,
        pctPlaced: r.placementSignals?.pctPlaced ?? null,
        source: r.placementSignals?.source ?? null,
      },
    })),
    principles: CHOICE_ORDER_PRINCIPLES,
    maxFillAdvice: MAX_FILL_ADVICE,
    pastNotFutureWarning: PAST_NOT_FUTURE_WARNING,
    rule:
      'Do not invent ranks, cutoffs, or salaries. Advise filling the maximum preferences the portal allows (not a short dream-only list). Clearly say past cutoffs and placements cannot guarantee future seats or packages. Explain why this preference order makes sense using only provided facts. Use simple language. Remind this is not official counselling. Do not name Gemini, Cloud, or Local AI — say AI only.',
  }

  return runAiAssistWithFallback({
    task: 'career_compass_choice_filling',
    context,
    localText: local.text,
    localDisclaimer: local.disclaimer,
    learningStem: `choice-guide:${input.counsellingType || 'josaa'}:${input.examId || 'exam'}:${input.rankSource === 'actual' ? 'actual' : 'predicted'}:${input.rank ?? ''}:${input.preferredBranchLabel ?? ''}`,
    recordLearning: true,
  })
}

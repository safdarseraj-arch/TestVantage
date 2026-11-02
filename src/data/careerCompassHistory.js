/**
 * Career Compass — NTA historical marks ↔ percentile ↔ AIR (General / All India).
 *
 * JEE Main 2024 moderate curve: calibrated from Jan + April 2024 session percentile-vs-marks PDFs.
 * Other years stay as history; 2027 rank/percentile trend uses the latest two complete years.
 *
 * Counselling cutoffs remain on the latest three JoSAA / CSAB / MCC years.
 */
import {
  JEE_MAIN_2024_MODERATE_MARKS_CURVE,
  JEE_MAIN_2024_PDF_SOURCE_NOTE,
} from './jeeMain2024PdfCurves.js'
import { JEE_MAIN_2025_MODERATE_MARKS_CURVE, JEE_MAIN_2025_SESSION_SOURCE_NOTE } from './jeeMain2025SessionCurves.js'
import { TREND_GRID_YEARS, getPublishedYearRecord } from './ntaPublishedMarks.js'

/** @typedef {{ marks: number, percentile: number, air: number, source?: string }} MarksAnchor */
/** @typedef {{ pool: number, session?: string, pctDrift?: number, airDrift?: number }} YearMeta */

export const PREDICT_TARGET_YEAR = 2027

/** JoSAA / CSAB / MCC closing-rank years in the college catalog */
export const COUNSELLING_YEARS = ['2024', '2025', '2026']

/** @deprecated Use COUNSELLING_YEARS for cutoffs; NTA_MARKS_YEARS for rank curves */
export const HISTORY_YEARS = COUNSELLING_YEARS

/** Full NTA marks-rank anchor span used by the rank predictor */
export const NTA_MARKS_YEARS = [
  '2016',
  '2017',
  '2018',
  '2019',
  '2020',
  '2021',
  '2022',
  '2023',
  '2024',
  '2025',
  '2026',
]

/** Heavier weighting in curve blend (last three complete NTA years) — counselling history */
export const RECENT_NTA_YEARS = ['2024', '2025', '2026']

/** Rank / percentile TREND uses only the latest two complete published NTA years. */
export const TREND_NTA_YEARS = TREND_GRID_YEARS

/** Extra weight on the year-to-year move when projecting the next session. */
export const TREND_SLOPE = 0.35

/**
 * Latest-two-years fit: last + (last − prev) × slope.
 * @param {number|null|undefined} prev
 * @param {number|null|undefined} last
 * @param {number} [slope]
 */
export function extrapolateTwoYearTrend(prev, last, slope = TREND_SLOPE) {
  const hasLast = last != null && Number.isFinite(Number(last))
  const hasPrev = prev != null && Number.isFinite(Number(prev))
  if (hasLast && hasPrev) return Number(last) + (Number(last) - Number(prev)) * slope
  if (hasLast) return Number(last)
  if (hasPrev) return Number(prev)
  return null
}

/**
 * Registered / appeared candidate pools per exam & year (NTA press releases).
 * @type {Record<string, Record<string, number>>}
 */
export const EXAM_POOL_BY_YEAR = {
  'jee-main': {
    2016: 1_198_989,
    2017: 1_186_564,
    2018: 1_043_739,
    2019: 931_198,
    2020: 921_261,
    2021: 869_010,
    2022: 900_000,
    2023: 1_080_000,
    2024: 1_230_000,
    2025: 1_350_000,
    2026: 1_450_000,
    2027: 1_520_000,
  },
  'jee-advanced': {
    2016: 155_000,
    2017: 160_000,
    2018: 160_000,
    2019: 161_319,
    2020: 155_538,
    2021: 150_000,
    2022: 160_000,
    2023: 165_000,
    2024: 175_000,
    2025: 178_000,
    2026: 180_000,
    2027: 182_000,
  },
  neet: {
    2016: 802_594,
    2017: 1_089_825,
    2018: 1_326_725,
    2019: 1_519_375,
    2020: 1_597_435,
    2021: 1_614_777,
    2022: 1_872_343,
    2023: 2_087_462,
    2024: 2_300_000,
    2025: 1_950_000,
    2026: 2_000_000,
    2027: 2_050_000,
  },
}

/** @param {string} examId @param {string|number} [year] */
export function getExamPoolForYear(examId, year = PREDICT_TARGET_YEAR) {
  const y = String(year)
  return EXAM_POOL_BY_YEAR[examId]?.[y] ?? EXAM_POOL_BY_YEAR[examId]?.['2026'] ?? 1_450_000
}

/** @param {number} pool @param {number} percentile */
export function airFromPercentileAndPool(pool, percentile) {
  if (percentile >= 100) return 1
  const p = Math.min(99.99, Math.max(0.01, percentile))
  return Math.max(1, Math.round((pool * (100 - p)) / 100))
}

/**
 * Canonical 2026 moderate-session anchors (NTA Re-NEET / JEE Main Session 2 press data).
 * Percentile anchors are primary; AIR is derived from pool unless explicitly set.
 * @type {Record<string, { marks: number, percentile: number }[]>}
 */
const NTA_BASE_CURVES = {
  'jee-main': JEE_MAIN_2024_MODERATE_MARKS_CURVE,
  'jee-advanced': [
    { marks: 40, percentile: 16.5 },
    { marks: 60, percentile: 33 },
    { marks: 80, percentile: 49 },
    { marks: 100, percentile: 65 },
    { marks: 120, percentile: 78 },
    { marks: 140, percentile: 87 },
    { marks: 160, percentile: 92.5 },
    { marks: 180, percentile: 95.8 },
    { marks: 200, percentile: 97.8 },
    { marks: 220, percentile: 98.9 },
    { marks: 240, percentile: 99.4 },
    { marks: 280, percentile: 99.8 },
    { marks: 320, percentile: 99.95 },
    { marks: 360, percentile: 100 },
  ],
  neet: [
    { marks: 200, percentile: 24 },
    { marks: 300, percentile: 46 },
    { marks: 400, percentile: 70 },
    { marks: 450, percentile: 81 },
    { marks: 500, percentile: 89.5 },
    { marks: 550, percentile: 95.2 },
    { marks: 580, percentile: 97.2 },
    { marks: 600, percentile: 98.35 },
    { marks: 620, percentile: 99.1 },
    { marks: 650, percentile: 99.48 },
    { marks: 680, percentile: 99.76 },
      { marks: 690, percentile: 99.88 },
    { marks: 700, percentile: 99.91 },
    { marks: 715, percentile: 99.97 },
    { marks: 720, percentile: 100 },
  ],
}

/**
 * Year-wise drift on 2026 base curve (NTA historical calibration).
 * pctDrift: added to percentile at each anchor; airDrift: multiplier on pool-derived AIR.
 * @type {Record<string, Record<string, YearMeta>>}
 */
const NTA_YEAR_META = {
  'jee-main': {
    2016: { pool: 1_198_989, session: 'both', pctDrift: -2.3, airDrift: 1.72 },
    2017: { pool: 1_186_564, session: 'both', pctDrift: -2.1, airDrift: 1.65 },
    2018: { pool: 1_043_739, session: 'both', pctDrift: -1.85, airDrift: 1.52 },
    2019: { pool: 931_198, session: 'jan+apr', pctDrift: -1.55, airDrift: 1.38 },
    2020: { pool: 921_261, session: 'jan+sep', pctDrift: -1.35, airDrift: 1.32 },
    2021: { pool: 869_010, session: 'feb+mar+apr', pctDrift: -1.15, airDrift: 1.25 },
    2022: { pool: 900_000, session: 'both', pctDrift: -1.35, airDrift: 1.18 },
    2023: { pool: 1_080_000, session: 'both', pctDrift: -0.95, airDrift: 1.08 },
    2024: { pool: 1_230_000, session: 'jan+apr-pdf', pctDrift: 0, airDrift: 1.03 },
    2025: { pool: 1_350_000, session: 'both', pctDrift: -0.15, airDrift: 1.01 },
    2026: { pool: 1_450_000, session: 'both', pctDrift: 0, airDrift: 1 },
  },
  'jee-advanced': {
    2016: { pool: 155_000, session: 'both', pctDrift: -1.8, airDrift: 1.45 },
    2017: { pool: 160_000, session: 'both', pctDrift: -1.6, airDrift: 1.38 },
    2018: { pool: 160_000, session: 'both', pctDrift: -1.4, airDrift: 1.32 },
    2019: { pool: 161_319, session: 'both', pctDrift: -1.2, airDrift: 1.25 },
    2020: { pool: 155_538, session: 'both', pctDrift: -1.0, airDrift: 1.2 },
    2021: { pool: 150_000, session: 'both', pctDrift: -0.85, airDrift: 1.15 },
    2022: { pool: 160_000, session: 'both', pctDrift: -0.65, airDrift: 1.1 },
    2023: { pool: 165_000, session: 'both', pctDrift: -0.45, airDrift: 1.06 },
    2024: { pool: 175_000, session: 'both', pctDrift: -0.25, airDrift: 1.03 },
    2025: { pool: 178_000, session: 'both', pctDrift: -0.12, airDrift: 1.01 },
    2026: { pool: 180_000, session: 'both', pctDrift: 0, airDrift: 1 },
  },
  neet: {
    2016: { pool: 802_594, session: 'single', pctDrift: -3.2, airDrift: 2.1 },
    2017: { pool: 1_089_825, session: 'single', pctDrift: -2.8, airDrift: 1.85 },
    2018: { pool: 1_326_725, session: 'single', pctDrift: -2.4, airDrift: 1.62 },
    2019: { pool: 1_519_375, session: 'single', pctDrift: -2.0, airDrift: 1.45 },
    2020: { pool: 1_597_435, session: 'single', pctDrift: -1.7, airDrift: 1.35 },
    2021: { pool: 1_614_777, session: 'single', pctDrift: -1.4, airDrift: 1.28 },
    2022: { pool: 1_872_343, session: 'single', pctDrift: -1.1, airDrift: 1.18 },
    2023: { pool: 2_087_462, session: 'single', pctDrift: -0.75, airDrift: 1.1 },
    2024: { pool: 2_300_000, session: 'single', pctDrift: -0.35, airDrift: 1.04 },
    2025: { pool: 1_950_000, session: 'single', pctDrift: -0.12, airDrift: 1.02 },
    2026: { pool: 2_000_000, session: 're-neet', pctDrift: 0, airDrift: 1 },
  },
}

/**
 * Explicit 2024–2025 anchors from NTA score distributions (2026 uses NTA_BASE_CURVES).
 * @type {Record<string, Record<string, { marks: number, percentile: number }[]>>}
 */
const EXPLICIT_RECENT_CURVES = {
  'jee-main': {
    '2024': JEE_MAIN_2024_MODERATE_MARKS_CURVE,
    '2025': JEE_MAIN_2025_MODERATE_MARKS_CURVE,
  },
  neet: {
    '2024': [
      { marks: 200, percentile: 26 }, { marks: 300, percentile: 49 }, { marks: 400, percentile: 73 },
      { marks: 450, percentile: 83 }, { marks: 500, percentile: 90.5 }, { marks: 550, percentile: 95.8 },
      { marks: 580, percentile: 97.6 }, { marks: 600, percentile: 98.55 }, { marks: 620, percentile: 99.25 },
      { marks: 650, percentile: 99.58 }, { marks: 680, percentile: 99.8 }, { marks: 690, percentile: 99.89 },
      { marks: 700, percentile: 99.93 }, { marks: 715, percentile: 99.98 }, { marks: 720, percentile: 100 },
    ],
    '2025': [
      { marks: 200, percentile: 25 }, { marks: 300, percentile: 47.5 }, { marks: 400, percentile: 71.5 },
      { marks: 450, percentile: 82 }, { marks: 500, percentile: 90 }, { marks: 550, percentile: 95.5 },
      { marks: 580, percentile: 97.4 }, { marks: 600, percentile: 98.45 }, { marks: 620, percentile: 99.18 },
      { marks: 650, percentile: 99.52 }, { marks: 680, percentile: 99.78 }, { marks: 690, percentile: 99.88 },
      { marks: 700, percentile: 99.92 }, { marks: 715, percentile: 99.975 }, { marks: 720, percentile: 100 },
    ],
  },
  'jee-advanced': {
    '2024': [
      { marks: 40, percentile: 18 }, { marks: 60, percentile: 35 }, { marks: 80, percentile: 52 },
      { marks: 100, percentile: 68 }, { marks: 120, percentile: 80 }, { marks: 140, percentile: 88 },
      { marks: 160, percentile: 93 }, { marks: 180, percentile: 96.2 }, { marks: 200, percentile: 98.0 },
      { marks: 220, percentile: 99.0 }, { marks: 240, percentile: 99.5 }, { marks: 280, percentile: 99.85 },
      { marks: 320, percentile: 99.97 }, { marks: 360, percentile: 100 },
    ],
    '2025': [
      { marks: 40, percentile: 17 }, { marks: 60, percentile: 34 }, { marks: 80, percentile: 50 },
      { marks: 100, percentile: 66 }, { marks: 120, percentile: 79 }, { marks: 140, percentile: 87.5 },
      { marks: 160, percentile: 92.8 }, { marks: 180, percentile: 96.0 }, { marks: 200, percentile: 97.9 },
      { marks: 220, percentile: 98.95 }, { marks: 240, percentile: 99.45 }, { marks: 280, percentile: 99.82 },
      { marks: 320, percentile: 99.96 }, { marks: 360, percentile: 100 },
    ],
  },
}
/** @param {number} pct @param {number} drift */
function applyPctDrift(pct, drift) {
  if (pct >= 100) return 100
  return Math.max(0.01, Math.min(99.99, Math.round((pct + drift) * 100) / 100))
}

/** @param {string} examId @param {string} year */
function buildYearAnchors(examId, year) {
  if (examId === 'jee-main' && year !== '2024' && year !== '2025') {
    const rec = getPublishedYearRecord(examId, year)
    if (rec?.published && rec.points?.length) {
      const pool = getExamPoolForYear(examId, year)
      return [...rec.points]
        .map((p) => {
          const percentile = Number(p.percentile)
          const marks = Number(p.marks)
          const air =
            percentile >= 100
              ? 1
              : Math.max(1, Math.round(airFromPercentileAndPool(pool, percentile)))
          return { marks, percentile, air }
        })
        .filter((p) => Number.isFinite(p.marks) && Number.isFinite(p.percentile))
        .sort((a, b) => a.marks - b.marks)
    }
  }
  const explicit = EXPLICIT_RECENT_CURVES[examId]?.[year]
  const base = explicit ?? NTA_BASE_CURVES[examId] ?? NTA_BASE_CURVES['jee-main']
  const meta = NTA_YEAR_META[examId]?.[year] ?? NTA_YEAR_META['jee-main'][year]
  const pool = meta?.pool ?? getExamPoolForYear(examId, year)
  const pctDrift = explicit ? 0 : (meta?.pctDrift ?? 0)
  const airDrift = meta?.airDrift ?? 1
  return base.map((p) => {
    const percentile = applyPctDrift(p.percentile, pctDrift)
    const air =
      p.percentile >= 100
        ? 1
        : Math.max(1, Math.round(airFromPercentileAndPool(pool, percentile) * airDrift))
    return { marks: p.marks, percentile, air }
  })
}

/** @type {Record<string, Record<string, MarksAnchor[]>>} */
function buildMarksRankHistory() {
  /** @type {Record<string, Record<string, MarksAnchor[]>>} */
  const out = {}
  for (const examId of Object.keys(NTA_BASE_CURVES)) {
    out[examId] = {}
    for (const year of NTA_MARKS_YEARS) {
      out[examId][year] = buildYearAnchors(examId, year)
    }
  }
  return out
}

/**
 * Sorted ascending by marks per year. air = approximate CRL / AIR at that marks band.
 * @type {Record<string, Record<string, MarksAnchor[]>>}
 */
export const MARKS_RANK_HISTORY = buildMarksRankHistory()

/** NTA source notes per exam (for UI / tests) */
export const NTA_DATA_SOURCES = {
  'jee-main':
    `${JEE_MAIN_2024_PDF_SOURCE_NOTE} ${JEE_MAIN_2025_SESSION_SOURCE_NOTE} Rank trend uses the latest two complete published years only; unpublished years are not shown as NTA marks.`,
  'jee-advanced':
    'IIT JEE Advanced CRL lists (2016–2026); marks bands from published response-analysis and rank predictors aligned to ~1.8L qualifiers.',
  neet:
    'NTA NEET UG score distributions & Re-NEET 2026 press release (~20L appeared); marks→percentile from NTA percentile formula; AIR from CRL merit.',
}

export const INDIAN_STATES = [
  { id: 'andhra-pradesh', label: 'Andhra Pradesh', share: 0.042 },
  { id: 'assam', label: 'Assam', share: 0.022 },
  { id: 'bihar', label: 'Bihar', share: 0.068 },
  { id: 'chhattisgarh', label: 'Chhattisgarh', share: 0.018 },
  { id: 'delhi', label: 'Delhi', share: 0.028 },
  { id: 'goa', label: 'Goa', share: 0.004 },
  { id: 'gujarat', label: 'Gujarat', share: 0.048 },
  { id: 'haryana', label: 'Haryana', share: 0.026 },
  { id: 'himachal-pradesh', label: 'Himachal Pradesh', share: 0.008 },
  { id: 'jharkhand', label: 'Jharkhand', share: 0.022 },
  { id: 'karnataka', label: 'Karnataka', share: 0.052 },
  { id: 'kerala', label: 'Kerala', share: 0.032 },
  { id: 'madhya-pradesh', label: 'Madhya Pradesh', share: 0.048 },
  { id: 'maharashtra', label: 'Maharashtra', share: 0.095 },
  { id: 'odisha', label: 'Odisha', share: 0.028 },
  { id: 'punjab', label: 'Punjab', share: 0.022 },
  { id: 'rajasthan', label: 'Rajasthan', share: 0.055 },
  { id: 'tamil-nadu', label: 'Tamil Nadu', share: 0.058 },
  { id: 'telangana', label: 'Telangana', share: 0.035 },
  { id: 'uttar-pradesh', label: 'Uttar Pradesh', share: 0.12 },
  { id: 'uttarakhand', label: 'Uttarakhand', share: 0.012 },
  { id: 'west-bengal', label: 'West Bengal', share: 0.055 },
  { id: 'jk', label: 'Jammu & Kashmir', share: 0.012 },
  { id: 'chandigarh', label: 'Chandigarh', share: 0.004 },
  { id: 'puducherry', label: 'Puducherry', share: 0.003 },
  { id: 'other', label: 'Other / UT', share: 0.02 },
]

/** Canonical branch picker options by exam */
export const BRANCH_OPTIONS = {
  'jee-main': [
    { id: 'cse', label: 'Computer Science (CSE / IT)' },
    { id: 'ece', label: 'Electronics & Communication (ECE)' },
    { id: 'ee', label: 'Electrical Engineering' },
    { id: 'me', label: 'Mechanical Engineering' },
    { id: 'ce', label: 'Civil Engineering' },
  ],
  'jee-advanced': [
    { id: 'cse', label: 'Computer Science & Engineering' },
    { id: 'ee', label: 'Electrical Engineering' },
    { id: 'me', label: 'Mechanical Engineering' },
    { id: 'ce', label: 'Civil Engineering' },
    { id: 'ai', label: 'Artificial Intelligence / MnC' },
    { id: 'ae', label: 'Aerospace Engineering' },
  ],
  neet: [
    { id: 'mbbs', label: 'MBBS' },
    { id: 'bds', label: 'BDS' },
  ],
}

/** Counselling sources for college cutoffs — link students to official portals. */
export const COUNSELLING_SOURCES = [
  {
    id: 'josaa',
    label: 'JoSAA',
    fullLabel: 'JoSAA (IIT / NIT / IIIT / GFTI)',
    url: 'https://josaa.nic.in',
    verifyUrl: 'https://josaa.nic.in/Archives/result/archiveresult.aspx',
    years: '2024–2026',
    appliesTo: ['iit', 'nit', 'iiit', 'gfti'],
    exams: ['jee-main', 'jee-advanced'],
    dataTypes: ['cutoff', 'allotment'],
    verifyLabel: 'Verify closing ranks on JoSAA',
    description: 'Joint Seat Allocation Authority — IIT, NIT, IIIT & GFTI counselling closing ranks.',
  },
  {
    id: 'csab',
    label: 'CSAB',
    fullLabel: 'CSAB special rounds',
    url: 'https://csab.nic.in',
    verifyUrl: 'https://csab.nic.in',
    years: '2024–2026',
    appliesTo: ['nit', 'iiit', 'gfti'],
    exams: ['jee-main'],
    dataTypes: ['cutoff', 'allotment'],
    verifyLabel: 'Verify CSAB special-round cutoffs',
    description: 'Central Seat Allocation Board — vacant NIT / IIIT seats after JoSAA.',
  },
  {
    id: 'mcc',
    label: 'MCC',
    fullLabel: 'MCC NEET UG counselling',
    url: 'https://mcc.nic.in',
    verifyUrl: 'https://mcc.nic.in/web/open/allotment-result',
    years: '2024–2026',
    appliesTo: ['medical'],
    exams: ['neet'],
    dataTypes: ['cutoff', 'allotment'],
    verifyLabel: 'Verify NEET UG allotment on MCC',
    description: 'Medical Counselling Committee — AIQ & deemed university MBBS/BDS cutoffs.',
  },
  {
    id: 'nta',
    label: 'NTA',
    fullLabel: 'NTA scorecards (marks / percentile / AIR)',
    url: 'https://nta.ac.in',
    verifyUrl: 'https://nta.ac.in/Examination',
    years: '2016–2026',
    appliesTo: [],
    exams: ['jee-main', 'jee-advanced', 'neet'],
    dataTypes: ['marks', 'percentile', 'air', 'state-rank'],
    verifyLabel: 'Verify marks & rank on NTA',
    description: 'National Testing Agency — official marks, percentile, AIR & state rank.',
  },
]


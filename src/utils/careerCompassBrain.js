/**
 * Career Compass AI brain — adaptive catalog refresh in the background.
 *
 * Tries official-facing endpoints when API is available; otherwise applies
 * small trend adaptation on the curated 3-year baseline and caches locally.
 * Re-runs on idle so the page stays snappy.
 */

import {
  CAREER_COMPASS_BASELINE,
  CAREER_COMPASS_SOURCES,
} from '../data/careerCompassCatalog.js'
import { OFFICIAL_CAREER_COMPASS_BUNDLE } from '../data/careerCompassOfficial/bundle.js'
import { isPlatformScaleEnabled } from '../config/platform.js'

import { MARKS_RANK_HISTORY, COUNSELLING_YEARS, RECENT_NTA_YEARS } from '../data/careerCompassHistory.js'
import { applyCounsellingFillOverlay } from './counsellingPredictor.js'

const CACHE_KEY = 'testvantage-career-compass-v2'
const META_KEY = 'testvantage-career-compass-meta-v2'
const CURVES_KEY = 'testvantage-career-compass-curves-v2'
const REFRESH_MS = 6 * 60 * 60 * 1000 // 6 hours
const ADAPT_YEARS = RECENT_NTA_YEARS
const ADAPTIVE_VERSION = 2

/** @type {import('../data/careerCompassCatalog.js').CollegeRow[] | null} */
let memoryCache = null
/** @type {typeof MARKS_RANK_HISTORY | null} */
let memoryCurves = null
/** @type {Promise<void> | null} */
let refreshPromise = null

/** @returns {{ updatedAt: number, source: string, note: string, collegeCount: number, branchCount: number, adaptiveVersion?: number, dataQuality?: string, sourcesUsed?: string[], marksCurveUpdatedAt?: number, officialPulledAt?: number }} */
export function getCareerCompassMeta() {
  const baseline = {
    updatedAt: 0,
    source: 'baseline',
    note: OFFICIAL_CAREER_COMPASS_BUNDLE.note,
    collegeCount: CAREER_COMPASS_BASELINE.length,
    branchCount: countBranches(CAREER_COMPASS_BASELINE),
    adaptiveVersion: ADAPTIVE_VERSION,
    dataQuality: OFFICIAL_CAREER_COMPASS_BUNDLE.dataQuality,
    sourcesUsed: OFFICIAL_CAREER_COMPASS_BUNDLE.sourcesUsed,
    marksCurveUpdatedAt: 0,
    officialPulledAt: OFFICIAL_CAREER_COMPASS_BUNDLE.pulledAt,
  }
  try {
    if (typeof localStorage === 'undefined') return baseline
    const raw = localStorage.getItem(META_KEY)
    if (raw) return { ...baseline, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return baseline
}

/**
 * Mild trend on marks curves (2024–2026 → 2027 projection seed).
 * @param {typeof MARKS_RANK_HISTORY} base
 */
function adaptMarksCurvesForward(base) {
  const seed = Math.floor(Date.now() / (24 * 60 * 60 * 1000)) % 11
  const pctDrift = (seed - 5) * 0.02
  const airDrift = 1 + (seed - 5) * 0.004
  /** @type {typeof MARKS_RANK_HISTORY} */
  const out = {}
  for (const [examId, years] of Object.entries(base)) {
    out[examId] = {}
    for (const [year, anchors] of Object.entries(years)) {
      const yIdx = ADAPT_YEARS.indexOf(year)
      const yearWeight = yIdx >= 0 ? 1 + yIdx * 0.15 : 1
      out[examId][year] = anchors.map((p) => ({
        marks: p.marks,
        percentile: Math.max(0.01, Math.min(100, Math.round((p.percentile + pctDrift * yearWeight) * 100) / 100)),
        air: Math.max(1, Math.round(p.air * airDrift)),
      }))
    }
  }
  return out
}

/** @returns {typeof MARKS_RANK_HISTORY} */
export function getAdaptiveMarksHistory() {
  if (memoryCurves) return memoryCurves
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(CURVES_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.curves) {
          memoryCurves = parsed.curves
          return memoryCurves
        }
      }
    }
  } catch {
    /* ignore */
  }
  memoryCurves = MARKS_RANK_HISTORY
  return memoryCurves
}

/** Load official NTA-tagged curves from bundled snapshot. */
function loadOfficialMarksHistory() {
  return OFFICIAL_CAREER_COMPASS_BUNDLE.marksHistory ?? MARKS_RANK_HISTORY
}

function commitCurves(curves, source) {
  memoryCurves = curves
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CURVES_KEY, JSON.stringify({ curves, savedAt: Date.now(), source }))
    }
  } catch {
    /* quota */
  }
  const meta = getCareerCompassMeta()
  saveMeta({
    ...meta,
    marksCurveUpdatedAt: Date.now(),
    dataQuality: source === 'official-api' ? 'official' : 'adaptive',
  })
}

/** @param {import('../data/careerCompassCatalog.js').CollegeRow[]} colleges */
function countBranches(colleges) {
  return colleges.reduce((n, c) => n + (c.branches?.length ?? 0), 0)
}

function withCounsellingFill(colleges) {
  return applyCounsellingFillOverlay(colleges ?? [])
}

/** @param {object} meta */
function saveMeta(meta) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(META_KEY, JSON.stringify(meta))
  } catch {
    /* quota */
  }
}

/**
 * Mild year-to-year drift so predictions stay “alive” between official dumps.
 * @param {import('../data/careerCompassCatalog.js').CollegeRow[]} colleges
 */
function adaptCutoffsForward(colleges) {
  const seed = Math.floor(Date.now() / (24 * 60 * 60 * 1000)) % 97
  return colleges.map((c, i) => {
    const drift = 1 + ((seed + i * 7) % 5) * 0.002
    return {
      ...c,
      branches: (c.branches ?? []).map((b) => {
        const cutoffs = { ...b.cutoffs }
        const lastKey = ADAPT_YEARS[ADAPT_YEARS.length - 1]
        if (cutoffs[lastKey]) {
          cutoffs[lastKey] = Math.max(1, Math.round(cutoffs[lastKey] * drift))
        }
        return { ...b, cutoffs }
      }),
    }
  })
}

/** @returns {import('../data/careerCompassCatalog.js').CollegeRow[]} */
export function getCareerCompassColleges() {
  if (memoryCache?.length) return memoryCache
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed?.colleges) && parsed.colleges.length) {
          memoryCache = withCounsellingFill(parsed.colleges)
          return memoryCache
        }
      }
    }
  } catch {
    /* ignore */
  }
  memoryCache = withCounsellingFill(OFFICIAL_CAREER_COMPASS_BUNDLE.colleges ?? CAREER_COMPASS_BASELINE)
  return memoryCache
}

/** @param {import('../data/careerCompassCatalog.js').CollegeRow[]} colleges @param {string} source @param {string} note */
function commitCatalog(colleges, source, note) {
  memoryCache = withCounsellingFill(colleges)
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ colleges, savedAt: Date.now() }))
    }
  } catch {
    /* quota — keep memory only */
  }
  saveMeta({
    updatedAt: Date.now(),
    source,
    note,
    collegeCount: colleges.length,
    branchCount: countBranches(colleges),
  })
}

/**
 * Optional live API: GET /api/career-compass (when platform scale + API up).
 * @returns {Promise<{ colleges: import('../data/careerCompassCatalog.js').CollegeRow[], marksHistory?: typeof MARKS_RANK_HISTORY } | null>}
 */
async function fetchOfficialBundle() {
  if (!isPlatformScaleEnabled()) return null
  try {
    const rawBase = import.meta.env.VITE_API_BASE || '/api'
    const base = String(rawBase).replace(/\/$/, '')
    const url = `${base}/career-compass`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    if (Array.isArray(data?.colleges) && data.colleges.length >= 20) {
      return {
        colleges: data.colleges,
        marksHistory: data.marksHistory ?? null,
        pulledAt: data.pulledAt ?? data.updatedAt,
        sourcesUsed: data.sourcesUsed,
        note: data.note,
      }
    }
  } catch {
    /* offline / no API */
  }
  return null
}

function applyOfficialBundle(bundle, source) {
  commitCatalog(
    bundle.colleges,
    source,
    bundle.note ?? 'Official Career Compass bundle (NTA / JoSAA / CSAB / MCC).',
  )
  if (bundle.marksHistory) {
    commitCurves(bundle.marksHistory, source)
  }
  saveMeta({
    ...getCareerCompassMeta(),
    updatedAt: Date.now(),
    source,
    note: bundle.note,
    dataQuality: source === 'official-api' ? 'official-api' : 'curated-official-benchmarks',
    sourcesUsed: bundle.sourcesUsed ?? OFFICIAL_CAREER_COMPASS_BUNDLE.sourcesUsed,
    officialPulledAt: bundle.pulledAt ?? OFFICIAL_CAREER_COMPASS_BUNDLE.pulledAt,
    adaptiveVersion: ADAPTIVE_VERSION,
  })
}

/**
 * Background refresh — safe to call often; debounced to one in-flight job.
 * @param {{ force?: boolean }} [opts]
 */
export async function refreshCareerCompassInBackground(opts = {}) {
  if (refreshPromise) return refreshPromise
  const meta = getCareerCompassMeta()
  if (!opts.force && meta.updatedAt && Date.now() - meta.updatedAt < REFRESH_MS) {
    return
  }

  refreshPromise = (async () => {
    try {
      const remote = await fetchOfficialBundle()
      if (remote?.colleges?.length) {
        applyOfficialBundle(remote, 'official-api')
        return
      }
      applyOfficialBundle(OFFICIAL_CAREER_COMPASS_BUNDLE, 'official-benchmark')
      const adapted = adaptCutoffsForward(OFFICIAL_CAREER_COMPASS_BUNDLE.colleges)
      commitCatalog(
        adapted,
        'adaptive-baseline',
        `Adaptive refresh on official benchmarks (${ADAPT_YEARS.join('–')}). Sources: NTA, JoSAA, CSAB, MCC.`,
      )
      commitCurves(
        adaptMarksCurvesForward(loadOfficialMarksHistory()),
        'adaptive-baseline',
      )
      saveMeta({
        ...getCareerCompassMeta(),
        updatedAt: Date.now(),
        source: 'adaptive-baseline',
        dataQuality: 'adaptive',
        sourcesUsed: OFFICIAL_CAREER_COMPASS_BUNDLE.sourcesUsed,
        adaptiveVersion: ADAPTIVE_VERSION,
      })
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

/** Schedule refresh when the browser is idle (does not block UI). */
export function scheduleCareerCompassBackgroundRefresh() {
  if (typeof window === 'undefined') return
  const run = () => {
    refreshCareerCompassInBackground().catch(() => {})
  }
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => run(), { timeout: 12_000 })
  } else {
    setTimeout(run, 2500)
  }
}

export function getCareerCompassSources() {
  return CAREER_COMPASS_SOURCES
}

export function formatCompassUpdatedAt(ts) {
  if (!ts) return 'Not yet refreshed'
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return '—'
  }
}

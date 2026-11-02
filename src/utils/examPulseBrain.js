/**
 * Exam Pulse brain — background refresh of student briefing headlines.
 * Mirrors Career Compass: idle schedule + TTL + optional force refresh.
 * Frontend calls /api/exam-pulse (Vite → http://127.0.0.1:3001).
 */

import {
  EXAM_PULSE_CURATED,
  EXAM_PULSE_OFFICIAL_PORTALS,
} from '../data/examPulseCurated.js'

const CACHE_KEY = 'testvantage-exam-pulse-v1'
const META_KEY = 'testvantage-exam-pulse-meta-v1'
const LIKED_KEY = 'testvantage-exam-pulse-liked-cats-v1'
const REFRESH_MS = 6 * 60 * 60 * 1000 // 6 hours — don't spam

/** @type {import('../data/examPulseCurated.js').ExamPulseItem[] | null} */
let memoryItems = null
/** @type {Promise<void> | null} */
let refreshPromise = null

/** @returns {{ updatedAt: number, source: string, note: string, mode: string, aiUsed: boolean, itemCount: number, byCategory?: Record<string, number>, disclaimer?: string }} */
export function getExamPulseMeta() {
  const baseline = {
    updatedAt: 0,
    source: 'curated',
    note: 'Curated Exam Pulse briefing for JEE / NEET aspirants.',
    mode: 'curated',
    aiUsed: false,
    itemCount: EXAM_PULSE_CURATED.length,
    byCategory: countByCategory(EXAM_PULSE_CURATED),
    disclaimer:
      'Not live TV news. Curated + optional AI summary of public education headlines. Verify on official portals.',
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

/** @returns {import('../data/examPulseCurated.js').ExamPulseItem[]} */
export function getExamPulseItems() {
  if (memoryItems?.length) return memoryItems
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed?.items) && parsed.items.length) {
          memoryItems = parsed.items
          return memoryItems
        }
      }
    }
  } catch {
    /* ignore */
  }
  memoryItems = EXAM_PULSE_CURATED
  return memoryItems
}

/** @param {import('../data/examPulseCurated.js').ExamPulseItem[]} items */
function countByCategory(items) {
  return {
    exams: items.filter((i) => i.category === 'exams').length,
    admissions: items.filter((i) => i.category === 'admissions').length,
    placements: items.filter((i) => i.category === 'placements').length,
    motivation: items.filter((i) => i.category === 'motivation').length,
  }
}

/**
 * @param {import('../data/examPulseCurated.js').ExamPulseItem[]} items
 * @param {object} metaPatch
 */
function commitFeed(items, metaPatch) {
  memoryItems = items
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ items, savedAt: Date.now() }))
      const meta = {
        ...getExamPulseMeta(),
        ...metaPatch,
        updatedAt: Date.now(),
        itemCount: items.length,
        byCategory: countByCategory(items),
      }
      localStorage.setItem(META_KEY, JSON.stringify(meta))
    }
  } catch {
    /* quota / private mode */
  }
}

/** @param {boolean} [force] */
async function fetchRemotePulse(force = false) {
  try {
    const rawBase = import.meta.env.VITE_API_BASE || '/api'
    const base = String(rawBase).replace(/\/$/, '')
    const qs = force ? '?refresh=1' : ''
    const res = await fetch(`${base}/exam-pulse${qs}`, { signal: AbortSignal.timeout(20000) })
    if (!res.ok) return null
    const data = await res.json()
    if (Array.isArray(data?.items) && data.items.length >= 4) return data
  } catch {
    /* offline / API down */
  }
  return null
}

/**
 * @param {{ force?: boolean }} [opts]
 */
export async function refreshExamPulseInBackground(opts = {}) {
  if (refreshPromise) return refreshPromise
  const meta = getExamPulseMeta()
  if (!opts.force && meta.updatedAt && Date.now() - meta.updatedAt < REFRESH_MS) {
    return
  }

  refreshPromise = (async () => {
    try {
      const remote = await fetchRemotePulse(Boolean(opts.force))
      if (remote?.items?.length) {
        commitFeed(remote.items, {
          source: remote.aiUsed ? 'api-ai' : 'api',
          note: remote.note,
          mode: remote.mode,
          aiUsed: Boolean(remote.aiUsed),
          disclaimer: remote.disclaimer,
        })
        return
      }
      commitFeed(EXAM_PULSE_CURATED, {
        source: 'curated',
        note: 'Showing curated Exam Pulse — API offline or unreachable. Official portal links still apply.',
        mode: 'curated',
        aiUsed: false,
      })
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export function scheduleExamPulseBackgroundRefresh() {
  const run = () => {
    refreshExamPulseInBackground().catch(() => {})
  }
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => run(), { timeout: 12000 })
  } else {
    setTimeout(run, 4000)
  }
}

export function getExamPulsePortals() {
  return EXAM_PULSE_OFFICIAL_PORTALS
}

/** @param {number} ts */
export function formatExamPulseUpdatedAt(ts) {
  if (!ts || ts <= 0) return 'not yet refreshed'
  try {
    return new Date(ts).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return 'recently'
  }
}

/** @returns {string[]} */
export function getLikedExamPulseCategories() {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(LIKED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** @param {string} categoryId */
export function toggleLikedExamPulseCategory(categoryId) {
  const allowed = new Set(['exams', 'admissions', 'placements', 'motivation'])
  if (!allowed.has(categoryId)) return getLikedExamPulseCategories()
  const current = getLikedExamPulseCategories()
  const next = current.includes(categoryId)
    ? current.filter((c) => c !== categoryId)
    : [...current, categoryId].slice(0, 4)
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LIKED_KEY, JSON.stringify(next))
    }
  } catch {
    /* ignore */
  }
  return next
}

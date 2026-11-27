/**
 * Go-live capacity for exhaustive diagnostics:
 * - Live national/school peer bands (Top 1% / Top 500) when API has attempts
 * - Answer-flip / OMR forensics from sessionTelemetry
 * - JEE Advanced Paper 1 + Paper 2 merged diagnostic pack
 */

import { API_BASE, isPlatformScaleEnabled } from '../config/platform.js'
import { pingExamApi } from './examApi.js'
import { buildPerQuestionPeerStats } from './testAnalysis.js'
import { buildDemoPeerStatsForQuestions } from './questionLevelDiagnostics.js'
import { attemptToResultData, getAttemptById, getAllStudentAttempts } from './attemptHistory.js'

const ADV_PAIR_KEY = 'tv_adv_paper_pairs_v1'

/**
 * @returns {Promise<boolean>}
 */
export async function isDiagnosticLiveApiOnline() {
  try {
    return await pingExamApi()
  } catch {
    return false
  }
}

/**
 * Fetch live peer stats for a paper from the API (post go-live).
 * @param {string} testId
 * @returns {Promise<{ map: Map<string, object>, meta: object } | null>}
 */
export async function fetchLivePeerStats(testId) {
  const id = String(testId || '').trim()
  if (!id) return null
  try {
    const res = await fetch(
      `${API_BASE}/diagnostics/peer-stats/${encodeURIComponent(id)}?limit=5000`,
      { signal: AbortSignal.timeout(12000) },
    )
    if (!res.ok) return null
    const data = await res.json()
    const map = new Map()
    for (const row of data.questions || []) {
      if (row?.questionId) map.set(String(row.questionId), { ...row, source: 'live_server' })
    }
    return {
      map,
      meta: {
        source: 'live_server',
        studentCount: Number(data.studentCount) || 0,
        capacity: data.capacity || {},
        generatedAt: data.generatedAt || null,
      },
    }
  } catch {
    return null
  }
}

/**
 * Resolve best available peer map: live server → device → demo/illustrative.
 * @param {{
 *   testId: string
 *   questions?: object[]
 *   perQuestion?: object[]
 *   demoMode?: boolean
 *   preferLive?: boolean
 * }} opts
 */
export async function resolvePeerStatsForDiagnostics(opts = {}) {
  const {
    testId,
    questions = [],
    perQuestion = [],
    demoMode = false,
    preferLive = true,
  } = opts

  const online = preferLive ? await isDiagnosticLiveApiOnline() : false
  if (online && testId) {
    const live = await fetchLivePeerStats(testId)
    if (live?.map?.size && (live.meta.studentCount || 0) >= 2) {
      return {
        map: live.map,
        source: 'live_server',
        studentCount: live.meta.studentCount,
        capacity: live.meta.capacity,
        liveReady: true,
      }
    }
  }

  let map = testId ? buildPerQuestionPeerStats(testId, questions) : new Map()
  const sample = map.size ? [...map.values()][0] : null
  if (demoMode || !sample || (sample.studentCount ?? 0) < 2) {
    map = buildDemoPeerStatsForQuestions(questions, perQuestion)
    return {
      map,
      source: demoMode ? 'demo_cohort' : 'illustrative_fallback',
      studentCount: 40,
      capacity: { nationalPeers: false, top1Ready: false, top500Ready: false },
      liveReady: false,
    }
  }
  return {
    map,
    source: 'device',
    studentCount: sample.studentCount || 0,
    capacity: {
      nationalPeers: false,
      top1Ready: (sample.studentCount || 0) >= 100,
      top500Ready: (sample.studentCount || 0) >= 50,
    },
    liveReady: false,
  }
}

/**
 * Summarise answer-flip / option-change forensics from session telemetry.
 * Ready for OMR bubbling events when those land in telemetry.omrEvents.
 * @param {object | null | undefined} sessionTelemetry
 * @param {object[]} [perQuestion]
 */
export function buildAnswerFlipForensics(sessionTelemetry = null, perQuestion = []) {
  const flips = Array.isArray(sessionTelemetry?.answerFlips)
    ? sessionTelemetry.answerFlips
    : []
  const omr = Array.isArray(sessionTelemetry?.omrEvents) ? sessionTelemetry.omrEvents : []
  const byQ = new Map()
  for (const f of flips) {
    const id = String(f?.questionId || '')
    if (!id) continue
    if (!byQ.has(id)) byQ.set(id, [])
    byQ.get(id).push(f)
  }

  const rows = []
  for (const pq of perQuestion || []) {
    const id = String(pq.questionId || '')
    const list = byQ.get(id) || []
    if (!list.length) continue
    rows.push({
      questionId: id,
      index: pq.index,
      grade: pq.grade,
      flipCount: list.length,
      lastFrom: list[list.length - 1]?.from ?? null,
      lastTo: list[list.length - 1]?.to ?? null,
      times: list.map((x) => x.t).filter((t) => Number.isFinite(Number(t))),
    })
  }

  const totalFlips = flips.length
  const questionsFlipped = byQ.size
  const flippedThenWrong = rows.filter((r) => r.grade === 'wrong' || r.grade === 'partial').length
  const flippedThenCorrect = rows.filter((r) => r.grade === 'correct').length

  return {
    enabled: true,
    totalFlips,
    questionsFlipped,
    flippedThenWrong,
    flippedThenCorrect,
    omrEventCount: omr.length,
    omrReady: omr.length > 0,
    rows: rows.sort((a, b) => b.flipCount - a.flipCount).slice(0, 40),
    capacityNote:
      totalFlips > 0
        ? 'Answer-change forensics captured from this sitting.'
        : 'Flip logging is on for new exams after go-live build — older attempts may show zero flips.',
  }
}

/**
 * @returns {Record<string, { paper1AttemptId?: string, paper2AttemptId?: string, updatedAt?: string }>}
 */
function loadAdvPairs() {
  try {
    const raw = localStorage.getItem(ADV_PAIR_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveAdvPairs(map) {
  try {
    localStorage.setItem(ADV_PAIR_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

/**
 * Link JEE Advanced Paper 1 + Paper 2 attempts for a merged diagnostic.
 * @param {{ ownerKey: string, paper1AttemptId: string, paper2AttemptId: string }} opts
 */
export function linkAdvancedPaperPair(opts) {
  const ownerKey = String(opts.ownerKey || 'guest')
  const paper1AttemptId = String(opts.paper1AttemptId || '')
  const paper2AttemptId = String(opts.paper2AttemptId || '')
  if (!paper1AttemptId || !paper2AttemptId) {
    return { ok: false, error: 'Both Paper 1 and Paper 2 attempt ids are required.' }
  }
  const map = loadAdvPairs()
  map[ownerKey] = {
    paper1AttemptId,
    paper2AttemptId,
    updatedAt: new Date().toISOString(),
  }
  saveAdvPairs(map)
  return { ok: true, pair: map[ownerKey] }
}

/**
 * @param {string} [ownerKey]
 */
export function getLinkedAdvancedPaperPair(ownerKey = 'guest') {
  const map = loadAdvPairs()
  return map[String(ownerKey)] || null
}

/**
 * Build a merged dual-paper diagnostic model input for Adv P1+P2.
 * @param {{ paper1AttemptId: string, paper2AttemptId: string }} pair
 */
export function buildAdvancedDualPaperBundle(pair) {
  const a1 = getAttemptById(pair.paper1AttemptId)
  const a2 = getAttemptById(pair.paper2AttemptId)
  if (!a1 || !a2) {
    return { ok: false, error: 'One or both linked attempts are missing on this device.' }
  }
  const d1 = attemptToResultData(a1)
  const d2 = attemptToResultData(a2)
  if (!d1?.result || !d2?.result) {
    return { ok: false, error: 'Attempts found but result snapshots are incomplete.' }
  }
  const score1 = Number(d1.result.score) || 0
  const score2 = Number(d2.result.score) || 0
  const max1 = Number(d1.result.maxScore) || 0
  const max2 = Number(d2.result.maxScore) || 0
  return {
    ok: true,
    paper1: { attempt: a1, data: d1 },
    paper2: { attempt: a2, data: d2 },
    combined: {
      score: score1 + score2,
      maxScore: max1 + max2,
      pct: max1 + max2 > 0 ? Math.round(((score1 + score2) / (max1 + max2)) * 100) : 0,
      correct: (d1.result.correct || 0) + (d2.result.correct || 0),
      wrong: (d1.result.wrong || 0) + (d2.result.wrong || 0),
      unattempted: (d1.result.unattempted || 0) + (d2.result.unattempted || 0),
    },
  }
}

/**
 * Human-readable capacity status for go-live checklist / UI banners.
 */
export function getDiagnosticCapacityStatus({ apiOnline = false, peerStudentCount = 0 } = {}) {
  const scale = isPlatformScaleEnabled()
  return {
    peers: {
      id: 'diag-national-peers',
      ready: apiOnline && peerStudentCount >= 50,
      partial: apiOnline && peerStudentCount > 0 && peerStudentCount < 50,
      note: apiOnline
        ? peerStudentCount >= 500
          ? `Live peers online (${peerStudentCount}) — Top 1% / Top 500 active.`
          : peerStudentCount >= 50
            ? `Live peers (${peerStudentCount}) — Top 500 uses available cohort until 500+.`
            : `API online — waiting for more submits on each paper (now ${peerStudentCount}).`
        : 'After live:deploy, peer bands use all students who sat the same paper (Top 1% / Top 500).',
    },
    flips: {
      id: 'diag-answer-flips',
      ready: true,
      note: 'Answer-change forensics log on every new exam sitting. OMR bubble events attach when OMR path is used.',
    },
    advDual: {
      id: 'diag-adv-dual',
      ready: true,
      note: 'Link Paper 1 + Paper 2 attempts for one merged Advanced diagnostic PDF.',
    },
    fullLength: {
      id: 'diag-full-length',
      ready: true,
      note: 'Report density follows the real paper size (75–180 Q). Use full mocks / Official PYQ, not the 9-Q sample.',
    },
    platformScale: scale,
  }
}

/**
 * List recent Advanced attempts for dual-pack linking UI.
 * @param {string} ownerKey
 * @param {number} [limit]
 */
export function listRecentAdvancedAttemptsForOwner(ownerKey, limit = 12) {
  return getAllStudentAttempts()
    .filter((a) => a.ownerKey === ownerKey)
    .filter((a) => {
      const pat = String(a.examPatternId || a.resultSnapshot?.examPatternId || '').toLowerCase()
      const title = String(a.title || '').toLowerCase()
      return pat.includes('advanced') || title.includes('advanced')
    })
    .slice(0, limit)
}

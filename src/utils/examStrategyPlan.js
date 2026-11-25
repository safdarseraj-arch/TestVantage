/**
 * Pre-test strategy lock-in (subject order + time plan) and post-result Plan Adherence %.
 */

import { getSubjectsForPattern } from '../data/subjects.js'
import { buildPassTimeline } from './resultAdvancedAnalytics.js'

const PLAN_KEY_PREFIX = 'testvantage-exam-plan-'

/**
 * @param {string} testId
 * @param {string} [ownerKey]
 */
export function examPlanStorageKey(testId, ownerKey = 'guest') {
  return `${PLAN_KEY_PREFIX}${ownerKey}-${testId}`
}

/**
 * @typedef {{
 *   subjectOrder: string[]
 *   minutesBySubject: Record<string, number>
 *   lockedAt: number
 *   paperMinutes: number
 * }} ExamStrategyPlan
 */

/**
 * @param {string} testId
 * @param {string} [ownerKey]
 * @returns {ExamStrategyPlan | null}
 */
export function loadExamStrategyPlan(testId, ownerKey = 'guest') {
  try {
    const raw = sessionStorage.getItem(examPlanStorageKey(testId, ownerKey))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.subjectOrder?.length) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * @param {string} testId
 * @param {ExamStrategyPlan} plan
 * @param {string} [ownerKey]
 */
export function saveExamStrategyPlan(testId, plan, ownerKey = 'guest') {
  try {
    sessionStorage.setItem(examPlanStorageKey(testId, ownerKey), JSON.stringify(plan))
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} testId
 * @param {string} [ownerKey]
 */
export function clearExamStrategyPlan(testId, ownerKey = 'guest') {
  try {
    sessionStorage.removeItem(examPlanStorageKey(testId, ownerKey))
  } catch {
    /* ignore */
  }
}

/**
 * Default even split of paper minutes across subjects.
 * @param {string} examPatternId
 * @param {number} paperMinutes
 * @returns {ExamStrategyPlan}
 */
export function defaultExamStrategyPlan(examPatternId, paperMinutes = 180) {
  const subjects = getSubjectsForPattern(examPatternId)
  const ids = subjects.map((s) => s.id)
  const n = Math.max(ids.length, 1)
  const total = Math.max(15, Number(paperMinutes) || 180)
  const base = Math.floor(total / n)
  /** @type {Record<string, number>} */
  const minutesBySubject = {}
  let used = 0
  ids.forEach((id, i) => {
    const mins = i === n - 1 ? Math.max(5, total - used) : base
    minutesBySubject[id] = mins
    used += mins
  })
  return {
    subjectOrder: ids,
    minutesBySubject,
    lockedAt: Date.now(),
    paperMinutes: total,
  }
}

/**
 * Actual subject path order from telemetry / reconstruction.
 * @param {object} opts
 * @returns {string[]}
 */
export function actualSubjectOrderFromAttempt(opts = {}) {
  const timeline = buildPassTimeline({
    result: opts.result,
    sessionTelemetry: opts.sessionTelemetry,
    examPatternId: opts.examPatternId,
  })
  const path = timeline?.subjectPath ?? []
  /** @type {string[]} */
  const order = []
  const seen = new Set()
  for (const step of path) {
    const id = String(step.subjectId || '').toLowerCase()
    if (!id || seen.has(id)) continue
    seen.add(id)
    order.push(id)
  }
  if (order.length) return order

  // Fallback: first-seen subject by question index
  const perQ = [...(opts.result?.perQuestion ?? [])].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  )
  for (const pq of perQ) {
    const id = String(pq.subject || '').toLowerCase()
    if (!id || seen.has(id)) continue
    seen.add(id)
    order.push(id)
  }
  return order
}

/**
 * Actual minutes spent per subject from question dwell times.
 * @param {{ result?: object, questionTimes?: Record<string, number> }} opts
 */
export function actualMinutesBySubject(opts = {}) {
  const perQ = opts.result?.perQuestion ?? []
  const times = opts.questionTimes ?? {}
  /** @type {Record<string, number>} */
  const sec = {}
  for (const pq of perQ) {
    const id = String(pq.subject || '').toLowerCase()
    if (!id) continue
    const t = Number(times[pq.questionId] ?? pq.timeSpentSeconds ?? 0)
    sec[id] = (sec[id] || 0) + Math.max(0, t)
  }
  /** @type {Record<string, number>} */
  const mins = {}
  for (const [id, s] of Object.entries(sec)) {
    mins[id] = Math.round(s / 60)
  }
  return mins
}

/**
 * Order match: longest common prefix / planned length, plus partial credit for relative order.
 * @param {string[]} planned
 * @param {string[]} actual
 */
export function scoreSubjectOrderMatch(planned = [], actual = []) {
  if (!planned.length) return { pct: null, detail: 'No plan locked' }
  if (!actual.length) return { pct: 0, detail: 'No subject path recorded yet' }
  let prefix = 0
  for (let i = 0; i < Math.min(planned.length, actual.length); i++) {
    if (planned[i] !== actual[i]) break
    prefix++
  }
  // Pairwise relative order: for each adjacent planned pair, did actual keep that order?
  let pairOk = 0
  let pairN = 0
  for (let i = 0; i < planned.length - 1; i++) {
    const a = planned[i]
    const b = planned[i + 1]
    const ia = actual.indexOf(a)
    const ib = actual.indexOf(b)
    if (ia < 0 || ib < 0) continue
    pairN++
    if (ia < ib) pairOk++
  }
  const prefixPct = (prefix / planned.length) * 100
  const pairPct = pairN > 0 ? (pairOk / pairN) * 100 : prefixPct
  const pct = Math.round(prefixPct * 0.55 + pairPct * 0.45)
  return {
    pct,
    detail:
      prefix === planned.length
        ? 'Subject order matched your plan exactly'
        : `Order match ${pct}% (first ${prefix} of ${planned.length} subjects as planned)`,
  }
}

/**
 * Time adherence: how close actual minutes were to planned (tolerance band).
 * @param {Record<string, number>} planned
 * @param {Record<string, number>} actual
 */
export function scoreTimePlanMatch(planned = {}, actual = {}) {
  const ids = Object.keys(planned)
  if (!ids.length) return { pct: null, detail: 'No time plan' }
  const actualTotal = Object.values(actual).reduce((s, n) => s + n, 0)
  if (actualTotal <= 0) return { pct: 0, detail: 'No timing data to compare' }

  let scoreSum = 0
  for (const id of ids) {
    const p = Number(planned[id]) || 0
    const a = Number(actual[id]) || 0
    if (p <= 0) continue
    // Full credit within ±25% of plan; linear falloff to 0 at ±100%
    const ratio = a / p
    const err = Math.abs(1 - ratio)
    const cell = err <= 0.25 ? 100 : Math.max(0, 100 - ((err - 0.25) / 0.75) * 100)
    scoreSum += cell
  }
  const pct = Math.round(scoreSum / ids.length)
  return {
    pct,
    detail: `Time mix ${pct}% aligned with your minute plan`,
  }
}

/**
 * Combined Plan Adherence for Result UI.
 * @param {{
 *   plan?: ExamStrategyPlan | null
 *   result?: object
 *   questionTimes?: Record<string, number>
 *   sessionTelemetry?: object | null
 *   examPatternId?: string
 * }} opts
 */
export function buildPlanAdherence(opts = {}) {
  const plan = opts.plan
  if (!plan?.subjectOrder?.length) {
    return {
      ready: false,
      pct: null,
      order: null,
      time: null,
      plannedOrder: [],
      actualOrder: [],
      plannedMinutes: {},
      actualMinutes: {},
      takeaway: 'No pre-test plan was locked for this attempt. Next mock: set subject order on the start screen.',
    }
  }

  const actualOrder = actualSubjectOrderFromAttempt(opts)
  const actualMinutes = actualMinutesBySubject(opts)
  const order = scoreSubjectOrderMatch(plan.subjectOrder, actualOrder)
  const time = scoreTimePlanMatch(plan.minutesBySubject ?? {}, actualMinutes)

  const parts = [order.pct, time.pct].filter((n) => n != null)
  const pct = parts.length ? Math.round(parts.reduce((s, n) => s + n, 0) / parts.length) : null

  let takeaway = 'Plan adherence recorded.'
  if (pct != null && pct >= 80) {
    takeaway = `Strong plan adherence (${pct}%) — you mostly stuck to the subject order and time mix you locked.`
  } else if (pct != null && pct >= 55) {
    takeaway = `Mixed adherence (${pct}%). Review where you left the plan — often one subject ate the clock.`
  } else if (pct != null) {
    takeaway = `Low adherence (${pct}%). Next mock: lock a simpler order and protect sitters first.`
  }

  return {
    ready: true,
    pct,
    order,
    time,
    plannedOrder: plan.subjectOrder,
    actualOrder,
    plannedMinutes: plan.minutesBySubject ?? {},
    actualMinutes,
    takeaway,
  }
}

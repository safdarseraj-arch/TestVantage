/**
 * AI pick quota: use 10–25% PYQ when the catalog has enough questions.
 */

import { isPyqLike, countPyqQuestions, pyqSharePercent } from './pyqDetect.js'

export const PYQ_QUOTA_MIN = 0.1
export const PYQ_QUOTA_MAX = 0.25

/**
 * @param {number} totalCount
 * @param {number} availablePyqCount
 */
export function computePyqQuotaTargets(totalCount, availablePyqCount) {
  if (!totalCount || !availablePyqCount) {
    return { min: 0, max: 0, ideal: 0 }
  }
  const rawMin = Math.max(1, Math.ceil(totalCount * PYQ_QUOTA_MIN))
  const rawMax = Math.max(rawMin, Math.floor(totalCount * PYQ_QUOTA_MAX))
  const min = Math.min(rawMin, availablePyqCount)
  const max = Math.min(rawMax, availablePyqCount)
  const ideal = Math.min(max, Math.max(min, Math.round(totalCount * 0.15)))
  return { min, max, ideal }
}

/**
 * Hard filter so AI pick stays within 10–25% PYQ when quota applies.
 * @param {import('../data/tests').Question[]} candidates
 * @param {number} pyqPicked
 * @param {{ min: number, max: number }} quota
 * @param {number} remainingSlots
 */
export function filterCandidatesForPyqQuota(candidates, pyqPicked, quota, remainingSlots) {
  if (!quota.min || !candidates.length) return candidates
  const pyqStillNeeded = quota.min - pyqPicked
  if (pyqPicked >= quota.max) {
    return candidates.filter((q) => !isPyqLike(q))
  }
  if (pyqStillNeeded > 0 && pyqStillNeeded >= remainingSlots) {
    const pyqOnly = candidates.filter(isPyqLike)
    if (pyqOnly.length) return pyqOnly
  }
  return candidates
}

/**
 * @param {import('../data/tests').Question} q
 * @param {number} pyqPicked
 * @param {{ min: number, max: number, pyqWeight?: number }} quota
 */
export function pyqSlotScoreAdjust(q, pyqPicked, quota) {
  if (!quota.min) return 0
  const isPyq = isPyqLike(q)
  if (pyqPicked < quota.min && isPyq) return -28
  if (pyqPicked >= quota.max && isPyq) return 22
  if (isPyq) return -8 * (quota.pyqWeight ?? 0.5)
  return 0
}

/**
 * @param {import('../data/tests').Question[]} picked
 * @param {number} total
 * @param {number} availablePyq
 */
export function pyqQuotaReport(picked, total, availablePyq) {
  const pyqCount = countPyqQuestions(picked)
  const { min, max } = computePyqQuotaTargets(total, availablePyq)
  const share = pyqSharePercent(pyqCount, total)
  const met = availablePyq ? pyqCount >= min && pyqCount <= max : true
  return {
    pyqCount,
    pyqShare: share,
    pyqMin: min,
    pyqMax: max,
    pyqAvailable: availablePyq,
    pyqQuotaMet: met,
    pyqSummary:
      availablePyq && min
        ? `PYQ mix: ${pyqCount}/${total} (${share}%) — target ${Math.round(PYQ_QUOTA_MIN * 100)}–${Math.round(PYQ_QUOTA_MAX * 100)}%`
        : 'PYQ mix: no PYQ in pool for this syllabus',
  }
}

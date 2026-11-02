const ATTEMPTS_KEY = 'testvantage-attempt-history'
const GUEST_ID_KEY = 'testvantage-guest-id'

function loadAll() {
  try {
    const raw = localStorage.getItem(ATTEMPTS_KEY)
    return raw ? JSON.parse(raw) : { attempts: [] }
  } catch {
    return { attempts: [] }
  }
}

function saveAll(data) {
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(data))
}

export function getGuestId() {
  let id = localStorage.getItem(GUEST_ID_KEY)
  if (!id) {
    id = `guest-${Date.now()}`
    localStorage.setItem(GUEST_ID_KEY, id)
  }
  return id
}

/** @param {string | null | undefined} userId */
export function getOwnerKey(userId) {
  return userId ?? getGuestId()
}

/**
 * @param {object} attempt
 */
export function saveAttempt(attempt) {
  const data = loadAll()
  const entry = {
    id: attempt.id ?? `att-${Date.now()}`,
    ...attempt,
    savedAt: Date.now(),
  }
  data.attempts.unshift(entry)
  if (data.attempts.length > 200) data.attempts = data.attempts.slice(0, 200)
  saveAll(data)
  return entry
}

/** @param {string} ownerKey */
export function getAttemptsByOwner(ownerKey) {
  return loadAll().attempts.filter((a) => a.ownerKey === ownerKey)
}

/** @param {string} testId @param {string} ownerKey */
export function getAttemptsForTest(testId, ownerKey) {
  return getAttemptsByOwner(ownerKey).filter((a) => a.testId === testId)
}

/** @param {string} attemptId */
export function getAttemptById(attemptId) {
  return loadAll().attempts.find((a) => a.id === attemptId) ?? null
}

/** All attempts (students + guests) for teachers — excludes teacher/admin practice if keyed differently. */
export function getAllStudentAttempts() {
  return loadAll().attempts.slice().sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0))
}

/**
 * Local cache + server attempts when production scale is on.
 * @param {{ ownerKeys?: string[], limit?: number }} [opts]
 */
export async function getAllStudentAttemptsAsync(opts = {}) {
  const { isPlatformScaleEnabled } = await import('../config/platform.js')
  if (!isPlatformScaleEnabled()) return getAllStudentAttempts()

  try {
    const { fetchAttemptsRemote } = await import('./orgApi.js')
    const remote = await fetchAttemptsRemote(opts)
    if (!remote.length) return getAllStudentAttempts()

    const local = getAllStudentAttempts()
    const byId = new Map(local.map((a) => [a.id, a]))
    for (const row of remote) {
      if (row?.id) byId.set(row.id, row)
    }
    return [...byId.values()].sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0))
  } catch {
    return getAllStudentAttempts()
  }
}

/**
 * Rebuild Result page payload from a stored attempt snapshot.
 * @param {object} attempt
 */
export function attemptToResultData(attempt) {
  if (!attempt) return null
  const snap = attempt.resultSnapshot
  if (snap) {
    return {
      testId: attempt.testId,
      title: attempt.title ?? snap.title,
      examPatternId: attempt.examPatternId,
      testTypeId: attempt.testTypeId,
      userName: attempt.userName,
      userEmail: attempt.userEmail,
      submittedAt: attempt.submittedAt,
      durationSeconds: attempt.durationSeconds ?? snap.durationSeconds,
      percentile: attempt.percentile ?? snap.percentile,
      estimatedAIR: attempt.estimatedAIR ?? snap.estimatedAIR,
      tabViolations: attempt.tabViolations ?? snap.tabViolations ?? 0,
      submitReason: attempt.submitReason ?? snap.submitReason,
      questionTimes: snap.questionTimes ?? {},
      visitedIds: snap.visitedIds ?? [],
      result: snap.result,
      calibratedStanding: snap.calibratedStanding,
      calibratedSectionResults: snap.calibratedSectionResults,
    }
  }
  return {
    testId: attempt.testId,
    title: attempt.title,
    userName: attempt.userName,
    userEmail: attempt.userEmail,
    durationSeconds: attempt.durationSeconds,
    percentile: attempt.percentile,
    estimatedAIR: attempt.estimatedAIR,
    tabViolations: attempt.tabViolations ?? 0,
    result: {
      score: attempt.score,
      maxScore: attempt.maxScore,
      accuracy: attempt.accuracy,
      correct: attempt.correct,
      wrong: attempt.wrong,
      partial: attempt.partial,
      unattempted: attempt.unattempted,
      bySubject: attempt.bySubject ?? {},
      byChapter: attempt.byChapter ?? {},
      byQuestionType: attempt.byQuestionType ?? {},
      perQuestion: attempt.perQuestion ?? [],
      markedCount: attempt.markedCount ?? 0,
    },
    questionTimes: attempt.questionTimes ?? {},
    visitedIds: attempt.visitedIds ?? [],
  }
}

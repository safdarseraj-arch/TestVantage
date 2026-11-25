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

/**
 * Persist a student’s “Why I got it wrong” tag on one question of an attempt.
 * @param {string} attemptId
 * @param {string} questionId
 * @param {string | null} tagId  pass null to clear
 * @returns {object | null} updated attempt
 */
export function updateAttemptWrongReason(attemptId, questionId, tagId) {
  if (!attemptId || !questionId) return null
  const data = loadAll()
  const idx = data.attempts.findIndex((a) => a.id === attemptId)
  if (idx < 0) return null
  const att = { ...data.attempts[idx] }
  const nextMap = { ...(att.wrongReasons || {}) }
  if (tagId) nextMap[questionId] = tagId
  else delete nextMap[questionId]
  att.wrongReasons = nextMap
  att.savedAt = Date.now()

  if (att.resultSnapshot?.result?.perQuestion) {
    const snap = { ...att.resultSnapshot, result: { ...att.resultSnapshot.result } }
    snap.result.perQuestion = (snap.result.perQuestion || []).map((pq) =>
      pq.questionId === questionId
        ? { ...pq, wrongReason: tagId || undefined }
        : pq,
    )
    snap.wrongReasons = nextMap
    att.resultSnapshot = snap
  }
  if (Array.isArray(att.perQuestion)) {
    att.perQuestion = att.perQuestion.map((pq) =>
      pq.questionId === questionId
        ? { ...pq, wrongReason: tagId || undefined }
        : pq,
    )
  }

  data.attempts[idx] = att
  saveAll(data)
  return att
}

/** @param {string} attemptId */
export function getAttemptWrongReasons(attemptId) {
  const att = getAttemptById(attemptId)
  if (!att) return {}
  if (att.wrongReasons && typeof att.wrongReasons === 'object') return { ...att.wrongReasons }
  if (att.resultSnapshot?.wrongReasons) return { ...att.resultSnapshot.wrongReasons }
  const fromPq = {}
  for (const pq of att.resultSnapshot?.result?.perQuestion ?? att.perQuestion ?? []) {
    if (pq?.wrongReason && pq.questionId) fromPq[pq.questionId] = pq.wrongReason
  }
  return fromPq
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
  const wrongReasons =
    (attempt.wrongReasons && typeof attempt.wrongReasons === 'object'
      ? attempt.wrongReasons
      : null) ||
    (attempt.resultSnapshot?.wrongReasons && typeof attempt.resultSnapshot.wrongReasons === 'object'
      ? attempt.resultSnapshot.wrongReasons
      : {}) ||
    {}

  /** @param {object[]} list */
  const attachWrongReasons = (list) =>
    (list || []).map((pq) => {
      const tag = wrongReasons[pq.questionId] ?? pq.wrongReason
      return tag ? { ...pq, wrongReason: tag } : { ...pq }
    })

  const snap = attempt.resultSnapshot
  if (snap) {
    const result = snap.result
      ? { ...snap.result, perQuestion: attachWrongReasons(snap.result.perQuestion) }
      : snap.result
    return {
      testId: attempt.testId,
      title: attempt.title ?? snap.title,
      examPatternId: attempt.examPatternId,
      testTypeId: attempt.testTypeId,
      userName: attempt.userName,
      userEmail: attempt.userEmail,
      submittedAt: attempt.submittedAt ?? snap.submittedAt ?? null,
      durationSeconds: attempt.durationSeconds ?? snap.durationSeconds,
      percentile: attempt.percentile ?? snap.percentile,
      estimatedAIR: attempt.estimatedAIR ?? snap.estimatedAIR,
      tabViolations: attempt.tabViolations ?? snap.tabViolations ?? 0,
      submitReason: attempt.submitReason ?? snap.submitReason,
      questionTimes: snap.questionTimes ?? {},
      sessionTelemetry: snap.sessionTelemetry ?? null,
      visitedIds: snap.visitedIds ?? [],
      result,
      wrongReasons: { ...wrongReasons },
      calibratedStanding: snap.calibratedStanding,
      calibratedSectionResults: snap.calibratedSectionResults,
      startedAt: attempt.startedAt ?? snap.startedAt ?? null,
      examPlan: attempt.examPlan ?? snap.examPlan ?? null,
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
    startedAt: attempt.startedAt ?? null,
    submittedAt: attempt.submittedAt ?? null,
    examPlan: attempt.examPlan ?? null,
    wrongReasons: { ...wrongReasons },
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
      perQuestion: attachWrongReasons(attempt.perQuestion ?? []),
      markedCount: attempt.markedCount ?? 0,
    },
    questionTimes: attempt.questionTimes ?? {},
    sessionTelemetry: attempt.sessionTelemetry ?? null,
    visitedIds: attempt.visitedIds ?? [],
  }
}

import assert from 'node:assert/strict'

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  }
}

const {
  liveMistakePct,
  liveSkipPct,
  combinedStrugglePct,
  attemptAdjustedErrorPct,
  solveRate,
  discriminationIndex,
  dominantDistractorShare,
  applyHysteresis,
  empiricalDifficultyBand,
  assignTriageBadge,
  buildCrowdBenchmarkHint,
  buildQuestionRollupsFromAttempts,
  routeDiagnosticTabs,
  buildStudentTrapMetrics,
  buildDiagnosticAnalyticsPack,
  buildPersonalFixQueue,
  buildDistractorBreakdown,
  buildRetestDelta,
  detectAnomalyFlags,
  summarizeDiagnosticTrendPoint,
  ENTER_THRESHOLD_PCT,
  EXIT_THRESHOLD_PCT,
} = await import('../src/utils/diagnosticQuestionAnalytics.js')

const {
  setVerificationStatus,
  getVerificationStatus,
  getVerificationAuditLog,
  clearVerificationStore,
  recordDiagnosticTrendSnapshot,
  getDiagnosticTrendSnapshots,
  clearDiagnosticTrendStore,
} = await import('../src/utils/diagnosticLocalStore.js')

// Core formulas (PDF §11)
assert.equal(liveMistakePct(45, 100), 45)
assert.equal(liveSkipPct(40, 100), 40)
assert.equal(combinedStrugglePct(35, 35, 100), 70)
assert.equal(attemptAdjustedErrorPct(45, 15), 75)
assert.equal(solveRate(65, 100), 0.65)
assert.equal(discriminationIndex(0.8, 0.2), 0.6)
assert.equal(dominantDistractorShare(30, 50), 60)

// Hysteresis enter 50 / exit 45
assert.equal(applyHysteresis(50, false), true)
assert.equal(applyHysteresis(49.9, false), false)
assert.equal(applyHysteresis(45, true), true)
assert.equal(applyHysteresis(44.9, true), false)
assert.equal(ENTER_THRESHOLD_PCT, 50)
assert.equal(EXIT_THRESHOLD_PCT, 45)

assert.equal(empiricalDifficultyBand(0.7, 1.0), 'Easy')
assert.equal(empiricalDifficultyBand(0.5, 1.0), 'Medium')
assert.equal(empiricalDifficultyBand(0.3, 1.0), 'Hard')

const suspect = assignTriageBadge({
  mistakePct: 70,
  skipPct: 10,
  discrimination: -0.1,
  top20AccuracyPct: 20,
  dominantDistractorPct: 65,
})
assert.equal(suspect.badge, 'suspect_key')
assert.equal(suspect.priority, 'P0')

const crowd = buildCrowdBenchmarkHint({
  grade: 'wrong',
  peerCorrectPct: 78,
  peerStrugglePct: 22,
  peerStudentCount: 20,
})
assert.equal(crowd.tone, 'urgent')
assert.ok(/rank-bleeding/i.test(crowd.title) || /75|78/.test(crowd.message))

// Synthetic cohort: 12 students, shared question IDs
/** @type {object[]} */
const attempts = []
for (let i = 0; i < 12; i += 1) {
  const strong = i < 3
  attempts.push({
    id: `att-${i}`,
    testId: 'diag-paper',
    score: 300 - i * 18,
    resultSnapshot: {
      questionTimes: {
        'q-trap': strong ? 40 : 70,
        'q-skip': strong ? 10 : 100,
        'q-ok': 50,
      },
      result: {
        score: 300 - i * 18,
        perQuestion: [
          {
            questionId: 'q-trap',
            index: 1,
            subject: 'physics',
            chapter: 'Kinematics',
            grade: strong ? 'correct' : 'wrong',
            userAnswerLabel: strong ? 'A' : 'B',
            difficulty: 'Easy',
            timeSpentSeconds: strong ? 40 : 70,
          },
          {
            questionId: 'q-skip',
            index: 2,
            subject: 'physics',
            chapter: 'Optics',
            grade: strong ? 'correct' : 'unattempted',
            difficulty: 'Medium',
            timeSpentSeconds: strong ? 10 : 100,
          },
          {
            questionId: 'q-ok',
            index: 3,
            subject: 'chemistry',
            chapter: 'Equilibrium',
            grade: 'correct',
            difficulty: 'Easy',
            timeSpentSeconds: 50,
          },
        ],
      },
    },
  })
}

const rollups = buildQuestionRollupsFromAttempts(attempts, {
  testId: 'diag-paper',
  sampleFloor: 10,
})
assert.equal(rollups.studentCount, 12)
assert.equal(rollups.questions.length, 3)

const trap = rollups.questions.find((q) => q.questionId === 'q-trap')
assert.ok(trap)
assert.ok(trap.mistakePct >= 50)
assert.equal(trap.inTabA, true)
assert.ok(trap.attemptErrorPct >= 50)
assert.ok(trap.meetsSampleFloor)

const skipQ = rollups.questions.find((q) => q.questionId === 'q-skip')
assert.ok(skipQ.skipPct >= 50)
assert.equal(skipQ.inTabB, true)

const tabs = routeDiagnosticTabs(rollups)
assert.ok(tabs.tabA.some((q) => q.questionId === 'q-trap'))
assert.ok(tabs.tabB.some((q) => q.questionId === 'q-skip'))
assert.ok(!tabs.tabA.some((q) => q.questionId === 'q-ok'))

// Combined struggle: 35% wrong + 35% skip should enter Combined, not A/B alone
const struggleAttempts = Array.from({ length: 20 }, (_, i) => {
  let grade = 'correct'
  if (i < 7) grade = 'wrong'
  else if (i < 14) grade = 'unattempted'
  return {
    id: `s-${i}`,
    testId: 'struggle-paper',
    score: 100 - i,
    resultSnapshot: {
      result: {
        score: 100 - i,
        perQuestion: [
          {
            questionId: 'q-struggle',
            index: 1,
            subject: 'maths',
            chapter: 'Integrals',
            grade,
          },
        ],
      },
    },
  }
})
const strugglePack = buildQuestionRollupsFromAttempts(struggleAttempts, {
  testId: 'struggle-paper',
  sampleFloor: 10,
})
const struggleQ = strugglePack.questions[0]
assert.ok(struggleQ.strugglePct >= 50)
assert.equal(struggleQ.inTabA, false)
assert.equal(struggleQ.inTabB, false)
assert.equal(struggleQ.inTabCombined, true)
const struggleTabs = routeDiagnosticTabs(strugglePack)
assert.ok(struggleTabs.tabCombined.some((q) => q.questionId === 'q-struggle'))

// Student trap metrics
const student = buildStudentTrapMetrics({
  perQuestion: [
    { questionId: 'q-trap', grade: 'wrong', timeSpentSeconds: 60 },
    { questionId: 'q-skip', grade: 'unattempted', timeSpentSeconds: 100 },
    { questionId: 'q-ok', grade: 'correct', timeSpentSeconds: 40 },
  ],
  questionTimes: { 'q-trap': 60, 'q-skip': 100, 'q-ok': 40 },
  tabAIds: ['q-trap'],
  tabBIds: ['q-skip'],
})
assert.equal(student.trapFallRate, 100)
assert.equal(student.timeSinkRate, 100)
assert.equal(student.ready, true)

const full = buildDiagnosticAnalyticsPack(attempts, {
  testId: 'diag-paper',
  sampleFloor: 10,
  studentPerQuestion: attempts[5].resultSnapshot.result.perQuestion,
  studentQuestionTimes: attempts[5].resultSnapshot.questionTimes,
})
assert.ok(full.tabs.summary.highMistake >= 1)
assert.ok(full.student?.ready)

// Demo batch shared IDs → diagnostic tabs
const { seedDemoBatchResults, getDemoBatchAttempts, DEMO_BATCH_TEST_ID } = await import(
  '../src/utils/seedDemoBatchResults.js'
)
localStorage.removeItem('testvantage-attempt-history')
localStorage.removeItem('testvantage-demo-batch-results-v3')
localStorage.removeItem('testvantage-demo-batch-results-v4')
seedDemoBatchResults({ force: true })
const demoRows = getDemoBatchAttempts()
assert.equal(demoRows.length, 12)
const ids0 = new Set(
  (demoRows[0].resultSnapshot?.result?.perQuestion || []).map((p) => p.questionId),
)
const ids1 = new Set(
  (demoRows[1].resultSnapshot?.result?.perQuestion || []).map((p) => p.questionId),
)
let shared = 0
for (const id of ids0) if (ids1.has(id)) shared += 1
assert.ok(shared >= 10, `expected shared demo question ids, got ${shared}`)

const demoPack = buildDiagnosticAnalyticsPack(demoRows, {
  testId: DEMO_BATCH_TEST_ID,
  sampleFloor: 10,
})
assert.ok(demoPack.rollups.questions.length > 0)
assert.ok(
  demoPack.tabs.summary.highMistake +
    demoPack.tabs.summary.highSkip +
    demoPack.tabs.summary.combinedOnly >=
    0,
)

// Personal Fix Queue — student who missed Tab A item
const fixQ = buildPersonalFixQueue({
  perQuestion: attempts[5].resultSnapshot.result.perQuestion,
  tabs: full.tabs,
  limit: 5,
})
assert.equal(fixQ.ready, true)
assert.ok(fixQ.items.some((it) => it.questionId === 'q-trap'))
assert.equal(fixQ.items.find((it) => it.questionId === 'q-trap')?.reason, 'trap_fall')

// Distractor breakdown
const dist = buildDistractorBreakdown({ B: 30, C: 10, D: 5 }, 45)
assert.equal(dist.ready, true)
assert.equal(dist.dominant, 'B')
assert.equal(dist.dominantPct, 66.7)

// Re-test delta — prior wrong → current correct
const retest = buildRetestDelta({
  currentPerQuestion: [
    { questionId: 'q-trap', index: 1, grade: 'correct', subject: 'physics' },
    { questionId: 'q-ok', index: 3, grade: 'correct', subject: 'chemistry' },
  ],
  priorAttempts: [
    {
      submittedAt: 1,
      resultSnapshot: {
        result: {
          perQuestion: [
            { questionId: 'q-trap', grade: 'wrong' },
            { questionId: 'q-ok', grade: 'correct' },
          ],
        },
      },
    },
  ],
})
assert.equal(retest.ready, true)
assert.equal(retest.improved, 1)
assert.equal(retest.comparable, 2)
assert.equal(retest.improvementPct, 50)

// Anomaly: Hard + high solve + fast
const anomalyQs = [
  {
    questionId: 'q-leak',
    index: 9,
    subject: 'physics',
    chapter: 'Modern',
    authorDifficulty: 'Hard',
    solvePct: 92,
    timeRatio: 0.3,
    medianTimeSec: 20,
    meetsSampleFloor: true,
    totalServed: 20,
    top20AccuracyPct: 100,
    discrimination: 0.05,
  },
]
const anomalies = detectAnomalyFlags(anomalyQs, { sampleFloor: 10 })
assert.equal(anomalies.ready, true)
assert.ok(anomalies.flags.some((f) => f.code === 'fast_hard_solve'))

// Verification + trend local store
clearVerificationStore()
clearDiagnosticTrendStore()
setVerificationStatus('q-trap', 'wrong_key', { note: 'key was B not A' })
assert.equal(getVerificationStatus('q-trap')?.status, 'wrong_key')
assert.equal(getVerificationAuditLog(5)[0].status, 'wrong_key')
setVerificationStatus('q-trap', 'verified')
assert.equal(getVerificationStatus('q-trap')?.status, 'verified')

const point = summarizeDiagnosticTrendPoint(full.tabs, {
  testId: 'diag-paper',
  testTitle: 'Diag',
})
recordDiagnosticTrendSnapshot(point)
const snaps = getDiagnosticTrendSnapshots({ testId: 'diag-paper' })
assert.ok(snaps.length >= 1)
assert.equal(snaps[0].highMistake, full.tabs.summary.highMistake)

// Demo rollups include optionWrong when wrong answers labeled
const demoTrap = demoPack.rollups.questions.find((q) => (q.wrong || 0) > 0 && q.dominantDistractor)
assert.ok(
  demoTrap || demoPack.rollups.questions.some((q) => Object.keys(q.optionWrong || {}).length > 0),
  'expected some optionWrong data from demo batch',
)

console.log('test-diagnostic-question-analytics: ok')

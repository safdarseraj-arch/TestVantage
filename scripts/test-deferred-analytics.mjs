import assert from 'node:assert/strict'
import {
  buildReportCardModel,
  buildReportCardHtml,
  buildReportCardPlainText,
  getMailSendConfig,
} from '../src/utils/resultReportCard.js'
import {
  defaultExamStrategyPlan,
  scoreSubjectOrderMatch,
  scoreTimePlanMatch,
  buildPlanAdherence,
} from '../src/utils/examStrategyPlan.js'
import { buildClassroomFailureHeatmap, heatmapFailColor } from '../src/utils/classroomHeatmap.js'
import {
  buildBioClockInsight,
  buildScoreFloorCeilingBand,
  bioClockSlotForTimestamp,
} from '../src/utils/resultAdvancedAnalytics.js'
import { findNcertUrl, buildChapterResourceLinks } from '../src/utils/chapterResourceLinks.js'
import { listWrongQuestionIds } from '../src/utils/mistakeOnlyRetest.js'
import { buildAttemptQualityMatrix } from '../src/utils/attemptQualityMatrix.js'

const result = {
  score: 120,
  maxScore: 300,
  accuracy: 55,
  correct: 40,
  wrong: 20,
  unattempted: 15,
  bySubject: {
    physics: { score: 40, maxScore: 100 },
    chemistry: { score: 45, maxScore: 100 },
    mathematics: { score: 35, maxScore: 100 },
  },
  byChapter: {
    Kinematics: { correct: 2, wrong: 4, unattempted: 1 },
    Equilibrium: { correct: 1, wrong: 3, unattempted: 0 },
  },
  perQuestion: [
    { questionId: 'q1', subject: 'physics', chapter: 'Kinematics', grade: 'wrong', marks: -1, maxMarks: 4, timeSpentSeconds: 30 },
    { questionId: 'q2', subject: 'physics', chapter: 'Kinematics', grade: 'correct', marks: 4, maxMarks: 4, timeSpentSeconds: 50 },
    { questionId: 'q3', subject: 'chemistry', chapter: 'Equilibrium', grade: 'wrong', marks: -1, maxMarks: 4, timeSpentSeconds: 200 },
    { questionId: 'q4', subject: 'mathematics', chapter: 'Integrals', grade: 'partial', marks: 1, maxMarks: 4, timeSpentSeconds: 90 },
  ],
}

// Report card
const model = buildReportCardModel({
  data: { title: 'Mock A', result, userName: 'Test Student', examPatternId: 'jee-main' },
})
assert.equal(model.score, 120)
assert.ok(buildReportCardHtml(model).includes('Test Student'))
assert.ok(buildReportCardPlainText(model).includes('120/300'))
assert.equal(getMailSendConfig().enabled, false)

// Plan adherence
const plan = defaultExamStrategyPlan('jee-main', 180)
assert.ok(plan.subjectOrder.length >= 3)
const order = scoreSubjectOrderMatch(['physics', 'chemistry', 'mathematics'], ['physics', 'chemistry', 'mathematics'])
assert.equal(order.pct, 100)
const time = scoreTimePlanMatch({ physics: 60, chemistry: 60, mathematics: 60 }, { physics: 58, chemistry: 62, mathematics: 55 })
assert.ok(time.pct >= 70)
const adhere = buildPlanAdherence({
  plan,
  result,
  questionTimes: Object.fromEntries(result.perQuestion.map((p) => [p.questionId, p.timeSpentSeconds])),
  sessionTelemetry: {
    subjectSwitches: [
      { t: 100, from: 'physics', to: 'chemistry' },
      { t: 200, from: 'chemistry', to: 'mathematics' },
    ],
  },
  examPatternId: 'jee-main',
})
assert.equal(adhere.ready, true)
assert.ok(adhere.pct != null)

// Heatmap
const heat = buildClassroomFailureHeatmap([
  {
    ownerKey: 's1',
    testId: 't1',
    byChapter: { Kinematics: { correct: 1, wrong: 4, unattempted: 0 } },
    perQuestion: [{ chapter: 'Kinematics', subject: 'physics' }],
  },
  {
    ownerKey: 's2',
    testId: 't1',
    byChapter: { Kinematics: { correct: 2, wrong: 3, unattempted: 0 } },
    perQuestion: [{ chapter: 'Kinematics', subject: 'physics' }],
  },
])
assert.equal(heat.ready, true)
assert.ok(heat.cells[0].failRate >= 50)
assert.ok(heatmapFailColor(80).startsWith('rgb'))

// Bio clock
assert.equal(bioClockSlotForTimestamp(new Date('2026-03-01T09:00:00')).id, 'morning')
assert.equal(bioClockSlotForTimestamp(new Date('2026-03-01T22:00:00')).id, 'night')
const bio = buildBioClockInsight({
  currentAttempt: { startedAt: Date.parse('2026-03-01T09:30:00'), score: 120, maxScore: 300, accuracy: 55 },
  attempts: [
    { startedAt: Date.parse('2026-03-01T09:00:00'), score: 120, maxScore: 300, accuracy: 55 },
    { startedAt: Date.parse('2026-03-02T18:00:00'), score: 90, maxScore: 300, accuracy: 40 },
  ],
})
assert.equal(bio.ready, true)
assert.equal(bio.currentSlot.id, 'morning')

const emptyBio = buildBioClockInsight({ currentAttempt: {}, attempts: [] })
assert.equal(emptyBio.ready, false)

// Score band
const band = buildScoreFloorCeilingBand({
  result,
  questionTimes: Object.fromEntries(result.perQuestion.map((p) => [p.questionId, p.timeSpentSeconds])),
  paperDurationSec: 180 * 60,
  questions: [{ id: 'q1', difficulty: 'easy' }, { id: 'q3', difficulty: 'hard' }],
})
assert.equal(band.ready, true)
assert.ok(band.ceiling.score >= band.mid.score)
assert.ok(band.floor.score <= band.mid.score)

// NCERT links
assert.ok(findNcertUrl('Kinematics', ['physics']))
assert.ok(buildChapterResourceLinks({ chapter: 'Equilibrium', subjects: ['chemistry'] }).ncertUrl)
assert.equal(buildChapterResourceLinks({ chapter: 'Totally Unknown XYZ' }).ncertUrl, null)

// Mistake ids
assert.deepEqual(listWrongQuestionIds(result).sort(), ['q1', 'q3', 'q4'])

const matrix = buildAttemptQualityMatrix({
  result,
  questionTimes: Object.fromEntries(result.perQuestion.map((p) => [p.questionId, p.timeSpentSeconds])),
})
assert.ok(matrix.potential)

console.log('test-deferred-analytics: ok')

import assert from 'node:assert/strict'
import {
  recordItemResponsesFromResult,
  getEffectiveQuestionToughness,
  getItemCalibrationReport,
  empiricalToughnessFromStats,
  _resetItemStatsForTests,
} from '../src/utils/itemResponseStats.js'

_resetItemStatsForTests()

const q = { id: 'q-cal-1', toughnessLevel: 5 }

recordItemResponsesFromResult([
  { questionId: 'q-cal-1', grade: 'wrong' },
  { questionId: 'q-cal-1', grade: 'wrong' },
  { questionId: 'q-cal-1', grade: 'wrong' },
  { questionId: 'q-cal-1', grade: 'correct' },
  { questionId: 'q-cal-1', grade: 'wrong' },
])

const report = getItemCalibrationReport('q-cal-1')
assert.equal(report.calibrated, true, 'calibrated after 5 graded responses')
assert.ok(report.empiricalToughness > 5, 'mostly wrong → harder empirical difficulty')

const effective = getEffectiveQuestionToughness(q)
assert.ok(effective > 5, 'effective toughness rises with wrong answers')

const easy = empiricalToughnessFromStats({
  correct: 9,
  wrong: 1,
  partial: 0,
  skipped: 0,
  attempts: 10,
  lastAt: Date.now(),
})
assert.ok(easy != null && easy < 4, 'high accuracy → easy empirical')

console.log('test-item-response-stats: ok')

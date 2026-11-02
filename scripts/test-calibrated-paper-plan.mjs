import assert from 'node:assert/strict'
import { getExamPattern } from '../src/data/examPatterns.js'
import {
  computeCalibratedDurationMinutes,
  planCalibratedPaperFromExam,
} from '../src/utils/calibratedPaperPlan.js'

const jeeMain = getExamPattern('jee-main')
const slots = jeeMain.questionSlots.map((s) => ({
  section: s.section,
  questionTypeId: s.questionTypeId,
  count: s.count,
  marking: { ...s.marking },
}))

assert.equal(computeCalibratedDurationMinutes(1, 'jee-main'), 60)
assert.equal(computeCalibratedDurationMinutes(2, 'jee-main'), 120)
assert.equal(computeCalibratedDurationMinutes(3, 'jee-main'), 180)

const oneSubject = planCalibratedPaperFromExam(slots, ['physics'], 'jee-main')
assert.equal(oneSubject.durationMinutes, 60)
assert.equal(oneSubject.targetTotal, 25, 'JEE Main Physics = 20 SCQ + 5 numerical')
assert.equal(oneSubject.questionsPerSectionBySubject.physics, 25)

const threeSubjects = planCalibratedPaperFromExam(
  slots,
  ['physics', 'chemistry', 'mathematics'],
  'jee-main',
)
assert.equal(threeSubjects.durationMinutes, 180)
assert.equal(threeSubjects.targetTotal, 75)

const twoSubjects = planCalibratedPaperFromExam(slots, ['physics', 'chemistry'], 'jee-main')
assert.equal(twoSubjects.durationMinutes, 120)
assert.equal(twoSubjects.targetTotal, 50)

console.log('test-calibrated-paper-plan: ok')

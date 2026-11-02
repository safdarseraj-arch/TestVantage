/**
 * PYQ-only student study modes (syllabus practice + timed mocks).
 * Live catalog is imported papers only — sample dated NTA lookalikes stay out.
 */
import assert from 'node:assert/strict'
import { getAllPyqQuestions, getSamplePracticePyqQuestions } from '../src/data/pyqCatalog.js'
import {
  buildPyqStudyPaper,
  getPyqStudyPool,
  pyqStudyPlanReady,
} from '../src/utils/pyqStudentTest.js'
import { SAMPLE_PRACTICE_BANK_SOURCE } from '../src/utils/pyqDetect.js'

const syllabus = { subjects: ['physics'], sections: [], chapters: [], topics: [] }

function testLiveCatalogExcludesSampleNtaLookalikes() {
  const all = getAllPyqQuestions()
  for (const q of all) {
    assert.notEqual(q.bankSource, SAMPLE_PRACTICE_BANK_SOURCE)
    assert.notEqual(q.isDemo, true)
  }
}

function testSampleGeneratorIsHonest() {
  const sample = getSamplePracticePyqQuestions()
  assert.ok(sample.length > 0)
  assert.ok(
    sample.every(
      (q) => q.isDemo === true && q.bankSource === SAMPLE_PRACTICE_BANK_SOURCE && q.officialPyq === false,
    ),
  )
}

function testPyqPoolExamOnly() {
  const pool = getPyqStudyPool('jee-main', syllabus)
  assert.ok(pool.every((q) => q.examPatternId === 'jee-main'))
  assert.ok(pool.every((q) => !q.isDemo && q.bankSource !== SAMPLE_PRACTICE_BANK_SOURCE))
}

function testComprehensivePyqPaper() {
  const fullSyllabus = {
    subjects: ['physics', 'chemistry', 'mathematics'],
    sections: [],
    chapters: [],
    topics: [],
  }
  const plan = buildPyqStudyPaper({
    mode: 'full',
    examPatternId: 'jee-main',
    syllabus: fullSyllabus,
  })
  if (!plan) {
    assert.equal(getPyqStudyPool('jee-main', fullSyllabus).length, 0)
    return
  }
  assert.equal(plan.kind, 'fixed')
  assert.ok(plan.durationMinutes >= 60)
  assert.ok(pyqStudyPlanReady(plan))
}

function testPyqPracticePlan() {
  const plan = buildPyqStudyPaper({
    mode: 'syllabus-practice',
    examPatternId: 'jee-main',
    syllabus,
    questionCount: 5,
  })
  if (!plan) {
    assert.equal(getPyqStudyPool('jee-main', syllabus).length, 0)
    return
  }
  assert.equal(plan.kind, 'practice')
  assert.ok(plan.questions.length > 0)
}

testLiveCatalogExcludesSampleNtaLookalikes()
testSampleGeneratorIsHonest()
testPyqPoolExamOnly()
testComprehensivePyqPaper()
testPyqPracticePlan()

console.log('test-pyq-student-study: ok')

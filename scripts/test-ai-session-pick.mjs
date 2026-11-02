import assert from 'node:assert/strict'
import { buildAdaptivePools, enrichPoolToughness } from '../src/utils/adaptiveTest.js'
import {
  buildAiSectionPickReport,
  pickAiAdaptiveSectionQuestions,
  pickAiPracticeQuestions,
  scorePracticePick,
} from '../src/utils/aiSessionPick.js'

/** @type {import('../src/data/tests').Question[]} */
function mockPool() {
  const chapters = ['Kinematics', 'Laws of Motion', 'Thermodynamics', 'Electrostatics']
  /** @type {import('../src/data/tests').Question[]} */
  const qs = []
  for (let i = 0; i < 18; i += 1) {
    qs.push({
      id: `q-${i}`,
      questionType: 'single_correct',
      subject: ['physics', 'chemistry', 'mathematics'][i % 3],
      chapter: chapters[i % chapters.length],
      text: `Sample question ${i + 1}?`,
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 0,
      toughnessLevel: 2 + (i % 8),
    })
  }
  return qs
}

const pool = enrichPoolToughness(mockPool())
const pools = buildAdaptivePools(pool, ['physics', 'chemistry', 'mathematics'])

const section = pickAiAdaptiveSectionQuestions(pools, 'physics', 'medium', 3, new Set(), {
  attempts: 6,
})
assert.equal(section.length, 3, 'fills adaptive section')
assert.ok(section.every((q) => q.subject === 'physics'), 'same subject')

const report = buildAiSectionPickReport(section, 'medium')
assert.ok(report.aiScore >= 0 && report.aiScore <= 100, 'section report ai score valid')
assert.match(report.summary, /AI picked/, 'section report summary')

const practice = pickAiPracticeQuestions(pool, 6, { attempts: 8 })
assert.equal(practice.questions.length, 6, 'practice count')
assert.ok(practice.report.aiScore >= 0 && practice.report.aiScore <= 100, 'practice ai score in range')

/** @type {import('../src/data/tests').Question[]} */
const pyqPool = [
  ...pool.slice(0, 6),
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `pyq-${i}`,
    questionType: 'single_correct',
    subject: 'physics',
    chapter: 'Kinematics',
    text: `PYQ ${i}?`,
    options: ['A', 'B', 'C', 'D'],
    correctIndex: 0,
    toughnessLevel: 5,
    bankSource: 'pyq',
    pyqYear: 2022,
  })),
]
const pyqPractice = pickAiPracticeQuestions(pyqPool, 10, { attempts: 10 })
assert.ok(pyqPractice.report.pyqMix, 'practice pyq mix report')
assert.ok(pyqPractice.report.pyqMix.pyqCount >= pyqPractice.report.pyqMix.pyqMin, 'practice meets PYQ min')
assert.ok(pyqPractice.report.pyqMix.pyqCount <= pyqPractice.report.pyqMix.pyqMax, 'practice within PYQ max')

const incomplete = pool.map((q, i) =>
  i === 0
    ? { ...q, options: ['A'], correctIndex: undefined }
    : q,
)
const practiceFiltered = pickAiPracticeQuestions(incomplete, 4, { attempts: 4 })
const scored = scorePracticePick(practiceFiltered.questions)
assert.ok(scored.readiness >= 0, 'readiness score present')

console.log('test-ai-session-pick: ok')

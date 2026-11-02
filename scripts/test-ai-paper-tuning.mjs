import assert from 'node:assert/strict'
import {
  aiTunePaper,
  AI_TUNE_PROFILES,
  scoreTunedPaper,
  computeSyllabusCoverageScore,
  computeChapterDiversityScore,
} from '../src/utils/aiPaperTuning.js'
import { getAnswerableQuestions } from '../src/utils/passage.js'
import { totalSlotCount } from '../src/utils/paperAssembly.js'

/** @type {import('../src/data/tests').Question[]} */
function mockPool() {
  const chapters = ['Kinematics', 'Laws of Motion', 'Thermodynamics', 'Electrostatics']
  /** @type {import('../src/data/tests').Question[]} */
  const qs = []
  for (let i = 0; i < 24; i += 1) {
    qs.push({
      id: `q-${i}`,
      questionType: 'single_correct',
      subject: 'Physics',
      section: 'Mechanics',
      chapter: chapters[i % chapters.length],
      text: `Sample question ${i + 1}?`,
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 0,
      toughnessLevel: 3 + (i % 7),
      source: i % 5 === 0 ? 'JEE Main 2023 PYQ' : 'Practice',
    })
  }
  return qs
}

const pool = mockPool()
const slots = [{ questionTypeId: 'single_correct', count: 10, marking: { correct: 4, wrong: -1 } }]
const syllabus = {
  subjects: ['Physics'],
  sections: [],
  chapters: ['Kinematics', 'Laws of Motion', 'Thermodynamics'],
  topics: [],
}

const tuned = aiTunePaper(pool, slots, syllabus, { profileId: 'jee_main', attempts: 8 })
assert.ok(tuned.questions?.length >= totalSlotCount(slots), 'fills blueprint slots')
assert.ok(tuned.tuneReport, 'returns tune report')
assert.ok(typeof tuned.tuneReport.aiScore === 'number', 'ai score present')
assert.ok(tuned.tuneReport.aiScore >= 0 && tuned.tuneReport.aiScore <= 100, 'ai score in range')

const answerable = getAnswerableQuestions(tuned.questions)
assert.equal(answerable.length, totalSlotCount(slots), 'answerable count matches slots')

const coverage = computeSyllabusCoverageScore(answerable, syllabus)
assert.ok(coverage >= 0 && coverage <= 100, 'coverage score valid')

const diversity = computeChapterDiversityScore(answerable)
assert.ok(diversity >= 0, 'diversity score non-negative')

const scored = scoreTunedPaper(answerable, slots, AI_TUNE_PROFILES.balanced, syllabus)
assert.equal(scored.tqs, tuned.tuneReport.tqs, 'tqs consistent')

const challenge = aiTunePaper(pool, slots, syllabus, { profileId: 'challenge', attempts: 4 })
assert.ok(challenge.tuneReport.difficulty, 'difficulty profile included')

assert.ok(tuned.tuneReport.pyqMix, 'pyq mix report included')
assert.ok(tuned.tuneReport.pyqMix.pyqCount >= 1, 'at least 10% PYQ when pool has PYQ')
assert.ok(tuned.tuneReport.pyqMix.pyqCount <= tuned.tuneReport.pyqMix.pyqMax, 'PYQ within max quota')

console.log('test-ai-paper-tuning: ok')

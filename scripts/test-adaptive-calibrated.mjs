import assert from 'node:assert/strict'
import {
  difficultyBand,
  nextSectionDifficulty,
  pickAdaptiveSectionQuestions,
  buildAdaptivePools,
  estimateStudentStanding,
} from '../src/utils/adaptiveTest.js'
import { enrichPoolToughness } from '../src/utils/adaptiveTest.js'

const pool = enrichPoolToughness([
  { id: 'a1', subject: 'physics', text: 'Q1', options: ['a', 'b'], correctIndex: 0, toughnessLevel: 2 },
  { id: 'a2', subject: 'physics', text: 'Q2', options: ['a', 'b'], correctIndex: 0, toughnessLevel: 8 },
  { id: 'b1', subject: 'chemistry', text: 'Q3', options: ['a', 'b'], correctIndex: 0, toughnessLevel: 5 },
  { id: 'b2', subject: 'chemistry', text: 'Q4', options: ['a', 'b'], correctIndex: 0, toughnessLevel: 9 },
  { id: 'c1', subject: 'mathematics', text: 'Q5', options: ['a', 'b'], correctIndex: 0, toughnessLevel: 3 },
  { id: 'c2', subject: 'mathematics', text: 'Q6', options: ['a', 'b'], correctIndex: 0, toughnessLevel: 7 },
])

assert.equal(difficultyBand(2), 'easy')
assert.equal(difficultyBand(8), 'hard')
assert.equal(nextSectionDifficulty(0.8, 'medium'), 'hard')
assert.equal(nextSectionDifficulty(0.2, 'medium'), 'easy')
assert.equal(nextSectionDifficulty(0.5, 'hard'), 'hard')

const pools = buildAdaptivePools(pool, ['physics', 'chemistry', 'mathematics'])
const picked = pickAdaptiveSectionQuestions(pools, 'physics', 'medium', 2, new Set())
assert.equal(picked.length, 2)

const afterHard = pickAdaptiveSectionQuestions(pools, 'chemistry', 'hard', 1, new Set(picked.map((q) => q.id)))
assert.equal(afterHard.length, 1)
assert.equal(difficultyBand(afterHard[0].toughnessLevel), 'hard')

const standing = estimateStudentStanding(
  [
    {
      subjectId: 'physics',
      difficulty: 'medium',
      correct: 2,
      total: 2,
      accuracy: 1,
      maxScore: 8,
      score: 8,
    },
  ],
  8,
  8,
)
assert.ok(standing.levelScore >= 70)
assert.ok(standing.tier)

console.log('test-adaptive-calibrated: ok')

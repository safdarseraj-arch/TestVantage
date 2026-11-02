import assert from 'node:assert/strict'
import {
  buildMasteryGraph,
  buildAiStudyPlan,
  pickWeakChaptersForStudy,
  recommendedToughnessFromMastery,
  masteryPickBonus,
} from '../src/utils/aiMastery.js'
import { pickAiPracticeQuestions } from '../src/utils/aiSessionPick.js'

const attempts = [
  {
    id: 'a1',
    submittedAt: Date.now(),
    byChapter: {
      calculus: { correct: 2, wrong: 8, unattempted: 0 },
      algebra: { correct: 7, wrong: 2, unattempted: 1 },
    },
    bySubject: { math: { score: 10, maxScore: 40 } },
  },
  {
    id: 'a2',
    submittedAt: Date.now() - 86400000,
    byChapter: {
      calculus: { correct: 4, wrong: 5, unattempted: 1 },
    },
  },
]

const graph = buildMasteryGraph(attempts)
assert.ok(graph.overallMastery >= 0 && graph.overallMastery <= 100)
assert.ok(graph.chapters.calculus)
assert.ok(graph.chapters.calculus.masteryScore < graph.chapters.algebra.masteryScore)

const weak = pickWeakChaptersForStudy(graph, 2)
assert.equal(weak[0].chapter.toLowerCase(), 'calculus')

const plan = buildAiStudyPlan(attempts)
assert.ok(plan.steps.length >= 2)
assert.ok(plan.summary.includes('Calculus') || plan.summary.includes('calculus'))

const tough = recommendedToughnessFromMastery(graph)
assert.ok(tough >= 3 && tough <= 8)

const pool = [
  { id: 'q1', subject: 'math', chapter: 'Calculus', text: 'Q1', options: ['1', '2', '3', '4'], questionType: 'single_correct', toughnessLevel: 5 },
  { id: 'q2', subject: 'math', chapter: 'Algebra', text: 'Q2', options: ['1', '2', '3', '4'], questionType: 'single_correct', toughnessLevel: 5 },
]
const bonusWeak = masteryPickBonus(pool[0], graph)
const bonusStrong = masteryPickBonus(pool[1], graph)
assert.ok(bonusWeak > bonusStrong)

const pick = pickAiPracticeQuestions(pool, 2, { masteryGraph: graph })
assert.equal(pick.questions.length, 2)
assert.ok(pick.report.masteryAware)

console.log('test-ai-mastery: ok')

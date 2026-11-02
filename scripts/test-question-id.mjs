import assert from 'node:assert/strict'
import { assignClassifiedQuestionId } from '../src/utils/classifiedQuestionId.js'
import { trialItemToBankDraft } from '../src/utils/geminiScqTrial.js'
import { assignAiSimilarChildId, assignSimilarQuestionId } from '../src/utils/questionFamily.js'
import { pyqExamLetter, pyqId, similarId } from '../src/utils/questionId.js'
import { buildReplicaPyqQuestion } from '../src/utils/pyqReplicaPaper.js'

assert.equal(similarId('MAQS2345', 1), 'MAQS2345C1')
assert.equal(pyqId('MAQS2345', 'advanced', 2024), 'MAQS2345A2024')
assert.equal(similarId('MAQS2345A2024', 2), 'MAQS2345A2024C2')
assert.equal(pyqExamLetter('jee-main'), 'J')
assert.equal(pyqExamLetter('main'), 'J')
assert.equal(pyqId('MAQS2345', 'main', 2024), 'MAQS2345J2024')
assert.equal(pyqExamLetter('neet'), 'N')
assert.equal(pyqId('MAQS2345', 'neet', 2023), 'MAQS2345N2023')
assert.equal(assignSimilarQuestionId('MAQS2345', 1, []), similarId('MAQS2345', 1))
assert.equal(assignSimilarQuestionId('MAQS2345A2024', 2, []), similarId('MAQS2345A2024', 2))
assert.equal(assignAiSimilarChildId('MAM00001I', 1, []), 'MAM00001IC1')
assert.equal(assignAiSimilarChildId('MAM00001I', 1, ['MAM00001IC1']), 'MAM00001IC2')

const generateSimilar = trialItemToBankDraft(
  {
    stem: 'A new similar stem about substitution that is not a copy.',
    options: ['1', '2', '3', '4'],
    correctIndex: 0,
    solution: 'Worked.',
    toughness: 6,
    questionType: 'single_correct',
  },
  {
    examId: 'jee-advanced',
    subject: 'mathematics',
    section: 'Algebra',
    chapter: 'Quadratic Equations',
    similarFromPyq: true,
    seedId: 'MAQS2345A2024',
    seedToughness: 6,
  },
  { now: 1, index: 0, variantIndex: 1 },
)
assert.equal(generateSimilar.id, similarId('MAQS2345A2024', 1))

const generateFromAi = trialItemToBankDraft(
  {
    stem: 'A new similar stem about matrices that is not a copy.',
    options: ['1', '2', '3', '4'],
    correctIndex: 1,
    solution: 'Worked.',
    toughness: 6,
    questionType: 'single_correct',
  },
  {
    examId: 'jee-advanced',
    subject: 'mathematics',
    section: 'Algebra',
    chapter: 'Matrices',
    similarFromPyq: true,
    seedId: 'MAM00001I',
    seedToughness: 6,
  },
  { now: 2, index: 0, variantIndex: 1, existingIds: ['MAM00001IC1'] },
)
assert.equal(generateFromAi.id, 'MAM00001IC2')
assert.equal(generateFromAi.parentQuestionId, 'MAM00001I')

const replica = buildReplicaPyqQuestion(
  { stem: 'Replica stem', options: ['1', '2', '3', '4'], correctIndex: 0, solution: 's', toughness: 6 },
  { id: 'MAQS2345A2024', subject: 'mathematics', toughnessLevel: 6 },
  { paperId: 'p', paperLabel: 'Similar1', examPatternId: 'jee-advanced', pyqYear: 2024 },
  1,
  [],
)
assert.equal(replica.id, similarId('MAQS2345A2024', 1))

const classified = assignClassifiedQuestionId(
  {
    id: 'uq-opyq-temp',
    subject: 'mathematics',
    section: 'Algebra',
    chapter: 'Quadratic Equations',
  },
  [],
)
const pyqSaveId = pyqId(classified.id, 'jee-advanced', 2024)
assert.equal(pyqSaveId, 'MAQ00001A2024')
assert.equal(pyqSaveId, pyqId('MAQ00001', 'advanced', 2024))

console.log('test-question-id: ok')

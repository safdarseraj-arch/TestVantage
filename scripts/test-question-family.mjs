import assert from 'node:assert/strict'
import {
  assignSimilarQuestionId,
  areSameQuestionFamily,
  filterCandidatesExcludingFamilies,
  questionFamilyKind,
  questionFamilyBadge,
  duplicateFamilyIdsInSelection,
} from '../src/utils/questionFamily.js'
import {
  buildReplicaPaperMeta,
  buildReplicaPyqQuestion,
  replicaPaperId,
  nextReplicaIndices,
} from '../src/utils/pyqReplicaPaper.js'
import { validateManualSelection } from '../src/utils/paperAssembly.js'

assert.equal(assignSimilarQuestionId('JEE24-P1-Q03', 1, []), 'JEE24-P1-Q03C1')
assert.equal(assignSimilarQuestionId('MAQS2345', 1, []), 'MAQS2345C1')
assert.equal(assignSimilarQuestionId('MAQS2345A2024', 2, []), 'MAQS2345A2024C2')
assert.equal(areSameQuestionFamily({ id: 'JEE24-P1-Q03' }, { id: 'JEE24-P1-Q03C1', parentQuestionId: 'JEE24-P1-Q03' }), true)
assert.equal(filterCandidatesExcludingFamilies([{ id: 'JEE24-P1-Q03' }, { id: 'JEE24-P1-Q03C1' }, { id: 'X' }], new Set(['JEE24-P1-Q03'])).length, 1)

const meta = buildReplicaPaperMeta({ paperId: '2024-adv-p1', examPatternId: 'jee-advanced', pyqYear: 2024, pyqSession: 'Paper 1' }, 1)
assert.equal(meta.paperLabel, '2024 JEE ADV P-1 Similar1')
assert.deepEqual(nextReplicaIndices('2024-adv-p1', [{ paperId: '2024-adv-p1-similar-1' }], 2), [2, 3])

const draft = buildReplicaPyqQuestion(
  { stem: 'New', options: ['1','2','3','4'], correctIndex: 0, solution: 's', toughness: 6 },
  { id: 'JEE24-P1-Q03', subject: 'mathematics', toughnessLevel: 6 },
  meta, 1, [],
)
assert.equal(draft.id, 'JEE24-P1-Q03C1')
assert.equal(questionFamilyKind({ id: 'JEE24-P1-Q03' }), 'original')
assert.equal(questionFamilyKind({ id: 'JEE24-P1-Q03C1', parentQuestionId: 'JEE24-P1-Q03' }), 'similar')
assert.equal(questionFamilyKind({ id: 'JEE24-P1-Q03C1', aiReplicaPaper: true }), 'replica')
assert.equal(questionFamilyBadge({ id: 'JEE24-P1-Q03C2' }).label, 'Similar C2')
assert.deepEqual(
  duplicateFamilyIdsInSelection([
    { id: 'JEE24-P1-Q03' },
    { id: 'JEE24-P1-Q03C1', parentQuestionId: 'JEE24-P1-Q03' },
  ]),
  ['JEE24-P1-Q03 + JEE24-P1-Q03C1'],
)
const familyClash = validateManualSelection(
  [
    { id: 'JEE24-P1-Q03', questionType: 'single_correct' },
    { id: 'JEE24-P1-Q03C1', parentQuestionId: 'JEE24-P1-Q03', questionType: 'single_correct' },
  ],
  [{ questionTypeId: 'single_correct', count: 2 }],
)
assert.ok(familyClash.some((e) => /original and similar/i.test(e)))
console.log('test-question-family: ok')
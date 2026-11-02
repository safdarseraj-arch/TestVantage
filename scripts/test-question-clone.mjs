import assert from 'node:assert/strict'
import {
  cloneQuestionsForTest,
  ensurePassageParentsIncluded,
  repairPassageLinksInQuestions,
  refreshTestQuestionsFromBank,
} from '../src/utils/testQuestionClone.js'
import { getPassageText } from '../src/utils/passage.js'

const parent = {
  id: 'uq-passage-1',
  subject: 'chemistry',
  questionType: 'passage_integer',
  passageText:
    'The plot of Density vs Pressure is shown below for a Van der Waals gas. The slope of the plot at 400 K is 1.25.',
  passageImage: 'data:image/png;base64,plot',
  text: 'What is the molar mass of the gas (in g mol-1)',
  correctInteger: 100,
}

const child = {
  id: 'uq-passage-1b',
  subject: 'chemistry',
  questionType: 'passage_integer',
  passageId: 'uq-passage-1',
  text: 'What is the inversion temperature of the gas (in $K$)',
  correctNumerical: 400,
}

const pool = [parent, child]
const cloned = cloneQuestionsForTest(pool)
assert.equal(cloned.length, 2)
assert.notEqual(cloned[0].id, parent.id)
assert.equal(cloned[1].passageId, cloned[0].id)

const passage = getPassageText(cloned[1], cloned)
assert.ok(passage?.includes('slope'), 'PIVQ child should resolve passage after id remap')
assert.ok(!passage?.includes('inversion'), 'passage body should not include sub-stem')

const selectedOnlyChild = ensurePassageParentsIncluded(pool, [child])
assert.equal(selectedOnlyChild.length, 2)
assert.equal(selectedOnlyChild[0].id, parent.id)

const brokenTestChild = {
  id: 'custom-q-17',
  subject: 'chemistry',
  questionType: 'passage_integer',
  passageId: 'uq-passage-1',
  text: 'What is the inversion temperature of the gas (in $K$)',
  correctNumerical: 400,
}
const repaired = repairPassageLinksInQuestions([brokenTestChild], pool)
assert.equal(repaired.length, 2, 'repair should inject missing passage parent')
const repairedChild = repaired.find((q) => q.id === 'custom-q-17')
assert.ok(repairedChild, 'child row preserved')
const repairedPassage = getPassageText(repairedChild, repaired)
assert.ok(repairedPassage?.includes('slope'), 'Q17-style child should resolve passage after repair')

const bankMatrix = {
  id: 'bank-mtx-1',
  subject: 'mathematics',
  questionType: 'matrix_match',
  text: 'Match the conditions on unit vectors $a, b, c$',
  matrixRows: [
    '$a, b, c$ are unit vectors satisfying $|a+b+c| = 0$',
    'If $[a+b \\quad b+c \\quad c+a] = 0$',
    'If $a \\perp b$ and $a \\perp c$',
    'If $a, b, c$ form a linearly dependent set',
  ],
  matrixCols: ['0', '$-\\frac{3}{2}$', '$\\frac{1}{2}$', '0'],
}
const staleTestMatrix = {
  id: 'custom-mtx-9',
  subject: 'mathematics',
  questionType: 'matrix_match',
  text: bankMatrix.text,
  matrixRows: bankMatrix.matrixRows,
  matrixCols: ['', '$-\\frac{3}{2}$', '', '$\\frac{1}{2}$'],
}
const refreshed = refreshTestQuestionsFromBank([staleTestMatrix], [bankMatrix])
assert.equal(refreshed[0].id, 'custom-mtx-9', 'keeps test-local id')
assert.equal(refreshed[0].matrixCols?.[0], '0', 'pulls corrected P from bank')
assert.equal(refreshed[0].matrixCols?.[2]?.includes('1'), true, 'pulls corrected R from bank')

console.log('test-question-clone: ok')

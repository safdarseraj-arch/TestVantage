import assert from 'node:assert/strict'
import {
  assertPassageSetStorageConsistent,
  buildPassageSubQuestionPayload,
  passageSetMetaTypeFromForm,
} from '../src/utils/uploadRegressionContracts.js'
import { parsePassagePivqAnswer } from '../src/utils/passageSubAnswer.js'
import { normalizePassageQuestionStorage } from '../src/utils/passage.js'
import { resolvePassageSetMetaType, isPassageSetIntegerMode } from '../src/data/questionTypes.js'

const subsOptionless = [
  { text: 'What is the molar mass (g/mol)?', options: ['', '', '', ''], correctInteger: 40 },
  { text: 'What is the inversion temperature (K)?', options: ['', '', '', ''], correctInteger: 100 },
]

assert.equal(resolvePassageSetMetaType('passage_integer', subsOptionless), 'passage_integer')
assert.equal(resolvePassageSetMetaType('passage_scq', subsOptionless), 'passage_scq')
assert.equal(resolvePassageSetMetaType('single_correct', subsOptionless), 'passage_integer')
assert.equal(isPassageSetIntegerMode('passage_scq', subsOptionless), false)

const subsMcq = [
  { text: 'Value of sum N_p is', options: ['1', '2', '3', '4'], correctIndex: 0 },
  { text: 'Value of ratio S_p is', options: ['5', '6', '7', '8'], correctIndex: 1 },
]
assert.equal(resolvePassageSetMetaType('passage_scq', subsMcq), 'passage_scq')
assert.equal(resolvePassageSetMetaType('passage_integer', subsMcq), 'passage_integer')
assert.equal(isPassageSetIntegerMode('passage_integer', subsMcq), true)

const meta = passageSetMetaTypeFromForm('passage_integer', subsOptionless)
const parentId = 'p-meta'
const rows = subsOptionless.map((sq, i) => {
  const stem = sq.text
  const payload = buildPassageSubQuestionPayload(meta, sq, stem)
  return {
    id: i === 0 ? parentId : `c-${i}`,
    ...payload,
    ...(i === 0
      ? { passageText: 'Van der Waals passage body only.', passageId: undefined }
      : { passageId: parentId }),
  }
})

assertPassageSetStorageConsistent(rows)

const subsNumerical = [
  { text: 'Molar mass (g/mol)?', options: ['', '', '', ''], answerMode: 'numerical', correctNumerical: 40.5 },
  { text: 'Inversion T (K)?', options: ['', '', '', ''], answerMode: 'numerical', correctNumerical: 100 },
]
const metaNum = passageSetMetaTypeFromForm('passage_integer', subsNumerical)
const rowsNum = subsNumerical.map((sq, i) => {
  const payload = buildPassageSubQuestionPayload(metaNum, sq, sq.text)
  return {
    id: i === 0 ? 'p-num' : `c-num-${i}`,
    ...payload,
    ...(i === 0
      ? { passageText: 'Gas passage.', passageId: undefined }
      : { passageId: 'p-num' }),
  }
})
assert.equal(rowsNum[0].correctNumerical, 40.5)
assert.equal(rowsNum[0].correctInteger, undefined)
assertPassageSetStorageConsistent(rowsNum)

const decimalParsed = parsePassagePivqAnswer('12.5')
assert.equal(decimalParsed.ok, true)
assert.equal(decimalParsed.answerMode, 'numerical')
assert.equal(decimalParsed.correctNumerical, 12.5)

const subsDecimalImplicit = [
  { text: 'Radius (cm)?', options: ['', '', '', ''], correctNumerical: 3.14 },
]
const metaDec = passageSetMetaTypeFromForm('passage_integer', subsDecimalImplicit)
const rowDec = buildPassageSubQuestionPayload(metaDec, subsDecimalImplicit[0], subsDecimalImplicit[0].text)
assert.equal(rowDec.correctNumerical, 3.14)
assert.equal(rowDec.answerMode, 'numerical')

const parent = { id: 'p1', questionType: 'passage_integer', passageText: 'Story.' }
const child = { id: 'c1', passageId: 'p1', questionType: 'integer', text: 'Sub stem' }
const norm = normalizePassageQuestionStorage(child, [parent, child])
assert.equal(norm.questionType, 'passage_integer')

try {
  assertPassageSetStorageConsistent([
    { id: 'p', passageText: 'X', questionType: 'passage_integer', correctInteger: 1 },
    { id: 'c', passageId: 'p', questionType: 'single_correct', text: 'Y', options: ['a', 'b'] },
  ])
  assert.fail('expected contract throw')
} catch (e) {
  assert.match(String(e.message), /whole set must be/)
}

console.log('test-passage-meta-type: ok')

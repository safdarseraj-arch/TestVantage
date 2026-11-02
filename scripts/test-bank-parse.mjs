import assert from 'node:assert/strict'
import { parseStoredBankJson, coerceQuestionsList } from '../src/utils/bankParse.js'

const q = { id: 'q1', subject: 'physics', text: 'test', options: ['a', 'b'], correctIndex: 0 }

const wrapped = parseStoredBankJson(JSON.stringify({ settings: { title: 'x' }, questions: [q] }))
assert.equal(wrapped?.questions?.length, 1)

const bare = parseStoredBankJson(JSON.stringify([q]))
assert.equal(bare?.questions?.length, 1)

const wm = parseStoredBankJson(
  JSON.stringify({ _watermark: {}, data: { questions: [q, { ...q, id: 'q2' }] } }),
)
assert.equal(wm?.questions?.length, 2)

const objectMap = parseStoredBankJson(
  JSON.stringify({ questions: { a: q, b: { ...q, id: 'q2' } } }),
)
assert.equal(objectMap?.questions?.length, 2)

const double = parseStoredBankJson(JSON.stringify(JSON.stringify({ questions: [q] })))
assert.equal(double?.questions?.length, 1)

const passageChild = coerceQuestionsList([{ id: 'c1', passageId: 'p1', subject: 'physics' }])
assert.equal(passageChild.length, 1)

const optionsOnly = coerceQuestionsList([
  { id: 'uq-99', options: ['A', 'B', 'C', 'D'], correctIndex: 0 },
])
assert.equal(optionsOnly.length, 1, 'option-only rows must stay in the bank')

assert.equal(parseStoredBankJson('{}')?.questions?.length ?? 0, 0)

console.log('test-bank-parse: ok')

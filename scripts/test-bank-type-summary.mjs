import assert from 'node:assert/strict'
import {
  summarizeBankCountsByType,
  bankShortageWarnings,
  countPoolForSlot,
} from '../src/utils/paperAssembly.js'

const pool = [
  { id: '1', questionType: 'single_correct', subject: 'Physics', text: 'Q1', options: ['A', 'B', 'C', 'D'], correctIndex: 0 },
  { id: '2', questionType: 'single_correct', subject: 'Physics', text: 'Q2', options: ['A', 'B', 'C', 'D'], correctIndex: 1 },
  { id: '3', questionType: 'multiple_correct', subject: 'Physics', text: 'Q3', options: ['A', 'B', 'C', 'D'], correctIndex: 0 },
]

const summary = summarizeBankCountsByType(pool, ['single_correct', 'multiple_correct', 'integer'])
const scq = summary.find((s) => s.typeId === 'single_correct')
const msq = summary.find((s) => s.typeId === 'multiple_correct')
const int = summary.find((s) => s.typeId === 'integer')

assert.equal(scq?.count, 2, 'two SCQ in pool')
assert.equal(msq?.count, 1, 'one MSQ in pool')
assert.equal(int?.count, 0, 'zero integer')

assert.equal(countPoolForSlot(pool, { questionTypeId: 'single_correct', count: 5 }), 2)

const warnings = bankShortageWarnings(
  [{ questionTypeId: 'single_correct', count: 5 }],
  pool,
)
assert.equal(warnings.length, 1, 'shortage when need exceeds bank')
assert.match(warnings[0], /only 2 in bank/i)

console.log('test-bank-type-summary: ok')

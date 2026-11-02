import assert from 'node:assert/strict'
import {
  sanitizeNumericalAnswerInput,
  parseNumericalAnswer,
  validateNumericalAnswer,
  MAX_NUMERICAL_DIGITS,
} from '../src/utils/numericalAnswer.js'

assert.equal(sanitizeNumericalAnswerInput('45.23'), '45.23')
assert.equal(sanitizeNumericalAnswerInput('-2.345'), '-2.345')
assert.equal(sanitizeNumericalAnswerInput('0,0123'), '0.0123')
assert.equal(sanitizeNumericalAnswerInput('-1234'), '-1234')
assert.equal(sanitizeNumericalAnswerInput('1234567'), '123456')
assert.equal(parseNumericalAnswer('45.23'), 45.23)
assert.equal(parseNumericalAnswer('-2.345'), -2.345)

const ok = validateNumericalAnswer('0.0123')
assert.equal(ok.ok, true)
assert.equal(ok.value, 0.0123)

assert.equal(MAX_NUMERICAL_DIGITS, 6)

console.log('test-numerical-answer: ok')

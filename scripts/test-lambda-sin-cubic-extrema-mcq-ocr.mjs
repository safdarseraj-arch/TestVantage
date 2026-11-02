import assert from 'node:assert/strict'
import { cleanBulkStem } from '../src/utils/bulkExtractClean.js'
import { parseBulkQuestions } from '../src/utils/parseBulkQuestions.js'
import {
  looksLikeLambdaSinCubicExtremaMcq,
  repairLambdaSinCubicExtremaMcqParse,
  repairLambdaSinCubicExtremaStemOcr,
  LAMBDA_SIN_EXTREMA_OPTIONS,
} from '../src/utils/repairLambdaSinCubicExtremaMcqOcr.js'

const garbled = `Let f(x) = sin 3x + l sin ² x, - 2 p < x < 2 p, then number of possible integral values of l for which f(x) has exactly one minimum and exactly one maximum, is-`

assert.ok(looksLikeLambdaSinCubicExtremaMcq(garbled))

const repaired = repairLambdaSinCubicExtremaStemOcr(garbled)
assert.match(repaired, /\\sin\^3|\\sin\^\{3\}/)
assert.match(repaired, /\\lambda/)
assert.match(repaired, /\\frac\{\\pi\}\{2\}/)
assert.ok(!/sin\s*3\s*x/i.test(repaired) || /\\sin\^3/.test(repaired))
assert.ok(!/\b2\s*p\b/i.test(repaired))

const bulkClean = cleanBulkStem(garbled, LAMBDA_SIN_EXTREMA_OPTIONS)
assert.match(bulkClean, /\\lambda/)

const healed = repairLambdaSinCubicExtremaMcqParse({
  text: garbled,
  options: ['0', '', '', ''],
  _ocrSource: garbled,
})
assert.equal(healed.optionsFound, 4)
assert.deepEqual(
  healed.options.map((o) => o.replace(/\$/g, '')),
  LAMBDA_SIN_EXTREMA_OPTIONS.map((o) => o.replace(/\$/g, '')),
)

const bulkBlock = `4. ${garbled}
(A) 0 (B) 1 (C) 2 (D) 3`
const parsed = parseBulkQuestions(bulkBlock)
assert.ok(parsed.length >= 1)
assert.match(parsed[0].text ?? '', /\\lambda/)

console.log('test-lambda-sin-cubic-extrema-mcq-ocr: ok')

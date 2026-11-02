import assert from 'node:assert/strict'
import { cleanBulkStem } from '../src/utils/bulkExtractClean.js'
import { parseBulkQuestions } from '../src/utils/parseBulkQuestions.js'
import { polishExtractedText } from '../src/utils/ocrExtractPolish.js'
import {
  looksLikeFxIntegralMaxMinMcq,
  repairFxIntegralMaxMinStemOcr,
  fixOcrIntegralGraveAccent } from '../src/utils/repairFxIntegralMaxMinMcqOcr.js'
const garbled = `Let f x () = 1 2 + ò ( t - x sin t dt), for x ∈ [ 0 , p ]. If M and m are the maximum and minimum value of f(x) respectively in x ∈ [ 0 , p ], then (M - m)`

assert.ok(looksLikeFxIntegralMaxMinMcq(garbled))
assert.match(fixOcrIntegralGraveAccent(garbled), /\\int_0\^x/)
assert.doesNotMatch(fixOcrIntegralGraveAccent(garbled), /\bò\b/)

const repaired = repairFxIntegralMaxMinStemOcr(garbled)
assert.match(repaired, /\\int_0\^x/)
assert.match(repaired, /\\frac\{1\}\{2\}/)
assert.match(repaired, /\\pi/)
assert.match(repaired, /\\sin\s*t/)
assert.doesNotMatch(repaired, /\bò\b/)

const bulkClean = cleanBulkStem(garbled, ['12', '10', '8', '6'])
assert.match(bulkClean, /\\int_0\^x/)

const polished = polishExtractedText(garbled)
assert.match(polished, /\\int/)

const bulkBlock = `Q2. ${garbled}
(A) 12 (B) 10 (C) 8 (D) 6`
const parsed = parseBulkQuestions(bulkBlock)
assert.ok(parsed.length >= 1)
assert.match(parsed[0].text ?? '', /\\int/)

console.log('test-fx-integral-maxmin-mcq-ocr: ok')

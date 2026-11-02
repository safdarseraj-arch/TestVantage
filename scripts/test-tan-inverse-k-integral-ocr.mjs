import assert from 'node:assert/strict'
import {
  looksLikeTanInverseKIntegral,
  repairTanInverseKIntegralOcr,
  repairTanInverseKIntegralParse,
  TAN_INVERSE_K_INTEGRAL_STEM,
  tanInverseKIntegralAnswer,
} from '../src/utils/repairTanInverseKIntegralOcr.js'
import { polishOcrText, polishCloudVisionText } from '../src/utils/ocrExtractPolish.js'
import { enrichParsedWithAnswerProvenance } from '../src/utils/answerProvenance.js'

const garbled =
  '+C, where k = | ( × 2 -2)dxlog (* +552 von 2) ( £) \\tan | x +- XxX'

assert.ok(looksLikeTanInverseKIntegral(garbled), 'detect tan inverse k integral')

const garbledAi = '2 -_- EN Ce toganl(x+ 4] ec. where k=. Re *'

assert.ok(looksLikeTanInverseKIntegral(garbledAi), 'detect AI garbled tan inverse k integral')

const repaired = repairTanInverseKIntegralOcr(garbled)
assert.match(repaired, /\\int[\s\S]*\\frac[\s\S]*\(x\^2\s*-\s*2\)/, 'integral numerator')
assert.match(repaired, /x\^4\s*\+\s*5x\^2\s*\+\s*4/, 'denominator polynomial')
assert.match(repaired, /\\tan\^{-1}/, 'inverse tan')
assert.match(repaired, /\\frac\{k\}\{x\}/, 'k over x')
assert.doesNotMatch(repaired, /552\s*von|XxX|£\)/, 'removes OCR soup')

const repairedAi = repairTanInverseKIntegralOcr(garbledAi)
assert.equal(repairedAi, TAN_INVERSE_K_INTEGRAL_STEM, 'AI garbled -> canonical stem')

const polished = polishOcrText(garbled)
assert.match(polished, /\\int/, 'polish keeps integral')
assert.match(polished, /\\text\{where\s*\}|where[\s\S]*k\s*=/i, 'polish keeps k blank')

const polishedAi = polishCloudVisionText(garbledAi)
assert.match(polishedAi, /\\int/, 'cloud polish keeps integral')
assert.doesNotMatch(polishedAi, /toganl|-_-/i, 'cloud polish removes soup')

assert.equal(tanInverseKIntegralAnswer(repaired), 2)

const enriched = enrichParsedWithAnswerProvenance({ text: repaired }, garbled)
assert.equal(enriched.correctInteger, 2)

const parsed = repairTanInverseKIntegralParse({
  text: garbledAi,
  options: ['', '', '', ''],
  questionType: 'single_correct',
})
assert.equal(parsed.questionType, 'integer')
assert.equal(parsed.correctInteger, 2)
assert.match(parsed.text, /\\int/)

console.log('test-tan-inverse-k-integral-ocr: ok')

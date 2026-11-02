import assert from 'node:assert/strict'
import {
  looksLikeExpRationalIntegralMcq,
  repairExpRationalIntegralMcqParse,
  repairExpRationalIntegralStemOcr,
  EXP_RATIONAL_INTEGRAL_STEM,
  healExpRationalIntegralOptions,
} from '../src/utils/repairExpRationalIntegralMcqOcr.js'
import { polishCloudVisionText, polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { applyMcqParseRepairs } from '../src/utils/repairRegistry.js'

const garbledStem = 'If | 2€ T0 dx = Ax + Blog,(9¢** -4) + C, then: 9x -4e™'
const garbledOpts = ['4=32', 'B=$\\frac{35}{36}$', 'Cisindefinite', 'A+B= =']
const blob = `${garbledStem}\n${garbledOpts.join('\n')}`

assert.ok(looksLikeExpRationalIntegralMcq(blob), 'detect exp rational integral')

const repairedStem = repairExpRationalIntegralStemOcr(garbledStem)
assert.match(repairedStem, /\\int[\s\S]*4e\^x\s*\+\s*6e\^\{-x\}/, 'integral stem')
assert.doesNotMatch(repairedStem, /Blog,|2€|9¢/, 'removes OCR soup')

const polished = polishCloudVisionText(garbledStem)
assert.match(polished, /\\int/, 'cloud polish keeps integral')

const parsed = applyMcqParseRepairs(
  { text: garbledStem, options: garbledOpts, optionsFound: 4 },
  blob,
  { passes: 2 },
)
assert.equal(parsed.text.trim(), EXP_RATIONAL_INTEGRAL_STEM.trim())
assert.deepEqual(parsed.options, healExpRationalIntegralOptions([]))
assert.equal(parsed.questionType, 'multiple_correct')
assert.deepEqual(parsed.correctIndices, [1, 2, 3])

const direct = repairExpRationalIntegralMcqParse({
  text: garbledStem,
  options: garbledOpts,
  _ocrSource: blob,
})
assert.match(direct.options[1], /35[\s\S]*36/, 'option B fraction')

console.log('test-exp-rational-integral-ocr: ok')

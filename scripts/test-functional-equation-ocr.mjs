import assert from 'node:assert/strict'
import { repairFunctionalEquationStemOcr } from '../src/utils/repairFunctionalEquationStemOcr.js'
import { stemForLivePreview } from '../src/utils/stemBankGuard.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'

const raw =
  "The function f is not defined for x= 0, but for all non zero real number x, f(x) + 2f 2) =3x. The X equation f(x) = f(-x) is satisfied by"

const repaired = repairFunctionalEquationStemOcr(raw)
assert.doesNotMatch(repaired, /2f\s*2\s*\)/, 'fixes 2f 2) OCR')
assert.doesNotMatch(repaired, /The X equation/i, 'fixes The X equation')
assert.ok(repaired.includes('2f(\\frac{1}{x}'), 'has 2f(1/x) LaTeX')

const live = stemForLivePreview(raw)
assert.doesNotMatch(live, /2f\s*2\s*\)/, 'live preview repairs OCR')

const polished = polishOcrText(raw)
assert.doesNotMatch(polished, /2f\s*2\s*\)/, 'polish pipeline repairs OCR')

console.log('test-functional-equation-ocr: ok')

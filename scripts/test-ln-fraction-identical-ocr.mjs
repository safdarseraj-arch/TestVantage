import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { stemForLivePreview } from '../src/utils/stemBankGuard.js'
import {
  LN_FRACTION_IDENTICAL_OPTIONS,
  repairLnFractionIdenticalMcqOcr,
  repairLnFractionIdenticalMcqParse } from '../src/utils/repairLnFractionIdenticalMcqOcr.js'
import { finalizeStemForBank } from '../src/utils/stemBankGuard.js'

const garbled = `f fix) = . and g (x) = -. Then identify the CORRECT statement
(A) 7) and f(x) are identical functio
(B) T(x) and g(x) are identical functions
(C) f(x) g(x) = 1 forall x > 0`

const partial = `f(x) = x / ln x and g (x) = ln x / x . Then identify the CORRECT statement
(A) 1 / g (x) and f (x) are identical functions
(B) 1 / f (x) and g (x) are identical functions
(C) f(x) . g(x) = 1 for all x > 0
(D) 1 / (f(x) . g(x)) = 1 for all x > 0`

const repairedRaw = repairLnFractionIdenticalMcqOcr(garbled)
assert.ok(repairedRaw.includes('\\frac{x}{\\ln x}'), 'rebuilds garbled stem fractions')
assert.ok(repairedRaw.includes('(D)'), 'adds missing option D')

const parsed = parseSingleQuestionUpload(polishOcrText(garbled), garbled)
assert.equal(parsed.optionsFound, 4, 'finds all 4 options after repair')
assert.doesNotMatch(parsed.text ?? '', /f\s*fix\s*\)/i, 'stem OCR fixed')
assert.ok(parsed.options[0]?.includes('\\frac{1}{g(x)}'), 'option A fraction')
assert.ok(parsed.options[1]?.includes('\\frac{1}{f(x)}'), 'option B fraction')

const parsedPartial = parseSingleQuestionUpload(polishOcrText(partial), partial)
assert.equal(parsedPartial.optionsFound, 4)
assert.doesNotMatch(parsedPartial.text ?? '', /\$\s*=\s*\$\\frac/, 'no nested frac dollars in stem')
assert.ok(parsedPartial.text?.includes('\\frac{x}{\\ln x}'), 'stem has x/ln x fraction')

const live = stemForLivePreview(parsed.text ?? '', parsed.options ?? [])
assert.ok(live.includes('\\frac{x}{\\ln x}'), 'live preview has stem LaTeX')

const repairedPartial = repairLnFractionIdenticalMcqParse({ ...parsedPartial })
assert.match(
  repairedPartial.options[2] ?? '',
  /\\forall\s*x\s*>\s*0/,
  'option C keeps forall x > 0',
)
assert.match(
  repairedPartial.options[3] ?? '',
  /= 1\s*\\quad\s*\\forall\s*x\s*>\s*0/,
  'option D keeps full = 1 forall x > 0 tail',
)
assert.doesNotMatch(repairedPartial.options[2] ?? '', /\\for\s+all/i, 'option C not broken forall')
assert.doesNotMatch(repairedPartial.options[3] ?? '', /\\for\s+all/i, 'option D not broken forall')

const canonicalD = finalizeStemForBank(LN_FRACTION_IDENTICAL_OPTIONS[3], LN_FRACTION_IDENTICAL_OPTIONS)
assert.match(canonicalD, /= 1\s*\\quad\s*\\forall\s*x\s*>\s*0/, 'canonical D survives finalize with sibling opts')

console.log('test-ln-fraction-identical-ocr: ok')

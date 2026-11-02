import assert from 'node:assert/strict'
import {
  looksLikeEcosxIntegralMcq,
  repairEcosxIntegralMcqParse,
  repairEcosxIntegralStemOcr,
  ECOSX_INTEGRAL_STEM,
  healEcosxIntegralOptions,
} from '../src/utils/repairEcosxIntegralMcqOcr.js'
import { polishCloudVisionText } from '../src/utils/ocrExtractPolish.js'
import { applyMcqParseRepairs } from '../src/utils/repairRegistry.js'

const garbledStem =
  'The value of | he must be same as: +ecosx wr = 3 ( ) 1 1 [1-e x . A -\\tan -\\tan- |'
const garbledOpts = ['Option A', 'Option B', 'Option C', 'Option D']
const blob = `${garbledStem}\n${garbledOpts.join('\n')}`

assert.ok(looksLikeEcosxIntegralMcq(blob), 'detect e cos x integral')

const repairedStem = repairEcosxIntegralStemOcr(garbledStem)
assert.match(repairedStem, /\\int\s*\\frac\{dx\}\{1\s*\+\s*e\\cos\s*x\}/, 'integral stem')
assert.doesNotMatch(repairedStem, /\+ecosx|\|\s*he\s+must/, 'removes OCR soup')

const polished = polishCloudVisionText(garbledStem)
assert.match(polished, /\\int/, 'cloud polish keeps integral')

const almost =
  'The value of $\\int $$\\frac{dx}{1 + e\\cos x}$ must be same as:'
assert.ok(looksLikeEcosxIntegralMcq(almost), 'detect half-parsed ecosx stem')
const healedAlmost = repairEcosxIntegralStemOcr(almost)
assert.doesNotMatch(healedAlmost, /\$\\int\s*\$\$/, 'fixes extra $$ before frac')
assert.deepEqual(
  repairEcosxIntegralMcqParse({
    text: almost,
    options: garbledOpts,
    optionsFound: 4,
  }).options,
  healEcosxIntegralOptions([]),
  'placeholder Option A–D become real math',
)

const parsed = applyMcqParseRepairs(
  { text: garbledStem, options: garbledOpts, optionsFound: 4 },
  blob,
  { passes: 2 },
)
// Short display math is normalized to inline downstream — both render the same.
const inlineDollars = (s) => String(s).replace(/\$\$/g, '$').trim()
assert.equal(inlineDollars(parsed.text), inlineDollars(ECOSX_INTEGRAL_STEM))
assert.deepEqual(parsed.options, healEcosxIntegralOptions([]))
assert.equal(parsed.questionType, 'multiple_correct')

console.log('test-ecosx-integral-ocr: ok')

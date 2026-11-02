import assert from 'node:assert/strict'
import {
  looksLikeExpXPlusInvXIntegralMcq,
  repairExpXPlusInvXIntegralMcqParse,
  repairExpXPlusInvXIntegralStemOcr,
  EXP_X_PLUS_INV_X_INTEGRAL_STEM,
  EXP_X_PLUS_INV_X_INTEGRAL_OPTIONS,
} from '../src/utils/repairExpXPlusInvXIntegralMcqOcr.js'
import { looksLikeXxPowerLnIntegralMcq } from '../src/utils/repairXxPowerLnIntegralMcqOcr.js'
import { looksLikeTanCscGxIntegralMcq } from '../src/utils/repairTanCscGxIntegralMcqOcr.js'
import { looksLikeExSinxCosxIntegralMcq } from '../src/utils/repairExSinxCosxIntegralMcqOcr.js'
import { applyGraphOptionPlaceholders, GRAPH_OPTION_PLACEHOLDER, isGraphPlaceholderText } from '../src/utils/graphOptionOcr.js'
import { polishCloudVisionText, polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { applyMcqParseRepairs } from '../src/utils/repairRegistry.js'
import { processMcqUploadExtract, shouldSkipHeavyMcqHeal } from '../src/utils/uploadPipeline.js'
import { looksLikeUnusableOcrSoup, countRealMcqOptions } from '../src/utils/stemDiagramDetect.js'
import { looksLikeFlatDeterminant } from '../src/utils/repairFlatVmatrixOcr.js'
import { shouldPreserveVisionStructuredFill } from '../src/utils/cloudVisionParse.js'

const garbled = '$- oC XX A AL (x -1) \\vec{c} x - eT ax (B) Fel +C |x ne +C'

assert.ok(looksLikeExpXPlusInvXIntegralMcq(garbled), 'detect e^{x+1/x} screenshot soup')
assert.equal(looksLikeXxPowerLnIntegralMcq(garbled), false, 'must not steal xx-power')
assert.equal(looksLikeTanCscGxIntegralMcq(garbled), false, 'must not steal tan-csc')
assert.equal(looksLikeExSinxCosxIntegralMcq(garbled), false, 'must not steal 202333')
assert.ok(looksLikeUnusableOcrSoup(garbled, ['Option A', 'Option B', 'Option C', 'Option D']))
assert.equal(looksLikeFlatDeterminant(garbled), false, 'not a vmatrix')

const repairedStem = repairExpXPlusInvXIntegralStemOcr(garbled)
assert.match(repairedStem, /1\+x-x\^\{-1\}/)
assert.match(repairedStem, /e\^\{x\+x\^\{-1\}/)
assert.doesNotMatch(repairedStem, /oC\s*XX|eT\s*ax/)

const polished = polishOcrText(garbled)
assert.match(polished, /\\int/)
const cloud = polishCloudVisionText(garbled)
assert.match(cloud, /\\int/)

const placeholders = ['Option A', 'Option B', 'Option C', 'Option D']
assert.equal(
  shouldSkipHeavyMcqHeal({ preserveVision: true, stem: garbled, options: placeholders }),
  false,
  'placeholder options must not skip heal',
)
assert.equal(
  shouldPreserveVisionStructuredFill(
    { text: garbled, options: placeholders },
    'cloud-vision',
  ),
  false,
)

const parsed = applyMcqParseRepairs(
  { text: garbled, options: placeholders, optionsFound: 4 },
  garbled,
  { passes: 2 },
)
const inlineDollars = (s) => String(s).replace(/\$\$/g, '$').trim()
assert.equal(inlineDollars(parsed.text), inlineDollars(EXP_X_PLUS_INV_X_INTEGRAL_STEM))
assert.deepEqual(parsed.options, EXP_X_PLUS_INV_X_INTEGRAL_OPTIONS)
assert.equal(parsed.questionType, 'single_correct')
assert.deepEqual(parsed.correctIndices, [3])
assert.equal(parsed.correctIndex, 3)
assert.equal(countRealMcqOptions(parsed.text, parsed.options), 4)
assert.ok(parsed.options.every((o) => !isGraphPlaceholderText(o)))
assert.match(parsed.options[3], /\$xe\^\{x\+x\^\{-1\}\}\+C\$/)

const pipe = processMcqUploadExtract(garbled)
assert.equal(inlineDollars(pipe.parsed?.text ?? ''), inlineDollars(EXP_X_PLUS_INV_X_INTEGRAL_STEM))
assert.deepEqual(pipe.parsed?.options, EXP_X_PLUS_INV_X_INTEGRAL_OPTIONS)
assert.equal(pipe.parsed?.correctIndex, 3)
assert.ok((pipe.parsed?.options ?? []).every((o) => !isGraphPlaceholderText(o)))

const empty = repairExpXPlusInvXIntegralMcqParse({
  text: garbled,
  options: ['', '', '', ''],
  optionsFound: 0,
})
assert.deepEqual(empty.options, EXP_X_PLUS_INV_X_INTEGRAL_OPTIONS)
assert.equal(empty.correctIndex, 3)

const graphApplied = applyGraphOptionPlaceholders(
  garbled,
  ['(x-1) +C', GRAPH_OPTION_PLACEHOLDER, 'Fel +C', '|x ne +C'],
  [],
)
assert.ok(graphApplied.every((o) => !isGraphPlaceholderText(o)), 'leaked +C soup is not a graph')

// Healed exp stem + original soup in _ocrSource must not become x^{x^2+1}.
const mixed = applyMcqParseRepairs(
  {
    text: EXP_X_PLUS_INV_X_INTEGRAL_STEM,
    options: placeholders,
    optionsFound: 4,
  },
  garbled,
  { passes: 2 },
)
assert.equal(inlineDollars(mixed.text), inlineDollars(EXP_X_PLUS_INV_X_INTEGRAL_STEM))
assert.deepEqual(mixed.options, EXP_X_PLUS_INV_X_INTEGRAL_OPTIONS)
assert.equal(mixed.correctIndex, 3)
assert.equal(
  looksLikeXxPowerLnIntegralMcq(`${EXP_X_PLUS_INV_X_INTEGRAL_STEM}\n${garbled}`),
  false,
  'concatenated exp stem + oC XX soup is not xx-power',
)

console.log('test-exp-x-plus-inv-x-integral-ocr: ok')

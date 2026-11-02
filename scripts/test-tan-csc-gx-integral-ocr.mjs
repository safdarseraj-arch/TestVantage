import assert from 'node:assert/strict'
import {
  looksLikeTanCscGxIntegralMcq,
  repairTanCscGxIntegralMcqParse,
  repairTanCscGxIntegralStemOcr,
  TAN_CSC_GX_INTEGRAL_STEM,
  TAN_CSC_GX_INTEGRAL_OPTIONS,
} from '../src/utils/repairTanCscGxIntegralMcqOcr.js'
import { looksLikeXxPowerLnIntegralMcq } from '../src/utils/repairXxPowerLnIntegralMcqOcr.js'
import { looksLikeExpXPlusInvXIntegralMcq } from '../src/utils/repairExpXPlusInvXIntegralMcqOcr.js'
import { looksLikeExSinxCosxIntegralMcq } from '../src/utils/repairExSinxCosxIntegralMcqOcr.js'
import { applyGraphOptionPlaceholders, GRAPH_OPTION_PLACEHOLDER, isGraphPlaceholderText } from '../src/utils/graphOptionOcr.js'
import { polishCloudVisionText, polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { applyMcqParseRepairs } from '../src/utils/repairRegistry.js'
import { processMcqUploadExtract, shouldSkipHeavyMcqHeal } from '../src/utils/uploadPipeline.js'
import { looksLikeUnusableOcrSoup, countRealMcqOptions } from '../src/utils/stemDiagramDetect.js'
import { looksLikeFlatDeterminant } from '../src/utils/repairFlatVmatrixOcr.js'
import { shouldPreserveVisionStructuredFill } from '../src/utils/cloudVisionParse.js'

const garbled = [
  'If [e [2 cose (2 )ar=e g(x) + K, then f =) χ',
  'M0\\sigma\\left( \\overline{\\partial x} \\right)=\\left( \\frac{2 \\tan x}{ \\quad } \\right)\\cdot\\left(\\begin{array}{c}2\\tan',
].join('\n')

assert.ok(looksLikeTanCscGxIntegralMcq(garbled), 'detect tan-csc g(x) screenshot soup')
assert.equal(looksLikeXxPowerLnIntegralMcq(garbled), false, 'must not steal xx-power')
assert.equal(looksLikeExpXPlusInvXIntegralMcq(garbled), false, 'must not steal e^{x+1/x}')
assert.equal(looksLikeExSinxCosxIntegralMcq(garbled), false, 'must not steal 202333')
assert.ok(looksLikeUnusableOcrSoup(garbled, ['Option A', 'Option B', 'Option C', 'Option D']))
assert.equal(looksLikeFlatDeterminant(garbled), false, 'array/tan soup is not a vmatrix')

const repairedStem = repairTanCscGxIntegralStemOcr(garbled)
assert.match(repairedStem, /2\\tan x/)
assert.match(repairedStem, /\\csc\^(?:\{2\}|2)/)
assert.doesNotMatch(repairedStem, /\[e\s*\[2\s*cose/)

const polished = polishOcrText(garbled)
assert.match(polished, /g\\left\(\\dfrac\{5\\pi\}\{4\}/)
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
  'garbled + Option A stubs must not lock Convert',
)

const parsed = applyMcqParseRepairs(
  { text: garbled, options: placeholders, optionsFound: 4 },
  garbled,
  { passes: 2 },
)
const inlineDollars = (s) => String(s).replace(/\$\$/g, '$').trim()
assert.equal(inlineDollars(parsed.text), inlineDollars(TAN_CSC_GX_INTEGRAL_STEM))
assert.deepEqual(parsed.options, TAN_CSC_GX_INTEGRAL_OPTIONS)
assert.equal(parsed.questionType, 'single_correct')
assert.deepEqual(parsed.correctIndices, [1])
assert.equal(parsed.correctIndex, 1)
assert.equal(countRealMcqOptions(parsed.text, parsed.options), 4)
assert.ok(parsed.options.every((o) => !isGraphPlaceholderText(o)))
assert.match(parsed.solution ?? '', /1\+\\tan/)
assert.match(parsed.solution ?? '', /wrongly gives \$0\$/)

const pipe = processMcqUploadExtract(garbled)
assert.equal(inlineDollars(pipe.parsed?.text ?? ''), inlineDollars(TAN_CSC_GX_INTEGRAL_STEM))
assert.deepEqual(pipe.parsed?.options, TAN_CSC_GX_INTEGRAL_OPTIONS)
assert.equal(pipe.parsed?.correctIndex, 1)
assert.ok((pipe.parsed?.options ?? []).every((o) => !isGraphPlaceholderText(o)))

const empty = repairTanCscGxIntegralMcqParse({
  text: garbled,
  options: ['', '', '', ''],
  optionsFound: 0,
})
assert.deepEqual(empty.options, TAN_CSC_GX_INTEGRAL_OPTIONS)
assert.equal(empty.correctIndex, 1)

const graphApplied = applyGraphOptionPlaceholders(garbled, placeholders, [])
assert.ok(graphApplied.every((o) => !isGraphPlaceholderText(o)), 'numeric options are not graphs')
assert.notEqual(graphApplied[0], GRAPH_OPTION_PLACEHOLDER)

// Exact Convert-panel soup from image-d1c5f9bc (unicode boxes + \text{} tan array).
const pngSoup = [
  'If [e [2 cose (2 )ar=e g(x) + K, then f =) χ',
  String.raw`▢M⊠0\sigma\left( \frac{\partial x}{\text{ }} \right)=\left( \frac{2 \tan x}{\text{ }} \right)\cdot\left(\begin{array}{c}2\tan\end{array}\right.`,
].join('\n')
assert.ok(looksLikeTanCscGxIntegralMcq(pngSoup), 'detect image-d1c5f9bc PNG soup')
assert.equal(looksLikeXxPowerLnIntegralMcq(pngSoup), false, 'PNG soup must not steal xx-power')
assert.equal(looksLikeExpXPlusInvXIntegralMcq(pngSoup), false, 'PNG soup must not steal e^{x+1/x}')
const pngParsed = applyMcqParseRepairs(
  { text: pngSoup, options: placeholders, optionsFound: 4 },
  pngSoup,
  { passes: 2 },
)
assert.equal(inlineDollars(pngParsed.text), inlineDollars(TAN_CSC_GX_INTEGRAL_STEM))
assert.deepEqual(pngParsed.options, TAN_CSC_GX_INTEGRAL_OPTIONS)
assert.equal(pngParsed.correctIndex, 1, 'g(5π/4)=1 is (B), not (A)=0')

console.log('test-tan-csc-gx-integral-ocr: ok')

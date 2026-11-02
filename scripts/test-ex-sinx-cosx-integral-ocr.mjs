import assert from 'node:assert/strict'
import {
  looksLikeExSinxCosxIntegralMcq,
  repairExSinxCosxIntegralMcqParse,
  repairExSinxCosxIntegralStemOcr,
  EX_SINX_COSX_INTEGRAL_STEM,
  EX_SINX_COSX_INTEGRAL_OPTIONS,
} from '../src/utils/repairExSinxCosxIntegralMcqOcr.js'
import { looksLikeXxPowerLnIntegralMcq } from '../src/utils/repairXxPowerLnIntegralMcqOcr.js'
import { applyGraphOptionPlaceholders, GRAPH_OPTION_PLACEHOLDER, isGraphPlaceholderText } from '../src/utils/graphOptionOcr.js'
import { polishCloudVisionText, polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { applyMcqParseRepairs } from '../src/utils/repairRegistry.js'
import { processMcqUploadExtract, shouldSkipHeavyMcqHeal } from '../src/utils/uploadPipeline.js'
import { looksLikeUnusableOcrSoup, countRealMcqOptions } from '../src/utils/stemDiagramDetect.js'
import { looksLikeFlatDeterminant } from '../src/utils/repairFlatVmatrixOcr.js'

const garbled = [
  'sin x+cosx x* cos? x \u2014 xsinx + cos x dr',
  '\u20ac 2.2. =',
  'x\u201c cos\u201d x',
  'A) gsmx+cosx X\u2014\u2014 | + C \u00AEB) egrsmxteosx x\u2014 + C',
  'cos x xXCosx',
  '. x ) .',
  '\u00A9) grsmatcosx 1 JES C D) grsmatcosxy 1 _ + C',
  'XCOSX COS x',
].join('\n')

assert.ok(looksLikeExSinxCosxIntegralMcq(garbled), 'detect 202333 OCR soup')
assert.equal(looksLikeXxPowerLnIntegralMcq(garbled), false, 'must not steal xx-power plugin')
assert.ok(looksLikeUnusableOcrSoup(garbled, []), 'soup so Convert does not skip heal')
assert.equal(looksLikeFlatDeterminant(garbled), false, 'not a vmatrix')

const repairedStem = repairExSinxCosxIntegralStemOcr(garbled)
assert.match(repairedStem, /e\^\{x\\sin x\+\\cos x\}/)
assert.doesNotMatch(repairedStem, /gsmx|egrsmx|\\bdr\\b/)

const polished = polishOcrText(garbled)
assert.match(polished, /\\int/)
assert.doesNotMatch(polished, /gsmx\+cosx/)

const parsed = applyMcqParseRepairs(
  { text: garbled, options: ['', '', '', ''], optionsFound: 0 },
  garbled,
  { passes: 2 },
)
const inlineDollars = (s) => String(s).replace(/\$\$/g, '$').trim()
assert.equal(inlineDollars(parsed.text), inlineDollars(EX_SINX_COSX_INTEGRAL_STEM))
assert.deepEqual(parsed.options, EX_SINX_COSX_INTEGRAL_OPTIONS)
assert.equal(parsed.questionType, 'single_correct')
assert.deepEqual(parsed.correctIndices, [1])
assert.equal(countRealMcqOptions(parsed.text, parsed.options), 4)
assert.ok(parsed.options.every((o) => !isGraphPlaceholderText(o)))

const pipe = processMcqUploadExtract(garbled)
assert.match(pipe.parsed?.text ?? '', /e\^\{x\\sin x\+\\cos x\}/)
assert.deepEqual(pipe.parsed?.options, EX_SINX_COSX_INTEGRAL_OPTIONS)
assert.equal(pipe.parsed?.questionType, 'single_correct')
assert.equal(countRealMcqOptions(pipe.parsed?.text ?? '', pipe.parsed?.options ?? []), 4)

assert.equal(
  shouldSkipHeavyMcqHeal({
    preserveVision: true,
    stem: garbled,
    options: ['gsmx+cosx X- | + C', '', 'grsmatcosx 1 JES C', 'grsmatcosxy 1 _ + C'],
  }),
  false,
  '202333 soup must not skip heal',
)

const graphApplied = applyGraphOptionPlaceholders(garbled, ['gsmx+cosx + C', 'egrsmxteosx + C', '1 JES C', GRAPH_OPTION_PLACEHOLDER], [])
assert.ok(graphApplied.every((o) => !isGraphPlaceholderText(o)), 'not graphs')

const placeholders = repairExSinxCosxIntegralMcqParse({
  text: garbled,
  options: ['Option A', 'Option B', 'Option C', 'Option D'],
  optionsFound: 4,
})
assert.deepEqual(placeholders.options, EX_SINX_COSX_INTEGRAL_OPTIONS)

const cloud = polishCloudVisionText(garbled)
assert.match(cloud, /\\int/)

console.log('test-ex-sinx-cosx-integral-ocr: ok')
import assert from 'node:assert/strict'
import {
  looksLikeXxPowerLnIntegralMcq,
  repairXxPowerLnIntegralMcqParse,
  repairXxPowerLnIntegralStemOcr,
  XX_POWER_LN_INTEGRAL_STEM,
  XX_POWER_LN_INTEGRAL_OPTIONS,
} from '../src/utils/repairXxPowerLnIntegralMcqOcr.js'
import {
  applyGraphOptionPlaceholders,
  GRAPH_OPTION_PLACEHOLDER,
  isGraphPlaceholderText,
  shouldUseGraphPlaceholder,
} from '../src/utils/graphOptionOcr.js'
import { polishCloudVisionText, polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { applyMcqParseRepairs } from '../src/utils/repairRegistry.js'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import { looksLikeFlatDeterminant } from '../src/utils/repairFlatVmatrixOcr.js'
import { countRealMcqOptions } from '../src/utils/stemDiagramDetect.js'

const garbledStem = '241 | 1 QInx + 1)dx A FC'
const garbledOpts = ['Lhx+C', 'MC', '(FY +C', '|Il1O']
const blob = `${garbledStem}\n${garbledOpts.join('\n')}`

assert.ok(looksLikeXxPowerLnIntegralMcq(garbledStem), 'detect screenshot garbled stem')
assert.ok(looksLikeXxPowerLnIntegralMcq(blob), 'detect garbled stem plus option soup')

const repairedStem = repairXxPowerLnIntegralStemOcr(garbledStem)
assert.match(repairedStem, /\\int\s*x\^\{x\^2\+1\}/)
assert.match(repairedStem, /2\\ln\s*x/)
assert.doesNotMatch(repairedStem, /QInx|241\s*\|/)

const polishedCloud = polishCloudVisionText(garbledStem)
assert.match(polishedCloud, /\\int/)
assert.doesNotMatch(polishedCloud, /QInx/)

const polishedLocal = polishOcrText(garbledStem)
assert.match(polishedLocal, /\\int/)
assert.doesNotMatch(polishedLocal, /QInx/)

assert.equal(
  looksLikeFlatDeterminant(blob),
  false,
  'this integral must not become a vmatrix',
)

assert.equal(
  shouldUseGraphPlaceholder('|Il1O', garbledStem, false),
  false,
  'garbled D on an integral stem is not a graph',
)
assert.equal(
  shouldUseGraphPlaceholder('Lhx+C', garbledStem, false),
  false,
  '+C option is not a graph',
)

const graphApplied = applyGraphOptionPlaceholders(garbledStem, garbledOpts, [])
assert.ok(
  graphApplied.every((o) => !isGraphPlaceholderText(o)),
  'garbled +C / ln / power options are never graph placeholders',
)
assert.notEqual(graphApplied[3], GRAPH_OPTION_PLACEHOLDER)

const alreadyGraph = applyGraphOptionPlaceholders(
  garbledStem,
  ['Lhx+C', 'MC', '(FY +C', GRAPH_OPTION_PLACEHOLDER],
  [],
)
assert.ok(
  !isGraphPlaceholderText(alreadyGraph[3]),
  'graph placeholder does not survive on D',
)

const parsed = applyMcqParseRepairs(
  { text: garbledStem, options: garbledOpts, optionsFound: 4 },
  blob,
  { passes: 2 },
)
const inlineDollars = (s) => String(s).replace(/\$\$/g, '$').trim()
assert.equal(inlineDollars(parsed.text), inlineDollars(XX_POWER_LN_INTEGRAL_STEM))
assert.deepEqual(parsed.options, XX_POWER_LN_INTEGRAL_OPTIONS)
assert.equal(parsed.questionType, 'single_correct')
assert.deepEqual(parsed.correctIndices, [3])
assert.equal(parsed.correctIndex, 3)
assert.ok(parsed.solution && /x\^\{x\^2\}/.test(parsed.solution))
assert.ok(parsed.options.every((o) => !isGraphPlaceholderText(o)))
assert.match(parsed.options[3], /\(x\^x\)\^x/)

const pipe = processMcqUploadExtract(blob)
assert.match(pipe.parsed?.text ?? '', /\\int\s*x\^\{x\^2\+1\}/)
assert.deepEqual(pipe.parsed?.options, XX_POWER_LN_INTEGRAL_OPTIONS)
assert.equal(pipe.parsed?.questionType, 'single_correct')
assert.ok((pipe.parsed?.options ?? []).every((o) => !isGraphPlaceholderText(o)))

const visionSoup = applyMcqParseRepairs(
  {
    text: garbledStem,
    options: ['Lhx+C', 'MC', '(FY +C', GRAPH_OPTION_PLACEHOLDER],
    optionsFound: 4,
    complete: true,
  },
  blob,
  { passes: 2 },
)
assert.match(visionSoup.text ?? '', /\\int\s*x\^\{x\^2\+1\}/)
assert.deepEqual(visionSoup.options, XX_POWER_LN_INTEGRAL_OPTIONS)
assert.ok(!isGraphPlaceholderText(visionSoup.options[3]))

const sourceImageOcr = `x^{x2+1}(2 ln x + 1) dx
(A) x^{2x}+C
(B) x^2 ln x + C
(C) x^{(x^x)}+C
(D) (x^x)^x+C`
assert.ok(looksLikeXxPowerLnIntegralMcq(sourceImageOcr), 'detect source-image OCR without QInx')
const sourceParsed = processMcqUploadExtract(sourceImageOcr)
assert.match(sourceParsed.parsed?.text ?? '', /\\int\s*x\^\{x\^2\+1\}/)
assert.deepEqual(sourceParsed.parsed?.options, XX_POWER_LN_INTEGRAL_OPTIONS)

const placeholders = repairXxPowerLnIntegralMcqParse({
  text: garbledStem,
  options: ['Option A', 'Option B', 'Option C', 'Option D'],
  optionsFound: 4,
})
assert.deepEqual(placeholders.options, XX_POWER_LN_INTEGRAL_OPTIONS)
assert.equal(placeholders.questionType, 'single_correct')
assert.deepEqual(placeholders.correctIndices, [3])

const afterGraphParse = applyMcqParseRepairs(
  {
    text: garbledStem,
    options: ['Lhx+C', 'MC', '(FY +C', GRAPH_OPTION_PLACEHOLDER],
    optionsFound: 4,
  },
  blob,
  { passes: 2 },
)
assert.equal(afterGraphParse.options[3], XX_POWER_LN_INTEGRAL_OPTIONS[3])
assert.ok(!isGraphPlaceholderText(afterGraphParse.options[3]))

const screenshot202432 =
  '241\n| 1 QInx + 1)dx\nA FC \u00AE Lhx+C \u00A9 MC \u00AE (FY +C\n'
assert.ok(looksLikeXxPowerLnIntegralMcq(screenshot202432), 'detect 202432.png tesseract OCR')
const shotPipe = processMcqUploadExtract(screenshot202432)
assert.match(shotPipe.parsed?.text ?? '', /\\int\s*x\^\{x\^2\+1\}/)
assert.deepEqual(shotPipe.parsed?.options, XX_POWER_LN_INTEGRAL_OPTIONS)
assert.equal(countRealMcqOptions(shotPipe.parsed?.text ?? '', shotPipe.parsed?.options ?? []), 4)

const screenshotLuNe =
  '. $\\times$$3 + LU I ne + A xX 1) dx Ne ) 4 C (B) (x ) 2\n xt C (x ) 2\n xt C$'
assert.ok(looksLikeXxPowerLnIntegralMcq(screenshotLuNe), 'detect LU/ne/xX/dx cloud soup')
const luPlaceholders = applyMcqParseRepairs(
  {
    text: screenshotLuNe,
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    optionsFound: 4,
  },
  screenshotLuNe,
  { passes: 2 },
)
assert.equal(inlineDollars(luPlaceholders.text), inlineDollars(XX_POWER_LN_INTEGRAL_STEM))
assert.deepEqual(luPlaceholders.options, XX_POWER_LN_INTEGRAL_OPTIONS)
assert.deepEqual(luPlaceholders.correctIndices, [3])
assert.equal(luPlaceholders.correctIndex, 3)
assert.ok(luPlaceholders.options.every((o) => !isGraphPlaceholderText(o)))
const luPipe = processMcqUploadExtract(screenshotLuNe)
assert.match(luPipe.parsed?.text ?? '', /\\int\s*x\^\{x\^2\+1\}/)
assert.deepEqual(luPipe.parsed?.options, XX_POWER_LN_INTEGRAL_OPTIONS)
assert.equal(luPipe.parsed?.correctIndex, 3)
assert.ok((luPipe.parsed?.options ?? []).every((o) => !isGraphPlaceholderText(o)))
assert.equal(looksLikeFlatDeterminant(screenshotLuNe), false, 'LU/ne soup is not a vmatrix')
assert.equal(
  shouldUseGraphPlaceholder('Option D', screenshotLuNe, false),
  false,
  'placeholder D on LU soup is not a graph',
)

console.log('test-xx-power-ln-integral-ocr: ok')

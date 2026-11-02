import assert from 'node:assert/strict'
import {
  looksLikeGxIntegralOriginMcq,
  repairGxIntegralOriginMcqParse,
  repairGxIntegralOriginStemOcr,
  GX_INTEGRAL_ORIGIN_STEM,
  GX_INTEGRAL_ORIGIN_OPTIONS,
} from '../src/utils/repairGxIntegralOriginMcqOcr.js'
import { polishCloudVisionText } from '../src/utils/ocrExtractPolish.js'
import { applyMcqParseRepairs } from '../src/utils/repairRegistry.js'
import { parseQuestionText } from '../src/utils/parseQuestionText.js'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import { countRealMcqOptions } from '../src/utils/stemDiagramDetect.js'

const garbled =
  'A curve g(x) = [+ (l+x+ x? 6 (6x^2 + 5x + 4 ) dx is passing through origin, then: Ww w=t \u00AE ew=i \u00A9 en-l \u00AE een=i gV=5 8975 \u00A37075 SREY'

assert.ok(looksLikeGxIntegralOriginMcq(garbled), 'detect g(x) origin MCQ')

const repairedStem = repairGxIntegralOriginStemOcr(garbled)
assert.match(repairedStem, /\\int\s*x\^\{27\}/)
assert.doesNotMatch(repairedStem, /Ww|SREY|\[\+/)

const polished = polishCloudVisionText(garbled)
assert.match(polished, /\\int/)
assert.doesNotMatch(polished, /Ww\s+w=t/)

const fromParse = parseQuestionText(garbled)
assert.ok(fromParse.optionsFound >= 2, 'generic split recovers option slots')
assert.doesNotMatch(fromParse.text, /Ww\s+w=t/)

const parsed = applyMcqParseRepairs(
  { text: garbled, options: ['', '', '', ''], optionsFound: 0 },
  garbled,
  { passes: 2 },
)
assert.equal(parsed.text.trim(), GX_INTEGRAL_ORIGIN_STEM.trim())
assert.deepEqual(parsed.options, GX_INTEGRAL_ORIGIN_OPTIONS)
assert.equal(parsed.questionType, 'multiple_correct')
assert.deepEqual(parsed.correctIndices, [0, 2])
assert.equal(countRealMcqOptions(parsed.text, parsed.options), 4)

const pipe = processMcqUploadExtract(garbled)
assert.match(pipe.parsed?.text ?? '', /\\int\s*x\^\{27\}/)
assert.deepEqual(pipe.parsed?.options, GX_INTEGRAL_ORIGIN_OPTIONS)
assert.equal(pipe.parsed?.questionType, 'multiple_correct')

const pluginDirect = repairGxIntegralOriginMcqParse({
  text: garbled,
  options: ['Option A', 'Option B', 'Option C', 'Option D'],
  optionsFound: 4,
})
assert.deepEqual(pluginDirect.options, GX_INTEGRAL_ORIGIN_OPTIONS)

console.log('test-gx-integral-origin-ocr: ok')
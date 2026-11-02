import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import {
  looksLikeMinSinAbsGiPeriodMcq,
  repairMinSinAbsGiPeriodMcqParse,
  MIN_SIN_ABS_GI_PERIOD_STEM,
  MIN_SIN_ABS_GI_PERIOD_OPTIONS,
} from '../src/utils/repairMinSinAbsGiPeriodMcqOcr.js'
import { shouldAutoAttachUploadScreenshot } from '../src/utils/stemDiagramDetect.js'

const garbled = `Period of function f(x) = \\min\\{\\sin x, b\\} + \\frac{x}{pi} - \\frac{x}{pi}(where [\\cdot] denotes greatest integer function) is - \\frac{1}{2} . \\backslash\\text{begin}\\{\\text{tabular}\\}\\{\\text{ccccc}\\} \\backslash\\text{hline } (\\text{A} )\\& \\text{ pi}/2 \\&`

assert.ok(looksLikeMinSinAbsGiPeriodMcq(garbled))

const polished = polishOcrText(garbled)
assert.ok(!/tabular|hline|\\\\text\{begin\}/i.test(polished), 'tabular garbage stripped')
assert.ok(polished.includes('min'), 'polished stem keeps min expression')
assert.ok(polished.includes('greatest integer'), 'polished stem keeps GI note')

const parsed = parseSingleQuestionUpload(garbled, garbled)
assert.equal(parsed.optionsFound, 4, 'repair fills four pi options')
assert.ok((parsed.text ?? '').includes('min'))
assert.equal(parsed.options[0], MIN_SIN_ABS_GI_PERIOD_OPTIONS[0])
assert.equal(parsed.options[3], MIN_SIN_ABS_GI_PERIOD_OPTIONS[3])

const extracted = processMcqUploadExtract(garbled)
assert.equal(extracted.found, 4)
assert.ok(!shouldAutoAttachUploadScreenshot(extracted.parsed.text ?? '', garbled, 4, extracted.parsed.options))

const healed = repairMinSinAbsGiPeriodMcqParse({
  text: garbled,
  options: ['', '', '', ''],
  _ocrSource: garbled,
})
assert.equal(healed.text, MIN_SIN_ABS_GI_PERIOD_STEM)
assert.equal(healed.optionsFound, 4)

console.log('test-min-sin-abs-gi-period-mcq-ocr: ok')

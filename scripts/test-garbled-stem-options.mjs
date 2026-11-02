import assert from 'node:assert/strict'
import {
  looksLikeLeakedOptionBand,
  relabelSequentialOcrOptionMarks,
  splitStemAndGarbledOptions,
  stripLeakedOptionBandFromStem,
  repairGarbledStemOptionsParse,
} from '../src/utils/splitStemAndGarbledOptions.js'
import { parseQuestionText } from '../src/utils/parseQuestionText.js'
import { applyMcqParseRepairs } from '../src/utils/repairRegistry.js'
import { shouldPreserveVisionStructuredFill, visionQuestionToMcqParse } from '../src/utils/cloudVisionParse.js'
import { countRealMcqOptions } from '../src/utils/stemDiagramDetect.js'

const UNKNOWN =
  'If f(x) = x^2 + 1 then: Ww 12 \u00AE 24 \u00A9 36 \u00AE 48 leftover'

assert.equal(looksLikeLeakedOptionBand(UNKNOWN), true, 'detects Ww/circled option soup')
const relabeled = relabelSequentialOcrOptionMarks(UNKNOWN)
assert.match(relabeled, /\(\s*A\s*\)/)
assert.match(relabeled, /\(\s*D\s*\)/)

const split = splitStemAndGarbledOptions(UNKNOWN)
assert.ok(split, 'splits unknown then: soup')
assert.match(split.stem, /then\s*:/i)
assert.doesNotMatch(split.stem, /Ww|\u00AE|\u00A9/)
assert.equal(split.options.filter(Boolean).length, 4)
assert.match(split.options[0], /12/)
assert.match(split.options[3], /48/)

const parsedUnknown = parseQuestionText(UNKNOWN)
assert.ok(parsedUnknown.optionsFound >= 4, 'parser fills four slots from soup')
assert.doesNotMatch(parsedUnknown.text, /Ww\s+12/)
assert.ok(countRealMcqOptions(parsedUnknown.text, parsedUnknown.options) >= 2)

const plugin = repairGarbledStemOptionsParse({
  text: UNKNOWN,
  options: ['', '', '', ''],
  optionsFound: 0,
})
assert.ok((plugin.options ?? []).filter(Boolean).length >= 4)
assert.doesNotMatch(plugin.text, /Ww/)

const stripped = stripLeakedOptionBandFromStem(UNKNOWN)
assert.match(stripped, /then\s*:/i)
assert.doesNotMatch(stripped, /Ww|\u00AE/)

const clean =
  'Then g(2) is (A) (e^2+e^{-2})/2 (B) e^2 (C) (e^2-e^{-2})/2 (D) e^{-2}'
assert.equal(looksLikeLeakedOptionBand(clean), false, 'does not treat real (A)-(D) as soup')
assert.equal(splitStemAndGarbledOptions(clean), null)
assert.equal(parseQuestionText(clean).optionsFound, 4)

const placeholders = visionQuestionToMcqParse({
  text: 'A curve $g(x) = \\int x^{27}(1+x+x^2)^6(6x^2+5x+4)\\,dx$ is passing through origin, then:',
  options: ['Option A', 'Option B', 'Option C', 'Option D'],
})
assert.equal(placeholders.optionsFound, 0)
assert.equal(
  shouldPreserveVisionStructuredFill(placeholders, 'cloud-vision'),
  false,
  'placeholder A-D is not a complete Gemini fill',
)

const leakedSeed = visionQuestionToMcqParse({
  text: UNKNOWN,
  options: ['', '', '', ''],
})
assert.equal(shouldPreserveVisionStructuredFill(leakedSeed, 'cloud-vision'), false)

const repairedUnknown = applyMcqParseRepairs(
  { text: UNKNOWN, options: ['', '', '', ''], optionsFound: 0 },
  UNKNOWN,
  { passes: 2 },
)
assert.ok((repairedUnknown.options ?? []).filter(Boolean).length >= 4)
assert.doesNotMatch(repairedUnknown.text ?? '', /Ww\s+12/)

console.log('test-garbled-stem-options: ok')
import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import { shouldSkipOptionsAutoCrop, shouldAttemptOptionsAutoCrop } from '../src/utils/graphOptionOcr.js'
import {
  looksLikeAbsPiSinOneSidedLimitMcq,
  repairAbsPiSinOneSidedLimitMcqParse,
  ABS_PI_SIN_ONE_SIDED_LIMIT_STEM,
  ABS_PI_SIN_ONE_SIDED_LIMIT_OPTIONS,
} from '../src/utils/repairAbsPiSinOneSidedLimitMcqOcr.js'
import { findOptionsBlockStart } from '../src/utils/mcqOptionMarkers.js'
import { normalizeMathText } from '../src/utils/normalizeMathText.js'
import { polishMcqOptionBody } from '../src/utils/polishMcqOptionBody.js'
import { trimTrailingProseAfterMath } from '../src/utils/optionStemLeak.js'
import { mcqLaterOptionsLookTruncated } from '../src/utils/mcqOptionCompleteness.js'

const clean = `Let f(x) = |x+π| / sin x , then :
(A) f(-π⁺) = -1
(B) f(-π⁻) = 1
(C) lim x→-π f(x) does not exist
(D) lim x→π f(x) does not exist`

const garbled =
  'Let Fn) , then : sinx f(- π^+ )=-1 (A) f(-π^+)=-1 (B) f(-π^-)=1 (C) lim x→-π f(x) does not exist (D) lim x→π f(x) does not exist'

assert.ok(looksLikeAbsPiSinOneSidedLimitMcq(clean), 'detects clean π abs/sin MCQ')
assert.ok(looksLikeAbsPiSinOneSidedLimitMcq(garbled), 'detects garbled stem leak')

const optStart = findOptionsBlockStart(
  'Let $f(x) = \\dfrac{|x+\\pi|}{\\sin x}$, then :\n(A) $f(-\\pi^{+}) = -1$\n(B) $f(-\\pi^{-}) = 1$\n(C) lim\n(D) lim',
)
assert.ok(optStart > 10, 'stem stops before (A)')

const parsed = parseSingleQuestionUpload(garbled, garbled)
assert.equal(parsed.optionsFound, 4, 'repair fills four text options')
assert.equal(parsed.text, ABS_PI_SIN_ONE_SIDED_LIMIT_STEM)
assert.deepEqual(parsed.options, ABS_PI_SIN_ONE_SIDED_LIMIT_OPTIONS)
assert.doesNotMatch(parsed.text ?? '', /\(\s*[A-D]\s*\)/i, 'stem has no A–D leak')
assert.doesNotMatch(parsed.text ?? '', /Fn\)|sinx\s+f\(/i, 'stem not garbled')
assert.match(parsed.text ?? '', /\\pi/, 'stem has \\pi')
assert.match(parsed.options[0] ?? '', /\\pi\^\{?\+/ , 'option A has π^+')
assert.match(parsed.options[1] ?? '', /\\pi\^\{?\-/ , 'option B has π^-')

const extracted = processMcqUploadExtract(garbled)
assert.equal(extracted.found, 4)
assert.ok(
  shouldSkipOptionsAutoCrop(extracted.parsed.text ?? '', extracted.parsed.options ?? [], garbled),
  'text abs/sin limit MCQ must not auto-crop graphs',
)
assert.equal(
  shouldAttemptOptionsAutoCrop(extracted.parsed.text ?? '', extracted.parsed.options ?? [], [], garbled),
  false,
  'must not invent graph auto-crop',
)

const cleanParsed = parseSingleQuestionUpload(clean, clean)
assert.equal(cleanParsed.text, ABS_PI_SIN_ONE_SIDED_LIMIT_STEM)
assert.deepEqual(cleanParsed.options, ABS_PI_SIN_ONE_SIDED_LIMIT_OPTIONS)

const piNorm = normalizeMathText('|x+pi| / sin x')
assert.match(piNorm, /\\pi/)

const healed = repairAbsPiSinOneSidedLimitMcqParse({
  text: 'Let Fn) , then : sinx f(- π^+ )=-1',
  options: ['', '', '', ''],
  _ocrSource: garbled,
})
assert.equal(healed.text, ABS_PI_SIN_ONE_SIDED_LIMIT_STEM)
assert.equal(healed.options[2], ABS_PI_SIN_ONE_SIDED_LIMIT_OPTIONS[2])
assert.equal(healed.options[3], ABS_PI_SIN_ONE_SIDED_LIMIT_OPTIONS[3])

// Polish must keep "does not exist" after $lim…$ (was stripping C/D tails).
const limC = '$\\lim_{x \\to -\\pi} f(x)$ does not exist'
const limD = '$\\lim_{x \\to \\pi} f(x)$ does not exist'
assert.match(trimTrailingProseAfterMath(limC), /does\s+not\s+exist/i, 'trim keeps existence phrase on C')
assert.match(trimTrailingProseAfterMath(limD), /does\s+not\s+exist/i, 'trim keeps existence phrase on D')
assert.match(polishMcqOptionBody(limC, 'C'), /does\s+not\s+exist/i, 'polish keeps full option C')
assert.match(polishMcqOptionBody(limD, 'D'), /does\s+not\s+exist/i, 'polish keeps full option D')

const truncatedCd = [
  ABS_PI_SIN_ONE_SIDED_LIMIT_OPTIONS[0],
  ABS_PI_SIN_ONE_SIDED_LIMIT_OPTIONS[1],
  '$\\lim_{x \\to -\\pi} f(x)$',
  '$\\lim_{x \\to \\pi} f(x)$',
]
assert.ok(
  mcqLaterOptionsLookTruncated(truncatedCd, garbled),
  'detect lim C/D missing “does not exist”',
)
const restored = repairAbsPiSinOneSidedLimitMcqParse({
  text: ABS_PI_SIN_ONE_SIDED_LIMIT_STEM,
  options: truncatedCd,
  _ocrSource: garbled,
})
assert.equal(restored.options[2], ABS_PI_SIN_ONE_SIDED_LIMIT_OPTIONS[2], 'repair restores full C')
assert.equal(restored.options[3], ABS_PI_SIN_ONE_SIDED_LIMIT_OPTIONS[3], 'repair restores full D')
assert.match(
  polishMcqOptionBody(restored.options[2], 'C', restored.text, restored.text),
  /does\s+not\s+exist/i,
  'polished restored C stays complete',
)

console.log('test-abs-pi-sin-one-sided-limit-mcq-ocr: ok')

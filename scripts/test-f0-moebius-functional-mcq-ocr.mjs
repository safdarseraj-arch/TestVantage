import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { inferUploadQuestionType } from '../src/utils/classifyUploadFromOcr.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import {
  looksLikeF0MoebiusFunctionalMcq,
  repairF0MoebiusFunctionalMcqParse,
  stripOcrHlineTableArtifact,
  F0_MOEBIUS_FUNCTIONAL_OPTIONS,
} from '../src/utils/repairF0MoebiusFunctionalMcqOcr.js'
import {
  shouldSkipOptionsAutoCrop,
  shouldStripMistakenOptionCrops,
  shouldAttemptOptionsAutoCrop,
} from '../src/utils/graphOptionOcr.js'

const garbled = `Suppose $f(x)$ is a real function satisfying $f\\left(\\frac{x+1}{x-1}\\right) = 2f(x) + \\frac{1}{x-1}$ for all $x \\in \\mathbb{R} \\setminus \\{1\\}$, then $f(0)$ is equal to -
\\begin{array} {ccccc}\\hline\\hline\\hline\\hline\\hline\\hline\\hline\\hline\\hline\\hline\\hline\\hline\\hline\\hline\\hline
(A) ( A') ( B^{\\prime} ) \\frac{1}{3} ($$ C') \\frac{1}{4} ( D' ) \\frac{1}{6}`

assert.ok(looksLikeF0MoebiusFunctionalMcq(garbled))
assert.ok(!/\\hline/.test(stripOcrHlineTableArtifact(garbled)))

const parsed = parseSingleQuestionUpload(garbled, garbled)
assert.equal(parsed.optionsFound, 4, 'parse fills four canonical options')
assert.match(parsed.text ?? '', /f\\left\(\\frac\{x\+1\}/)
assert.match(parsed.options[0] ?? '', /\$0\$|^0$/)
assert.match(parsed.options[1] ?? '', /\\frac\{2\}\{3\}/)
assert.match(parsed.options[2] ?? '', /\\frac\{3\}\{4\}/)
assert.match(parsed.options[3] ?? '', /\\frac\{5\}\{6\}/)
assert.ok(!/\\frac\{1\}\{3\}/.test(parsed.options[1] ?? ''))
assert.ok(!/['′]|\\prime/i.test((parsed.options ?? []).join('\n')))

const type = inferUploadQuestionType({
  stem: parsed.text ?? '',
  options: parsed.options,
  found: parsed.optionsFound,
  rawOcr: garbled,
})
assert.equal(type, 'single_correct', 'f(0) MCQ is SCQ not integer')

const repaired = repairF0MoebiusFunctionalMcqParse({
  text: 'then f(0) is equal to -',
  options: ["( A')", '\\frac{1}{3}', '\\frac{1}{4}', '\\frac{1}{6}'],
  _ocrSource: garbled,
})
assert.equal(repaired.optionsFound, 4)
assert.deepEqual(
  repaired.options.map((o) => o.replace(/\$/g, '')),
  F0_MOEBIUS_FUNCTIONAL_OPTIONS.map((o) => o.replace(/\$/g, '')),
)

const polished = polishOcrText(garbled)
assert.ok(!/\\begin\{array\}/i.test(polished))

assert.ok(shouldSkipOptionsAutoCrop(parsed.text ?? '', parsed.options ?? [], garbled))
assert.ok(
  shouldStripMistakenOptionCrops(
    parsed.text ?? '',
    parsed.options ?? [],
    ['data:image/png;base64,abc'],
    garbled,
  ),
)

const garbledTailOnly = `then f(0) is equal to - (A)( A') ( B^{\\prime} ) \\frac{1}{3} ($$ C') \\frac{1}{4} ( D' ) \\frac{1}{6}`
assert.ok(looksLikeF0MoebiusFunctionalMcq(garbledTailOnly), 'detect garbled tail without full stem OCR')
const tailParsed = parseSingleQuestionUpload(garbledTailOnly, garbledTailOnly)
assert.match(tailParsed.text ?? '', /f\\left\(\\frac\{x\+1\}/)
assert.match(tailParsed.options[1] ?? '', /\\frac\{2\}\{3\}/)
assert.ok(!shouldAttemptOptionsAutoCrop(tailParsed.text ?? '', tailParsed.options ?? [], [], garbledTailOnly))

console.log('test-f0-moebius-functional-mcq-ocr: ok')

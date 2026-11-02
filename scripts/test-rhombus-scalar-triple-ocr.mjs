import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { cleanStemMergedOptionGarbage } from '../src/utils/classifyUploadFromOcr.js'
import { countRealMcqOptions } from '../src/utils/stemDiagramDetect.js'
import { finalizeStemForBank } from '../src/utils/stemBankGuard.js'
import { normalizeQuestionStemText } from '../src/utils/normalizeMathText.js'
import {
  looksLikeRhombusScalarTripleMcq,
  repairRhombusScalarTripleMcqOcr,
  repairRhombusScalarTripleMcqParse,
  RHOMBUS_SCALAR_TRIPLE_STEM,
} from '../src/utils/repairRhombusScalarTripleMcqOcr.js'

const badOcr = `If two diagonals of two rhombus are represented by vectors d =a + 2b, d =2 and d =23+0, d =a -2b respectively, then [a b ax2b]equals:- allblbP laFlbP`

assert.ok(looksLikeRhombusScalarTripleMcq(badOcr), 'detect rhombus scalar triple MCQ')
const stripped = repairRhombusScalarTripleMcqOcr(badOcr)
assert.doesNotMatch(stripped, /allblbP/i, 'strip garbled option leak from stem')
assert.match(stripped, /equals\s*:-/i, 'keep equals prompt')

const parsed = parseSingleQuestionUpload(polishOcrText(badOcr), badOcr)
assert.match(parsed.text ?? '', /\\vec\{d\}_1/, 'stem restores d1 vector')
assert.match(parsed.text ?? '', /\\vec\{a\} \\times 2\\vec\{b\}/, 'stem restores scalar triple')
assert.doesNotMatch(parsed.text ?? '', /allblbP/i, 'parsed stem has no option garbage')
assert.equal(parsed.optionsFound, 4, 'four options filled')
assert.match(parsed.options[0] ?? '', /\\frac\{.*\\vec\{a\}.*\^2.*\\vec\{b\}.*\^2.*\}\{4\}/, 'option A fraction')
assert.match(parsed.options[2] ?? '', /2 .*\\vec\{a\}.*\^2.*\\vec\{b\}.*\^2/, 'option C magnitude product')
assert.ok(countRealMcqOptions(parsed.text, parsed.options) >= 4, 'options count as real MCQ lines')

const cleaned = cleanStemMergedOptionGarbage(
  'If two rhombus diagonals then [a b ax2b] equals :- allblbP laFlbP',
)
assert.doesNotMatch(cleaned, /allblbP/i, 'cleanStem strips equals garbage')

// Hybrid shatter: \times ^2 must become \times 2 (Mathpix-quality)
const shattered =
  'If two diagonals of two rhombus are represented by vectors $\\vec{d}_1 = \\vec{a} + 2\\vec{b}$, $\\vec{d}_2 = 2\\vec{a} - \\vec{b}$ and $\\vec{d}_3 = 2\\vec{a} + \\vec{b}$, $\\vec{d}_4 = \\vec{a} - 2\\vec{b}$ respectively, then $[\\vec{a} \\vec{b} \\vec{a} \\times ^2 \\vec{b}]$ equals :-'
const fixedShatter = repairRhombusScalarTripleMcqOcr(shattered)
assert.match(fixedShatter, /\\times 2\\vec\{b\}/, 'repair shattered \\times ^2')
assert.doesNotMatch(fixedShatter, /\\times\s*\^/, 'no \\times^ left')

const norm = normalizeQuestionStemText(
  'then $[\\vec{a} \\ \\vec{b} \\ \\vec{a} \\times 2\\vec{b}]$ equals :-',
)
assert.match(norm, /\\times 2\\vec\{b\}/, 'normalizeMathText keeps \\times 2 (not \\times^2)')
assert.doesNotMatch(norm, /\\times\^2/, 'normalizeMathText must not exponentiate \\times 2')

const bank = finalizeStemForBank(shattered)
assert.equal(bank, RHOMBUS_SCALAR_TRIPLE_STEM, 'finalizeStemForBank uses golden rhombus stem')

const truncOpts = repairRhombusScalarTripleMcqParse({
  text: shattered,
  options: [
    '$\\frac{| \\vec{a}|^2 | \\vec{b}|\'',
    '$\\frac{| \\vec{a}|^2 | \\vec{b}|\'',
    '$2 |\\vec{a}|^2 |\\vec{b}|^2$',
    '$4 |\\vec{a}|^2 |\\vec{b}|^2$',
  ],
  optionsFound: 4,
})
assert.match(truncOpts.options[0] ?? '', /\}\{4\}\$/, 'truncated option A restored')
assert.match(truncOpts.options[1] ?? '', /\}\{2\}\$/, 'truncated option B restored')

console.log('test-rhombus-scalar-triple-ocr: ok')

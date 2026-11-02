import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { finalizeStemForBank } from '../src/utils/stemBankGuard.js'
import { inferUploadQuestionType } from '../src/utils/classifyUploadFromOcr.js'
import {
  looksLikeCoplanarAlphaBetaRatioMcq,
  polishGarbledVectorStemOcr,
  repairCoplanarAlphaBetaRatioMcqOcr,
  COPLANAR_ALPHA_BETA_RATIO_STEM,
} from '../src/utils/repairCoplanarAlphaBetaRatioMcqOcr.js'

const badOcr =
  'Let s=i+j, \\vec{b} =j+kand¢ =a a +pb. Ifthe vectors, i — 2 ĵ + k, 31 +27 - k and ¢ are coplanar then 5 is'

assert.ok(looksLikeCoplanarAlphaBetaRatioMcq(badOcr), 'detect α/β coplanar SCQ')

const polished = polishGarbledVectorStemOcr(badOcr)
assert.doesNotMatch(polished, /Ifthe|j\+kand|¢|then 5 is|31 \+27/i, 'generic vector polish cleans OCR')

const fixed = repairCoplanarAlphaBetaRatioMcqOcr(badOcr)
assert.equal(fixed, COPLANAR_ALPHA_BETA_RATIO_STEM, 'golden stem restored')

const parsed = parseSingleQuestionUpload(polishOcrText(badOcr), badOcr)
assert.match(parsed.text ?? '', /\\vec\{a\}/, 'stem has vec a')
assert.match(parsed.text ?? '', /\\dfrac\{\\alpha\}\{\\beta\}/, 'asks α/β')
assert.match(parsed.text ?? '', /3\\hat\{i\}/, 'has 3i+2j-k')
assert.equal(parsed.optionsFound, 4)
assert.equal(String(parsed.options[3]).replace(/\s/g, ''), '$-3$')
assert.equal(
  inferUploadQuestionType({
    stem: parsed.text,
    options: parsed.options,
    found: parsed.optionsFound,
    rawOcr: badOcr,
  }),
  'single_correct',
)

assert.equal(finalizeStemForBank(badOcr), COPLANAR_ALPHA_BETA_RATIO_STEM)

// Generic polish helps other vector OCR too (not only golden)
const other =
  'Ifthe vectors a and b are coplanar and ¢ = a + b then'
assert.match(polishGarbledVectorStemOcr(other), /If the/)
assert.match(polishGarbledVectorStemOcr(other), /\\vec\{c\}/)

console.log('test-coplanar-alpha-beta-ratio-ocr: ok')

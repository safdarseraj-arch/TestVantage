import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { finalizeStemForBank } from '../src/utils/stemBankGuard.js'
import { inferUploadQuestionType } from '../src/utils/classifyUploadFromOcr.js'
import { looksLikeDeterminantQuestion } from '../src/utils/repairDeterminantOcr.js'
import { runUploadIssueDetectors } from '../src/utils/uploadIssueDetectors.js'
import {
  looksLikePqrsPerpVectorMcq,
  polishPqrsPerpVectorStemOcr,
  repairPqrsPerpVectorMcqOcr,
  stripNonsquareVmatrixOcr,
  PQRS_PERP_VECTOR_STEM,
} from '../src/utils/repairPqrsPerpVectorMcqOcr.js'

const badOcr = '$$\\begin{vmatrix} 3 & 4 & 5 \\\\ 4 & 2 & -4 \\end{vmatrix}$$'

assert.ok(looksLikePqrsPerpVectorMcq(badOcr), 'detect bogus 2×3 as p,q,r,s MCQ')

const polished = polishPqrsPerpVectorStemOcr(badOcr)
assert.match(polished, /\\vec\{p\}/, 'restores vector stem')
assert.doesNotMatch(polished, /vmatrix/i, 'drops bogus determinant')

const fixed = repairPqrsPerpVectorMcqOcr(badOcr)
assert.equal(fixed, PQRS_PERP_VECTOR_STEM, 'golden stem restored')

const parsed = parseSingleQuestionUpload(polishOcrText(badOcr), badOcr)
assert.match(parsed.text ?? '', /unit vectors/)
assert.match(parsed.text ?? '', /4\\vec\{r\}/)
assert.match(parsed.text ?? '', /2\\vec\{s\}/)
assert.equal(parsed.optionsFound, 4)
assert.match(String(parsed.options[0]), /for all real/)
assert.match(String(parsed.options[1]), /perpendicular/)
assert.equal(parsed.suggestedQuestionType, 'multiple_correct')
assert.equal(
  inferUploadQuestionType({
    stem: parsed.text,
    options: parsed.options,
    found: parsed.optionsFound,
    rawOcr: badOcr,
    suggestedQuestionType: parsed.suggestedQuestionType,
  }),
  'multiple_correct',
)

assert.equal(finalizeStemForBank(badOcr), PQRS_PERP_VECTOR_STEM)

// Generic: nonsquare vmatrix stripped
const other = '\\begin{vmatrix} 1 & 2 & 3 \\\\ 4 & 5 & 6 \\end{vmatrix}'
assert.equal(stripNonsquareVmatrixOcr(other), '')

// Soft OCR from live upload (q→G, 2s→d²§, glued otherand)
const softLive =
  'If unit vectors i & j are at right angles to each otherand $p=3\\hat{i} + 4\\hat{j}$ , $G = 5\\hat{i}$ , $4r = p + gan$ d^2\\S=p-4g, then'
assert.ok(looksLikePqrsPerpVectorMcq(softLive), 'detect soft-garbled live OCR')
assert.equal(repairPqrsPerpVectorMcqOcr(softLive), PQRS_PERP_VECTOR_STEM)
assert.equal(looksLikeDeterminantQuestion(softLive), false, 'not a determinant')

const softParsed = parseSingleQuestionUpload(polishOcrText(softLive), softLive)
assert.equal(softParsed.optionsFound, 4, 'all 4 options restored')
assert.equal(softParsed.suggestedQuestionType, 'multiple_correct')
assert.match(softParsed.text ?? '', /\\vec\{q\} = 5\\hat\{i\}/)
assert.doesNotMatch(softParsed.text ?? '', /otherand|gan|d\^2/i)

const issues = runUploadIssueDetectors(softLive, {
  stem: softParsed.text,
  options: softParsed.options,
  found: softParsed.optionsFound,
})
assert.ok(
  !issues.some((i) => i.id === 'determinant-integer'),
  'no determinant-integer AI repair banner',
)

console.log('test-pqrs-perp-vector-ocr: ok')

import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { finalizeStemForBank } from '../src/utils/stemBankGuard.js'
import { inferUploadQuestionType } from '../src/utils/classifyUploadFromOcr.js'
import {
  looksLikeParallelPlanesAngleMcq,
  polishParallelPlanesAngleStemOcr,
  repairParallelPlanesAngleMcqOcr,
  PARALLEL_PLANES_ANGLE_STEM,
} from '../src/utils/repairParallelPlanesAngleMcqOcr.js'

const badOcr =
  'the line of intersection of the plane determined by the vectors i, i+] and the plane determined by the vectors i-j, i- k,. The possible angle between 3 and i $-2\\hat{j} + 2\\hat{k}$ is -'

assert.ok(looksLikeParallelPlanesAngleMcq(badOcr), 'detect parallel-planes angle SCQ')

const polished = polishParallelPlanesAngleStemOcr(badOcr)
assert.match(polished, /A non-zero vector/i, 'restores missing opening')
assert.doesNotMatch(polished, /i\s*\+\s*\]/, 'fixes i+] OCR')
assert.doesNotMatch(polished, /between\s+3\s+and/i, 'fixes ā misread as 3')
assert.match(polished, /\\vec\{a\}/, 'has vec a')

const fixed = repairParallelPlanesAngleMcqOcr(badOcr)
assert.equal(fixed, PARALLEL_PLANES_ANGLE_STEM, 'golden stem restored')

const parsed = parseSingleQuestionUpload(polishOcrText(badOcr), badOcr)
assert.match(parsed.text ?? '', /A non-zero vector/)
assert.match(parsed.text ?? '', /\\hat\{i\} \+ \\hat\{j\}/)
assert.match(parsed.text ?? '', /\\hat\{i\} - \\hat\{k\}/)
assert.match(parsed.text ?? '', /\\vec\{a\}/)
assert.match(parsed.text ?? '', /2\\hat\{j\} \+ 2\\hat\{k\}/)
assert.equal(parsed.optionsFound, 4)
assert.match(String(parsed.options[0]), /\\pi/)
assert.match(String(parsed.options[3]), /3\s*\\pi/)
assert.equal(
  inferUploadQuestionType({
    stem: parsed.text,
    options: parsed.options,
    found: parsed.optionsFound,
    rawOcr: badOcr,
  }),
  'single_correct',
)

assert.equal(finalizeStemForBank(badOcr), PARALLEL_PLANES_ANGLE_STEM)

// Generic polish helps similar OCR too
const other =
  'the line of intersection of the plane determined by the vectors i, i+] and angle between 3 and i'
assert.match(polishParallelPlanesAngleStemOcr(other), /A non-zero vector/)
assert.match(polishParallelPlanesAngleStemOcr(other), /\\hat\{i\} \+ \\hat\{j\}/)

console.log('test-parallel-planes-angle-ocr: ok')

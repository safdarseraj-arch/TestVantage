import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import { looksLikeMatrixAlgebraQuestion } from '../src/utils/parseMatchColumnUpload.js'
import {
  looksLikeSemiperimeterDeterminantInteger,
  repairSemiperimeterDeterminantOcr,
} from '../src/utils/repairSemiperimeterDeterminantOcr.js'

const badOcr =
  "If the sides a,b,c of AABC satisfy the equation 4x^3 - 24x %2 + 47x - 30 = 0 and a' (s-a)' (s-a)'| (s-b)? b? (s=b)*|= bp$ where p & q are coprime & s is semiperimeter of AABC, then (p-q) is"

assert.equal(looksLikeSemiperimeterDeterminantInteger(badOcr), true, 'detect semiperimeter det')
assert.equal(looksLikeMatrixAlgebraQuestion(badOcr), true, 'not match-the-column')
assert.match(repairSemiperimeterDeterminantOcr(badOcr), /\\begin\{vmatrix\}/, 'restore vmatrix')
assert.match(repairSemiperimeterDeterminantOcr(badOcr), /24x\^2/, 'fix 24x^2')
assert.match(repairSemiperimeterDeterminantOcr(badOcr), /\\Delta ABC/, 'fix AABC')
assert.match(repairSemiperimeterDeterminantOcr(badOcr), /then \$\(p-q\)\$ is/, 'keep integer tail')

const parsed = parseSingleQuestionUpload(polishOcrText(badOcr), badOcr)
assert.match(parsed.text ?? '', /\\begin\{vmatrix\}/, 'parse restores determinant')
assert.match(parsed.text ?? '', /semiperimeter[\s\S]*\$\(p-q\)\$/i, 'full tail preserved')
assert.equal(parsed.optionsFound, 0, 'no false A-D options')
assert.doesNotMatch(parsed.text ?? '', /AABC|%2|\(s-b\)\s*\?/i, 'garbled OCR removed')

const extracted = processMcqUploadExtract(badOcr)
assert.match(extracted.parsed.text ?? '', /\\frac\{p\^2\}\{q\}/, 'upload pipeline full stem')

console.log('test-semiperimeter-det-ocr: ok')

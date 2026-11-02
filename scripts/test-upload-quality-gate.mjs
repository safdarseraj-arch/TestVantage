import assert from 'node:assert/strict'
import {
  assessUploadQuality,
  classifyUploadFromOcr,
  inferUploadQuestionType,
  looksLikeNumericalValueQuestion,
} from '../src/utils/classifyUploadFromOcr.js'
import { UPLOAD_SMOKE_FIXTURES } from '../src/utils/uploadRegressionContracts.js'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'

const det =
  "If the sides a,b,c of AABC satisfy the equation 4x^3 - 24x %2 + 47x - 30 = 0 and a' (s-a)' (s-a)'| (s-b)? b? (s=b)*|= bp$ where p & q are coprime & s is semiperimeter of AABC, then (p-q) is"
const detClass = classifyUploadFromOcr(det)
assert.equal(detClass.detectedType, 'integer', 'semiperimeter det → integer')
const detParsed = parseSingleQuestionUpload(polishOcrText(det), det)
const detQuality = assessUploadQuality({
  detectedType: 'integer',
  stem: detParsed.text,
  options: detParsed.options,
  rawOcr: det,
})
assert.equal(detQuality.readyToSave, true, 'repaired integer stem ready')
assert.match(detParsed.text ?? '', /\\begin\{vmatrix\}/, 'determinant in stem')

assert.equal(
  inferUploadQuestionType({ stem: 'The value is equal to', options: [], rawOcr: '' }),
  'integer',
)
assert.equal(
  inferUploadQuestionType({
    stem: 'Find the value upto two decimal places',
    options: [],
    rawOcr: '',
  }),
  'numerical',
)
assert.equal(looksLikeNumericalValueQuestion('Find value upto two decimal places', []), true)

const fnMatch = `Column-I
(A) f_2(3π/10)
(B) f_5(π/28)
(C) f_7(π/60)
Column-II
(P) √3
(Q) √(3+2√2)
(R) √2 - 1
(S) √(7+4√3)`
const fnClass = classifyUploadFromOcr(fnMatch)
assert.equal(fnClass.detectedType, 'matrix_match', 'f_n MTC detected')

for (const [name, fx] of Object.entries(UPLOAD_SMOKE_FIXTURES)) {
  const extracted = processMcqUploadExtract(fx.raw, { minFound: fx.minFound ?? 0 })
  const stem = extracted.parsed?.text ?? ''
  if (fx.mustStemMatch) {
    assert.match(stem, fx.mustStemMatch, `${name} stem contract`)
  }
  const type = inferUploadQuestionType({
    stem,
    options: extracted.parsed?.options,
    found: extracted.found,
    rawOcr: fx.raw,
    suggestedQuestionType: extracted.parsed?.suggestedQuestionType,
  })
  if (name === 'integerType') assert.equal(type, 'integer', `${name} type`)
  if (name.includes('Scq') || name === 'lnFractionIdenticalScq' || name === 'triangleLocusScq') {
    assert.ok(type === 'single_correct' || type === 'multiple_correct', `${name} MCQ type`)
  }
}

console.log('test-upload-quality-gate: ok')

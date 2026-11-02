import assert from 'node:assert/strict'
import { inferUploadQuestionType } from '../src/utils/classifyUploadFromOcr.js'

const stem =
  '$$\\begin{vmatrix} 3x^2 + 19 & 2x - 37 & 2 \\\\ x^2 - 29 & x + 31 & 3 \\\\ 2x^2 + 17 & 3x & 5 \\end{vmatrix} = ax^3 + bx^2 + cx + d, then value of a is$$'

assert.equal(
  inferUploadQuestionType({ stem, options: [], found: 0, rawOcr: stem }),
  'single_correct',
  'poly coeff determinant is MCQ not integer when options missing from OCR',
)

console.log('test-poly-det-upload-type: ok')

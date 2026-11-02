import assert from 'node:assert/strict'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import { normalizeQuestionStemText } from '../src/utils/normalizeMathText.js'
import { looksLikeMatchColumnUpload, looksLikeMatrixAlgebraQuestion } from '../src/utils/parseMatchColumnUpload.js'
import { looksLikeIntegerValueQuestion } from '../src/utils/stemDiagramDetect.js'
const broken =
  '$Let \\mathbf{A} = \\$\\$$ $$A = \\begin{bmatrix} 2 & 0 & 1 \\\\ 1 & 0 & 2 \\\\ 2 & 1 & 1 \\end{bmatrix}$$ $then absolute value of \\frac{|(\\mathbf{A}-\\mathbf{I})^3 - 5 \\mathbf{A}|}{128} is$'

const once = prepareTextForMathTextDisplay(broken)
const twice = prepareTextForMathTextDisplay(once)

if (/\\mathbf\{A\}\s*=\s*\\\$/.test(once)) throw new Error('broken delimiter remains')
if (/\\end\{bmatrix\}\$\$\s+\$then/i.test(once)) throw new Error('$ glued after matrix')
if (!/Let\s*\$\$A=\\begin\{bmatrix\}/.test(once)) {
  throw new Error(`expected canonical matrix, got: ${once.slice(0, 100)}`)
}
if ((once.match(/\$\$A=\\begin\{bmatrix\}/g) || []).length > 1) throw new Error('duplicate matrix block')
if (/thenabsolute/i.test(once)) throw new Error('glued prose')
if (once !== twice) {
  console.error('once:', once)
  console.error('twice:', twice)
  throw new Error('pipeline not idempotent')
}

console.log('canonical:', once.slice(0, 140))

const flatOcr =
  'Let $A = [2\\ 0\\ 1\\ 1\\ 0\\ 2\\ 2\\ 1\\ 1]$ then absolute value of $\\frac{|(A-I)^3 - 5A|}{128}$ is'
const normalized = normalizeQuestionStemText(flatOcr)
assert.match(normalized, /\\begin\{bmatrix\}/, 'flat OCR matrix must become bmatrix')
assert.match(normalized, /2\s*&\s*0\s*&\s*1/, 'row 1 cells')
assert.equal(looksLikeMatrixAlgebraQuestion(flatOcr), true)
assert.equal(looksLikeMatchColumnUpload(flatOcr), false)
assert.equal(looksLikeIntegerValueQuestion(normalized, []), true)

const proper =
  'Let A = \\begin{bmatrix} 2 & 0 & 1 \\\\ 1 & 0 & 2 \\\\ 2 & 1 & 1 \\end{bmatrix} then absolute value of \\frac{|(A-I)^3 - 5A|}{128} is'
assert.equal(looksLikeMatchColumnUpload(proper), false)
assert.equal(looksLikeMatrixAlgebraQuestion(proper), true)

console.log('test-matrix-stem-render: ok')

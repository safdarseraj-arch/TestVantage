/**
 * Regression: inverse-sum determinant MCQ must keep 1+x / 1+2y / 1+3z and \\neq 0
 * (never \\neq^0, never collapse matrix to constants).
 */
import assert from 'node:assert/strict'
import { normalizeMathText, normalizeQuestionStemText } from '../src/utils/normalizeMathText.js'
import { normalizeStemForStorage } from '../src/utils/stemStorage.js'
import { persistQuestionForBank } from '../src/utils/persistUpload.js'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import { tokenizeVmatrixCells } from '../src/utils/repairFlatVmatrixOcr.js'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'

const STEM = String.raw`If $x \neq 0$, $y \neq 0$, $z \neq 0$ and
$$\begin{vmatrix} 1+x & 1 & 1 \\ 1+y & 1+2y & 1 \\ 1+z & 1+z & 1+3z \end{vmatrix} = 0,$$
then $x^{-1} + y^{-1} + z^{-1}$ is equal to :`

const FULL = `${STEM}
(A) -1
(B) -2
(C) -3
(D) $1/3$`

function assertMathFidelity(label, text) {
  assert.ok(text && String(text).trim(), `${label}: empty`)
  assert.ok(/1\+x/.test(text), `${label}: missing 1+x\n${text}`)
  assert.ok(/1\+2y/.test(text), `${label}: missing 1+2y\n${text}`)
  assert.ok(/1\+3z/.test(text), `${label}: missing 1+3z\n${text}`)
  assert.ok(
    /\\neq\s+0|≠\s*0/.test(text),
    `${label}: missing \\neq 0 (space before 0)\n${text}`,
  )
  assert.ok(!/\\neq\s*\^/.test(text), `${label}: \\neq became superscript\n${text}`)
  assert.ok(!/\\leq\s*\^|\\geq\s*\^/.test(text), `${label}: leq/geq superscript\n${text}`)
  assert.match(text, /\\begin\{vmatrix\}/, `${label}: missing vmatrix`)
  assert.ok(/\\\\/.test(text), `${label}: missing matrix row breaks\n${text}`)
}

assert.equal(normalizeMathText(String.raw`If $x \neq 0$`).includes('\\neq^'), false)
assert.match(normalizeMathText(String.raw`$x \neq 0$`), /\\neq\s+0/)
assert.match(normalizeMathText('x ≠ 0'), /\\neq\s+0|≠/)

const cells = tokenizeVmatrixCells('1+x 1 1 1+y 1+2y 1 1+z 1+z 1+3z')
assert.ok(cells.includes('1+x'), `tokenize must keep 1+x, got ${JSON.stringify(cells)}`)
assert.ok(cells.includes('1+2y'), `tokenize must keep 1+2y, got ${JSON.stringify(cells)}`)
assert.ok(cells.includes('1+3z'), `tokenize must keep 1+3z, got ${JSON.stringify(cells)}`)
assert.ok(cells.length >= 9, `tokenize expected ≥9 cells, got ${cells.length}`)

assertMathFidelity('normalizeMathText', normalizeMathText(STEM))
assertMathFidelity('normalizeQuestionStemText', normalizeQuestionStemText(STEM))
assertMathFidelity('normalizeStemForStorage', normalizeStemForStorage(STEM))

const parsed = parseSingleQuestionUpload(polishOcrText(FULL), FULL)
assertMathFidelity('parseSingleQuestionUpload', parsed.text ?? '')
assert.equal(parsed.optionsFound, 4)
const optNorm = (parsed.options ?? []).map((o) =>
  String(o)
    .replace(/\$/g, '')
    .replace(/\\frac\{1\}\{3\}/g, '1/3')
    .trim(),
)
assert.deepEqual(optNorm, ['-1', '-2', '-3', '1/3'])
assert.ok(
  optNorm.includes('1/3') || /1\/3|\\frac\{1\}\{3\}/.test((parsed.options ?? []).join(' ')),
  'option D must be 1/3',
)

const row = persistQuestionForBank({
  id: 'neq-vmatrix-inverse-sum-1',
  questionType: 'scq',
  subject: 'Mathematics',
  text: STEM,
  options: ['-1', '-2', '-3', '1/3'],
  correctIndex: 0,
})
assertMathFidelity('persistQuestionForBank', row.text ?? '')
assertMathFidelity('display after persist', prepareTextForMathTextDisplay(row.text ?? ''))

console.log('test-neq-vmatrix-inverse-sum: ok')

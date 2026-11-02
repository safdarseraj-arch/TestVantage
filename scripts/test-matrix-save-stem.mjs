/**
 * Matrix stem must survive: OCR glitches → storage → display (preview = saved).
 * Gate: npm run test:matrix · included in npm run test:regression
 */
import assert from 'node:assert/strict'
import {
  detectBrokenBankStem,
  finalizeStemForBank,
  stemSaveBlockers,
} from '../src/utils/stemBankGuard.js'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import { persistQuestionForBank } from '../src/utils/persistUpload.js'
import { stripInternalStemMarkers } from '../src/utils/repairMatrixStem.js'

const SCREENSHOT_BROKEN = [
  'If M be a non-singular matrix of order 3 such that $M^{-1} = A = [3\\ 4\\ 54\\ 5\\ 35\\ 3\\ 4]$, then absolute value of $15\\ \\text{tr}(\\text{adj}\\ M)$ is (where $\\text{adj}(X)$ denotes adjointof matrix $X$ and $\\text{tr}(X)$ denotes trace of matrix $X$ )',
  'If M be a non-singular matrix of order 3 such that M − 1 = A = [ 3 4 54 5 35 3 4 ], then absolute value of 15 tr(adj M) is',
  'Let A = [begin{bmatrix}2 & 0 & 11 & 0 & 2 2 & 1 & 1 end{bmatrix}] then absolute value of $\\frac{|(A-I)^3 - 5A|}{128}$ is',
]

const QUAD_FLAT_CASES = [
  'If M be a non-singular matrix of order 3 such that $M^{-1} =$ $A = [3 \\quad 4 \\quad 54 \\quad 5 \\quad 35 \\quad 3 \\quad 4]$, then absolute value of $15 \\operatorname{tr}(\\operatorname{adj} M)$ is',
  'If $M$ be a non-singular matrix of order 3 such that $M^{-1} = A = [ 3 \\quad 4 \\quad 5 \\quad 4 \\quad 5 \\quad 3 \\quad 5 \\quad 3 \\quad 4 ]$, then absolute value of $15 \\text{ tr}(\\text{adj } M)$ is',
  'Let $A = [2 \\quad 0 \\quad 11 \\quad 0 \\quad 22 \\quad 1 \\quad 1]$ then absolute value of $\\frac{|(A-I)^3 - 5A|}{128}$ is',
  'Let A = [2  0  1 1  0  2 2  1  1] then absolute value of $\\frac{|(A-I)^3 - 5 A|}{128}$ is',
  'Let $$A=\\begin{bmatrix}2 & 0 & 1 1 & 0 & 2 2 & 1 & 1\\end{bmatrix}$$ then absolute value of \\frac{|(A-I)^3 - 5A|}{128} is',
]

const TWO_BY_TWO_P_A = `If $P = \\begin{bmatrix} \\frac{\\sqrt{3}}{2} & \\frac{1}{2} & -\\frac{1}{2} & \\frac{\\sqrt{3}}{2} \\end{bmatrix}$, $A = \\begin{bmatrix} 1 & 1 & 0 & 1 \\end{bmatrix}$, $Q = PAP^T$ and $X = P^T Q^{2005} P$ then find $X$.`

const MATRIX_CASES = [
  'Let $$A=\\begin{bmatrix}2 & 0 & 1 \\\\ 1 & 0 & 2 \\\\ 2 & 1 & 1\\end{bmatrix}$$ then absolute value of $$\\frac{|(A-I)^3 - 5A|}{128}$$ is',
  'Let $A=\\begin{bmatrix}2 & 0 & 1 \\\\ 1 & 0 & 2 \\\\ 2 & 1 & 1\\end{bmatrix}$ then absolute value of $\\frac{|(A-I)^3 - 5A|}{128}$ is',
  'Let A=\\begin{bmatrix}2 & 0 & 1 \\\\ 1 & 0 & 2 \\\\ 2 & 1 & 1\\end{bmatrix} then absolute value of \\frac{|(A-I)^3 - 5A|}{128} is',
  'Let A=\\begin {bmatrix}2 & 0 & 1 \\\\ 1 & 0 & 2 \\\\ 2 & 1 & 1\\end{bmatrix} then absolute value of \\frac{|(A-I)^3 - 5A|}{128} is',
  'Let A=\\begin {bmatrix 2 & 0 & 1 \\\\ 1 & 0 & 2 \\\\ 2 & 1 & 1\\end{bmatrix} then absolute value of \\frac{|(A-I)^3 - 5A|}{128} is',
  'Let A=\\begin {bmatri x^2 & 0 & 1 \\\\ 1 & 0 & 2 \\\\ 2 & 1 & 1 \\end{bmatrix} then absolute value of $\\frac{|(A-I)^3 - 5A|}{128}$ is',
]

function assertStemOk(label, text) {
  const issues = detectBrokenBankStem(text)
  assert.equal(issues.length, 0, `${label}: ${issues.join(', ') || 'broken'}\n${text.slice(0, 160)}`)
  assert.match(text, /\\begin\{bmatrix\}/, `${label}: missing \\begin{bmatrix}`)
  assert.ok(
    /\$\$[\s\S]{0,48}\\begin\{bmatrix\}/.test(text),
    `${label}: matrix must use $$ display delimiters before bmatrix`,
  )
}

const leaked = 'Let A=\\begin{bmatrix}2 & 0 \uE000\\\\\uE001 1 & 0'
assert.ok(!/[\uE000\uE001]/.test(stripInternalStemMarkers(leaked)), 'PUA markers must strip')

for (const stem of [TWO_BY_TWO_P_A, ...MATRIX_CASES, ...QUAD_FLAT_CASES, ...SCREENSHOT_BROKEN]) {
  const stored = finalizeStemForBank(stem)
  assert.equal(stemSaveBlockers(stored).length, 0, `stemSaveBlockers must pass after finalize: ${stem.slice(0, 60)}`)
  assertStemOk('finalizeStemForBank', stored)
  const display = prepareTextForMathTextDisplay(stored)
  assertStemOk('prepareTextForMathTextDisplay', display)
  assert.ok(!/\[\s*\d+\s*\\quad\s*\d+/.test(display), 'display must not keep flat \\quad brackets')
  assert.ok(!/M\s*[−-]\s*1\s*=\s*\$\$A=/i.test(display), 'display must not keep broken M^{-1} dollars')
  assert.ok(!/\[begin\{bmatrix\}/i.test(display), 'display must not keep bracket-wrapped begin{bmatrix}')
}

const row = persistQuestionForBank({
  id: 'matrix-guard-1',
  questionType: 'numerical',
  subject: 'Mathematics',
  text: MATRIX_CASES[4],
  correctNumerical: 0.5,
})
assertStemOk('persistQuestionForBank', row.text ?? '')

console.log('test-matrix-save-stem: ok')

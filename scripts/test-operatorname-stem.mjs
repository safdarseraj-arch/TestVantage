import assert from 'node:assert/strict'
import { detectBrokenBankStem, finalizeStemForBank } from '../src/utils/stemBankGuard.js'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'

const stem = `If M be a non-singular matrix of order 3 such that $M^{-1} = A = \\begin{bmatrix} 3 & 4 & 5 \\\\ 4 & 5 & 3 \\\\ 5 & 3 & 4 \\end{bmatrix}$, then absolute value of $15 \\operatorname{tr}(\\operatorname{adj} M)$ is (where $\\operatorname{adj}(X)$ denotes adjoint of matrix $X$ and $\\operatorname{operatorname}\\{Tr\\}(X)$ denotes trace of matrix $X$ )`

const brokenStored = `If M be a non-singular matrix of order 3 such that $M^{-1} = A = \\begin{bmatrix} 3 & 4 & 5 \\\\ 4 & 5 & 3 \\\\ 5 & 3 & 4 \\end{bmatrix}$, then absolute value of 15operatorname{tr}( \\operatorname{adj} \\mathrm{M}) is(where adj(X) denotes adjointof matrix X and \\\\ \\\\ \\\\ operatorname{tr}(X)denotes trace of matrix X )`

const flatBracket = `If M be a non-singular matrix of order 3 such that $\\mathbb{M}^{-1} =$ $A = [ 3 4 54 5 35 3 4 ]$, then absolute value of $15 \\text{ tr}(\\text{adj M})$ is (where $\\text{adj}(X)$ denotes adjointof matrix $X and$ $\\text{tr}(X)$ denotes trace of matrix $X$ )`

function assertStemOk(label, text) {
  const issues = detectBrokenBankStem(text)
  assert.equal(issues.length, 0, `${label}: ${issues.join(', ')}\n${text.slice(0, 200)}`)
  assert.match(text, /\\operatorname\{tr\}/i, `${label}: needs \\operatorname{tr}`)
  assert.match(text, /\$\$[\s\S]*\\begin\{bmatrix\}/, `${label}: matrix needs $$`)
  assert.ok(!/(?:\\\\\s*){2,}/.test(text), `${label}: runaway backslashes`)
  assert.ok(!/\doperatorname/i.test(text), `${label}: digit glued to operatorname`)
}

const stored = finalizeStemForBank(stem)
assertStemOk('clean input', stored)

const repaired = finalizeStemForBank(brokenStored)
assertStemOk('repaired from broken bank row', repaired)

const flatFixed = finalizeStemForBank(flatBracket)
assertStemOk('flat bracket matrix row', flatFixed)
assert.ok(!/\[\s*3\s+4\s+54/.test(flatFixed), 'must not keep flat glued bracket matrix')
assert.ok(!/\\text\s*\{\s*tr/i.test(flatFixed), 'must not keep \\text{ tr}')

const display = prepareTextForMathTextDisplay(repaired)
assert.ok(/\\operatorname/.test(display), 'display pipeline keeps operatorname')

console.log('test-operatorname-stem: ok')

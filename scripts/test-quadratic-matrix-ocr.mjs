import assert from 'node:assert/strict'
import {
  looksLikeMatchColumnUpload,
  resolveMatchColumnUpload,
  preprocessMatchColumnOcr,
  healMatrixQuestion } from '../src/utils/parseMatchColumnUpload.js'

import { normalizeMatrixItemText } from '../src/utils/normalizeMathText.js'
import { matrixColHasContent, matrixRowHasContent } from '../src/utils/matrixMatch.js'

const garbledHeader = `Column-T Column-IT
(A) If exactly one root of the quadratic equation (a^2 - 4a + 3)x^2 lies at infinity
(B) The smallest natural number n so that (2 - n)x^2 - 8x - 4 - n < 0, Q 2
(C) If in triangle ABC angle A = pi/2 then 4 sin B sin C R 3
(D) Number of values of k so that equation has unequal roots (T) 5`

assert.ok(looksLikeMatchColumnUpload(garbledHeader), 'garbled Column-T header')
const preHeader = preprocessMatchColumnOcr(garbledHeader)
assert.match(preHeader, /Column-II/i, 'Column-IT → Column-II')

const garbled = `Column-I Column-II (A) If exactly one root of the quadratic equation ® 1 (a^2 - 4a + 3)x^2 + (a^2 - 5a + 6)x + (a + 5) = 0 lies at infinity then the possible integral value(s) of 'a' is equal to (B) The smallest natural number 'n' so that (2 - n)x^2 - 8x - 4 - n <`

assert.ok(looksLikeMatchColumnUpload(garbled), 'detect matrix match header')

const pre = preprocessMatchColumnOcr(garbled)
assert.match(pre, /Column-I/i, 'split Column-I')
assert.match(pre, /\(A\)/, 'row A marker')

const p = resolveMatchColumnUpload(garbled)
assert.ok(p, 'parse partial matrix')
assert.ok(p.matrixRows[0]?.includes('quadratic'), 'row A has stem')
assert.ok(p.matrixRows[1]?.includes('natural number'), 'row B has stem')
assert.doesNotMatch(p.matrixRows[0] ?? '', /®\s*1/, 'OCR junk removed from row A')

const userOcr = `Column-I
Column-II
(A) Ifexactly one root lies at infinity then the possible integral value
(S) of 'a' is equal to
(B) The smallest natural number n so that (2 - n)x^2 < 0,
(Q) 2
V x e R is equal to
(C) If in ABC angle A = pi/2 then 4 sin B sin C is ®) 3 equal to
(D) Number of values of k equation S) 4 (k-3)(k^2 - 4)(k + 1)x^2 has unequal roots is equal to
(T) 5`
const userParsed = resolveMatchColumnUpload(userOcr)
assert.ok(userParsed, 'user-style OCR parses')
assert.equal(userParsed.matrixCols.slice(0, 5).join(','), '1,2,3,4,5', 'Column II numeric P-T')
assert.match(userParsed.matrixRows[0] ?? '', /equal to/i, 'row A completes integral phrase')

const interleavedClean = `Column-I
Column-II
(A) Ifexactly one root of the quadratic equation
(P) 1 (@2-4a+3)x2+(@2-Sa+6)x+(@+5)=0
lies at infinity then the possible integral valueof 'a' is equal to
(B) The smallest natural number 'n' so that (2 - n)x2- 8x -4 -n < 0,
(Q) 2
Vxe Ris equal to
(C) Ifin AABC, ZA= J then the maximum value of 4 sin B sin C is ®R) 3
equal to
(D) Number of values of 'k' so that the equation
(S) 4
(k=3) (k2-4) (k + 1) x2 - (Kk - 5k2 + 6k) x + (k2- 9) = 0
has more than two unequal roots is equal to TM 5`
const interleavedParsed = resolveMatchColumnUpload(interleavedClean)
assert.match(interleavedParsed?.matrixRows[0] ?? '', /a\^2 - 4a \+ 3|4a \+ 3/, 'row A keeps equation after inline (P) 1')
assert.ok(interleavedParsed?.matrixRows[0]?.includes('is equal to'), 'row A ends with is equal to')
assert.ok(interleavedParsed?.matrixRows[3]?.includes('unequal roots'), 'row D keeps full stem')

const garbledEq = `Ifexactly one root of the quadratic equation (a² - 4a + 3) ×² + (a² - S5a + 6)x + (a + 5) = 0 lies at infinity then the possible integral value(s) of 'a' is equal to`
const eqParsed = resolveMatchColumnUpload(`Column-I Column-II (A) ${garbledEq} (B) test (C) test (D) test (P) 1`)
assert.doesNotMatch(eqParsed?.matrixRows[0] ?? '', /×²|S5a|Ifexactly/, 'row A equation OCR repaired')
assert.match(eqParsed?.matrixRows[0] ?? '', /x\^2|x²/i, 'row A has x squared')

const rowC = normalizeMatrixItemText(
  'If in \\Delta ABC, \\angle A = \\frac{\\pi}{2} then the maximum value of 4 sin B sin C is equal to',
)
assert.doesNotMatch(rowC, /o f\^4|of\^4/, 'row C keeps of 4 not o f^4')
assert.match(rowC, /of 4.*\\sin B \\sin C/i, 'row C has 4 sin B sin C')

const rowD = normalizeMatrixItemText(
  "Number of values of 'k' so that the equation (k-3)(k2-4)(k+1)x^2-(k3-5k2+6k)x+(k2-9)=0 has more than two unequal roots is equal to",
)
assert.doesNotMatch(rowD, /\\hat\{k\}/, 'row D has no hat on polynomial k')
assert.match(rowD, /k\^2|k\^3/, 'row D has k powers')

assert.ok(matrixColHasContent('1'), 'single-digit Column II counts for save')
assert.ok(matrixColHasContent('2'), 'Column II digit 2')
assert.ok(!matrixRowHasContent('1'), 'row stem rule still needs long text')
assert.equal(['1', '2', '3', '4', '5'].filter(matrixColHasContent).length, 5, 'five numeric cols')

const trimmedSave = {
  questionType: 'matrix_match',
  text: 'Match the Column',
  matrixRows: userParsed.matrixRows,
  matrixCols: ['', '', '', '', ''] }
const healedSave = healMatrixQuestion(trimmedSave)
assert.equal(healedSave.matrixCols.slice(0, 5).join(','), '1,2,3,4,5', 'heal empty cols from row stems')

const unitVecSparse = {
  questionType: 'matrix_match',
  text: 'Match the conditions on unit vectors $a, b, c$',
  matrixRows: [
    '$a, b, c$ are unit vectors satisfying $|a+b+c| = 0$, then $a \\cdot b + b \\cdot c + c \\cdot a$ equals',
    'If $[a+b \\quad b+c \\quad c+a] = 0$, then $[a \\quad b \\quad c]$ equals',
    'If $a \\perp b$ and $a \\perp c$, then the maximum value of $[a \\quad b \\quad c]^2$ equals',
    'If $a, b, c$ form a linearly dependent set of non-zero vectors, then $[a \\quad b \\quad c]$ equals',
  ],
  matrixCols: ['', '$-\\frac{3}{2}$', '', '$\\frac{1}{2}$'] }
const healedUnitVec = healMatrixQuestion(unitVecSparse)
assert.equal(healedUnitVec.matrixCols.filter((c) => c.trim()).length, 4, 'sparse unit-vector cols filled')
assert.equal(String(healedUnitVec.matrixCols[0] ?? '').replace(/\$/g, ''), '0', 'P is 0')
assert.match(healedUnitVec.matrixCols[1] ?? '', /3.*2/, 'Q has -3/2')
assert.match(healedUnitVec.matrixCols[2] ?? '', /1.*2/, 'R has 1/2')
assert.equal(String(healedUnitVec.matrixCols[3] ?? '').replace(/\$/g, ''), '0', 'S is 0')

const unitVecFiveSlots = {
  ...unitVecSparse,
  matrixCols: ['', '$-\\frac{3}{2}$', '', '$\\frac{1}{2}$', ''],
  matrixColLabels: ['(P)', '(Q)', '(R)', '(S)', '(T)'] }
const healedFive = healMatrixQuestion(unitVecFiveSlots)
assert.equal(healedFive.matrixCols.length, 4, '5-slot sparse heals to 4 cols')
assert.equal(healedFive.matrixCols.filter((c) => c.trim()).length, 4, '5-slot all P–S filled')

const misplaced = {
  ...unitVecSparse,
  matrixRows: [
    'a, b, c are unit vectors satisfying |a+b+c| = 0',
    'If [a + b b + c c + a] = 0, then',
    'If a ⊥ b and a ⊥ c, then',
    'If a, b, c form a linearly depende',
  ],
  matrixCols: ['', '$-\\frac{3}{2}$', '', '$\\frac{1}{2}$', ''] }
const healedMisplaced = healMatrixQuestion(misplaced)
assert.equal(String(healedMisplaced.matrixCols[0] ?? '').replace(/\$/g, ''), '0', 'misplaced OCR P is 0')
assert.match(healedMisplaced.matrixCols[1] ?? '', /3.*2/, 'misplaced OCR Q has -3/2')

console.log('rows', p.matrixRows.map((r) => r.slice(0, 70)))
console.log('cols', p.matrixCols)
console.log('test-quadratic-matrix-ocr: ok')

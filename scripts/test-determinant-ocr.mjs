import assert from 'node:assert/strict'
import katex from 'katex'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { parseQuestionText } from '../src/utils/parseQuestionText.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import { POLY_COEFF_VMATRIX_STEM } from '../src/utils/repairPolynomialCoeffVmatrixOcr.js'
import { looksLikePassageMultiMcq } from '../src/utils/parsePassageUpload.js'
import { looksLikeZ5ImaginaryRootsExpDeterminantMcq } from '../src/utils/repairZ5ImaginaryRootsExpDeterminantMcqOcr.js'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import {
  looksLikeDeterminantIntegerStem,
  looksLikeDeterminantQuestion,
  repairDeterminantOcr,
  vmatrixLooksBroken,
} from '../src/utils/repairDeterminantOcr.js'
import { LET_ABE_SMASHED_VMATRIX_STEM } from '../src/utils/repairSmashedProseVmatrixOcr.js'
import { latexExtractionIncomplete } from '../src/utils/healTruncatedLatex.js'

const semiperimeter =
  "If the sides a,b,c of AABC satisfy the equation 4x^3 - 24x %2 + 47x - 30 = 0 and a' (s-a)' (s-a)'| (s-b)? b? (s=b)*|= bp$ where p & q are coprime & s is semiperimeter of AABC, then (p-q) is"

const vandermonde = `Let Lp p (p ,q .1;) & (Py.Qy.1,) are satisfying [l q q° | = 6( where pi, qi, ri e Nand pi < qi < ri & i = 1, 2) and point (p ,q .1;) lies on the plane 2x + 3y + 6z = k and point (Py.Qy.1,) lies on the plane 2x + 3y + 6z = k, (where p1 = p2 = 1). If distance between these planes is 'd', then value of (210d) is`

for (const sample of [semiperimeter, vandermonde]) {
  assert.equal(looksLikeDeterminantQuestion(sample), true)
  assert.equal(looksLikeDeterminantIntegerStem(sample), true)
  assert.match(repairDeterminantOcr(sample), /\\begin\{vmatrix\}/)
  assert.equal(parseQuestionText(sample).optionsFound, 0, 'no false MCQ options')
  const parsed = parseSingleQuestionUpload(polishOcrText(sample), sample)
  assert.match(parsed.text ?? '', /\\begin\{vmatrix\}/)
  assert.equal(parsed.optionsFound, 0)
  assert.equal(vmatrixLooksBroken(parsed.text ?? ''), false, 'vmatrix row breaks ok')
}

const extractedSemi = processMcqUploadExtract(semiperimeter)
assert.match(extractedSemi.parsed.text ?? '', /semiperimeter.*\(p-q\)/is)
const extractedVan = processMcqUploadExtract(vandermonde)
assert.ok((extractedVan.parsed.text ?? '').length > 350)

const genericBroken = `Find $\\det(A)$ where A = \\begin{vmatrix} 1 & 2 & 3 4 & 5 & 6 7 & 8 & 9 \\end{vmatrix} is equal to`
assert.equal(vmatrixLooksBroken(genericBroken), true)
const fixed = repairDeterminantOcr(genericBroken)
assert.equal(vmatrixLooksBroken(fixed), false)
assert.match(fixed, /\$\$.*\\begin\{vmatrix\}/s)

const alphaBeta = `I+a-B 2Jap 2B If a, where o> B are roots of x^2 - 4x + 2 = 0, then value of determinant 2a \\ l^1 - a + p2a2B2 \\ Jo^1 - a - B is- (A) 125 (B) 64 ©) 25 (D) 16`
const abParsed = parseSingleQuestionUpload(polishOcrText(alphaBeta), alphaBeta)
assert.match(abParsed.text ?? '', /\\begin\{vmatrix\}/)
assert.match(abParsed.text ?? '', /\\alpha.*\\beta/s)
assert.deepEqual(abParsed.options, ['125', '64', '25', '16'])
assert.equal(abParsed.optionsFound, 4)
assert.equal(looksLikeDeterminantIntegerStem(alphaBeta), false, 'numeric MCQ not integer')

const trigRange =
  "sec? x¹1f(x) = | cos ®x cos 'x cosec'x|, then range of f(x) is - 1 cos 'x cot'x (A) (0,1 (B) (11) (© [0,1]"
assert.equal(looksLikeDeterminantQuestion(trigRange), true)
assert.equal(looksLikeDeterminantIntegerStem(trigRange), false, 'interval MCQ not integer')
const trigFixed = repairDeterminantOcr(trigRange)
assert.match(trigFixed, /\\begin\{vmatrix\}/)
assert.match(trigFixed, /\\sec\^2 x/)
const trigParsed = parseSingleQuestionUpload(polishOcrText(trigRange), trigRange)
assert.match(trigParsed.text ?? '', /\\begin\{vmatrix\}/)
assert.match(trigParsed.text ?? '', /range of \$f\(x\)\$ is/)
assert.deepEqual(trigParsed.options, ['$(0, 1)$', '$(-1, 1)$', '$[0, 1]$', '$[-1, 1]$'])
assert.equal(trigParsed.optionsFound, 4)
assert.equal(trigParsed.complete, true)

const polyCoeff =
  "3x' +19 2x-37 2 x^2 - 29x + 313 ] =ax'+bx?>+ cx +d, then value of a is 2x° + 173x^5 (A) 2 (B) 5 (C) -5 (D) -8"
assert.equal(looksLikeDeterminantQuestion(polyCoeff), true)
assert.match(repairDeterminantOcr(polyCoeff), /\\begin\{vmatrix\}/)
assert.match(repairDeterminantOcr(polyCoeff), /3x\^2\s*\+\s*19/)
const polyParsed = parseSingleQuestionUpload(polishOcrText(polyCoeff), polyCoeff)
assert.match(polyParsed.text ?? '', /\\begin\{vmatrix\}/)
assert.match(polyParsed.text ?? '', /then value of a is/)
assert.deepEqual(polyParsed.options, ['2', '5', '-5', '-8'])
assert.equal(polyParsed.optionsFound, 4)
assert.equal(polyParsed.complete, true)

const genericFlat =
  'Find determinant of 1 2 3 4 5 6 7 8 9 is equal to'
const flatFixed = repairDeterminantOcr(genericFlat)
assert.match(flatFixed, /\\begin\{vmatrix\}/)
assert.equal(vmatrixLooksBroken(flatFixed), false)

const brokenAfterPolish =
  '$$\\begin{vmatrix}3x^2 + 19 & 2x - 37 & 2 x^2 - 29 & x + 31 & 3 2x^2 + 17 & 3x & 5\\end{vmatrix} = ax^3 + bx^2 + cx + d, then value of a is$$'
assert.equal(vmatrixLooksBroken(brokenAfterPolish), true)
const repolished = repairDeterminantOcr(brokenAfterPolish)
assert.equal(vmatrixLooksBroken(repolished), false)

const hybridPoly =
  `| 3x 19 2x - 37 |\n| 2 -29 x + 31 | , then value of ai s^2 - 8 3x' + 192x - 372 x^2 - 29 & x + 31 2x^2 + 17 & 3x & 5 \\end{vmatrix} = a x^3 + b x^2 + cx + d, then value of a is (A) 2 (B) 5 (C) -5 (D) -8`
assert.equal(looksLikeDeterminantQuestion(hybridPoly), true)
const hybridParsed = parseSingleQuestionUpload(polishOcrText(hybridPoly), hybridPoly)
assert.match(hybridParsed.text ?? '', /\\begin\{vmatrix\}/)
assert.match(hybridParsed.text ?? '', /3x\^2\s*\+\s*19/)
assert.equal(vmatrixLooksBroken(hybridParsed.text ?? ''), false)
assert.deepEqual(hybridParsed.options, ['2', '5', '-5', '-8'])

const stemOnlyPoly =
  '$$\\begin{vmatrix} 3x^2 + 19 & 2x - 37 & 2 \\\\ x^2 - 29 & x + 31 & 3 \\\\ 2x^2 + 17 & 3x & 5 \\end{vmatrix} = ax^3 + bx^2 + cx + d, then value of a is$$'
const stemOnlyParsed = parseSingleQuestionUpload(stemOnlyPoly, stemOnlyPoly)
assert.equal(stemOnlyParsed.optionsFound, 4, 'stem-only poly det fills A-D options')
assert.deepEqual(stemOnlyParsed.options, ['2', '5', '-5', '-8'])
assert.match(stemOnlyParsed.text ?? '', /\\text\{ then value of a is\}/)

const z5Garbled =
  "eo elu eld _g Let a, B, 7, & are distinct imaginary roots of 1° = 1, then find the value of [¢\" e* e¥'-e™| is- CU Sr (A) O B)e 1 D)e'"
assert.equal(looksLikePassageMultiMcq(z5Garbled), false, 'z5 det must not defer as passage')
assert.equal(looksLikeDeterminantQuestion(z5Garbled), true)
assert.equal(looksLikeDeterminantIntegerStem(z5Garbled), false, 'z5 exp det is MCQ not integer')
const z5Parsed = parseSingleQuestionUpload(polishOcrText(z5Garbled), z5Garbled)
assert.match(z5Parsed.text ?? '', /\\begin\{vmatrix\}/)
assert.match(z5Parsed.text ?? '', /z\^5\s*=\s*1/)
assert.match(z5Parsed.text ?? '', /e\^\\alpha/)
assert.deepEqual(z5Parsed.options, ['0', '$e$', '1', '$e^5$'])
assert.equal(z5Parsed.optionsFound, 4)
assert.equal(z5Parsed.complete, true)
assert.equal(vmatrixLooksBroken(z5Parsed.text ?? ''), false)
const z5Extracted = processMcqUploadExtract(z5Garbled)
assert.notEqual(z5Extracted.pass, 'passage-deferred', 'upload pipeline must parse z5 det')
assert.deepEqual(z5Extracted.parsed.options, ['0', '$e$', '1', '$e^5$'])

const z5PolishedCirc =
  'eo elu eld _g Let a, B, 7, & are distinct imaginary roots of $1^\\circ = 1$, then find the value of [¢" e* e¥\'-e™| is- CU Sr (A) 0 B)e 1 D)e\''
assert.ok(looksLikeZ5ImaginaryRootsExpDeterminantMcq(z5PolishedCirc), 'detect after 1^circ polish')
const z5CircExtracted = processMcqUploadExtract(z5PolishedCirc)
assert.deepEqual(z5CircExtracted.parsed.options, ['0', '$e$', '1', '$e^5$'], 'parse after 1^circ polish')

const bareVmatrixPreview =
  '\\begin{vmatrix}3x^2 + 19 & 2x - 37 & 2 \\\\ x^2 - 29 & x + 31 & 3 \\\\ 2x^2 + 17 & 3x & 5 \\end{vmatrix} = ax^3 + bx^2 + cx + d, \\text{then value of a is}'
for (const stem of [POLY_COEFF_VMATRIX_STEM, bareVmatrixPreview]) {
  const prepared = prepareTextForMathTextDisplay(stem)
  assert.match(prepared, /^\$\$[\s\S]*\\begin\{vmatrix\}/, 'preview wraps vmatrix in $$')
  const html = katex.renderToString(prepared.slice(2, -2), {
    throwOnError: false,
    displayMode: true,
  })
  assert.equal(html.includes('katex-error'), false, 'KaTeX renders vmatrix preview')
}

assert.equal(vmatrixLooksBroken(LET_ABE_SMASHED_VMATRIX_STEM), true, 'Let/Abe smash is a broken vmatrix')
const letAbeFixed = repairDeterminantOcr(LET_ABE_SMASHED_VMATRIX_STEM)
assert.doesNotMatch(letAbeFixed, /\\begin\{vmatrix\}/, 'do not keep letter-smash as a determinant')
assert.doesNotMatch(letAbeFixed, /\$\$/)
assert.match(letAbeFixed, /Let A be an/i)
assert.equal(latexExtractionIncomplete(letAbeFixed), true, 'missing matrix is not invented')

console.log('test-determinant-ocr: ok')

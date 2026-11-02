import assert from 'node:assert/strict'
import {
  CURVE_FP_POS_FPP_NEG_STEM,
  normalizeDerivativePrimeChars,
  extractDerivativeConditionTokens,
  looksLikeCurveDerivativeGraphMcq,
  curveDerivativeStemLooksMangled,
  stemHasIncreasingConcaveDownConditions,
  repairDerivativePrimeStemOcr,
  derivativeTokensDifferWildly,
  trySolveIncreasingConcaveDownGraphMcq,
} from '../src/utils/repairDerivativePrimeStemOcr.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { finalizeStemForBank } from '../src/utils/stemBankGuard.js'
import { enrichParsedWithAnswerProvenance, tryAiSolveMcq } from '../src/utils/answerProvenance.js'
import { detectStemMathFidelityIssues } from '../src/utils/uploadFieldConfidence.js'
import { normalizeVisionQuestion } from '../src/utils/cloudVisionParse.js'

const mangled =
  'The curve $y = f(x)$ which satisfies the condition $f\'\'(x)>0$ and $f(x) < 0$ for all real $x$, is :'
const good =
  "The curve $y = f(x)$ which satisfies the condition $f'(x) > 0$ and $f''(x) < 0$ for all real $x$, is :"

assert.ok(looksLikeCurveDerivativeGraphMcq(mangled), 'detect mangled curve MCQ')
assert.ok(curveDerivativeStemLooksMangled(mangled), 'mangled flags wrong primes')
assert.ok(!stemHasIncreasingConcaveDownConditions(mangled), 'mangled is not increasing+concave-down')

const repaired = repairDerivativePrimeStemOcr(mangled)
assert.ok(stemHasIncreasingConcaveDownConditions(repaired), 'repair restores f\'>0 and f\'\'<0')
assert.match(repaired, /f'\(x\)\s*>\s*0/, "has f'(x)>0")
assert.match(repaired, /f''\(x\)\s*<\s*0/, "has f''(x)<0")
assert.doesNotMatch(repaired, /f\(x\)\s*<\s*0/, 'no bare f(x)<0')

const unicode = normalizeDerivativePrimeChars('f\u2032(x) > 0 and f\u2033(x) < 0')
assert.match(unicode, /f'\(x\)/)
assert.match(unicode, /f''\(x\)/)

const tokens = extractDerivativeConditionTokens(good)
assert.deepEqual([...tokens].sort(), ["f''(x)<0", "f'(x)>0"].sort())

assert.ok(
  derivativeTokensDifferWildly(mangled, good),
  'side-by-side token mismatch when primes differ',
)

const polished = polishOcrText(mangled)
assert.ok(stemHasIncreasingConcaveDownConditions(polished), 'polish chain preserves primes')

const bank = finalizeStemForBank(mangled)
assert.ok(stemHasIncreasingConcaveDownConditions(bank), 'bank finalize repairs mangled stem')
assert.match(bank, /f'\(x\)/)

const solved = trySolveIncreasingConcaveDownGraphMcq({
  text: CURVE_FP_POS_FPP_NEG_STEM,
  options: ['', '', '', ''],
  optionImages: ['imgA', 'imgB', 'imgC', 'imgD'],
})
assert.equal(solved?.correctIndex, 3, 'classic graph MCQ → D')

const ai = tryAiSolveMcq({
  text: CURVE_FP_POS_FPP_NEG_STEM,
  options: ['', '', '', ''],
  optionImages: ['a', 'b', 'c', 'd'],
})
assert.equal(ai?.correctIndex, 3, 'tryAiSolveMcq → D')

const enriched = enrichParsedWithAnswerProvenance(
  {
    text: mangled,
    options: ['', '', '', ''],
    optionImages: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
  },
  mangled,
)
assert.ok(stemHasIncreasingConcaveDownConditions(String(enriched.text ?? '')), 'enrich repairs stem')
assert.equal(enriched.correctIndex, 3, 'enrich drops wrong A and sets D')
assert.notEqual(enriched.correctIndex, 0, 'never keep wrong A by default')

const fidelity = detectStemMathFidelityIssues(mangled, good)
assert.ok(
  fidelity.some((m) => /derivative primes/i.test(m)),
  'fidelity warning when stem tokens differ from re-OCR',
)

const vision = normalizeVisionQuestion({
  text: mangled,
  options: ['', '', '', ''],
  correctIndex: 0,
})
assert.equal(vision?.correctIndex, undefined, 'vision parse drops guessed A on empty graph options')
assert.ok(stemHasIncreasingConcaveDownConditions(vision?.text ?? ''), 'vision text repaired')

console.log('test-derivative-prime-stem-ocr: ok')

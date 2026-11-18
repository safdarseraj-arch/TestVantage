/**
 * JEE Main assertion-combination MCQ (proton / E,B fields — Q33 style).
 * Run: node scripts/test-assertion-combination-mcq.mjs
 */
import assert from 'node:assert/strict'
import {
  fixDuplicateEdFieldStatement,
  optionsLookLikeAssertionCombinations,
  optionLooksLikeAssertionReason,
  peelAssertionCombinationBlock,
  restoreAssertionReasonFromSource,
  restoreAssertionStatementsFromSource,
  stemHasAssertionReasonBodies,
  stemHasAssertionStatements,
} from '../src/utils/assertionCombinationMcq.js'
import { stripTrailingPyqSectionHeader } from '../src/utils/bulkExtractClean.js'
import { cleanInstituteSolutionBody } from '../src/utils/instituteSolutionsParse.js'
import { stripLeakedOptionsFromStem } from '../src/utils/stripLeakedOptionsFromStem.js'
import { recoverOptionsFromStem } from '../src/utils/mathpixQuestionSplit.js'
import { healUploadQuestionCard } from '../src/utils/uploadQualityGuards.js'
import { sanitizeStemForDisplay } from '../src/utils/sanitizeStemForDisplay.js'
import {
  normalizeMcqOptionForRender,
  prepareTextForMathTextDisplay,
} from '../src/utils/prepareMathForRender.js'

const BODY = [
  'A proton moving with a constant velocity passes through a region of space without any change in its velocity. If $\\overrightarrow{\\mathrm{E}}$ and $\\overrightarrow{\\mathrm{B}}$ represent the electric and magnetic fields respectively, then the region of space may have:',
  '(A) $\\mathrm{E}=0 , \\mathrm{B}=0$',
  '(B) $\\mathrm{E}=0 , \\mathrm{B} \\neq 0$',
  '(C) $\\mathrm{E} \\neq 0, \\mathrm{B}=0$',
  '(D) $\\mathrm{E}=0, \\mathrm{B} \\neq 0$',
  'Choose the most appropriate answer from the options given below :',
  '(1) (A), (B) and (C) only',
  '(2) (A), (C) and (D) only',
  '(3) (A), (B) and (D) only',
  '(4) (B), (C) and (D) only',
].join('\n')

const COMBOS = [
  '(A), (B) and (C) only',
  '(A), (C) and (D) only',
  '(A), (B) and (D) only',
  '(B), (C) and (D) only',
]

assert.equal(optionsLookLikeAssertionCombinations(COMBOS), true)
assert.equal(stemHasAssertionStatements(BODY), true)

const peeled = peelAssertionCombinationBlock(BODY)
assert.ok(peeled)
assert.match(peeled.stem, /\(A\).*\\mathrm\{E\}=0/s)
assert.match(peeled.stem, /Choose the most appropriate/i)
assert.equal(peeled.options[0], '(A), (B) and (C) only')
assert.equal(peeled.options[2], '(A), (B) and (D) only')
assert.match(peeled.stem, /\\mathrm\{E\} \\neq 0, \\mathrm\{B\} \\neq 0/, 'OCR twin (D) rewritten to E≠0,B≠0')

const fullStem = BODY.replace(/\n\(1\)[\s\S]*/, '').trim()
const kept = stripLeakedOptionsFromStem(fullStem, COMBOS)
assert.match(kept, /\(A\)/)
assert.match(kept, /\(D\)/)
assert.match(kept, /Choose the most appropriate/i)

const rec = recoverOptionsFromStem(BODY, [])
assert.match(rec.stem, /\(A\).*\\mathrm\{E\}=0/s)
assert.equal(rec.options[0], '(A), (B) and (C) only')
assert.doesNotMatch(String(rec.options[0]), /^,/)

const short =
  'A proton moving with a constant velocity passes through a region of space without any change in its velocity. If $\\overrightarrow{\\mathrm{E}}$ and $\\overrightarrow{\\mathrm{B}}$ represent the electric and magnetic fields respectively, then the region of space may have:'
const restored = restoreAssertionStatementsFromSource({ text: short, options: COMBOS }, BODY)
assert.match(restored.text, /\(A\)/)
assert.match(restored.text, /Choose the most appropriate/i)
assert.equal(restored.options[0], '(A), (B) and (C) only')

const healed = healUploadQuestionCard({ text: short, options: COMBOS }, BODY)
assert.match(healed.text, /\(A\).*\\mathrm\{E\}=0/s)
assert.match(healed.text, /Choose the most appropriate/i)
assert.equal(healed.options[0], '(A), (B) and (C) only')

const shown = sanitizeStemForDisplay(fullStem, COMBOS)
assert.match(shown, /\(A\).*\\mathrm\{E\}=0/s, 'preview must keep statement (A)')
assert.match(shown, /Choose the most appropriate/i, 'preview must keep Choose line')

assert.equal(
  normalizeMcqOptionForRender('(A), (B) and (C) only'),
  '(A), (B) and (C) only',
  'MathText must not strip leading (A) from combination choices',
)
assert.equal(
  normalizeMcqOptionForRender('(B), (C) and (D) only'),
  '(B), (C) and (D) only',
)
assert.doesNotMatch(prepareTextForMathTextDisplay('(A), (B) and (C) only'), /^,/)
assert.match(prepareTextForMathTextDisplay('(A), (B) and (C) only'), /^\(A\), \(B\) and \(C\) only/)

const twin = fixDuplicateEdFieldStatement(
  '(A) $E=0,B=0$\n(B) $E=0,B\\neq0$\n(C) $E\\neq0,B=0$\n(D) $E=0,B\\neq0$',
)
assert.match(twin, /\(D\).*\\mathrm\{E\} \\neq 0, \\mathrm\{B\} \\neq 0/)

const arOcr = `Given below are two statements : one is labelled as Assertion (A) and the other is labelled as Reason (R).
Assertion (A) : Melting point of Boron (2453 K) is unusually high in group 13 elements.
Reason (R) : Solid Boron has very strong crystalline lattice.
In the light of the above statements, choose the most appropriate answer from the options given below:
(1) Both (A) and (R) are correct and (R) is the correct explanation of (A).
(2) (A) is false but (R) is true.
(3) (A) is true but (R) is false.
(4) Both (A) and (R) are correct but (R) is not the correct explanation of (A).
Ans. (1)
`
const arOpts = [
  'Both (A) and (R) are correct and (R) is the correct explanation of (A).',
  '(A) is false but (R) is true.',
  '(A) is true but (R) is false.',
  'Both (A) and (R) are correct but (R) is not the correct explanation of (A).',
]
assert.equal(optionLooksLikeAssertionReason(arOpts[1]), true)
assert.equal(
  normalizeMcqOptionForRender('(A) is false but (R) is true.'),
  '(A) is false but (R) is true.',
)
assert.equal(
  normalizeMcqOptionForRender('(C) < (A) < (D) < (B) < (E)'),
  '(C) < (A) < (D) < (B) < (E)',
)
const arCut = restoreAssertionReasonFromSource(
  { text: 'Given below are two statements : one is labelled as Assertion', options: arOpts },
  arOcr,
)
assert.equal(stemHasAssertionReasonBodies(arCut.text), true)
assert.match(arCut.text, /Melting point of Boron/)
assert.match(arCut.text, /strong crystalline lattice/)

const solWithPart = 'v=\\sqrt{673}\\mathrm{~m}/\\mathrm{s}\n\n\nPART - C (CHEMISTRY)'
assert.doesNotMatch(stripTrailingPyqSectionHeader(solWithPart), /PART\s*-\s*C/i)
assert.doesNotMatch(cleanInstituteSolutionBody(solWithPart), /PART\s*-\s*C/i)

console.log('test-assertion-combination-mcq: ok')

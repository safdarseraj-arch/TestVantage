import assert from 'node:assert/strict'
import { sanitizeMathDelimiters } from '../src/utils/sanitizeMathDelimiters.js'
import { trimTrailingProseAfterMath } from '../src/utils/optionStemLeak.js'
import { polishMcqOptionBody } from '../src/utils/polishMcqOptionBody.js'
import { buildMcqPreviewContext } from '../src/utils/repairMcqOption.js'

// A \frac already inside $…$ must not get a second opening $ spliced in.
assert.equal(
  sanitizeMathDelimiters('(A) $A = \\frac{3}{2}$'),
  '(A) $A = \\frac{3}{2}$',
  'no stray $ before \\frac inside inline math',
)
assert.equal(
  sanitizeMathDelimiters('The value of $\\int \\frac{dx}{1 + e\\cos x}$ must be same as:'),
  'The value of $\\int \\frac{dx}{1 + e\\cos x}$ must be same as:',
  'integral with inner \\frac survives',
)
// Genuinely unwrapped LaTeX with a stray closing $ still gets wrapped.
assert.equal(
  sanitizeMathDelimiters('area is \\sqrt{86}$'),
  'area is $\\sqrt{86}$',
  'unwrapped LaTeX still gets delimiters',
)

// A short predicate is the answer, not leaked stem prose.
assert.equal(trimTrailingProseAfterMath('$C$ is indefinite'), '$C$ is indefinite')
assert.equal(trimTrailingProseAfterMath('$k$ is arbitrary'), '$k$ is arbitrary')
// A trailing preposition means the sentence ran on — still strippable.
assert.equal(trimTrailingProseAfterMath('$x$ is equal to'), '$x$')

const stem =
  '$$\\int \\left( \\frac{4e^x + 6e^{-x}}{9e^x - 4e^{-x}} \\right) dx = Ax + B \\log_e(9e^{2x} - 4) + C,$$ then:'
const options = [
  '$A = \\frac{3}{2}$',
  '$B = \\frac{35}{36}$',
  '$C$ is indefinite',
  '$A + B = -\\frac{19}{36}$',
]
const ctx = buildMcqPreviewContext({
  extractedRaw: '',
  questionText: stem,
  options,
  forOptionRepair: true,
})
options.forEach((option, i) => {
  const polished = polishMcqOptionBody(option, String.fromCharCode(65 + i), ctx, stem)
  assert.equal(polished, option, `option ${String.fromCharCode(65 + i)} survives polish unchanged`)
})

console.log('test-option-math-integrity: ok')

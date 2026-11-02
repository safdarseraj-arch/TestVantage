import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import { unwrapProseBeforeDisplayMath } from '../src/utils/fixRunawayInlineMath.js'

const cases = [
  'Let $$A=\\begin{bmatrix}2 & 0 & 1 \\\\ 1 & 0 & 2 \\\\ 2 & 1 & 1\\end{bmatrix}$$ $thenabsolutevalueof \\frac{|(A-I)^3-5A|}{128} is$',
  'Let $$A=\\begin{bmatrix}2 & 0 & 1 \\\\ 1 & 0 & 2 \\\\ 2 & 1 & 1\\end{bmatrix} thenabsolutevalueof \\frac{|(A-I)^3-5A|}{128} is$$',
  'Let $$A=\\begin{bmatrix}2 & 0 & 1 \\\\ 1 & 0 & 2 \\\\ 2 & 1 & 1\\end{bmatrix}$$thenabsolutevalueof \\frac{|(A-I)^3-5A|}{128} is',
  '$thenabsolutevalueof \\frac{|(A-I)^3-5A|}{128} is$',
]

for (const c of cases) {
  const o = prepareTextForMathTextDisplay(c)
  console.log('IN:', c)
  console.log('OUT:', o)
  console.log('glued?', /thenabsolute/i.test(o))
  console.log('in-dollar glued?', /\$[^$]*thenabsolute/i.test(o))
  console.log('---')
}

const u = unwrapProseBeforeDisplayMath('$thenabsolutevalueof \\frac{x}{128} is$')
console.log('unwrap:', u)

import { normalizeQuestionStemText } from '../src/utils/normalizeMathText.js'

const raw =
  'Let $$A=\\begin{bmatrix}2 & 0 & 1 \\\\ 1 & 0 & 2 \\\\ 2 & 1 & 1\\end{bmatrix}$$ $thenabsolutevalueof \\frac{|(A-I)^3-5A|}{128} is$'
const norm = normalizeQuestionStemText(raw)
const prep = prepareTextForMathTextDisplay(norm)
console.log('\nDOUBLE PIPELINE (QuestionStem path):')
console.log('norm:', norm)
console.log('prep:', prep)
console.log('bare frac?', /[^$]\\frac/.test(prep) && !/\$\\frac/.test(prep))
console.log('glued?', /thenabsolute/i.test(prep))

// Simulate QuestionStem path: no normalize before MathText
const stemOnly = prepareTextForMathTextDisplay(raw)
console.log('\nSTEM PATH (no normalize):', stemOnly)
console.log('has $frac?', /\$\\frac/.test(stemOnly))

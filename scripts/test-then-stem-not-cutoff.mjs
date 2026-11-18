/**
 * Complete "then :" / fill-in stems must not look cut off (Approve heal was
 * gluing the next question + Ans/Sol into Q13/Q26 and flagging math-draw).
 */
import assert from 'node:assert/strict'
import { stemLooksCutOff, extendStemFromSource } from '../src/utils/extendTruncatedStem.js'

const q13 =
  'If A denotes the sum of all coefficients in the expansion of $\\left(1-3 x+10 x^{2}\\right)$ and B denotes the sum of all the coefficients in the expansion of $\\left(1+x^{2}\\right)^{n}$ then :'
const q26 =
  'Let the set of all $a \\in R$ such that the equation $\\cos 2 x+a \\sin x=2 a-7$ has a solution be [p, q] and $\\mathrm{r}=\\tan 9^{\\circ}-\\tan 27^{\\circ}-\\frac{1}{\\cot 63^{\\circ}}+\\tan 81^{\\circ}$, then pqr is equal to ____'

assert.equal(stemLooksCutOff(q13), false, 'MCQ closer "then :" is complete')
assert.equal(stemLooksCutOff(q26), false, 'fill-in "then … ____" is complete')
assert.equal(stemLooksCutOff('Let $x>0$. Then'), true, 'bare Then is still cut off')

const gluedSource = `${q13}
(1) $A=B^{3}$
(2) $3 \\mathrm{~A}=B$

Let $\\overline{\\mathrm{a}}=\\hat{\\mathrm{i}}+2 \\hat{\\mathrm{j}}$
Ans. 48
Sol.
$$\\begin{aligned}
r= & \\tan 9^{\\circ}
\\end{aligned}$$
`
const extended13 = extendStemFromSource(q13, gluedSource)
assert.equal(extended13, q13, 'complete then : stem must not pull next Q / Ans')
assert.doesNotMatch(extended13, /\\\\begin\{aligned\}/)
assert.doesNotMatch(extended13, /Ans\./i)

const glued26 = `${q26}
\\end{itemize}

Ans. 48
Sol.
$$\\begin{aligned}
r= & \\tan 9^{\\circ}-\\tan 27^{\\circ}
\\end{aligned}$$
`
const extended26 = extendStemFromSource(q26, glued26)
assert.equal(extended26, q26, 'complete fill-in stem must not pull Sol')
assert.doesNotMatch(extended26, /\\\\begin\{aligned\}/)

console.log('test-then-stem-not-cutoff: ok')

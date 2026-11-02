import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'

const q = `Let $f(x)$ be a continuously differentiable function on the interval $(0, \\infty)$ such that $f(1) = 2$ and
$$\\lim_{t \\to x} \\frac{t^{10}f(x) - x^{10}f(t)}{t^9 - x^9} = 1$$
for each $x > 0$. Then, for all $x > 0$, $f(x)$ is equal to
(A) $\\frac{31}{11x} - \\frac{9}{11}x^{10}$
(B) $\\frac{9}{11x} + \\frac{13}{11}x^{10}$
(C) $\\frac{-9}{11x} + \\frac{31}{11}x^{10}$
(D) $\\frac{13}{11x} + \\frac{9}{11}x^{10}$`

const p = parseSingleQuestionUpload(q)
console.log('multi', p.multi)
console.log('text', p.text?.slice(0, 80))
console.log('options', p.options?.map((o) => o.slice(0, 40)))
assert.equal(p.multi, false, 'should be single question')
assert.ok(p.text?.includes('lim'), 'stem has limit')
assert.ok(p.options?.filter((o) => o.trim()).length >= 4, 'four options')

console.log('test-single-limit-mcq: ok')

import assert from 'node:assert/strict'
import { normalizeMathText, normalizeQuestionStemText } from '../src/utils/normalizeMathText.js'
import { prepareMathForRender, repairBarePiConstant } from '../src/utils/prepareMathForRender.js'
import { collapseRunawayBackslashes } from '../src/utils/repairOperatorname.js'

const pi = '\\pi'

// Bare OCR "pi" → \\pi (renders as π)
const absSin = normalizeMathText('|x+pi| / sin(x)')
assert.match(absSin, /\\pi/, '|x+pi| becomes \\pi')
assert.doesNotMatch(absSin, /(?<!\\)pi(?![a-zA-Z])/, 'no bare pi left in abs/sin stem')
assert.match(absSin, /\$/, 'wrapped for KaTeX')

assert.match(normalizeMathText('f(x)=|x+pi|/sin(x)'), /\|x\+\\pi\|/)
assert.match(normalizeMathText('-pi'), /-\\pi/)
assert.match(normalizeMathText('+pi'), /\+\\pi/)
assert.match(normalizeMathText('pi^+'), /\\pi\^/)
assert.match(normalizeMathText('lim x to -pi'), /-\\pi/)
assert.match(normalizeMathText('$|x+pi|$'), /\|x\+\\pi\|/)
assert.match(normalizeMathText('sin(pi)'), /\\sin\(\\pi\)/)
assert.match(normalizeMathText('|x+Pi|'), /\\pi/)

// English "pie" must stay
assert.equal(normalizeMathText('apple pie'), 'apple pie')

// Already-correct \\pi must NOT become " pi" (legacy double-escape + collapse bug)
const goodPi = normalizeMathText(`|x+${pi}|`)
assert.match(goodPi, /\\pi/, 'keeps \\pi')
assert.doesNotMatch(goodPi, /\+\s+pi\b/, 'must not corrupt \\pi to bare pi')
assert.match(normalizeQuestionStemText(`$f(x) = |x + ${pi}| / \\sin(x)$`), /\\pi/)

const alone = normalizeMathText(pi)
assert.match(alone, /\\pi/)
assert.doesNotMatch(alone, /^pi$/)

assert.match(normalizeMathText(`$${pi}$`), /\\pi/)
assert.doesNotMatch(normalizeMathText(`$${pi}$`), /\$\s+pi/)

// collapse must not strip \\ before letters (\\pi)
assert.match(collapseRunawayBackslashes(`|x+\\\\${pi.slice(1)}|`), /\\pi|\\\\pi/)
assert.equal(collapseRunawayBackslashes('|x+\\pi|'), '|x+\\pi|')

// Render path heals bare / legacy-corrupted pi
assert.match(repairBarePiConstant('|x+pi|'), /\\pi/)
assert.match(repairBarePiConstant('|x+ pi|'), /\\pi/)
assert.match(prepareMathForRender('$|x+pi|$'), /\\pi/)
assert.match(prepareMathForRender('$|x+ pi|$'), /\\pi/)
assert.equal(repairBarePiConstant('apple pie'), 'apple pie')

console.log('test-pi-latex-normalize: ok')

import assert from 'node:assert/strict'
import { parsePassageWithSubQuestions, resolvePassageUpload } from '../src/utils/parsePassageUpload.js'
import { passageSubQuestionDisplayText } from '../src/utils/passage.js'

const ocr = `An expression $F(a, b)(a, b $\\in R$)$ takes two inputs ' $a$ ', ' $b$ ', and gives an output. The outpu is obtained by the given rule. For example if $F(a, b)=a^{2}+2 a b$, then $F(1,1)=1+2=3, F(1,2)=1+4=5.
Let$F(a, b)=\\log _{b} a,(a>0, b>0, b \\neq 1)$then evaluate:$F(\\sqrt{2}, 4)+F\\left(2 \\sqrt{2}, 4^{3}\\right)+F\\left(4 \\sqrt{2}, 4^{5}\\right)+\\ldots \\ldots \\ldots \\ldots+F\\left((\\sqrt{2})^{2 n+1}, 4^{2 n+1}\\right)+\\ldots \\ldots+F\\left((\\sqrt{2})^{99}, 4^{99}\\right)
Consider the quadratic expression $f(x, b)=x^{2}+b x+4$.Let $g(B)$ be minimum of $f(x, b)$ as $x$ varies over $(-\\infty, \\infty)$.Let maximum value of $g(B)$ be ' $k$ ' (as $b$ varies over $(-\\infty, \\infty))$, then $\\sum_{r=1}^{100}\\left[\\log _{k} r\\right]=?($ where $[]=$. greatest integer function $)$`

const parsed = parsePassageWithSubQuestions(ocr, { allowOptionless: true })
assert.ok(parsed, 'expected passage parse')
assert.equal(parsed.subQuestions.length, 2, 'two problems on one sheet')

assert.match(parsed.passageText, /expression \$F\(a,\s*b\)/i)
assert.ok(!/Consider\s+the\s+quadratic/i.test(parsed.passageText), 'passage must not include problem 2')
assert.ok(!/Let\s+\$?g\s*\(/i.test(parsed.passageText), 'passage must not include g(b) clause')

assert.match(parsed.subQuestions[0].text, /Let\s*\$?F\s*\(\s*a\s*,/i)
assert.match(parsed.subQuestions[0].text, /evaluate/i)
assert.ok(!/Consider\s+the\s+quadratic/i.test(parsed.subQuestions[0].text), 'Q1 is log sum only')

assert.match(parsed.subQuestions[1].text, /Consider\s+the\s+quadratic/i)
assert.match(parsed.subQuestions[1].text, /minimum\s+of\s+\$?f\s*\(\s*x/i)
assert.match(parsed.subQuestions[1].text, /maximum\s+value\s+of\s+\$?g/i)
assert.match(parsed.subQuestions[1].text, /\\sum_\{r=1\}/)

const resolved = resolvePassageUpload(ocr, ocr, { allowOptionless: true })
assert.equal(resolved?.subQuestions?.length, 2)

const display1 = passageSubQuestionDisplayText(parsed.subQuestions[0].text, parsed.passageText)
assert.match(display1, /Let\s*\$?F/i)
assert.ok(display1.length > 40, 'Q1 display should not be truncated to a fragment')

const display2 = passageSubQuestionDisplayText(parsed.subQuestions[1].text, parsed.passageText)
assert.match(display2, /Consider\s+the\s+quadratic/i)

console.log('test-passage-function-f-split: ok')

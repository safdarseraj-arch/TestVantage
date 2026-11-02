import assert from 'node:assert/strict'
import {
  looksLikeT10LimitQuestion,
  repairT10LimitStemOcr,
  T10_LIMIT_STEM,
} from '../src/utils/repairT10LimitStemOcr.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'

const garbled = `Let f(x) be a continuously differentiable function on the
interval (0,0) such that (1) =2 and 10 10 LUO t-x rr -x for
each x > 0. Then, for all x>0, f(x) is equal to
(A) 31.9 wn
(B) 9 Ble 11x 11 11x 11 0) 22 310
(D) 13 9 jo 11x 11 11x 11`

assert.ok(looksLikeT10LimitQuestion(garbled), 'detect t^10 limit stem')

const repaired = repairT10LimitStemOcr(garbled)
assert.match(repaired, /\\lim_\{t\s*\\to\s*x\}/, 'rebuilds limit')
assert.match(repaired, /t\^\{10\}f\(x\)/, 't^10 f(x) in limit')
assert.match(repaired, /t\^9\s*-\s*x\^9/, 't^9 - x^9 denominator')
assert.match(repaired, /\\frac\{31\}\{11x\}/, 'option A fraction')
assert.match(repaired, /\(C\)/, 'option C present')
assert.doesNotMatch(repaired, /LUO|rr -x|\(0,0\)/i, 'removes garbled OCR')

const polished = polishOcrText(garbled)
assert.match(polished, /\\lim_\{t\s*\\to\s*x\}/, 'polish pipeline keeps limit')

const parsed = parseSingleQuestionUpload(polished)
assert.equal(parsed.multi, false, 'single question')
assert.ok(parsed.text?.includes('lim'), 'stem parsed')
assert.equal(parsed.options?.filter((o) => o.trim()).length, 4, 'four options')

assert.match(T10_LIMIT_STEM, /f\(1\)\s*=\s*2/, 'canonical stem')

const garbledLatex = `Let $f(x)$ be a continuously differentiable function on the interval $(0, \\infty)$ such that $f f(1) = 2$ and $\\setminus\\text{lim\\_\\{t \\setminus to x\\}} \\frac{t^{10} f(x)-x^{10} f(t)}{t^9-x^9} = 1$ for each $x > 0$. Then, for all $x > 0$, $f(x)$ is equal to
(A) $\\frac{31}{11x}$
(B) $\\frac{9}{11x}$
(C) $\\frac{-9}{11x}$
(D) $\\frac{13}{11x}$`

assert.ok(looksLikeT10LimitQuestion(garbledLatex), 'detect LaTeX-garbled t^10 limit stem')

const parsedLatex = parseSingleQuestionUpload(garbledLatex)
assert.match(parsedLatex.text ?? '', /\\lim_\{t\s*\\to\s*x\}/, 'LaTeX garble → canonical limit stem')
assert.match(parsedLatex.options?.[0] ?? '', /x\^\{10\}/, 'option A includes x^10 term')
assert.match(parsedLatex.options?.[0] ?? '', /31.*11x/, 'option A includes 31/11x')
assert.doesNotMatch(parsedLatex.text ?? '', /\\setminus|f\s+f\s*\(\s*1\s*\)/, 'stem garble removed')

console.log('test-t10-limit-ocr: ok')

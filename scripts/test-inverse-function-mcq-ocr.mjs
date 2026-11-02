import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { enhanceMcqFromOcr } from '../src/utils/aiUploadAssist.js'
import { shouldSkipOptionsAutoCrop, shouldAttemptOptionsAutoCrop } from '../src/utils/graphOptionOcr.js'
import {
  looksLikeInverseFunctionMcq,
  repairInverseFunctionMcqParse,
} from '../src/utils/repairInverseFunctionMcqOcr.js'

const partial = `Then g(2) is - e' +e" 2 ee" -2 (A) Ys B)e © 5 Dye`
const garbled = `Let f(x) = ln(x + sqrt(x^2+1)). If g(f(x)) = x for all x then g(2) is
- e' +e" 2 ee" -2 (A) (e^2+e^{-2})/2 B)e^2 C) (e^2-e^{-2})/2 D)e^{-2}`

assert.ok(looksLikeInverseFunctionMcq(partial), 'partial OCR still detected')
assert.ok(looksLikeInverseFunctionMcq(garbled))

for (const t of [partial, garbled]) {
  const p = parseSingleQuestionUpload(t, t)
  assert.equal(p.optionsFound, 4, `4 options from: ${t.slice(0, 30)}`)
  assert.match(p.text ?? '', /\\ln/, 'stem has LaTeX ln')
  assert.match(p.options[0] ?? '', /e\^2/, 'option A exponential')
  assert.ok(shouldSkipOptionsAutoCrop(p.text, p.options, t), 'must not auto-crop graph options')
  assert.equal(shouldAttemptOptionsAutoCrop(p.text, p.options, [], t), false)
}

const mcq = enhanceMcqFromOcr({
  stem: partial,
  options: ['$\\ce{Ys}$', '', '', ''],
  rawOcr: garbled,
})
assert.equal(mcq.found, 4, 'AI heal fills 4 options')
assert.ok(!/\\ce\{Ys\}/.test(mcq.options[0] ?? ''), 'no chemistry garbage in A')

const repaired = repairInverseFunctionMcqParse({
  text: partial,
  options: ['Ys', '', '', ''],
  _ocrSource: garbled,
})
assert.equal(repaired.optionsFound, 4)

console.log('test-inverse-function-mcq-ocr: ok')

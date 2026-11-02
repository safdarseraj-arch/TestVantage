import assert from 'node:assert/strict'
import {
  LIM_INTERSECTION_STEM,
  looksLikeLimIntersectionCalculusQuestion,
  repairLimIntersectionStemOcr,
} from '../src/utils/repairLimIntersectionStemOcr.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { finalizeStemForBank } from '../src/utils/stemBankGuard.js'
import { pageNeedsOnnxBoost } from '../src/utils/hybridOcrNeeds.js'
import { stripTrailingOptionMarkerFromStem } from '../src/utils/optionStemLeak.js'
import { persistQuestionForBank } from '../src/utils/persistUpload.js'

const garbled =
  'If P denotes the number of intersection of $y^*>=7x$ and $x^2 + y^2 - 4x + 2 = 0$, tl . . - value of lim, pd tm 5 La $Xx^1 111$'

assert.ok(looksLikeLimIntersectionCalculusQuestion(garbled), 'detect intersection stem')

const repaired = repairLimIntersectionStemOcr(garbled)
assert.match(repaired, /y\^2\s*=\s*7x/, 'fixes parabola')
assert.match(repaired, /\\lim_\{x\s*\\to\s*P\}/, 'rebuilds limit')
assert.match(repaired, /\\sin\(\\sin\s*x\)/, 'nested sin in limit')
assert.match(repaired, /\\frac\{1\}\{6\}/, 'restores MCQ option A')
assert.doesNotMatch(repaired, /y\^?\*>=?7x|pd\s*tm|Xx\^?1/i, 'removes garbled OCR')

const polished = polishOcrText(garbled)
assert.match(polished, /\\lim_\{x\s*\\to\s*P\}/, 'polish pipeline keeps limit')
assert.match(polished, /points of intersection/, 'polish fixes intersection phrase')

const saved = finalizeStemForBank(polished)
assert.match(saved, /\\lim_\{x\s*\\to\s*P\}/, 'bank save keeps limit')

assert.ok(pageNeedsOnnxBoost(garbled), 'garbled limit triggers ONNX boost')

assert.match(LIM_INTERSECTION_STEM, /\$P\$/, 'canonical uses P symbol')

const leakedStem =
  'If $P$ denotes the number of points of intersection of $y^2 = 7x$ and $x^2 + y^2 - 4x + 2 = 0$, then the value of $\\lim_{x \\to P} \\frac{x\\sin(\\sin x) - \\sin^2 x}{x^6}$ is (A)'
const opts = ['$\\frac{1}{6}$', '$\\frac{1}{18}$', '$\\frac{1}{12}$', '$\\frac{1}{24}$']
const stripped = stripTrailingOptionMarkerFromStem(leakedStem, opts)
assert.doesNotMatch(stripped, /\(\s*A\s*\)\s*$/i, 'strips leaked (A) from stem')
assert.match(stripped, /\bis\s*$/i, 'stem still ends with is')

const repairedLeak = repairLimIntersectionStemOcr(leakedStem)
assert.doesNotMatch(repairedLeak, /\(\s*A\s*\)\s*$/i, 'lim repair strips lone (A)')

const migrated = persistQuestionForBank({
  id: 'lim-leak',
  questionType: 'single_correct',
  text: leakedStem,
  options: opts,
})
assert.doesNotMatch(migrated.text ?? '', /\(\s*A\s*\)\s*$/i, 'bank migrate strips leaked (A)')

console.log('test-lim-intersection-ocr: ok')

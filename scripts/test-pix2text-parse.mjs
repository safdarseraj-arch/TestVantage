/**
 * Pix2Text result normalization + pipeline gate (no live P2T server required).
 */
import assert from 'node:assert/strict'
import { normalizePix2TextResults, pix2TextLooksMathHeavy, looksLikeComplexFormulaQuestion } from '../src/utils/pix2textParse.js'
import { shouldAttemptPix2Text } from '../src/utils/pix2textClient.js'

const limitBlocks = [
  { type: 'isolated', text: '\\lim_{x \\to \\infty} \\frac{e^{x^n}}{x^n}' },
  { type: 'text', text: ', $n \\in N$, is equal to :' },
  { type: 'text', text: '(A) 0' },
  { type: 'text', text: '(B) $\\ln\\left(\\frac{2}{3}\\right)$' },
]
const text = normalizePix2TextResults(limitBlocks)
assert.match(text, /\\lim/)
assert.match(text, /\\ln/)
assert.ok(pix2TextLooksMathHeavy(text))

assert.equal(normalizePix2TextResults('plain line'), 'plain line')

assert.equal(
  shouldAttemptPix2Text({ pix2Ready: true, cloudAttempted: false }),
  true,
  'try Pix2Text when cloud never ran',
)
assert.equal(
  shouldAttemptPix2Text({ pix2Ready: true, cloudAttempted: true, cloudSucceeded: true, cloudWeak: 40 }),
  false,
  'skip when cloud already strong',
)
assert.equal(
  shouldAttemptPix2Text({ pix2Ready: true, cloudAttempted: true, cloudSucceeded: false }),
  true,
  'try when cloud failed',
)

assert.equal(
  shouldAttemptPix2Text({ pix2Ready: false, cloudAttempted: false }),
  false,
)

assert.equal(
  shouldAttemptPix2Text({
    pix2Ready: true,
    cloudAttempted: true,
    cloudSucceeded: true,
    cloudWeak: 50,
  }),
  true,
  'try Pix2Text when cloud score is medium-weak',
)
assert.equal(
  shouldAttemptPix2Text({
    pix2Ready: true,
    cloudAttempted: true,
    cloudSucceeded: true,
    cloudWeak: 20,
    cloudLowConfidence: true,
  }),
  true,
  'try Pix2Text on low-confidence cloud even if score looks ok',
)

const garbledEcosx =
  'The value of | he must be same as: +ecosx wr = 3 ( ) 1 1 [1-e x . A -tan -tan- |'
assert.ok(looksLikeComplexFormulaQuestion(garbledEcosx), 'detect nested inverse / ecosx garble')
assert.equal(
  shouldAttemptPix2Text({
    pix2Ready: true,
    cloudAttempted: true,
    cloudSucceeded: true,
    cloudWeak: 20,
    cloudText: garbledEcosx,
  }),
  true,
  'route nested-formula garbage to Pix2Text',
)

const garbledXxPower =
  '241 | 1 QInx + 1)dx A FC\n(A) Lhx+C\n(B) MC\n(C) (FY +C\n(D) |Il1O'
assert.ok(looksLikeComplexFormulaQuestion(garbledXxPower), 'detect QInx integral soup as complex math')
assert.equal(
  shouldAttemptPix2Text({
    pix2Ready: true,
    cloudAttempted: true,
    cloudSucceeded: true,
    cloudWeak: 20,
    cloudText: garbledXxPower,
  }),
  true,
  'route garbled nested-power integral to Pix2Text when sidecar is up',
)

console.log('test-pix2text-parse: ok')

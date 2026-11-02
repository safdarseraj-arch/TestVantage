/**
 * Grok 6-layer hybrid stack — ensemble unit tests (no live Pix2Text).
 */
import assert from 'node:assert/strict'
import { pickBestOcrCandidate } from '../src/utils/pickBestOcrCandidate.js'
import {
  GROK_HYBRID_STACK_LAYERS,
  formatOcrStackStatusMessage,
} from '../src/utils/hybridStackExtract.js'

assert.equal(GROK_HYBRID_STACK_LAYERS.length, 6)
assert.match(GROK_HYBRID_STACK_LAYERS[1].detail, /Pix2Text/i)
assert.equal(GROK_HYBRID_STACK_LAYERS[3].name, 'Ensemble')

const localGarbage = 'lim -,neN,is equal to: 10 x\n(A) 0\n(B) w(2)'
const p2tGood =
  '$\\lim_{x \\to \\infty} \\frac{e^{x^n}}{x^n}$, $n \\in N$, is equal to :\n(A) 0\n(B) $\\ln(2/3)$'

const best = pickBestOcrCandidate([
  { text: localGarbage, source: 'hybrid:local' },
  { text: p2tGood, source: 'pix2text' },
])
assert.equal(best.source, 'pix2text', 'ensemble must prefer Pix2Text LaTeX over garbled local')

const msg = formatOcrStackStatusMessage({
  vision: { configured: true, ready: true },
  pix2text: { enabled: true, ready: true },
})
assert.match(msg, /Cloud AI: ready/)
assert.match(msg, /Pix2Text: ready/)

console.log('test-hybrid-stack: ok')

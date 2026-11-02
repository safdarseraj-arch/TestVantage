import assert from 'node:assert/strict'
import { pdfItemsToPolishedText, pdfTextLayerNeedsMathBoost } from '../src/utils/pdfMathTextLayer.js'

const items = [
  { str: 'Let', transform: [12, 0, 0, 12, 40, 700] },
  { str: 'T', transform: [12, 0, 0, 12, 55, 700] },
  { str: '1', transform: [7, 0, 0, 7, 67, 693] },
  { str: '=', transform: [12, 0, 0, 12, 74, 700] },
  { str: '2', transform: [12, 0, 0, 12, 86, 700] },
  { str: 'T', transform: [12, 0, 0, 12, 96, 700] },
  { str: '2', transform: [7, 0, 0, 7, 108, 693] },
]

const text = pdfItemsToPolishedText(items)
assert.match(text, /T₁/)
assert.match(text, /2T₂|T₂/)

const garbled = 'T , and T , respectively then'
assert.ok(pdfTextLayerNeedsMathBoost(garbled))

console.log('test-pdf-math-text-layer: ok')

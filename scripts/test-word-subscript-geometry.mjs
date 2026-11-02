import assert from 'node:assert/strict'
import { inferSubscriptsOnTesseractPage } from '../src/utils/subscriptWordGeometry.js'

const page = {
  lines: [
    {
      text: 'T 1 = 2 T 2',
      words: [
        { text: 'T', bbox: { x0: 10, y0: 100, x1: 22, y1: 120 }, confidence: 90 },
        { text: '1', bbox: { x0: 23, y0: 108, x1: 30, y1: 118 }, confidence: 88 },
        { text: '=', bbox: { x0: 32, y0: 100, x1: 40, y1: 120 }, confidence: 90 },
        { text: '2T', bbox: { x0: 42, y0: 100, x1: 58, y1: 120 }, confidence: 85 },
        { text: '2', bbox: { x0: 58, y0: 108, x1: 65, y1: 118 }, confidence: 85 },
      ],
    },
  ],
}

inferSubscriptsOnTesseractPage(page)
assert.match(page.lines[0].text, /T₁|T1/)

console.log('test-word-subscript-geometry: ok')

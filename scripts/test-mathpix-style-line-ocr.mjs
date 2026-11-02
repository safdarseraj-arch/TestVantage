import assert from 'node:assert/strict'
import {
  buildLineDataFromTesseractPage,
  parseMcqFromLineData,
  lineDataToDocumentText,
} from '../src/utils/ocrLineData.js'
import { setLastOcrLineData, tryMcqParseFromCachedLineData } from '../src/utils/ocrLineDataCache.js'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import { pickBestOcrCandidate, scoreOcrCandidate } from '../src/utils/pickBestOcrCandidate.js'

/** @param {string} text @param {number} y0 @param {number} y1 */
function mockLine(text, y0, y1) {
  return {
    text,
    bbox: { x0: 40, y0, x1: 760, y1 },
    confidence: 88,
    words: [{ text, confidence: 88 }],
  }
}

const inverseMcqPage = {
  width: 800,
  height: 1100,
  lines: [
    mockLine('Let f(x) = ln(x + sqrt(x^2+1)). If g(f(x)) = x for all x', 120, 165),
    mockLine('then g(2) is', 175, 210),
    mockLine('(A) Ys', 880, 910),
    mockLine('(B) e^2', 920, 950),
    mockLine('(C) (e^2-e^{-2})/2', 960, 990),
    mockLine('(D) e^{-2}', 1000, 1030),
  ],
}

const lineData = buildLineDataFromTesseractPage(inverseMcqPage, { width: 800, height: 1100 })
assert.ok(lineData.length >= 6, 'all lines captured')
assert.equal(lineData.filter((l) => l.type === 'mcq_option').length, 4, 'four option lines typed')
assert.ok(lineData.every((l) => l.included), 'lines included when confident')

const doc = lineDataToDocumentText(lineData)
assert.match(doc, /g\(f\(x\)\)/)
assert.match(doc, /\(A\) Ys/)

const geo = parseMcqFromLineData(lineData)
assert.ok(geo, 'geometry MCQ parse')
assert.equal(geo.optionsFound, 4, 'four options from geometry')
assert.match(geo.text, /g\(2\)/)
assert.match(geo.options[1] ?? '', /e\^2/)

const fakeFile = {}
setLastOcrLineData(fakeFile, lineData)
const cached = tryMcqParseFromCachedLineData(fakeFile)
assert.equal(cached?.optionsFound, 4)

const garbledOcr = `Let f(x) = ln(x + sqrt(x^2+1)). If g(f(x)) = x for all x then g(2) is
- e' +e" 2 ee" -2 (A) Ys B)e © 5 Dye`
const extracted = processMcqUploadExtract(garbledOcr, { sourceFile: fakeFile })
assert.ok(
  extracted.pass === 'mathpix-line-geometry' || extracted.pass === 'document-structure',
  `geometry/structure beats garbled flat OCR (got ${extracted.pass})`,
)
assert.equal(extracted.found, 4)

const plain = 'Question stem only\n(A) one\n(B) two'
const lineMcq = pickBestOcrCandidate([
  { text: plain, source: 'hybrid:merged' },
  {
    text: `${geo.text}\n(A) ${geo.options[0]}\n(B) ${geo.options[1]}\n(C) ${geo.options[2]}\n(D) ${geo.options[3]}`,
    source: 'mathpix-style:mcq-lines',
  },
])
assert.equal(lineMcq.source, 'mathpix-style:mcq-lines')
assert.ok(scoreOcrCandidate(lineMcq.text, { source: 'mathpix-style:lines' }) > scoreOcrCandidate(plain))

console.log('test-mathpix-style-line-ocr: ok')

import assert from 'node:assert/strict'
import {
  buildMatrixSupplementCropRect,
  sliceMatrixSupplementOcrText,
} from '../src/utils/matrixSupplementCrop.js'
import {
  countFilledMatrixRowsNormalized,
  resolveMatchColumnUpload,
  supplementMatrixRowsFromCachedOcr,
} from '../src/utils/parseMatchColumnUpload.js'

const r800 = buildMatrixSupplementCropRect(800, 1200)
assert.equal(r800.x, 0)
assert.equal(r800.y, 360)
assert.equal(r800.width, 800)
assert.equal(r800.height, 840)

const rSmall = buildMatrixSupplementCropRect(400, 100)
assert.equal(rSmall.y, 30)
assert.equal(rSmall.height, 80, 'minimum crop height')

const ocrBlob = [
  '11. Match the Column',
  'Column-I',
  '(A) If p terms G.P. then p,q,r will be in',
  '(B) If a,b,c,d inequality then a,b,c,d will be in',
  'Column-II',
  '(P) Arithmetic progression',
  '(Q) Geometric progression',
  'If a,b,c,d are four different positive numbers in G.P. then fraction logs will be in',
  '(D) If a_1,a_2,a_3 AP then always in',
  '(R) Harmonic progression',
].join('\n')
const slice = sliceMatrixSupplementOcrText(ocrBlob)
assert.ok(slice.includes('four different positive numbers'), 'slice keeps lower row C text')
assert.ok(!slice.startsWith('11. Match'), 'slice drops header lines')

const sparse = resolveMatchColumnUpload(ocrBlob)
const filled = supplementMatrixRowsFromCachedOcr(ocrBlob, sparse)
assert.ok(countFilledMatrixRowsNormalized(filled) >= 3, 'cached supplement recovers row C')
assert.match(filled.matrixRows[2] ?? '', /four different positive/i, 'row C body present')

console.log('test-matrix-supplement: ok')

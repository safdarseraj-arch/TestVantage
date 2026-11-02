import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWorker } from 'tesseract.js'
import { polishExtractedText } from '../src/utils/ocrExtractPolish.js'
import {
  looksLikeMatchColumnUpload,
  resolveMatchColumnUpload } from '../src/utils/parseMatchColumnUpload.js'

const img = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'matrix-quadratic-user.png')
const worker = await createWorker('eng')
const { data } = await worker.recognize(img)
await worker.terminate()

const raw = data.text.replace(/\r\n/g, '\n').trim()
console.log('--- RAW OCR ---')
console.log(raw.slice(0, 1200))
console.log('---')

const polished = polishExtractedText(raw, 'builtin')
console.log('looksLike', looksLikeMatchColumnUpload(raw))
const p = resolveMatchColumnUpload(raw, polished)
console.log('parsed', p ? 'yes' : 'no')
if (p) {
  p.matrixRows.forEach((r, i) => console.log(`row ${i}:`, r.slice(0, 100)))
  console.log('cols', p.matrixCols)
}

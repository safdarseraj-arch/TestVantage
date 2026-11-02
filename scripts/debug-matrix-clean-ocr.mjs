import { createWorker } from 'tesseract.js'
import { fixOcrStructure } from '../src/utils/fixOcrStructure.js'
import { polishExtractedText } from '../src/utils/ocrExtractPolish.js'
import { stripUploadUiOcr } from '../src/utils/stripUploadUiOcr.js'
import {
  preprocessMatchColumnOcr,
  resolveMatchColumnUpload,
} from '../src/utils/parseMatchColumnUpload.js'

const img = process.argv[2] || './scripts/fixtures/matrix-quadratic-clean.png'
const worker = await createWorker('eng')
const { data } = await worker.recognize(img)
await worker.terminate()

let raw = data.text.replace(/\r\n/g, '\n').trim()
raw = stripUploadUiOcr(fixOcrStructure(raw))
const polished = polishExtractedText(raw, 'builtin')
const pre = preprocessMatchColumnOcr(raw)

console.log('--- RAW (first 800) ---')
console.log(raw.slice(0, 800))
console.log('--- PRE (first 800) ---')
console.log(pre.slice(0, 800))

const p = resolveMatchColumnUpload(raw, polished)
if (!p) {
  console.log('PARSE FAILED')
  process.exit(1)
}
p.matrixRows.forEach((r, i) => {
  console.log(`\nROW ${String.fromCharCode(65 + i)} (${r.length} chars):`)
  console.log(r)
})
console.log('\nCOLS', p.matrixCols)

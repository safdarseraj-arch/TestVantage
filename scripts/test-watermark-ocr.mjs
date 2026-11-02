import assert from 'node:assert/strict'
import {
  stripImageWatermarkOcr,
  stripLeadingOcrWatermarkNoise,
  filterPdfTextItemsDropWatermarks,
  isPdfTextItemWatermark,
  stripPdfExtractWatermarks,
  looksLikeWatermarkPhrase,
} from '../src/utils/stripImageWatermarkOcr.js'
import { fixOcrStructure } from '../src/utils/fixOcrStructure.js'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { pdfItemsToPolishedText } from '../src/utils/pdfMathTextLayer.js'
import { migrateStoredQuestionText } from '../src/utils/migrateStoredQuestions.js'

const z5Core =
  "eo elu eld _g Let a, B, 7, & are distinct imaginary roots of 1° = 1, then find the value of [¢\" e* e¥'-e™| is- CU Sr (A) 0 B)e 1 D)e'"

assert.ok(
  stripLeadingOcrWatermarkNoise(z5Core).startsWith('Let a, B'),
  'strip leading diagonal watermark letters before Let',
)

const watermarked = `TestVantages — Not for resale
www.jeemath.in
Scanned with CamScanner
${z5Core}
Downloaded from telegram`

const stripped = stripImageWatermarkOcr(watermarked)
assert.ok(!/camscanner|telegram|jeemath/i.test(stripped), 'remove watermark lines')
assert.ok(stripped.includes('Let a, B'), 'keep question stem')

const viaStructure = fixOcrStructure(watermarked)
const parsed = parseSingleQuestionUpload(polishOcrText(viaStructure), viaStructure)
assert.match(parsed.text ?? '', /\\begin\{vmatrix\}/, 'watermarked z5 still repairs to vmatrix')
assert.deepEqual(parsed.options, ['0', '$e$', '1', '$e^5$'])

assert.equal(stripImageWatermarkOcr('0'), '0', 'keep numeric MCQ option 0')
assert.equal(stripImageWatermarkOcr('1'), '1', 'keep numeric MCQ option 1')
assert.equal(stripImageWatermarkOcr('$e$'), '$e$', 'keep LaTeX MCQ option')

const healed = migrateStoredQuestionText({
  text: 'Let $\\alpha, \\beta, \\gamma, \\delta$ are distinct imaginary roots of $z^5 = 1$, then value of $$\\begin{vmatrix} e^\\alpha & e^{2\\alpha} & e^{3\\alpha+1} - e^{-\\delta} \\\\ e^\\beta & e^{2\\beta} & e^{3\\beta+1} - e^{-\\delta} \\\\ e^\\gamma & e^{2\\gamma} & e^{3\\gamma+1} - e^{-\\delta} \\end{vmatrix}$$ is',
  options: ['', '$e$', '', '$e^5$'],
  questionType: 'single_correct',
})
assert.deepEqual(healed.options, ['0', '$e$', '1', '$e^5$'], 'heal empty z5 options on bank load')

// Real stems must survive (brand words inside sentences are NOT watermarks)
assert.match(
  stripImageWatermarkOcr('Find the resonance frequency of the LCR circuit'),
  /resonance frequency/i,
)
assert.match(
  stripImageWatermarkOcr('A brilliant student solved the problem'),
  /brilliant student/i,
)
assert.match(
  stripImageWatermarkOcr('In Allen modules the value of g is 10'),
  /Allen modules/i,
)
assert.match(
  stripImageWatermarkOcr('Resonance occurs when XL = XC'),
  /Resonance occurs when/i,
)
assert.match(
  stripImageWatermarkOcr('Choose the correct option'),
  /Choose the correct/i,
)
assert.equal(looksLikeWatermarkPhrase('unacademy'), true)
assert.equal(looksLikeWatermarkPhrase('Find the resonance frequency'), false)

const rot = Math.cos(Math.PI / 4)
const pdfItems = [
  { str: 'www.unacademy.com', transform: [1, 0, 0, 1, 10, 700] },
  { str: 'FREE PDF', transform: [rot, rot, -rot, rot, 100, 400] },
  { str: 'Let f(x) = x^2', transform: [1, 0, 0, 1, 40, 500] },
  { str: '(A) 1', transform: [1, 0, 0, 1, 40, 460] },
]
assert.equal(isPdfTextItemWatermark(pdfItems[0]), true)
assert.equal(isPdfTextItemWatermark(pdfItems[1]), true)
assert.equal(isPdfTextItemWatermark(pdfItems[2]), false)
assert.equal(filterPdfTextItemsDropWatermarks(pdfItems).length, 2)
const pdfText = pdfItemsToPolishedText(pdfItems)
assert.match(pdfText, /Let f\(x\)/i)
assert.doesNotMatch(pdfText, /unacademy|FREE PDF/i)
assert.equal(
  stripPdfExtractWatermarks('Confidential\nLet x = 1\nwww.telegram.com'),
  stripImageWatermarkOcr('Confidential\nLet x = 1\nwww.telegram.com'),
)

console.log('test-watermark-ocr: ok')

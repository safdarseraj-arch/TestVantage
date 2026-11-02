import assert from 'node:assert/strict'
import {
  buildStemBandRegion,
  detectMathRegionsFromPixels,
  mergeRegionSources,
} from '../src/utils/mathRegionDetect.js'
import {
  looksLikeGarbledMathLine,
  mergeHybridOcrText,
  normalizeTexifyLatex,
} from '../src/utils/hybridOcrMerge.js'
import {
  bboxToRect,
  looksLikeMathLine,
  looksLikeMathWord,
  mathOptionRegionsFromTesseractPage,
  mathRegionsFromTesseractPage,
} from '../src/utils/tesseractMathRegions.js'
import { layoutTextFromTesseractPage } from '../src/utils/tesseractLayoutText.js'
import { pickHybridFinalResult } from '../src/utils/hybridOcrFinalize.js'
import { pageNeedsOnnxBoost } from '../src/utils/hybridOcrNeeds.js'
import { tryRecoverSingleUploadParse } from '../src/utils/tryRecoverSingleUploadParse.js'
import { isLocalMathOcrEnabled, resolveOcrEngine } from '../src/utils/ocrSettings.js'
import {
  MATH_OCR_MODEL_FALLBACK,
  MATH_OCR_MODEL_PRIMARY,
} from '../src/utils/mathOcrConstants.js'

assert.equal(MATH_OCR_MODEL_PRIMARY, 'onnx-community/nougat-latex-base-ONNX')
assert.equal(MATH_OCR_MODEL_FALLBACK, 'Xenova/texify2')

assert.equal(
  resolveOcrEngine({ mode: 'standard', mathpixAppId: '', mathpixAppKey: '', useLocalMathOcr: true }),
  'mathpix',
)
assert.ok(isLocalMathOcrEnabled({ mode: 'standard', useLocalMathOcr: true }))
assert.ok(isLocalMathOcrEnabled({ mode: 'advanced', useLocalMathOcr: true }))
assert.equal(
  resolveOcrEngine({ mode: 'advanced', useLocalMathOcr: true }),
  'mathpix',
)
assert.equal(
  resolveOcrEngine({ mode: 'advanced', useLocalMathOcr: false }),
  'mathpix',
)

const stemBand = buildStemBandRegion(1000, 1400)
assert.ok(stemBand.width > 900 && stemBand.height > 900 && stemBand.height < 1200)

assert.ok(looksLikeGarbledMathLine('20m! s 8 g < = = 4 Ss^3 +-D-'))
assert.ok(!looksLikeGarbledMathLine('If Distance D between the towers is x meter'))
assert.ok(!looksLikeGarbledMathLine('Value of sum N_p is'))

const tex = normalizeTexifyLatex('$$\\frac{1}{x}=\\frac{1}{c}$$')
assert.match(tex, /\$.*\\frac/)

const prose = `Two friends A & B playing a game.
20m! s 8 g < = = 4
If Distance D between the towers is x meter, then the value x/100`
const merged = mergeHybridOcrText(prose, [
  {
    rect: { y: 10 },
    latex: '$P=\\begin{bmatrix}1&0\\\\2005&1\\end{bmatrix}$',
    lineText: '20m! s 8 g',
  },
])
assert.match(merged, /\\begin\{bmatrix\}/)
assert.match(merged, /If Distance D/)
assert.ok(!/20m! s 8 g/.test(merged))

const mockPage = {
  lines: [
    {
      text: 'Two friends A & B playing a game.',
      confidence: 92,
      bbox: { x0: 40, y0: 20, x1: 360, y1: 44 },
      words: [
        { text: 'Two', confidence: 95, in_dictionary: true, bbox: { x0: 40, y0: 20, x1: 70, y1: 44 } },
        { text: 'friends', confidence: 94, in_dictionary: true, bbox: { x0: 72, y0: 20, x1: 130, y1: 44 } },
      ],
    },
    {
      text: '20m! s 8 g < = = 4',
      confidence: 48,
      bbox: { x0: 50, y0: 80, x1: 280, y1: 118 },
      words: [
        { text: '20m!', confidence: 40, in_dictionary: false, is_numeric: false, bbox: { x0: 50, y0: 80, x1: 90, y1: 118 } },
        { text: '8', confidence: 55, in_dictionary: false, is_numeric: true, bbox: { x0: 110, y0: 80, x1: 125, y1: 118 } },
        { text: '=', confidence: 50, in_dictionary: false, bbox: { x0: 150, y0: 80, x1: 165, y1: 118 } },
        { text: '4', confidence: 52, in_dictionary: false, is_numeric: true, bbox: { x0: 200, y0: 80, x1: 215, y1: 118 } },
      ],
    },
    {
      text: 'If $P=\\begin{bmatrix}1&0\\\\2005&1\\end{bmatrix}$ find X',
      confidence: 70,
      bbox: { x0: 45, y0: 200, x1: 340, y1: 248 },
      words: [
        { text: 'If', confidence: 90, in_dictionary: true, bbox: { x0: 45, y0: 200, x1: 60, y1: 248 } },
        { text: 'P=', confidence: 65, in_dictionary: false, bbox: { x0: 80, y0: 200, x1: 110, y1: 248 } },
        { text: '2005', confidence: 60, in_dictionary: false, is_numeric: true, bbox: { x0: 140, y0: 200, x1: 180, y1: 248 } },
      ],
    },
    {
      text: '(A) 1',
      confidence: 88,
      bbox: { x0: 50, y0: 520, x1: 100, y1: 548 },
      words: [{ text: '(A)', confidence: 90, in_dictionary: false, bbox: { x0: 50, y0: 520, x1: 78, y1: 548 } }],
    },
    {
      text: '(B) sqrt(3)/2',
      confidence: 52,
      bbox: { x0: 50, y0: 560, x1: 220, y1: 592 },
      words: [
        { text: '(B)', confidence: 88, in_dictionary: false, bbox: { x0: 50, y0: 560, x1: 78, y1: 592 } },
        { text: 'sqrt(3)/2', confidence: 45, in_dictionary: false, bbox: { x0: 90, y0: 560, x1: 180, y1: 592 } },
      ],
    },
  ],
}

assert.ok(looksLikeMathWord({ text: '20m!', in_dictionary: false, confidence: 40 }))
assert.ok(!looksLikeMathWord({ text: 'friends', in_dictionary: true, confidence: 94 }))
assert.ok(looksLikeMathLine(mockPage.lines[1]))
assert.ok(!looksLikeMathLine(mockPage.lines[0]))

assert.equal(
  layoutTextFromTesseractPage(mockPage).split('\n').length,
  5,
  'layout text preserves line breaks like Mathpix mmd',
)

const tessRegions = mathRegionsFromTesseractPage(mockPage)
assert.ok(tessRegions.length >= 2, 'tesseract should route garbled + matrix lines')

const optRegions = mathOptionRegionsFromTesseractPage(mockPage)
assert.ok(optRegions.length >= 1, 'garbled MCQ option rows should get ONNX crops')
assert.ok(optRegions.some((r) => /sqrt/.test(r.lineText ?? '')), 'option band includes (B) sqrt row')
assert.ok(tessRegions.every((r) => r.width >= 18 && r.lineText))
const garbledRegion = tessRegions.find((r) => /20m/.test(r.lineText ?? ''))
assert.ok(garbledRegion, 'garbled line should get a tight bbox')
const garbledRect = bboxToRect({ x0: 50, y0: 80, x1: 280, y1: 118 })
assert.ok(garbledRegion.width <= garbledRect.width + 30)

const pixelOnly = [{ x: 0, y: 0, width: 400, height: 60, score: 10, source: 'pixel:band' }]
const mergedRegions = mergeRegionSources(tessRegions, pixelOnly, 12)
assert.ok(mergedRegions.length >= tessRegions.length)
assert.ok(mergedRegions.some((r) => r.source?.startsWith('tesseract')))

/** Sparse horizontal strokes (equation-like), not solid blocks. */
function paintEquationBand(rgba, w, h, x, y, rw, rh) {
  for (let yy = y; yy < y + rh; yy += 3) {
    for (let xx = x; xx < x + rw; xx += 4) {
      const i = (yy * w + xx) * 4
      rgba[i] = 20
      rgba[i + 1] = 20
      rgba[i + 2] = 20
      rgba[i + 3] = 255
    }
  }
}

const w = 400
const h = 300
const rgba = new Uint8ClampedArray(w * h * 4).fill(255)
paintEquationBand(rgba, w, h, 80, 40, 240, 50)
paintEquationBand(rgba, w, h, 60, 140, 280, 45)

const regions = detectMathRegionsFromPixels(rgba, w, h)
assert.ok(regions.length >= 1, 'should detect ink bands as math regions')
assert.ok(regions.every((r) => r.width >= 18 && r.height >= 18))

const brokenOnnx =
  'If P matrix (A) $1$ (B) $\\frac{1}{2}$ $1$ (C) 3 (D) 4'
const plainMcq =
  'If P = [ sqrt(3)/2 1/2 -1/2 sqrt(3)/2 ] find X.\n(A) 1\n(B) 2\n(C) 3\n(D) 4'
const picked = pickHybridFinalResult(plainMcq, brokenOnnx, mockPage)
assert.ok(!/\$1\$1\$/.test(picked), 'Mathpix-style pick avoids broken ONNX sqrt in MCQs')
assert.match(picked, /sqrt\(3\)|\\frac\{\\sqrt/, 'prefer synthesis or layout when ONNX breaks options')

assert.ok(pageNeedsOnnxBoost('Column-I Column-II (A) a^2 - 4a + 3'), 'matrix match triggers ONNX')
assert.ok(pageNeedsOnnxBoost('9 term expansion log_2 x 495'), 'binomial log495 triggers ONNX')
assert.equal(
  pageNeedsOnnxBoost('Find det(A) where A is a 3x3 matrix'),
  false,
  'determinant golden repair skips ONNX',
)
assert.ok(pageNeedsOnnxBoost('Evaluate the limit as x tends to 0'), 'limit triggers ONNX')
assert.ok(pageNeedsOnnxBoost('The graph of y = f(x) is shown below'), 'graph question triggers ONNX')
assert.equal(
  pageNeedsOnnxBoost(
    "eo elu eld Let a, B, 7, & are distinct imaginary roots of 1° = 1, then find the value of",
  ),
  false,
  'z5 determinant golden repair skips ONNX',
)
assert.ok(pageNeedsOnnxBoost('Fe2+ reacts with CuSO4 in aqueous solution'), 'chemistry triggers ONNX')
assert.equal(
  pageNeedsOnnxBoost('The boiling point of ethanol is compared with methanol.\n(A) 65\n(B) 78'),
  false,
  'plain prose chemistry MCQ does not force ONNX',
)

const recover = tryRecoverSingleUploadParse(
  'If x=1 then\n(A) 1\n(B) 2\n(C) 3\n(D) 4',
  { minFound: 0 },
)
assert.ok(recover && recover.found >= 4, 'second-pass parse recovers MCQ options')

console.log('test-hybrid-math-ocr: ok')

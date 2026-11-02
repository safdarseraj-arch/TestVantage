import assert from 'node:assert/strict'
import { pickBestOcrCandidate, scoreOcrCandidate } from '../src/utils/pickBestOcrCandidate.js'
import { synthesizeLatexFromPlainOcr } from '../src/utils/synthesizeLatexFromPlainOcr.js'
import { finalizeOcrText } from '../src/utils/inferMathFromPlainOcr.js'
import {
  resolveOcrEngine,
  loadOcrSettings,
  shouldUseMathpixOcr,
} from '../src/utils/ocrSettings.js'
import { polishExtractedText } from '../src/utils/ocrExtractPolish.js'
import { stripUploadUiOcr, collapseSpacedOcrLetters } from '../src/utils/stripUploadUiOcr.js'
import { fixOcrStructure } from '../src/utils/fixOcrStructure.js'
import { repairNestedMathrmUnits } from '../src/utils/fixOcrMathSymbols.js'
import { stripOcrStemTailJunk } from '../src/utils/passage.js'

const garbage = 'llllllll random noise without math'
const mcqPlain =
  'If P = [ sqrt(3)/2 1/2 -1/2 sqrt(3)/2 ] and A = [ 1 1 0 1 ] find X.\n(A) 1\n(B) 2\n(C) 3\n(D) 4'
const mcqLatex =
  'If $P=\\begin{bmatrix}\\frac{\\sqrt{3}}{2} & \\frac{1}{2} \\\\ -\\frac{1}{2} & \\frac{\\sqrt{3}}{2}\\end{bmatrix}$ (A) 1 (B) 2'

const picked = pickBestOcrCandidate([
  { text: garbage, source: 'tesseract:AUTO' },
  { text: finalizeOcrText(mcqPlain), source: 'builtin:preprocessed' },
  { text: mcqLatex, source: 'tesseract:SINGLE_BLOCK' },
])
assert.ok(picked.score > scoreOcrCandidate(garbage), 'must prefer math MCQ over garbage')
assert.match(picked.text, /\\frac\{\\sqrt\{3\}\}\{2\}|\\begin\{bmatrix\}/, 'winner should have synthesized math')

const mcqBrokenOnnx = pickBestOcrCandidate([
  { text: '(A) $1$ (B) $\\frac{1}{2}$ $1$ (C) 3 (D) 4', source: 'hybrid:merged' },
  { text: finalizeOcrText(mcqPlain), source: 'builtin:synthesis' },
])
assert.equal(
  mcqBrokenOnnx.source,
  'builtin:synthesis',
  'Mathpix-style: MCQ with broken sqrt prefers synthesis over hybrid merge',
)

const synthesized = synthesizeLatexFromPlainOcr(
  'If P = [ sqrt(3)/2 1/2 -1/2 sqrt(3)/2 ], A = [ 1 1 0 1 ], Q = PAP^T',
)
assert.match(synthesized, /\\begin\{bmatrix\}/, 'bracket matrix should become bmatrix')
assert.match(synthesized, /\\\\/, 'flat matrix should gain row breaks')

const flatBmatrix = synthesizeLatexFromPlainOcr(
  '$P=\\begin{bmatrix}\\frac{\\sqrt{3}}{2} & \\frac{1}{2} & -\\frac{1}{2} & \\frac{\\sqrt{3}}{2}\\end{bmatrix}$',
)
assert.match(flatBmatrix, /\\\\/, 'flat bmatrix body should get row breaks')

const towerPhysics = finalizeOcrText(
  'Two friends A & B playing a game. If the balls collide at P and O is origin (g=10 m/s^2) with velocity 20sqrt(2) m/s at 45 degrees.',
)
assert.match(towerPhysics, /\\mathrm\{m\/s\}/, 'm/s should become LaTeX')
assert.match(towerPhysics, /\\sqrt\{2\}/, 'sqrt(2) should become LaTeX')
assert.match(towerPhysics, /\$[^$]*g[^$]*\$/, 'g=10 m/s^2 should be wrapped in math delimiters')

const base = { mode: 'standard', mathpixAppId: '', mathpixAppKey: '', useLocalMathOcr: true }
assert.equal(resolveOcrEngine({ ...base, mode: 'standard' }), 'mathpix')
assert.equal(resolveOcrEngine({ ...base, mode: 'auto' }), 'mathpix')
assert.equal(
  resolveOcrEngine({ ...base, mode: 'standard', mathpixAppId: 'id', mathpixAppKey: 'key' }),
  'mathpix',
  'PDF/image OCR is always Mathpix',
)
assert.equal(
  resolveOcrEngine({ ...base, mode: 'advanced', mathpixAppId: 'id', mathpixAppKey: 'key' }),
  'mathpix',
  'Advanced mode still uses Mathpix for page OCR',
)
assert.equal(
  resolveOcrEngine({ ...base, mode: 'advanced', useLocalMathOcr: false }),
  'mathpix',
)
assert.equal(
  resolveOcrEngine({ ...base, useLocalMathOcr: false }),
  'mathpix',
)
assert.equal(shouldUseMathpixOcr(), true)

const plainPhysics =
  'Two friends playing a game. g=10 m/s^2 velocity 20sqrt(2) m/s at 45 degrees.'
const polishedPhysics = polishExtractedText(plainPhysics, 'builtin')
assert.match(polishedPhysics, /\\sqrt\{2\}/, 'upload polish must synthesize sqrt LaTeX')
assert.match(polishedPhysics, /\\mathrm\{m\/s\}/, 'upload polish must synthesize m/s LaTeX')

try {
  const settings = loadOcrSettings()
  assert.equal(
    resolveOcrEngine({ ...settings, mode: 'standard', useLocalMathOcr: true }),
    'mathpix',
  )
} catch {
  /* import.meta.env absent outside Vite */
}

const uiNoise = `Drop image or PDF — fill form
Hybrid OCR + LaTeX fills this after image upload.
Two friends A & B playing a game of collision`
const stripped = stripUploadUiOcr(uiNoise)
assert.ok(!/Drop image/i.test(stripped), 'UI chrome lines removed')
assert.match(stripped, /Two friends A & B/, 'passage prose kept')

const spaced = 'L e t A=\\begin {bmatrix 2 & 0 & 1'
const collapsed = collapseSpacedOcrLetters(spaced)
assert.match(collapsed, /^Let A=/, 'spaced OCR letters collapsed')

const forall = collapseSpacedOcrLetters('defined f o r a l l x ∈ R')
assert.match(forall, /for all x/, 'forall prose repaired')

const structured = fixOcrStructure(`Drop image or PDF\nL e t $A=1$\nParse question & options`)
assert.ok(!/Drop image/i.test(structured), 'fixOcrStructure strips UI')
assert.match(structured, /Let \$A=1\$/, 'fixOcrStructure collapses letters')

const garbledWind =
  'If wind starts blowing horizontally, then co-ordinates of point of collision will be (x,y) then find 1^\\circ\\mathbf{\\Phi} ## 1 Introduction The _Fractional State_'
const windClean = stripOcrStemTailJunk(garbledWind)
assert.ok(!/Introduction|Fractional/i.test(windClean), 'stem tail junk stripped')
assert.match(windClean, /then find/i, 'wind stem keeps then find')

const nestedMs = repairNestedMathrmUnits('(g=10 $\\mathrm{$\\mathrm{m/s}$}$?)')
assert.ok(!/\$\\mathrm\{\$\\mathrm/.test(nestedMs), 'no double mathrm wrap')
assert.ok(nestedMs.includes('\\mathrm{m/s}^2'), 'nested m/s LaTeX repaired to m/s^2')
assert.ok(!nestedMs.includes('?$'), 'trailing ? inside math removed')

console.log('test-builtin-ocr: ok')

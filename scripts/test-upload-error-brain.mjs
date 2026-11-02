import assert from 'node:assert/strict'
import {
  detectUploadErrors,
  autoRectifyUpload,
  assessUploadQualityFull,
} from '../src/utils/uploadErrorBrain.js'
import { countRealMcqOptions } from '../src/utils/stemDiagramDetect.js'
import { runAiUploadAssist } from '../src/utils/aiUploadAssist.js'

const trigRaw = `Let f (x) = sin²x + cos⁴x + 2 and g (x) = cos (cos x) + cos (sin x). Also let fundamental period of f (x) and gfl(x) be T₁ and T₂ respectively then (A) T₁ = 2T₂ (B) 2T₁ = T₂ (C) T₁ = T₂ (D) T₁ = 4T₂`

const mergedOpts = ['$T_1 = 2T_2$', '2T_1 = T_2 (C) T_1 = T_2', '', '']
const detectMerged = detectUploadErrors({
  stem: 'Let f(x)...',
  options: mergedOpts,
  rawOcr: trigRaw,
  questionType: 'single_correct',
})
assert.ok(
  detectMerged.some((e) => e.id === 'option-embedded-marker' || e.id === 'options-horizontal-ocr'),
  'detects merged B+C or horizontal options',
)

const fixed = autoRectifyUpload({
  stem: 'Let $f(x) = \\sin \\pi x + \\cos \\pi x + 2$...',
  options: mergedOpts,
  rawOcr: trigRaw,
  questionType: 'single_correct',
})
assert.equal(countRealMcqOptions(fixed.stem, fixed.options), 4, 'rectifies to 4 options')
assert.match(fixed.stem, /\\sin\^2|\\sin\^\{2\}/)
assert.ok(!/\(C\)/i.test(fixed.options[1] ?? ''), 'B no longer contains C marker')
assert.ok(fixed.improved)

const quality = assessUploadQualityFull({
  stem: fixed.stem,
  options: fixed.options,
  rawOcr: trigRaw,
  detectedType: 'single_correct',
  questionType: 'single_correct',
})
assert.ok(quality.readyToSave || quality.confidence >= 70, 'quality improves after rectify')

const assist = runAiUploadAssist(trigRaw, { hasSourceImage: true })
assert.equal(countRealMcqOptions(assist.stem, assist.options), 4)
assert.match(assist.stem ?? '', /\\sin\^2|\\sin\^\{2\}/)

const minSinGarbled = `Period of function f(x) = \\min\\{\\sin x, b\\} + \\frac{x}{pi} - \\frac{x}{pi}(where [\\cdot] denotes greatest integer function) is - \\frac{1}{2} . \\backslash\\text{begin}\\{\\text{tabular}\\}`
const minDetect = detectUploadErrors({
  stem: minSinGarbled,
  options: ['', '', '', ''],
  rawOcr: minSinGarbled,
  questionType: 'single_correct',
})
assert.ok(
  minDetect.some((e) => e.id === 'min-sin-abs-period' || e.id === 'stem-tabular-garbage'),
  'smart brain detects min-sin-abs period garble',
)

const minFixed = autoRectifyUpload({
  stem: minSinGarbled,
  options: ['', '', '', ''],
  rawOcr: minSinGarbled,
  questionType: 'single_correct',
})
assert.equal(countRealMcqOptions(minFixed.stem, minFixed.options), 4, 'brain repairs min-sin-abs to 4 options')
assert.ok(minFixed.improved)
assert.ok(minFixed.steps.some((s) => /repair plugin/i.test(s)), 'logs plugin repair step')

console.log('test-upload-error-brain: ok')

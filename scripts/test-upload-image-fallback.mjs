/**
 * Image fallback when OCR fails — unit checks (no browser).
 */
import assert from 'node:assert/strict'
import {
  shouldUseUploadImageFallback,
  countGarbledMcqOptions,
  adjustQualityAfterImageFallback,
} from '../src/utils/uploadImageFallback.js'
import {
  assessUploadQuality,
  correctUploadTypeForOcr,
  isMcqLikeFromOcr,
  cleanStemMergedOptionGarbage,
  inferUploadQuestionType,
} from '../src/utils/classifyUploadFromOcr.js'

const TETRA_STEM =
  "If ABCD is regular tetrahedron with length of any edge '$\\ell$', then the minimum distance of any vertex from the opposite face is - 2 3 2, 1 -=/"
const TETRA_RAW =
  "If ABCD is regular tetrahedron with length of any edge l, then the minimum distance of any vertex from the opposite face is - 2 3 2 (D) sqrt(3)"

assert.equal(correctUploadTypeForOcr('integer', { stem: TETRA_STEM, rawOcr: TETRA_RAW, options: ['', '', '', ''] }), 'single_correct')
assert.equal(cleanStemMergedOptionGarbage(TETRA_STEM), "If ABCD is regular tetrahedron with length of any edge '$\\ell$', then the minimum distance of any vertex from the opposite face is -")
assert.ok(isMcqLikeFromOcr({ stem: TETRA_STEM, rawOcr: TETRA_RAW, options: ['', '', '', ''] }))
assert.equal(inferUploadQuestionType({ stem: TETRA_STEM, options: ['', '', '', ''], rawOcr: TETRA_RAW, found: 0 }), 'single_correct')

assert.equal(
  countGarbledMcqOptions(['2 3 2', '1 -=/', '@ 2 ® 2', '']),
  3,
  'garbled option OCR',
)

assert.equal(
  shouldUseUploadImageFallback({
    sourceUrl: 'data:image/png;base64,abc',
    stem: 'If ABCD is a regular tetrahedron with edge length l, then the minimum distance is',
    options: ['2 3 2', '1 -=/', '(C) garbled', '(D) √3'],
    rawOcr: 'tetrahedron (A) 2 3 2 (B) 1 -=/ (C) (D)',
    questionType: 'single_correct',
    optionsAutoCropped: 4,
  }),
  true,
  'garbled options with source image triggers fallback',
)

assert.equal(
  shouldUseUploadImageFallback({
    sourceUrl: 'data:image/png;base64,abc',
    stem: 'Find the value of x when 2x + 3 = 7',
    options: ['1', '2', '3', '4'],
    rawOcr: 'Find x (A) 1 (B) 2 (C) 3 (D) 4',
    questionType: 'single_correct',
  }),
  false,
  'clean text MCQ does not need fallback',
)

const badQuality = assessUploadQuality({
  detectedType: 'single_correct',
  stem: 'Tetrahedron question',
  options: ['garbled', 'more garbled', '', ''],
  rawOcr: '(A) junk',
  hasSourceImage: true,
})
const adjusted = adjustQualityAfterImageFallback(badQuality, {
  imageFallbackApplied: true,
  optionImages: ['a', 'b', 'c', 'd'],
  questionImage: 'stem',
})
assert.ok(adjusted.readyToSave, 'image fallback should allow save after crops')
assert.ok(
  adjusted.issues.some((i) => i.id === 'image-fallback'),
  'info issue for image fallback',
)

console.log('test-upload-image-fallback: ok')

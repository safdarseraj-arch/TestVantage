import assert from 'node:assert/strict'
import {
  buildJeeUploadTestCases,
  flattenJeeAdvancedChapters,
  JEE_UPLOAD_QUESTION_TYPES,
  buildGoogleImageSearchUrl,
} from '../src/utils/jeeUploadTestManifest.js'
import { classifyOcrUpload } from '../src/utils/jeeUploadTestClassify.js'

const chapters = flattenJeeAdvancedChapters()
assert.ok(chapters.length >= 70, 'expected 70+ PCM chapters')
assert.equal(JEE_UPLOAD_QUESTION_TYPES.length, 7)

const sample = buildJeeUploadTestCases({ mode: 'sample' })
assert.equal(sample.length, 10 * 7)

const full = buildJeeUploadTestCases({ mode: 'full' })
assert.equal(full.length, chapters.length * 7)

assert.match(buildGoogleImageSearchUrl('test'), /google\.com\/search\?tbm=isch/)

const scq = classifyOcrUpload(
  'Find x\n(A) 1\n(B) 2\n(C) 3\n(D) 4',
  'single_correct',
)
assert.ok(scq.ok, 'SCQ classify')

console.log('test-jee-upload-manifest: ok')

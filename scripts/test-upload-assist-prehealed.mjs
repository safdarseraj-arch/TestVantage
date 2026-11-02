/**
 * Guards the `preHealed` hand-off from QuestionBank's upload flow into
 * runFullUploadAssist. A scoping slip here shipped as "aiMcq is not defined"
 * and made every image upload fail after OCR had already finished.
 */
import assert from 'node:assert/strict'
import { runFullUploadAssist, iterativeUploadHeal } from '../src/utils/uploadOrchestrator.js'

const rawOcr =
  'A curve g(x) = [+ (l+x+ x? 6 (6x^2 + 5x + 4 ) dx is passing through origin, then: Ww w=t \u00ae ew=i \u00a9 en-l \u00ae een=i'

// Branch 1 — heavy heal ran, its result is forwarded as preHealed.
const healed = iterativeUploadHeal({
  stem: '',
  options: ['', '', '', ''],
  rawOcr,
  engine: 'builtin',
  questionType: 'single_correct',
  maxPasses: 2,
})
const withHeal = runFullUploadAssist(rawOcr, {
  engine: 'builtin',
  hasSourceImage: true,
  questionType: 'single_correct',
  stem: healed.stem,
  options: healed.options,
  preHealed: healed,
})
assert.ok(withHeal, 'assist runs with a real heal result')
assert.equal(withHeal.stem, healed.stem, 'healed stem is kept')
assert.ok(withHeal.quality, 'quality report present')

// Branch 2 — heavy heal was skipped to preserve cloud fields, so a stand-in
// preHealed is passed. The cloud stem and options must survive untouched.
const cloudStem =
  'A curve $g(x) = \\int x^{27}(1 + x + x^2)^6(6x^2 + 5x + 4)\\,dx$ is passing through origin, then:'
const cloudOptions = [
  '$g(1) = \\dfrac{3^{7}}{7}$',
  '$g(1) = \\dfrac{2^{7}}{7}$',
  '$g(-1) = \\dfrac{1}{7}$',
  '$g(-1) = \\dfrac{3^{7}}{14}$',
]
const preserved = runFullUploadAssist(rawOcr, {
  engine: 'cloud-vision',
  hasSourceImage: true,
  questionType: 'multiple_correct',
  stem: cloudStem,
  options: cloudOptions,
  preHealed: {
    stem: cloudStem,
    options: cloudOptions,
    questionType: 'multiple_correct',
    found: 4,
  },
})
assert.equal(preserved.stem, cloudStem, 'cloud stem is not re-healed away')
assert.deepEqual(preserved.options, cloudOptions, 'cloud options are not re-healed away')

// Branch 3 — a missing preHealed must still not throw.
const noPreHeal = runFullUploadAssist(rawOcr, {
  engine: 'builtin',
  hasSourceImage: true,
  questionType: 'single_correct',
  stem: '',
  options: ['', '', '', ''],
  preHealed: null,
})
assert.ok(noPreHeal, 'assist tolerates a null preHealed')

console.log('test-upload-assist-prehealed: ok')

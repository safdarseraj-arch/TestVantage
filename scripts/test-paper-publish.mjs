import assert from 'node:assert/strict'
import { ALPHA_BETA_DET_STEM } from '../src/utils/repairAlphaBetaRootsDeterminantMcqOcr.js'
import { persistQuestionForBank } from '../src/utils/persistUpload.js'
import { healStoredMcqQuestion } from '../src/utils/healStoredMcq.js'
import {
  computePaperQualityScore,
  validatePaperForPublish,
  isTestPublished,
  getTestPublishStatus,
  buildPaperReviewManifest,
  analyzeDifficultyProfile,
} from '../src/utils/paperPublish.js'

const good = persistQuestionForBank(
  healStoredMcqQuestion({
    questionType: 'single_correct',
    text: ALPHA_BETA_DET_STEM,
    options: ['125', '', '', ''],
    correctIndex: 0,
  }),
)

const bad = {
  questionType: 'single_correct',
  text: 'Pick one:',
  options: ['A only', '', '', ''],
}

const pubGood = validatePaperForPublish([good], { strictKeys: true })
assert.equal(pubGood.ok, true, 'complete keyed paper publishes')

const pubBad = validatePaperForPublish([bad], { strictKeys: true })
assert.equal(pubBad.ok, false, 'incomplete paper blocked')

const noKey = {
  questionType: 'single_correct',
  text: 'What is 2+2?',
  options: ['3', '4', '5', '6'],
}
const pubNoKey = validatePaperForPublish([noKey], { strictKeys: true })
assert.equal(pubNoKey.ok, false, 'missing correct index blocks strict publish')

const score = computePaperQualityScore([good])
assert.ok(score >= 75, 'good paper scores 75+')

assert.equal(isTestPublished({ id: 'custom-1' }), true, 'legacy custom = published')
assert.equal(getTestPublishStatus({ id: 'custom-1', status: 'draft' }), 'draft')

const manifest = buildPaperReviewManifest([good])
assert.equal(manifest.length, 1, 'review manifest')
assert.ok(analyzeDifficultyProfile([good]).count >= 1)

console.log('test-paper-publish: ok')

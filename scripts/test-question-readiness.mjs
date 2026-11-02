import assert from 'node:assert/strict'
import { ALPHA_BETA_DET_STEM } from '../src/utils/repairAlphaBetaRootsDeterminantMcqOcr.js'
import { persistQuestionForBank } from '../src/utils/persistUpload.js'
import { healStoredMcqQuestion } from '../src/utils/healStoredMcq.js'
import {
  validatePaperReadiness,
  validateQuestionReadiness,
} from '../src/utils/questionReadiness.js'
import { getQuestionReviewState, getQuestionPublishBlockers } from '../src/utils/questionBankReview.js'
import { LET_ABE_SMASHED_VMATRIX_STEM } from '../src/utils/repairSmashedProseVmatrixOcr.js'

const partialScq = persistQuestionForBank({
  questionType: 'single_correct',
  text: ALPHA_BETA_DET_STEM,
  options: ['125', '', '', ''],
})

const healed = persistQuestionForBank(healStoredMcqQuestion(partialScq))
const ready = validateQuestionReadiness(healed)
assert.equal(ready.ok, true, 'healed SCQ passes readiness')

const genericBad = {
  questionType: 'single_correct',
  text: 'Which of the following is correct about photosynthesis?',
  options: ['Only A', '', '', ''],
}
const badReady = validateQuestionReadiness(genericBad)
assert.equal(badReady.ok, false, 'generic partial SCQ blocked')

const paper = validatePaperReadiness([genericBad, healed])
assert.equal(paper.problems.length, 1, 'paper flags one bad question')

const imageScq = {
  questionType: 'single_correct',
  text: "If ABCD is regular tetrahedron with edge l, then the minimum distance of any vertex from the opposite face is -",
  options: ['Option A', 'Option B', 'Option C', 'Option D'],
  optionImages: ['data:image/png;base64,a', 'data:image/png;base64,b', 'data:image/png;base64,c', 'data:image/png;base64,d'],
}
const imageReady = validateQuestionReadiness(imageScq)
assert.equal(imageReady.ok, true, 'image-only SCQ options count as 4/4')

const imagePersisted = persistQuestionForBank(imageScq, [])
const imagePersistedReady = validateQuestionReadiness(imagePersisted)
assert.equal(imagePersistedReady.ok, true, 'persist keeps image-only SCQ ready')

const missingListI = {
  questionType: 'single_correct',
  text: 'Match each entry in List-I to the correct entry in List-II.\nList-II\n(1) $1$\n(2) $12$\n(3) infinite\n(4) $6$\n(5) $0$',
  options: ['(P) → (4)', '(P) → (2)', '(P) → (1)', '(P) → (5)'],
}
const matchReady = validateQuestionReadiness(missingListI)
assert.equal(matchReady.ok, false, 'bank publish blocks match-the-column missing List-I')
assert.ok(matchReady.issues.some((i) => i.id === 'match-list-i'))

const smashedLetAbe = {
  questionType: 'single_correct',
  subject: 'mathematics',
  section: 'Algebra',
  chapter: 'Matrices',
  text: LET_ABE_SMASHED_VMATRIX_STEM,
  options: ['9', '11', '12', '15'],
  correctIndex: 1,
}
const smashedReady = validateQuestionReadiness(smashedLetAbe)
assert.equal(smashedReady.ok, false, 'Let/Abe smashed vmatrix is not publishable')
assert.ok(smashedReady.issues.some((i) => i.id === 'extraction-incomplete'))
assert.equal(getQuestionReviewState(smashedLetAbe).id, 'needs-fix')
assert.ok(getQuestionPublishBlockers(smashedLetAbe).length > 0)

console.log('test-question-readiness: ok')

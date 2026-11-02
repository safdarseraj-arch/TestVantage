import assert from 'node:assert/strict'
import {
  questionNeedsFigure,
  buildStoredFigureImageFields,
  normalizeFigureQuestionOnMigrate,
  resolveFigureImageForSave,
} from '../src/utils/figureQuestionImage.js'

const tower =
  'A ball is thrown from the top of 36 m high tower with velocity 5 m/s at an angle 37° above the horizontal as shown. Its horizontal range on the ground is closest to'

assert.equal(questionNeedsFigure(tower), true)

const figFields = buildStoredFigureImageFields({
  questionImage: 'data:image/jpeg;base64,abc',
  needsFigure: true,
  stemImageCrop: true,
})
assert.equal(figFields.stemImageCrop, true)
assert.equal(figFields.stemTextInImage, false)
assert.equal(figFields.questionImage, 'data:image/jpeg;base64,abc')

const figFullPage = buildStoredFigureImageFields({
  questionImage: 'data:image/jpeg;base64,full',
  needsFigure: true,
  stemImageCrop: false,
})
assert.equal(figFullPage.stemImageCrop, undefined)
assert.equal(figFullPage.stemTextInImage, false)

const textMcqNoDup = buildStoredFigureImageFields({
  questionImage: 'data:image/jpeg;base64,full',
  needsFigure: false,
  stemImageCrop: false,
  mcqOptionCount: 4,
})
assert.equal(textMcqNoDup.questionImage, undefined, 'text MCQ with 4 options drops full-page image')

const migratedMcq = normalizeFigureQuestionOnMigrate({
  questionType: 'single_correct',
  text: 'The function f is not defined for x=0, but for all non-zero real number x, f(x) + 2f(1/x) = 3x.',
  questionImage: 'data:image/jpeg;base64,full',
  stemImageCrop: false,
  options: [
    'exactly one real number',
    'exactly two real numbers',
    'no real numbers',
    'all non zero real numbers',
  ],
})
assert.equal(migratedMcq.questionImage, undefined, 'migrate strips duplicate MCQ screenshot')

const migrated = normalizeFigureQuestionOnMigrate({
  text: tower,
  questionImage: 'data:image/jpeg;base64,full',
  stemImageCrop: true,
  stemTextInImage: true,
})
assert.equal(migrated.questionImage, undefined)

const kept = normalizeFigureQuestionOnMigrate({
  text: tower,
  questionImage: 'data:image/jpeg;base64,crop',
  stemImageCrop: true,
  stemTextInImage: false,
})
assert.equal(kept.questionImage, 'data:image/jpeg;base64,crop')
assert.equal(kept.stemTextInImage, false)

const piecewiseMigrated = normalizeFigureQuestionOnMigrate({
  questionType: 'single_correct',
  text: 'Given $f(x)=\\begin{cases} x^{2}e^{2(x-1)}, & 0\\le x\\le 1 \\\\ a\\operatorname{sgn}(x+1)\\cos(2x-2)+bx^{2}, & 1<x\\le 2 \\end{cases}$ If $f(x)$ is differentiable at $x=1$, then $|a-b|$ is',
  questionImage: 'data:image/jpeg;base64,faintcrop',
  stemImageCrop: true,
  stemTextInImage: false,
  options: ['0', '1', '2', '3'],
})
assert.equal(
  piecewiseMigrated.questionImage,
  undefined,
  'migrate strips false cases/piecewise stem crop when text is complete',
)

const circuit =
  'In the circuit shown, $A$ and $B$ are equal resistances. When $S$ is closed, the capacitor $C$ charges from the cell of emf E and reaches a steady state'
const manualCrop = 'data:image/jpeg;base64,manualdiagramonly'
const resolved = await resolveFigureImageForSave({
  questionImage: manualCrop,
  stemImageCrop: true,
  stemTextInImage: false,
  stem: circuit,
  sourceUrl: 'data:image/jpeg;base64,fullpagescreenshot',
  mcqOptionCount: 4,
  questionType: 'single_correct',
})
assert.equal(resolved.ok, true)
assert.equal(resolved.questionImage, manualCrop, 'manual diagram split must not be replaced on save')
assert.equal(resolved.stemImageCrop, true)
assert.equal(resolved.stemTextInImage, false)

console.log('test-figure-question-image: ok')

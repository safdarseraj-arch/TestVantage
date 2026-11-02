import assert from 'node:assert/strict'
import {
  stemLikelyNeedsDiagramImage,
  shouldShowQuestionStemImage,
  isValidDiagramStemImage,
  looksLikeIntegerValueQuestion,
  isFixedAnswerQuestionType,
  shouldHideStemTextWithImage,
  shouldUseDiagramSplitWorkflow,
  shouldAutoAttachUploadScreenshot,
  shouldPreferDiagramOverMatrixParse,
  shouldAttemptDiagramAutoCrop,
} from '../src/utils/stemDiagramDetect.js'

const graphStem =
  'Consider the graph of real valued function $f(x)$ defined $\\forall x \\in \\mathbb{R}$ as shown above. The number of real solutions of the equation $f(f(x)) = 2$ is equal to'

assert.equal(stemLikelyNeedsDiagramImage(graphStem), true)

const vdwPassage =
  'The plot of Density vs Pressure is shown below for a Van der Waals gas at various temperatures.'
assert.equal(stemLikelyNeedsDiagramImage(vdwPassage), true)

assert.equal(
  shouldShowQuestionStemImage({
    questionType: 'integer',
    stemImageCrop: true,
    questionImage: 'data:image/png;base64,abc',
    text: graphStem,
    options: [],
  }),
  true,
)

assert.equal(
  shouldShowQuestionStemImage({
    questionType: 'single_correct',
    stemImageCrop: false,
    questionImage: 'data:image/png;base64,abc',
    text: 'A ball is thrown as shown. Range is',
    options: ['12', '18', '24', '30'],
  }),
  false,
)

assert.equal(
  isValidDiagramStemImage({
    stemImageCrop: true,
    stemTextInImage: true,
    questionImage: 'data:image/png;base64,abc',
  }),
  false,
)

assert.equal(
  isValidDiagramStemImage({
    stemImageCrop: true,
    stemTextInImage: false,
    questionImage: 'data:image/png;base64,abc',
  }),
  true,
)

assert.equal(
  shouldShowQuestionStemImage({
    questionType: 'single_correct',
    stemImageCrop: true,
    questionImage: 'data:image/png;base64,abc',
    text: graphStem,
    options: ['(A) 0', '(B) 1', '(C) 2', '(D) 3'],
  }),
  true,
)

assert.equal(looksLikeIntegerValueQuestion(graphStem, []), true)
assert.equal(isFixedAnswerQuestionType('integer'), true)
assert.equal(isFixedAnswerQuestionType('single_correct'), false)

assert.equal(
  shouldHideStemTextWithImage({
    questionImage: 'data:image/png;base64,x',
    stemTextInImage: true,
    text: graphStem,
  }),
  true,
)
assert.equal(
  shouldHideStemTextWithImage({
    questionImage: 'data:image/png;base64,x',
    stemTextInImage: false,
    text: graphStem,
  }),
  false,
)
assert.equal(
  shouldHideStemTextWithImage({
    questionImage: 'data:image/png;base64,x',
    stemImageCrop: true,
    stemTextInImage: false,
    text: graphStem,
  }),
  false,
  'diagram-only crop must keep OCR text visible below the figure',
)

assert.equal(shouldUseDiagramSplitWorkflow(graphStem, graphStem, []), true)

const projectile =
  'A projectile is thrown with a speed 20 m/s at an angle 53° with the horizontal. It lands on a platform with minimum speed'
assert.equal(stemLikelyNeedsDiagramImage(projectile), true)
assert.equal(
  shouldUseDiagramSplitWorkflow(projectile, projectile, ['A) 6i+7j', 'B) 12i', 'C) x', 'D) y']),
  true,
)
assert.equal(shouldAutoAttachUploadScreenshot(graphStem, graphStem, 0, []), false)

const circuitStem =
  'In the circuit shown, A and B are equal resistances. When S is closed, the capacitor C charges from the cell of emf E and reaches a steady state'
const circuitOpts = [
  '(A) During charging, more heat is produced in A than in B.',
  '(B) In the steady state, heat is produced at the same rate in A and B.',
  '(C) In the steady state, energy stored in C is $1/4 CE^2$.',
  '(D) In the steady state, energy stored in C is $1/8 CE^2$.',
]
assert.equal(stemLikelyNeedsDiagramImage(circuitStem), true)
assert.equal(shouldUseDiagramSplitWorkflow(circuitStem, circuitStem, circuitOpts), true)


const mtcOcr = `Match the Column
Column-I
(A) a, b, c are unit vectors satisfying |a+b+c| = 0
(B) If $\\begin{bmatrix}a+b & b+c & c+a\\end{bmatrix} = 0$
Column-II
(P) 0
(Q) $-\\frac{3}{2}$`
assert.equal(stemLikelyNeedsDiagramImage('Match the Column', mtcOcr), false)
assert.equal(stemLikelyNeedsDiagramImage(mtcOcr), false)
assert.equal(stemLikelyNeedsDiagramImage(mtcOcr, '', { questionType: 'matrix_match' }), false)

assert.equal(shouldPreferDiagramOverMatrixParse(graphStem, graphStem, []), true)
assert.equal(shouldPreferDiagramOverMatrixParse('Match the Column', mtcOcr, []), false)

assert.equal(shouldAttemptDiagramAutoCrop(graphStem, graphStem, []), true)
assert.equal(shouldAttemptDiagramAutoCrop('Match the Column', mtcOcr, [], 'matrix_match'), false)
assert.equal(
  shouldAttemptDiagramAutoCrop(graphStem, graphStem, [], 'matrix_match'),
  true,
  'graph stem must crop even if form type is MTC',
)

assert.equal(
  shouldShowQuestionStemImage({
    questionType: 'single_correct',
    stemImageCrop: false,
    questionImage: 'data:image/png;base64,abc',
    text: 'The function f is not defined for $x=0$, but for all non-zero real number x, $f(x) + 2f(\\frac{1}{x}) = 3x$ . The equation $f(x) = f(-x)$ is satisfied by',
    options: [
      'exactly one real number',
      'exactly two real numbers',
      'no real numbers',
      'all non zero real numbers',
    ],
  }),
  false,
  'prose MCQ options — hide duplicate full-page screenshot',
)

const optionGraphStem =
  'Which of the following graphs is correct for the function $y = f(x)$?'
assert.equal(
  shouldShowQuestionStemImage({
    questionType: 'single_correct',
    stemImageCrop: false,
    questionImage: 'data:image/png;base64,composite',
    text: optionGraphStem,
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    optionImages: ['data:a', 'data:b', 'data:c', 'data:d'],
  }),
  false,
  'option graph crops — hide full composite stem image',
)
assert.equal(
  shouldAttemptDiagramAutoCrop(optionGraphStem, optionGraphStem, ['', '', '', '']),
  false,
  'options-are-figures — do not run stem diagram crop',
)

const piecewiseStem =
  'Given $f(x)=\\begin{cases} x^{2}e^{2(x-1)}, & 0\\le x\\le 1 \\\\ a\\operatorname{sgn}(x+1)\\cos(2x-2)+bx^{2}, & 1<x\\le 2 \\end{cases}$ If $f(x)$ is differentiable at $x=1$, then $|a-b|$ is'
const piecewiseOpts = ['0', '1', '2', '3']
assert.equal(
  stemLikelyNeedsDiagramImage(piecewiseStem),
  false,
  'piecewise cases LaTeX is text — not a diagram',
)
assert.equal(
  shouldShowQuestionStemImage({
    questionType: 'single_correct',
    stemImageCrop: true,
    questionImage: 'data:image/png;base64,faintcrop',
    text: piecewiseStem,
    options: piecewiseOpts,
  }),
  false,
  'complete text cases MCQ — hide redundant stem crop',
)
assert.equal(
  shouldAttemptDiagramAutoCrop(piecewiseStem, piecewiseStem, piecewiseOpts),
  false,
  'do not auto-crop diagram for text piecewise MCQ',
)

console.log('test-stem-diagram-detect: ok')

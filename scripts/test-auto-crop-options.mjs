import assert from 'node:assert/strict'
import {
  geometricOptionGridRects,
  geometricOptionRowRects,
  geometricOptionColRects,
  optionRectsLookValid,
  optionGraphPanelRectsLookValid,
  looksLikeHorizontalGraphRowLayout,
  formatOptionsAutoCropStatus,
} from '../src/utils/autoDetectOptions.js'
import {
  normalizeVisionOptionRegions,
  visionOptionBoxesLookLikeGraphPanels,
} from '../src/utils/visionOptionRegions.js'
import {
  shouldAttemptOptionsAutoCrop,
  shouldSkipOptionsAutoCrop,
  shouldStripMistakenOptionCrops,
  stripWrongTextMcqOptionImages,
  optionsAreTextOnlyMcq,
  countGraphOptionsNeedingImage,
  cleanOptionCropOcrText,
  looksLikeMistakenOptionCropSet,
  looksLikeMistakenOptionCropText,
  looksLikeVerticalTextOptionsMcq,
  looksLikeContinuityDiscontinuityTextMcq,
  blobHasTypedTextMcqOptions,
  stemSaysOptionsAreFigures,
  blobMentionsGraphOptions,
  looksLikeVerbalGraphOptionDescription,
  shouldUseGraphPlaceholder,
  applyGraphOptionPlaceholders,
  optionTextForDisplay,
  GRAPH_OPTION_PLACEHOLDER,
} from '../src/utils/graphOptionOcr.js'
import { Z5_IMAGINARY_ROOTS_DET_STEM, Z5_IMAGINARY_ROOTS_DET_OPTIONS } from '../src/utils/repairZ5ImaginaryRootsExpDeterminantMcqOcr.js'
import {
  MIN_SIN_ABS_GI_PERIOD_OPTIONS,
  MIN_SIN_ABS_GI_PERIOD_STEM,
} from '../src/utils/repairMinSinAbsGiPeriodMcqOcr.js'

const rects = geometricOptionGridRects(800, 1200, 0.4)
assert.ok(rects?.length === 4, 'geometric grid yields 4 cells')
assert.ok(rects[0].width > 100 && rects[0].height > 80, 'cells have sensible size')
assert.ok(optionRectsLookValid(rects, 1200), '2×2 grid rects look valid')

const rowRects = geometricOptionRowRects(800, 1400, 0.35)
assert.ok(rowRects?.length === 4, 'geometric rows yield 4 cells')
assert.ok(optionRectsLookValid(rowRects, 1400), '1×4 row rects look valid')
assert.ok(rowRects[0].y < rowRects[1].y, 'rows stack top→bottom')

// —— 1×4 horizontal side-by-side graph options (common JEE) ——
assert.ok(
  looksLikeHorizontalGraphRowLayout(960, 280, 2),
  'wide short zone with ≤2 ink bands → horizontal 1×4',
)
assert.equal(
  looksLikeHorizontalGraphRowLayout(400, 500, 2),
  false,
  'tall zone is not horizontal 1×4',
)
assert.equal(
  looksLikeHorizontalGraphRowLayout(960, 280, 4),
  false,
  'four stacked bands → rows4 not cols4',
)

const colRects = geometricOptionColRects(1200, 900, 0.48)
assert.ok(colRects?.length === 4, 'geometric cols yield 4 vertical panels')
assert.ok(colRects[0].x < colRects[1].x, 'cols run left→right')
assert.ok(
  Math.abs(colRects[0].y - colRects[3].y) < 8,
  'cols share the same vertical band',
)
assert.ok(
  optionGraphPanelRectsLookValid(colRects, 1200, 900),
  '1×4 column rects look like valid graph panels',
)
assert.ok(
  colRects.every((r) => r.width < 1200 * 0.35),
  'each col is roughly one graph wide (not half-row)',
)

// Messy 2×2-on-1×4: A/B span two graphs, C/D are label strips only.
const messy2x2OnCols4 = [
  { x: 40, y: 480, width: 540, height: 220 },
  { x: 620, y: 480, width: 540, height: 220 },
  { x: 40, y: 720, width: 540, height: 48 },
  { x: 620, y: 720, width: 540, height: 48 },
]
assert.equal(
  optionGraphPanelRectsLookValid(messy2x2OnCols4, 1200, 900),
  false,
  'reject 2×2 mis-split of horizontal graph row (label strips C/D)',
)

const spanningAb = [
  { x: 20, y: 500, width: 700, height: 280 },
  { x: 740, y: 500, width: 220, height: 280 },
  { x: 260, y: 500, width: 220, height: 280 },
  { x: 980, y: 500, width: 200, height: 280 },
]
assert.equal(
  optionGraphPanelRectsLookValid(spanningAb, 1200, 900),
  false,
  'reject panels that span >1.5 graph widths',
)

const labelOnlyVision = normalizeVisionOptionRegions(
  {
    layout: 'cols4',
    options: [
      { label: 'A', box: { x: 0.05, y: 0.88, w: 0.2, h: 0.04 } },
      { label: 'B', box: { x: 0.28, y: 0.88, w: 0.2, h: 0.04 } },
      { label: 'C', box: { x: 0.52, y: 0.88, w: 0.2, h: 0.04 } },
      { label: 'D', box: { x: 0.75, y: 0.88, w: 0.2, h: 0.04 } },
    ],
  },
  1000,
  1400,
)
assert.equal(labelOnlyVision, null, 'reject Gemini label-only strips under graphs')

const goodCols4Vision = normalizeVisionOptionRegions(
  {
    layout: 'cols4',
    options: [
      { label: 'A', box: { x: 0.02, y: 0.52, w: 0.23, h: 0.42 } },
      { label: 'B', box: { x: 0.27, y: 0.52, w: 0.23, h: 0.42 } },
      { label: 'C', box: { x: 0.52, y: 0.52, w: 0.23, h: 0.42 } },
      { label: 'D', box: { x: 0.76, y: 0.52, w: 0.22, h: 0.42 } },
    ],
  },
  1000,
  1400,
)
assert.ok(goodCols4Vision?.length === 4, 'accept Gemini cols4 full graph boxes')
assert.ok(
  visionOptionBoxesLookLikeGraphPanels(goodCols4Vision, 1000, 1400, 'cols4'),
  'cols4 vision boxes look like graph panels',
)

const visionRects = normalizeVisionOptionRegions(
  {
    layout: 'grid2x2',
    options: [
      { label: 'A', box: { x: 0.05, y: 0.45, w: 0.42, h: 0.24 } },
      { label: 'B', box: { x: 0.52, y: 0.45, w: 0.42, h: 0.24 } },
      { label: 'C', box: { x: 0.05, y: 0.72, w: 0.42, h: 0.24 } },
      { label: 'D', box: { x: 0.52, y: 0.72, w: 0.42, h: 0.24 } },
    ],
  },
  1000,
  1400,
)
assert.ok(visionRects?.length === 4, 'vision normalize returns 4 boxes')
assert.equal(visionRects[0].x, 50)
assert.ok(visionRects[0].width > 400)
assert.ok(optionRectsLookValid(visionRects, 1400), 'vision boxes look valid')

assert.ok(
  stemSaysOptionsAreFigures('Which of the following graphs is correct?'),
  'detect which-of-following-graphs stem',
)
assert.ok(
  blobMentionsGraphOptions('Find the correct curve below\n(A)\n(B)\n(C)\n(D)'),
  'blob mentions graph options with labels',
)

const graphLabeledRaw = `The graph of y = f(x) is shown. Which option is correct?
(A)
(B)
(C)
(D)`
assert.equal(
  shouldSkipOptionsAutoCrop('The graph of y = f(x) is shown. Which option is correct?', ['', '', '', ''], graphLabeledRaw),
  false,
  'do not skip auto-crop when (A)–(D) labels sit under graph options',
)
assert.ok(
  shouldAttemptOptionsAutoCrop(
    'The graph of y = f(x) is shown. Which option is correct?',
    ['', '', '', ''],
    [],
    graphLabeledRaw,
  ),
  'attempt auto-crop for labeled graph options',
)
assert.equal(
  looksLikeVerticalTextOptionsMcq(
    'The graph of y = f(x) is shown. Which option is correct?',
    ['', '', '', ''],
    graphLabeledRaw,
  ),
  false,
  'graph labels are not vertical text MCQ',
)

assert.equal(
  shouldAttemptOptionsAutoCrop('', ['', '', '', ''], [], ''),
  false,
  'do not auto-crop before OCR text exists',
)
assert.ok(
  shouldAttemptOptionsAutoCrop('Find the correct graph below', ['', '', '', '']),
  'empty options trigger auto crop when stem names graphs',
)
assert.ok(
  shouldAttemptOptionsAutoCrop('Which curve is correct?', ['| |', 'l l', 'O O', '— —'], []),
  'garbled OCR triggers auto crop',
)
assert.equal(
  countGraphOptionsNeedingImage(['1/6', '1/18', '1/12', '1/24'], [], 'limit question'),
  0,
  'numeric text options alone do not need graph placeholders',
)
assert.ok(
  optionsAreTextOnlyMcq(['$\\frac{1}{6}$', '$\\frac{1}{18}$', '$\\frac{1}{12}$', '$\\frac{1}{24}$']),
  'detects fraction text MCQ',
)
assert.equal(
  shouldAttemptOptionsAutoCrop('limit question', ['$\\frac{1}{6}$', '$\\frac{1}{18}$', '$\\frac{1}{12}$', '$\\frac{1}{24}$'], []),
  false,
  'skip auto-crop when four text answers exist',
)
assert.ok(
  shouldSkipOptionsAutoCrop('limit question', ['$\\frac{1}{6}$', '$\\frac{1}{18}$', '$\\frac{1}{12}$', '']),
  'skip when three fraction answers exist',
)
assert.ok(
  shouldSkipOptionsAutoCrop('limit question', ['(A) 1/6', '(B) 1/18', '(C) 1/12', '(D) 1/24']),
  'skip when labeled fraction answers exist',
)
const healed = stripWrongTextMcqOptionImages({
  questionType: 'single_correct',
  text: 'limit question',
  options: ['$\\frac{1}{6}$', '$\\frac{1}{18}$', '$\\frac{1}{12}$', '$\\frac{1}{24}$'],
  optionImages: ['data:image/png;base64,abc', null, null, null],
})
assert.equal(healed.optionImages, undefined, 'migration strips wrong text MCQ option crops')

const detStem =
  '$$\\begin{vmatrix} 3x^2 + 19 & 2x - 37 & 2 \\\\ x^2 - 29 & x + 31 & 3 \\\\ 2x^2 + 17 & 3x & 5 \\end{vmatrix} = ax^3 + bx^2 + cx + d, then value of a is$$'
assert.ok(
  shouldSkipOptionsAutoCrop(detStem, ['2', '5', '-5', '-8']),
  'skip auto-crop for determinant numeric MCQ',
)
assert.equal(
  shouldAttemptOptionsAutoCrop(detStem, ['2', '5', '-5', '-8'], []),
  false,
  'never auto-crop determinant options',
)
const detHealed = stripWrongTextMcqOptionImages({
  questionType: 'single_correct',
  text: detStem,
  options: ['2', '5', '-5', '-8'],
  optionImages: ['data:image/png;base64,row3', null, null, null],
})
assert.equal(detHealed.optionImages, undefined, 'strip mistaken determinant row crop from option A')

const trigDetStem =
  'If A, B and C are $$\\begin{vmatrix}\\sin\\theta&\\cos\\theta&\\tan\\frac{\\pi}{11}\\\\\\sin(\\frac{4\\pi}{3}+\\theta)&\\cos(\\frac{4\\pi}{3}+\\theta)&\\tan\\frac{2\\pi}{11}\\\\\\sin(\\frac{8\\pi}{3}+\\theta)&\\cos(\\frac{8\\pi}{3}+\\theta)&\\tan\\frac{3\\pi}{11}\\end{vmatrix}$$ then'
const manualOptLabels = ['Option A', 'Option B', 'Option C', 'Option D']
const manualOptImgs = [
  'data:image/png;base64,matA',
  'data:image/png;base64,matB',
  'data:image/png;base64,matC',
  'data:image/png;base64,matD',
]
assert.equal(
  shouldStripMistakenOptionCrops(trigDetStem, manualOptLabels, manualOptImgs),
  false,
  'keep manual-split matrix option crops on determinant stem',
)
const manualKept = stripWrongTextMcqOptionImages({
  questionType: 'single_correct',
  text: trigDetStem,
  options: manualOptLabels,
  optionImages: manualOptImgs,
})
assert.deepEqual(manualKept.optionImages, manualOptImgs, 'migration keeps deliberate option matrix crops')

const manualGraphOpts = ['', '', '', '']
const manualGraphImgs = [
  'data:image/png;base64,gA',
  'data:image/png;base64,gB',
  'data:image/png;base64,gC',
  'data:image/png;base64,gD',
]
assert.equal(
  shouldStripMistakenOptionCrops(MIN_SIN_ABS_GI_PERIOD_STEM, manualGraphOpts, manualGraphImgs),
  false,
  'keep manual-split graph options even on text MCQ stems (π/2, π, …)',
)
assert.ok(
  shouldStripMistakenOptionCrops(
    MIN_SIN_ABS_GI_PERIOD_STEM,
    MIN_SIN_ABS_GI_PERIOD_OPTIONS,
    ['data:image/png;base64,wrong', null, null, null],
  ),
  'still strip mistaken auto-crop on filled text options',
)

assert.ok(
  shouldSkipOptionsAutoCrop(Z5_IMAGINARY_ROOTS_DET_STEM, Z5_IMAGINARY_ROOTS_DET_OPTIONS),
  'skip auto-crop for z5 exp determinant text MCQ',
)
assert.equal(
  shouldAttemptOptionsAutoCrop(Z5_IMAGINARY_ROOTS_DET_STEM, Z5_IMAGINARY_ROOTS_DET_OPTIONS, []),
  false,
  'never auto-crop z5 exp determinant options',
)
assert.ok(
  shouldStripMistakenOptionCrops(
    Z5_IMAGINARY_ROOTS_DET_STEM,
    Z5_IMAGINARY_ROOTS_DET_OPTIONS,
    ['data:image/png;base64,wrong', null, null, null],
  ),
  'strip mistaken auto-crops on z5 exp determinant',
)

import { LIMIT_GX_OPTIONS, LIMIT_GX_STEM } from '../src/utils/repairLimitGxStemOcr.js'
assert.ok(
  shouldSkipOptionsAutoCrop(LIMIT_GX_STEM, LIMIT_GX_OPTIONS),
  'skip auto-crop for limit g(x) text MSQ',
)
assert.equal(
  shouldAttemptOptionsAutoCrop(LIMIT_GX_STEM, LIMIT_GX_OPTIONS, []),
  false,
  'never auto-crop limit g(x) options',
)

const intervalStem = 'The solution set of the inequality is'
const intervalRaw = `${intervalStem}
(A) -147 (B) (-12, 3.7] (C) [3.1, 7] (D) |\\sqrt{13}, 4.15|`
const cropGarbledOpts = [
  '-147 |',
  '[3.1] U[ V^{3}.7] © 3.7 ]-(-12)',
  '',
  '|$\\sqrt{13}$,415 |',
]
const cropImgs = [
  'data:image/png;base64,a',
  'data:image/png;base64,b',
  'data:image/png;base64,c',
  'data:image/png;base64,d',
]
assert.equal(cleanOptionCropOcrText('-147 |'), '-147')
assert.ok(looksLikeMistakenOptionCropText('[3.1] U[ V^{3}.7] © 3.7 ]-(-12)'))
assert.ok(looksLikeMistakenOptionCropText('|$\\sqrt{13}$,415 |'))
assert.ok(looksLikeMistakenOptionCropSet(cropGarbledOpts, cropImgs))
assert.ok(
  shouldStripMistakenOptionCrops(intervalStem, cropGarbledOpts, cropImgs, intervalRaw),
  'strip mistaken interval/numeric option crops',
)
assert.ok(
  shouldSkipOptionsAutoCrop(intervalStem, cropGarbledOpts, intervalRaw),
  'skip auto-crop when raw OCR has four A–D labels',
)
assert.equal(
  shouldAttemptOptionsAutoCrop(intervalStem, cropGarbledOpts, cropImgs, intervalRaw),
  false,
  'do not re-auto-crop garbled interval MCQ',
)
const intervalHealed = stripWrongTextMcqOptionImages({
  questionType: 'single_correct',
  text: intervalStem,
  options: cropGarbledOpts,
  optionImages: cropImgs,
})
assert.equal(intervalHealed.optionImages, undefined, 'migration strips interval text MCQ crops')

import { shouldHideUploadScreenshotInStemPreview } from '../src/utils/stemDiagramDetect.js'
import { planUploadImageActions } from '../src/utils/uploadPipeline.js'

assert.ok(
  shouldHideUploadScreenshotInStemPreview(detStem, ['2', '5', '-5', '-8']),
  'hide full upload screenshot when vmatrix stem + options extracted',
)
assert.equal(
  planUploadImageActions({
    stem: detStem,
    options: ['2', '5', '-5', '-8'],
    extractedRaw: detStem,
    questionType: 'single_correct',
  }).dropFullPageQuestionImage,
  true,
  'drop full-page image for determinant text MCQ',
)

const tetraStem =
  'If ABCD is regular tetrahedron with length of any edge $\\ell$, then the minimum distance of any vertex from the opposite face is -'
const tetraRaw = `${tetraStem}
(A) $\\frac{\\ell}{\\sqrt{3}}$
(B) $\\frac{\\ell}{\\sqrt{2}}$
(C) $\\frac{\\ell}{3}$
(D) $\\frac{\\ell}{\\sqrt{6}}$`

assert.ok(
  shouldSkipOptionsAutoCrop(tetraStem, ['', '', '', ''], tetraRaw),
  'skip graph auto-crop for tetrahedron text MCQ',
)
assert.ok(
  looksLikeVerticalTextOptionsMcq(tetraStem, [], tetraRaw),
  'detect vertical text options MCQ',
)

assert.match(
  formatOptionsAutoCropStatus(4, 'cloud-vision'),
  /\bAI\b/,
  'status names AI (cloud)',
)
assert.match(
  formatOptionsAutoCropStatus(3, 'local', { short: true }),
  /\bAI\b/,
  'status names AI (local)',
)
assert.match(
  formatOptionsAutoCropStatus(0, null),
  /Auto-crop A–D/,
  'failed status points to retry button',
)

// —— Gemini verbal invent must not block A–D image crop ——
const verbalOpts = [
  '[Graph A: Curve with local maximum and minimum]',
  '[Graph B: Decreasing, concave down curve]',
  '[Graph C: Increasing then flat]',
  '[Graph D: Parabola opening upward]',
]
const verbalStem = 'Which of the following graphs is correct for y = f(x)?'
assert.ok(
  looksLikeVerbalGraphOptionDescription(verbalOpts[0]),
  'detect [Graph A: …] invent',
)
assert.ok(
  shouldUseGraphPlaceholder(verbalOpts[0], verbalStem, false),
  'verbal invent needs graph placeholder / crop',
)
assert.equal(
  optionsAreTextOnlyMcq(verbalOpts),
  false,
  'verbal invent is not a text-only MCQ',
)
assert.equal(
  shouldSkipOptionsAutoCrop(verbalStem, verbalOpts, verbalStem),
  false,
  'do not skip auto-crop for verbal graph invent',
)
assert.ok(
  countGraphOptionsNeedingImage(verbalOpts, [], verbalStem) >= 4,
  'all four verbal invent slots need images',
)
assert.ok(
  shouldAttemptOptionsAutoCrop(verbalStem, verbalOpts, [], verbalStem),
  'attempt auto-crop when Gemini returned verbal graph descriptions',
)
const placeholders = applyGraphOptionPlaceholders(verbalStem, verbalOpts, [])
assert.ok(
  placeholders.every((o) => o === GRAPH_OPTION_PLACEHOLDER),
  'convert verbal invent to standard graph placeholder',
)
assert.equal(
  optionTextForDisplay(verbalOpts[0], false, verbalStem),
  '',
  'UI must not show verbal invent as the option body',
)
assert.equal(
  optionTextForDisplay(verbalOpts[0], true, verbalStem),
  '',
  'with image, still hide verbal invent text',
)

import {
  shouldDropCompositeStemForOptionGraphs,
  buildStoredFigureImageFields,
  normalizeFigureQuestionOnMigrate,
} from '../src/utils/figureQuestionImage.js'
import { shouldShowQuestionStemImage } from '../src/utils/stemDiagramDetect.js'

assert.ok(
  shouldDropCompositeStemForOptionGraphs({
    stem: verbalStem,
    optionImages: ['a', 'b', 'c', 'd'],
    stemImageCrop: false,
  }),
  'drop composite when A–D graph crops exist',
)
assert.equal(
  shouldShowQuestionStemImage({
    questionType: 'single_correct',
    text: verbalStem,
    options: placeholders,
    optionImages: ['a', 'b', 'c', 'd'],
    questionImage: 'data:image/png;base64,full',
    stemImageCrop: false,
  }),
  false,
  'viewer hides composite when option graphs exist',
)
const stored = buildStoredFigureImageFields({
  questionImage: 'data:image/png;base64,full',
  stemImageCrop: false,
  needsFigure: false,
  mcqOptionCount: 4,
  optionImages: ['a', 'b', 'c', 'd'],
  stem: verbalStem,
})
assert.equal(stored.questionImage, undefined, 'save must not persist composite with option crops')
const migrated = normalizeFigureQuestionOnMigrate({
  questionType: 'single_correct',
  text: verbalStem,
  options: placeholders,
  optionImages: ['a', 'b', 'c', 'd'],
  questionImage: 'data:image/png;base64,full',
  stemImageCrop: false,
})
assert.equal(migrated.questionImage, undefined, 'migrate strips composite when option crops exist')
assert.equal(
  planUploadImageActions({
    stem: verbalStem,
    options: placeholders,
    extractedRaw: verbalStem,
    questionType: 'single_correct',
  }).dropFullPageQuestionImage,
  true,
  'upload plan drops full-page for options-are-figures',
)
assert.equal(
  planUploadImageActions({
    stem: verbalStem,
    options: placeholders,
    extractedRaw: verbalStem,
    questionType: 'single_correct',
  }).attemptDiagramAutoCrop,
  false,
  'upload plan skips stem diagram when options are the graphs',
)

import { classifyMcqImageLayout } from '../src/utils/mcqImageLayoutPlan.js'

const textText = classifyMcqImageLayout({
  stem: 'If ABCD is regular tetrahedron with edge $\\ell$, distance is',
  options: ['$\\frac{\\ell}{\\sqrt{3}}$', '$\\frac{\\ell}{\\sqrt{2}}$', '$\\frac{\\ell}{3}$', '$\\frac{\\ell}{\\sqrt{6}}$'],
})
assert.equal(textText.kind, 'text_text', 'case1 text+text')
assert.equal(textText.attemptOptionsAutoCrop, false)
assert.equal(textText.attemptDiagramAutoCrop, false)

const piecewiseStemLayout =
  'Given $f(x)=\\begin{cases} x^{2}, & x\\le 0 \\\\ x, & x>0 \\end{cases}$ then $f$ is continuous on R'
const piecewiseOptsLayout = [
  'continuous everywhere now',
  'differentiable at zero',
  'neither of these',
  'both of the above',
]
const piecewiseLayout = classifyMcqImageLayout({
  stem: piecewiseStemLayout,
  options: piecewiseOptsLayout,
})
assert.equal(piecewiseLayout.kind, 'text_text', 'cases LaTeX is text_text not figure_text')
assert.equal(piecewiseLayout.keepStemImage, false)
assert.equal(
  shouldDropCompositeStemForOptionGraphs({
    stem: piecewiseStemLayout,
    options: piecewiseOptsLayout,
    optionImages: [],
    stemImageCrop: true,
  }),
  true,
  'text_text drops false stem crop even when stemImageCrop was set',
)

const textGraphs = classifyMcqImageLayout({
  stem: verbalStem,
  options: placeholders,
})
assert.equal(textGraphs.kind, 'text_graphs', 'case2 text+graphs')
assert.equal(textGraphs.attemptOptionsAutoCrop, true)
assert.equal(textGraphs.attemptDiagramAutoCrop, false)
assert.equal(textGraphs.dropFullPageQuestionImage, true)

const circuitStem =
  'In the circuit shown, A and B are equal resistances. When S is closed, the capacitor C charges'
const circuitOpts = [
  'During charging, more heat is produced in A than in B.',
  'In the steady state, heat is produced at the same rate in A and B.',
  'In the steady state, energy stored in C is $1/4 CE^2$.',
  'In the steady state, energy stored in C is $1/8 CE^2$.',
]
const figureText = classifyMcqImageLayout({
  stem: circuitStem,
  options: circuitOpts,
  extractedRaw: circuitStem,
})
assert.equal(figureText.kind, 'figure_text', 'case3 stem figure + text options')
assert.equal(figureText.attemptDiagramAutoCrop, true)
assert.equal(figureText.attemptOptionsAutoCrop, false)
assert.equal(
  shouldDropCompositeStemForOptionGraphs({
    stem: circuitStem,
    options: circuitOpts,
    optionImages: [],
    stemImageCrop: true,
  }),
  false,
  'case3 keep stem figure crop',
)

const figureGraphs = classifyMcqImageLayout({
  stem: 'In the figure shown, which of the following graphs is correct?',
  options: placeholders,
})
assert.equal(figureGraphs.kind, 'figure_graphs', 'case4 stem figure + option graphs')
assert.equal(figureGraphs.attemptDiagramAutoCrop, true)
assert.equal(figureGraphs.attemptOptionsAutoCrop, true)
assert.equal(figureGraphs.keepStemImage, true)
assert.equal(
  shouldDropCompositeStemForOptionGraphs({
    stem: 'In the figure shown, which of the following graphs is correct?',
    options: placeholders,
    optionImages: ['a', 'b', 'c', 'd'],
    stemImageCrop: true,
  }),
  false,
  'case4 keep stem-only crop with option graphs',
)
assert.ok(
  shouldDropCompositeStemForOptionGraphs({
    stem: 'In the figure shown, which of the following graphs is correct?',
    options: placeholders,
    optionImages: ['a', 'b', 'c', 'd'],
    stemImageCrop: false,
  }),
  'case4 drop full composite even with separate stem cue',
)

const mixed = classifyMcqImageLayout({
  stem: 'Choose the correct statement',
  options: [
    'f is continuous everywhere',
    GRAPH_OPTION_PLACEHOLDER,
    'f is differentiable at 0',
    GRAPH_OPTION_PLACEHOLDER,
  ],
})
assert.equal(mixed.kind, 'mixed_options', 'case5 mixed text+graph options')
assert.ok(mixed.attemptOptionsAutoCrop)
assert.ok(mixed.graphOptionIndexes.includes(1))
assert.ok(mixed.graphOptionIndexes.includes(3))
assert.ok(!mixed.graphOptionIndexes.includes(0))

const noFig = classifyMcqImageLayout({
  stem: 'The value of 2+2 is',
  options: ['3', '4', '5', '6'],
})
assert.ok(
  noFig.kind === 'text_text' || noFig.kind === 'no_figure',
  'case6 no invented graphs',
)
assert.equal(noFig.attemptOptionsAutoCrop, false)
assert.equal(noFig.graphOptionIndexes.length, 0)

const mixedVision = normalizeVisionOptionRegions(
  {
    layout: 'cols4',
    case: 'mixed_options',
    options: [
      { label: 'A', kind: 'optionText', box: { x: 0, y: 0, w: 0, h: 0 } },
      { label: 'B', kind: 'optionGraph', box: { x: 0.27, y: 0.52, w: 0.23, h: 0.42 } },
      { label: 'C', kind: 'optionText', box: { x: 0, y: 0, w: 0, h: 0 } },
      { label: 'D', kind: 'optionGraph', box: { x: 0.76, y: 0.52, w: 0.22, h: 0.42 } },
    ],
  },
  1000,
  1400,
)
assert.ok(mixedVision, 'mixed vision returns graph boxes only')
assert.equal(mixedVision.filter(Boolean).length, 2, 'two graph option boxes')

// C/D much shorter than A/B → reject (label scraps on 1×4 row)
const shortCdPanels = [
  { x: 20, y: 500, width: 220, height: 280 },
  { x: 260, y: 500, width: 220, height: 280 },
  { x: 500, y: 720, width: 220, height: 48 },
  { x: 740, y: 720, width: 220, height: 48 },
]
assert.equal(
  optionGraphPanelRectsLookValid(shortCdPanels, 1200, 900),
  false,
  'reject when C/D height << A/B',
)
const shortCdWidth = [
  { x: 20, y: 500, width: 280, height: 260 },
  { x: 320, y: 500, width: 280, height: 260 },
  { x: 620, y: 500, width: 80, height: 260 },
  { x: 720, y: 500, width: 80, height: 260 },
]
assert.equal(
  optionGraphPanelRectsLookValid(shortCdWidth, 1200, 900),
  false,
  'reject when C/D width << A/B',
)

// —— Continuity / piecewise-log MCQ: prefer text A–D, never misaligned option strips ——
const continuityStem =
  'The function $f(x)$ is defined $f(x)=\\begin{cases} \\log_{(4x-3)}(x^{2}-2x+5), & \\text{if } \\frac{3}{4} < x < 1 \\text{ or } x > 1 \\\\ 4, & \\text{if } x = 1 \\end{cases}$'
const continuityOpts = [
  'is continuous at $x = 1$',
  'is discontinuous at $x = 1$ since $f(1^{+})$ does not exist though $f(1^{-})$ exists',
  'is discontinuous at $x = 1$ since $f(1^{-})$ does not exist though $f(1^{+})$ exists',
  'is discontinuous since neither $f(1^{-})$ nor $f(1^{+})$ exists',
]
const continuityRaw = `${continuityStem}
(A) is continuous at $x = 1$
(B) is discontinuous at $x = 1$ since $f(1^{+})$ does not exist though $f(1^{-})$ exists
(C) is discontinuous at $x = 1$ since $f(1^{-})$ does not exist though $f(1^{+})$ exists
(D) is discontinuous since neither $f(1^{-})$ nor $f(1^{+})$ exists`

assert.ok(looksLikeContinuityDiscontinuityTextMcq(continuityRaw), 'detect continuity text MCQ')
assert.ok(blobHasTypedTextMcqOptions(continuityRaw), 'OCR has typed A–D bodies')
assert.ok(
  looksLikeVerticalTextOptionsMcq(continuityStem, ['', '', '', ''], continuityRaw),
  'empty slots + prose OCR still text MCQ',
)
assert.ok(
  shouldSkipOptionsAutoCrop(continuityStem, ['', '', '', ''], continuityRaw),
  'skip auto-crop for continuity (even empty options)',
)
assert.equal(
  shouldAttemptOptionsAutoCrop(continuityStem, ['', '', '', ''], [], continuityRaw),
  false,
  'never auto-crop continuity option strips',
)
assert.ok(
  shouldStripMistakenOptionCrops(
    continuityStem,
    ['Option A', 'Option B', 'Option C', 'Option D'],
    [
      'data:image/png;base64,sliceA',
      'data:image/png;base64,sliceB',
      'data:image/png;base64,sliceC',
      'data:image/png;base64,sliceD',
    ],
    continuityRaw,
  ),
  'strip misaligned Option A–D image slices when OCR has prose options',
)
assert.ok(
  looksLikeMistakenOptionCropSet(
    ['', '', '', ''],
    [
      'data:image/png;base64,a',
      'data:image/png;base64,b',
      'data:image/png;base64,c',
      'data:image/png;base64,d',
    ],
    continuityRaw,
  ),
  'empty + crops + typed OCR = mistaken crop set',
)
const continuityHealed = stripWrongTextMcqOptionImages({
  questionType: 'single_correct',
  text: continuityStem,
  options: continuityOpts,
  optionImages: [
    'data:image/png;base64,bad1',
    'data:image/png;base64,bad2',
    'data:image/png;base64,bad3',
    'data:image/png;base64,bad4',
  ],
  ocrRawText: continuityRaw,
})
assert.equal(continuityHealed.optionImages, undefined, 'migration strips continuity option crops')

const continuityLayout = classifyMcqImageLayout({
  stem: continuityStem,
  options: continuityOpts,
  extractedRaw: continuityRaw,
})
assert.equal(continuityLayout.kind, 'text_text', 'continuity layout is text_text')
assert.equal(continuityLayout.attemptOptionsAutoCrop, false, 'continuity plan skips option crop')

assert.equal(
  planUploadImageActions({
    stem: continuityStem,
    options: continuityOpts,
    extractedRaw: continuityRaw,
    questionType: 'single_correct',
  }).attemptOptionsAutoCrop,
  false,
  'upload plan never crops continuity text options',
)

console.log('test-auto-crop-options: ok')

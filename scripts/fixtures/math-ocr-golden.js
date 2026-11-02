/**
 * Golden routing/merge fixtures (no live model — CI-safe).
 * Each case simulates Tesseract layout + expected ONNX merge behavior.
 */

/** @typedef {import('../../src/utils/mathRegionDetect.js').MathRegion} MathRegion */

/** @type {Array<{
 *   name: string
 *   page: object
 *   prose: string
 *   mockLatex: string[]
 *   expectRegionMin: number
 *   expectMerged: RegExp[]
 *   expectAbsent?: RegExp[]
 * }>} */
export const MATH_OCR_GOLDEN = [
  {
    name: 'tower-garbled-q1',
    page: {
      lines: [
        {
          text: 'Two friends A & B playing a game.',
          confidence: 90,
          bbox: { x0: 30, y0: 10, x1: 350, y1: 36 },
          words: [],
        },
        {
          text: '20m! s 8 g < = = 4',
          confidence: 42,
          bbox: { x0: 55, y0: 70, x1: 260, y1: 105 },
          words: [
            { text: '20m!', in_dictionary: false, confidence: 38, bbox: { x0: 55, y0: 70, x1: 95, y1: 105 } },
            { text: '=', in_dictionary: false, confidence: 45, bbox: { x0: 180, y0: 70, x1: 195, y1: 105 } },
          ],
        },
        {
          text: 'If Distance D between the towers is x meter',
          confidence: 88,
          bbox: { x0: 40, y0: 130, x1: 360, y1: 158 },
          words: [],
        },
      ],
    },
    prose: `Two friends A & B playing a game.\n20m! s 8 g < = = 4\nIf Distance D between the towers is x meter`,
    mockLatex: ['$v=\\sqrt{2gh}$'],
    expectRegionMin: 1,
    expectMerged: [/\\sqrt\{2gh\}/, /If Distance D/],
    expectAbsent: [/20m! s 8 g/],
  },
  {
    name: 'matrix-p-2005',
    page: {
      lines: [
        {
          text: 'Answer the following questions.',
          confidence: 92,
          bbox: { x0: 30, y0: 10, x1: 300, y1: 36 },
          words: [],
        },
        {
          text: 'If P = [ 1 0 2005 1 ] find X',
          confidence: 55,
          bbox: { x0: 40, y0: 60, x1: 320, y1: 95 },
          words: [
            { text: 'P', in_dictionary: false, confidence: 60, bbox: { x0: 70, y0: 60, x1: 85, y1: 95 } },
            { text: '=', in_dictionary: false, confidence: 58, bbox: { x0: 90, y0: 60, x1: 105, y1: 95 } },
            { text: '2005', in_dictionary: false, is_numeric: true, confidence: 62, bbox: { x0: 150, y0: 60, x1: 195, y1: 95 } },
          ],
        },
      ],
    },
    prose: 'If P = [ 1 0 2005 1 ] find X',
    mockLatex: ['$P=\\begin{bmatrix}1&0\\\\2005&1\\end{bmatrix}$'],
    expectRegionMin: 1,
    expectMerged: [/\\begin\{bmatrix\}/, /2005/],
  },
  {
    name: 'mcq-options-skipped',
    page: {
      lines: [
        {
          text: '(A) 1',
          confidence: 90,
          bbox: { x0: 50, y0: 500, x1: 90, y1: 530 },
          words: [{ text: '(A)', in_dictionary: false, bbox: { x0: 50, y0: 500, x1: 75, y1: 530 } }],
        },
        {
          text: '(B) 2',
          confidence: 90,
          bbox: { x0: 120, y0: 500, x1: 160, y1: 530 },
          words: [{ text: '(B)', in_dictionary: false, bbox: { x0: 120, y0: 500, x1: 145, y1: 530 } }],
        },
      ],
    },
    prose: 'Value of x is\n(A) 1\n(B) 2',
    mockLatex: [],
    expectRegionMin: 0,
    expectMerged: [/Value of x/],
  },
]

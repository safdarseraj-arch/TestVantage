/**
 * Official PYQ: Q7-style option glue, Q40 reagent MCQ + figure,
 * Q31-34 physics figures from OCR, no physics figure on chemistry cards,
 * Q48-51 passage pairs keep their own paragraph.
 */
import assert from 'node:assert/strict'
import { healUploadQuestionCard } from '../src/utils/uploadQualityGuards.js'
import { restoreMissingFiguresFromSource } from '../src/utils/extendTruncatedStem.js'
import { peelGluedMcqOptions } from '../src/utils/peelGluedMcqOptions.js'
import { fillOfficialPyqPairPassages } from '../src/utils/passage.js'

const PHYS_31 = 'https://cdn.mathpix.com/cropped/q31-circuit.png'
const PHYS_32 = 'https://cdn.mathpix.com/cropped/q32-graph.png'
const PHYS_33 = 'https://cdn.mathpix.com/cropped/q33-rod.png'
const PHYS_34 = 'https://cdn.mathpix.com/cropped/q34-field.png'
const CHEM_PQ = 'https://cdn.mathpix.com/cropped/pq-reaction.png'
const CHEM_48 = 'https://cdn.mathpix.com/cropped/phenol-scheme.png'

const Q7_OPT_A = 'If the H+ ion has x = d then the detector is at height h.'
const Q7_OPT_B = 'If AM = 144 the ion hits the detector.'
const Q7_OPT_C = 'The detector is placed at a height 2d.'
const Q7_OPT_D = 'The width w of the detector is d.'

const q7Stem =
  'A thin uniform ion beam of a given velocity is shot into a region of uniform magnetic field as shown. ' +
  `\\includegraphics{https://cdn.mathpix.com/cropped/ion-detector.png} ` +
  'Which of the following option(s) is(are) correct? ' +
  `${Q7_OPT_A} ${Q7_OPT_B} ${Q7_OPT_C} ${Q7_OPT_D}`

const q7Healed = healUploadQuestionCard(
  {
    text: q7Stem,
    options: [Q7_OPT_A, Q7_OPT_B, '', ''],
    printedNumber: 7,
    questionNumber: 7,
  },
  '',
)
assert.doesNotMatch(q7Healed.text, /If the H\+ ion/, 'Q7-style: option A not left in the stem')
assert.doesNotMatch(q7Healed.text, /AM = 144/, 'Q7-style: option B not left in the stem')
assert.doesNotMatch(q7Healed.text, /width w of the detector/, 'Q7-style: option D not left in the stem')
assert.match(q7Healed.text, /Which of the following option\(s\) is\(are\) correct/)
assert.match(q7Healed.text, /ion-detector\.png/, 'Q7 figure stays on the stem')
assert.equal(q7Healed.options.filter((o) => String(o ?? '').trim()).length, 4, 'Q7-style fills four options')
assert.match(q7Healed.options[0], /H\+ ion/)
assert.match(q7Healed.options[3], /width w/)

const q40Glued =
  "The option(s) with correct sequence of reagents for the conversion of P to Q is(are)" +
  "i) Lindlar's catalyst, H2; ii) SnCl2/HCl; iii) NaBH4; iv) H3O+ " +
  "i) Lindlar's catalyst, H2; i) H3O+; iii) SnCl2/HCl; iv) NaBH4 " +
  'i) NaBH4; ii) \\mathrm{SnCl}_{2} / \\mathrm{HCl}; iii) H3O+; iv) Lindlar\'s catalyst, H2 ' +
  "i) Lindlar's catalyst, $$ H2; ii) \\mathrm{NaBH}_{4}; iii) SnCl2/HCl; iv) H3O+"

const q40Ocr = [
  'Q. 40 The option(s) with correct sequence of reagents for the conversion of P to Q is(are)',
  `\\includegraphics{${CHEM_PQ}}`,
  "(A) i) Lindlar's catalyst, H2; ii) SnCl2/HCl; iii) NaBH4; iv) H3O+",
  "(B) i) Lindlar's catalyst, H2; ii) H3O+; iii) SnCl2/HCl; iv) NaBH4",
  "(C) i) NaBH4; ii) SnCl2/HCl; iii) H3O+; iv) Lindlar's catalyst, H2",
  "(D) i) Lindlar's catalyst, H2; ii) NaBH4; iii) SnCl2/HCl; iv) H3O+",
  'Q. 41 Next chemistry item',
].join('\n')

const q40Healed = healUploadQuestionCard(
  {
    text: q40Glued,
    options: ['', '', '', ''],
    printedNumber: 40,
    questionNumber: 40,
  },
  q40Ocr,
)
assert.match(q40Healed.text, /conversion of P to Q/)
assert.doesNotMatch(q40Healed.text, /Lindlar[\s\S]*Lindlar/, 'Q40 stem must not keep option sequences')
assert.doesNotMatch(q40Healed.text, /i\)\s*Lindlar/i, 'Q40 stem has no i) Lindlar row')
assert.equal(q40Healed.options.filter((o) => String(o ?? '').trim()).length, 4, 'Q40 has four A-D options')
assert.match(q40Healed.options[0], /Lindlar/)
assert.match(q40Healed.options[2], /NaBH/)
assert.match(q40Healed.text, /pq-reaction\.png/, 'Q40 figure URL from OCR stays on that card')
assert.equal(q40Healed.printedNumber, 40, 'do not renumber the 40th card')

const q40WithPhysFig = healUploadQuestionCard(
  {
    text:
      'The option(s) with correct sequence of reagents for the conversion of P to Q is(are)\n' +
      `\\includegraphics{${PHYS_31}}`,
    options: ['', '', '', ''],
    printedNumber: 40,
    questionNumber: 40,
  },
  [
    'Q. 31 A particle of charge q moves in a uniform magnetic field as shown.',
    `\\includegraphics{${PHYS_31}}`,
    'The detector is placed in the ion beam.',
    'Q. 40 The option(s) with correct sequence of reagents for the conversion of P to Q is(are)',
    `\\includegraphics{${CHEM_PQ}}`,
    "(A) i) Lindlar's catalyst, H2; ii) SnCl2/HCl; iii) NaBH4; iv) H3O+",
    "(B) i) Lindlar's catalyst, H2; ii) H3O+; iii) SnCl2/HCl; iv) NaBH4",
    "(C) i) NaBH4; ii) SnCl2/HCl; iii) H3O+; iv) Lindlar's catalyst, H2",
    "(D) i) Lindlar's catalyst, H2; ii) NaBH4; iii) SnCl2/HCl; iv) H3O+",
  ].join('\n'),
)
assert.doesNotMatch(q40WithPhysFig.text, /q31-circuit/, 'physics includegraphics from card 31 must not stay on chemistry Q40')
assert.match(q40WithPhysFig.text, /pq-reaction\.png/)

const PHYS_OCR = [
  'Q. 31 A particle of charge q moves in a uniform magnetic field as shown.',
  `\\includegraphics{${PHYS_31}}`,
  'Match each entry in List-I with List-II. Work done in the complete cycle is P.',
  'Q. 32 A particle of charge q then enters the second region as shown.',
  `\\includegraphics{${PHYS_32}}`,
  'If the value of n(X) is k then |k| is ______.',
  'Q. 33 A particle of charge 2q moves along the rod as shown.',
  `\\includegraphics{${PHYS_33}}`,
  'Match each entry in List-I with the correct entry in List-II.',
  'Q. 34 A particle of charge 3q is in a uniform magnetic field as shown.',
  `\\includegraphics{${PHYS_34}}`,
  'If the value of n(Y) is m then |m| is ______.',
  'Q. 40 The option(s) with correct sequence of reagents for the conversion of P to Q is(are)',
  `\\includegraphics{${CHEM_PQ}}`,
].join('\n')

const q31 = healUploadQuestionCard(
  {
    text: 'A particle of charge q moves in a uniform magnetic field as shown. Match each entry in List-I with List-II. Work done in the complete cycle is P.',
    options: ['P-1', 'P-2', 'P-3', 'P-4'],
    printedNumber: 31,
    questionNumber: 31,
  },
  PHYS_OCR,
)
const q32 = healUploadQuestionCard(
  {
    text: 'A particle of charge q then enters the second region as shown. If the value of n(X) is k then |k| is ______.',
    options: ['', '', '', ''],
    printedNumber: 32,
    questionNumber: 32,
  },
  PHYS_OCR,
)
const q33 = healUploadQuestionCard(
  {
    text: 'A particle of charge 2q moves along the rod as shown. Match each entry in List-I with the correct entry in List-II.',
    options: ['P-1', 'P-2', 'P-3', 'P-4'],
    printedNumber: 33,
    questionNumber: 33,
  },
  PHYS_OCR,
)
const q34 = healUploadQuestionCard(
  {
    text: 'A particle of charge 3q is in a uniform magnetic field as shown. If the value of n(Y) is m then |m| is ______.',
    options: ['', '', '', ''],
    printedNumber: 34,
    questionNumber: 34,
  },
  PHYS_OCR,
)
assert.match(q31.text, /q31-circuit/, 'Q31 restores its OCR figure')
assert.match(q32.text, /q32-graph/, 'Q32 restores its OCR figure')
assert.match(q33.text, /q33-rod/, 'Q33 restores its OCR figure')
assert.match(q34.text, /q34-field/, 'Q34 restores its OCR figure')
assert.doesNotMatch(q31.text, /pq-reaction/)
assert.doesNotMatch(q31.text, /q33-rod/)

const chem48 = healUploadQuestionCard(
  {
    text:
      'Among the following phenolic compounds, the correct option is.\n' +
      `\\includegraphics{${PHYS_31}}`,
    options: ['one', 'two', 'three', 'four'],
    printedNumber: 48,
    questionNumber: 48,
  },
  [
    'Q. 31 A particle of charge q moves in a uniform magnetic field as shown.',
    `\\includegraphics{${PHYS_31}}`,
    'The detector is placed in the ion beam.',
    'Paragraph for Questions 48 and 49',
    'Let $C$ be the fixture set used only for the 48-49 grouping contract.',
    'Among the following phenolic compounds, the correct option is.',
    `\\includegraphics{${CHEM_48}}`,
    '\\item[Q.] 48 Among the following phenolic compounds, the correct option is.',
    '\\item[Q.] 49 If $n(C)=2$ then the value is ______.',
  ].join('\n'),
)
assert.doesNotMatch(chem48.text, /q31-circuit/, 'physics figure from card 31 must not appear on chemistry Q48')
assert.match(String(chem48.passageText ?? ''), /fixture set used only for the 48-49/)
assert.match(chem48.text, /phenolic/)

const pairOcr = [
  'Paragraph for Questions 48 and 49',
  'Let $C$ be the fixture set used only for the 48-49 grouping contract.',
  '\\item[Q.] 48 If $n(C)=1$ then the value is ______.',
  '\\item[Q.] 49 If $n(C)=2$ then the value is ______.',
  'Paragraph for Questions 50 and 51',
  'Let $D$ be the fixture set used only for the 50-51 grouping contract.',
  '\\item[Q.] 50 If $n(D)=1$ then the value is ______.',
  '\\item[Q.] 51 If $n(D)=2$ then the value is ______.',
].join('\n')

const cards4851 = fillOfficialPyqPairPassages(
  [48, 49, 50, 51].map((n, i) =>
    healUploadQuestionCard(
      {
        text: i < 2 ? `If $n(C)=${i + 1}$ then the value is ______.` : `If $n(D)=${i - 1}$ then the value is ______.`,
        options: ['', '', '', ''],
        printedNumber: n,
        questionNumber: n,
        passageText: '',
      },
      pairOcr,
    ),
  ),
)
assert.match(String(cards4851[0].passageText), /48-49 grouping/)
assert.match(String(cards4851[1].passageText), /48-49 grouping/)
assert.match(String(cards4851[2].passageText), /50-51 grouping/)
assert.match(String(cards4851[3].passageText), /50-51 grouping/)
assert.doesNotMatch(String(cards4851[0].passageText), /50-51 grouping/)
assert.doesNotMatch(String(cards4851[2].passageText), /48-49 grouping/)
assert.equal(cards4851[0].passageRole, 'comprehension_child')
assert.equal(cards4851[2].passageRole, 'comprehension_child')

const peeled = peelGluedMcqOptions(q40Glued, [])
assert.equal(peeled.options.filter(Boolean).length, 4)
assert.doesNotMatch(peeled.text, /i\)\s*Lindlar/i)

const restoredAlone = restoreMissingFiguresFromSource(
  'A particle of charge q moves in a uniform magnetic field as shown. Match each entry in List-I with List-II.',
  PHYS_OCR,
)
assert.match(restoredAlone, /q31-circuit/)
assert.doesNotMatch(restoredAlone, /q33-rod/)

assert.equal(
  restoreMissingFiguresFromSource(
    'A point source S emits unpolarized light uniformly in all directions. At two points A and B, the ratio of the intensities of light is 2.',
    `Q. 27 A point source S emits unpolarized light uniformly in all directions. At two points A and B, the ratio of the intensities of light is 2.
then the new value of r will be ____ .
Q. 30 A rod of length L rotates about O as shown in the figure.
\\includegraphics{https://cdn.mathpix.com/cropped/rod-figure.png}`,
  ),
  'A point source S emits unpolarized light uniformly in all directions. At two points A and B, the ratio of the intensities of light is 2.',
)

const q59Stem =
  'The charge accumulated on the\n\ncapacitor connected in the following circuit is ____ $\\mu C$. (Given $C=150 \\mu \\mathrm{F}$ )'
const q59Ocr = `charge accumulated on the
![](https://cdn.mathpix.com/cropped/q59-stem.jpg?height=280&width=662&top_left_y=244&top_left_x=1097)
capacitor connected in the following circuit is \\_\\_\\_\\_ $\\mu \\mathrm{C}$. (Given $\\mathrm{C}=150$ $\\mu \\mathrm{F}$ )
\\end{itemize}

Ans. 400
Sol. At steady state
![](https://cdn.mathpix.com/cropped/q59-sol.jpg?height=280&width=663&top_left_y=559&top_left_x=1097)
`
const q59Restored = restoreMissingFiguresFromSource(q59Stem, q59Ocr)
assert.match(q59Restored, /q59-stem\.jpg/)
assert.doesNotMatch(q59Restored, /q59-sol\.jpg/)

// Prior question Ans/Sol in the lookbehind must not wipe this stem's figure (Q73).
const q73Stem = 'IUPAC name of following compound (P) is:'
const q73Ocr = `oxidation state is:
(1) Chlorine
(2) Fluorine
\\end{itemize}

Ans. (2)
Sol. Fluorine does not show variable oxidation state.
\\begin{itemize}
\\item[] *73. IUPAC name of following compound $(\\mathrm{P})$ is:

\\begin{figure}
\\includegraphics[alt={},max width=\\textwidth]{https://cdn.mathpix.com/cropped/q73-compound-p.jpg?height=199&width=258&top_left_y=1575&top_left_x=372}

\\caption{(P)}
\\end{figure}
(1) 3-Ethyl-1,1-dimethylcyclohexane
\\end{itemize}

Ans. (1)

Sol.
![](https://cdn.mathpix.com/cropped/q73-sol.jpg?height=100&width=100&top_left_y=1&top_left_x=1)
`
const q73Restored = restoreMissingFiguresFromSource(q73Stem, q73Ocr, 73)
assert.match(q73Restored, /q73-compound-p\.jpg/)
assert.doesNotMatch(q73Restored, /q73-sol\.jpg/)

// Q39: figure restore must not leave option circuit crops in the stem when options already hold them.
const { officialPyqCardAsShown } = await import('../src/utils/officialPyqCardAsShown.js')
const { preferOcrSmilesOverBadStemCrops } = await import('../src/utils/restorePyqOptionFiguresFromOcr.js')
const { stripTrailingPyqSectionHeader } = await import('../src/utils/bulkExtractClean.js')
const CROP_A = '/api/official-pyq/original/crops/q39-a.png'
const CROP_B = '/api/official-pyq/original/crops/q39-b.png'
const CROP_C = '/api/official-pyq/original/crops/q39-c.png'
const CROP_D = '/api/official-pyq/original/crops/q39-d.png'
const q39Ocr = [
  '\\item[39.] Which of the following circuits is reverse - biased ?',
  '(1) ![](https://cdn.mathpix.com/cropped/q39-1.jpg?height=239&width=247&top_left_y=736&top_left_x=508)',
  '(2) ![](https://cdn.mathpix.com/cropped/q39-2.jpg?height=173&width=329&top_left_y=762&top_left_x=1174)',
  '(3) ![](https://cdn.mathpix.com/cropped/q39-3.jpg?height=95&width=235&top_left_y=1031&top_left_x=487)',
  '(4) ![](https://cdn.mathpix.com/cropped/q39-4.jpg?height=331&width=255&top_left_y=985&top_left_x=1172)',
  'Ans. (3)',
].join('\n')
const q39Shown = officialPyqCardAsShown(
  {
    text: 'Which of the following circuits is reverse - biased ?',
    options: [
      `\\includegraphics{${CROP_A}}`,
      `\\includegraphics{${CROP_B}}`,
      `\\includegraphics{${CROP_C}}`,
      `\\includegraphics{${CROP_D}}`,
    ],
    questionType: 'single_correct',
    printedNumber: 39,
    adminEdited: true,
  },
  q39Ocr,
)
assert.equal(String(q39Shown.text).trim(), 'Which of the following circuits is reverse - biased ?')
assert.equal(
  (String(q39Shown.text).match(/includegraphics|!\[/g) || []).length,
  0,
  'Q39 stem has no extra circuit images',
)
assert.equal(
  q39Shown.options.filter((o) => /cdn\.mathpix\.com/.test(String(o))).length,
  4,
  'Q39 swaps clubbed paper crops for Mathpix CDN option figures',
)

// Q75: OCR prints the same SMILES four times; keep distinct page crops (do not collapse options).
const { preferOcrSmilesOverBadOptionCrops } = await import('../src/utils/restorePyqOptionFiguresFromOcr.js')
const q75Ocr = [
  'Bond line formula of $\\mathrm{HOCH}(\\mathrm{CN})_{2}$ is',
  '(1)',
  '<smiles>N#CC(O)C#N</smiles>',
  '(2)',
  '<smiles>N#CC(O)C#N</smiles>',
  '(3)',
  '<smiles>N#CC(O)C#N</smiles>',
  '(4)',
  '<smiles>N#CC(O)C#N</smiles>',
  'Ans. (3)',
].join('\n')
const q75Crops = [
  '\\includegraphics{/api/official-pyq/original/crops/q75-a.png?page=32&x0=0.2090&y0=0.7093&x1=0.3232&y1=0.7798}',
  '\\includegraphics{/api/official-pyq/original/crops/q75-b.png?page=32&x0=0.5690&y0=0.7147&x1=0.7086&y1=0.7753}',
  '\\includegraphics{/api/official-pyq/original/crops/q75-c.png?page=32&x0=0.2065&y0=0.7847&x1=0.3098&y1=0.8544}',
  '\\includegraphics{/api/official-pyq/original/crops/q75-d.png?page=32&x0=0.5690&y0=0.7890&x1=0.7086&y1=0.8544}',
]
const q75Kept = preferOcrSmilesOverBadOptionCrops(
  {
    text: 'Bond line formula of $\\mathrm{HOCH}(\\mathrm{CN})_{2}$ is',
    options: q75Crops,
    printedNumber: 75,
  },
  q75Ocr,
)
assert.deepEqual(q75Kept.options, q75Crops, 'Q75 keeps page crops when OCR SMILES are identical')
const q75Shown = officialPyqCardAsShown(
  {
    text: 'Bond line formula of $\\mathrm{HOCH}(\\mathrm{CN})_{2}$ is',
    options: q75Crops,
    questionType: 'single_correct',
    printedNumber: 75,
    adminEdited: true,
  },
  q75Ocr,
)
assert.equal(
  q75Shown.options.filter((o) => /original\/crops\/q75-/.test(String(o))).length,
  4,
  'Q75 asShown still shows the four page crops',
)
assert.equal(
  /cdn\.mathpix|includegraphics/i.test(String(q75Shown.text)),
  false,
  'Q75 stem stays prose-only when options already hold the drawings',
)

// S1 Q63: four distinct arenium SMILES must win over original page crops (pairRe gap fill).
const q63Ocr = [
  '63. The arenium ion which is not involved in the bromination of Aniline is ____.',
  '(1)',
  '<smiles>[NH2+]=C1C=CC=CC1Br</smiles>',
  '(2)',
  '<smiles>[NH3+]=C1C=CC(Br)C=C1</smiles>',
  '(3)',
  '<smiles>NC1=CC=CC(Br)[CH+]1</smiles>',
  '(4)',
  '<smiles>NC1=CC=C[CH+]C1Br</smiles>',
  'Ans. (3)',
].join('\n')
const q63Crops = [
  '\\includegraphics{/api/official-pyq/original/crops/q63-a.png?page=23&x0=0.21&y0=0.63&x1=0.33&y1=0.73}',
  '\\includegraphics{/api/official-pyq/original/crops/q63-b.png?page=23&x0=0.57&y0=0.62&x1=0.66&y1=0.73}',
  '\\includegraphics{/api/official-pyq/original/crops/q63-c.png?page=23&x0=0.21&y0=0.74&x1=0.32&y1=0.85}',
  '\\includegraphics{/api/official-pyq/original/crops/q63-d.png?page=23&x0=0.57&y0=0.72&x1=0.69&y1=0.82}',
]
const q63Fixed = preferOcrSmilesOverBadOptionCrops(
  {
    text: 'The arenium ion which is not involved in the bromination of Aniline is ____.',
    options: q63Crops,
    printedNumber: 63,
  },
  q63Ocr,
)
assert.equal(q63Fixed.options.filter((o) => /<smiles>/i.test(String(o))).length, 4, 'Q63 prefers four OCR SMILES')
assert.match(String(q63Fixed.options[2]), /NC1=CC=CC\(Br\)\[CH\+\]1/)

// Q78: bare stem crop → cyclohexene SMILES, not an earlier enol SMILES from a wide OCR window.
const q78Ocr = [
  'Highest enol content will be shown by:',
  '(1) <smiles>O=C1CC(=O)CC(=O)C1</smiles>',
  'Ans. (1)',
  '\\item[] *78. Cyclohexene',
  '<smiles>C1=CCCCC1</smiles>',
  'is ______ type of an organic compound.',
  '(1) Benzenoid aromatic',
  '(2) Acyclic',
  '(3) Alicyclic',
  '(4) Benzenoid non-aromatic',
  'Ans. (3)',
].join('\n')
const q78Fixed = preferOcrSmilesOverBadStemCrops(
  {
    text: 'Cyclohexene \\includegraphics{/api/official-pyq/original/crops/q78.png?y0=0.1&y1=0.4} is ______ type of an organic compound.',
    options: ['Benzenoid aromatic', 'Acyclic', 'Alicyclic', 'Benzenoid non-aromatic'],
    printedNumber: 78,
  },
  q78Ocr,
)
assert.match(String(q78Fixed.text), /<smiles>C1=CCCCC1<\/smiles>/)
assert.doesNotMatch(String(q78Fixed.text), /O=C1CC\(=O\)/)

// S1 Q76: Compare crops → OCR SMILES; stem keeps the reaction CDN figure (not Sol. pages).
const s1Q76Ocr = [
  '76. The major product (P) in the following reaction is',
  '![](https://cdn.mathpix.com/cropped/s1-76-stem.jpg?height=256&width=719&top_left_y=1091&top_left_x=382)',
  '(1)',
  '<smiles>BrCc1cccc(Br)c1</smiles>',
  '(2)',
  '<smiles>Oc1cccc(CCBr)c1</smiles>',
  '(3)',
  '<smiles>CC(Br)c1cccc(Br)c1</smiles>',
  '(4)',
  '<smiles>CC(Br)c1cccc(O)c1</smiles>',
  'Ans. (4)',
  'Sol.',
  '![](https://cdn.mathpix.com/cropped/s1-76-sol-a.jpg?height=261&width=720&top_left_y=1926&top_left_x=385)',
  '![](https://cdn.mathpix.com/cropped/s1-76-sol-b.jpg?height=714&width=1161&top_left_y=253&top_left_x=381)',
  '77. Chlorine undergoes disproportionation in alkaline medium as shown below :',
].join('\n')
const s1Q76Crops = [
  '\\includegraphics{/api/official-pyq/original/crops/s1-76-a.png?page=27&x0=0.2114&y0=0.4829&x1=0.3316&y1=0.5871}',
  '\\includegraphics{/api/official-pyq/original/crops/s1-76-b.png?page=27&x0=0.5750&y0=0.4829&x1=0.6977&y1=0.5871}',
  '\\includegraphics{/api/official-pyq/original/crops/s1-76-c.png?page=27&x0=0.2041&y0=0.5756&x1=0.3316&y1=0.6789}',
  '\\includegraphics{/api/official-pyq/original/crops/s1-76-d.png?page=27&x0=0.5678&y0=0.5747&x1=0.6977&y1=0.6789}',
]
const s1Q76Stem =
  'The major product (P) in the following reaction is\n\\includegraphics{https://cdn.mathpix.com/cropped/s1-76-stem.jpg?height=256&width=719&top_left_y=1091&top_left_x=382}'
const s1Q76Prefer = preferOcrSmilesOverBadOptionCrops(
  { text: s1Q76Stem, options: s1Q76Crops, printedNumber: 76 },
  s1Q76Ocr,
)
assert.equal(s1Q76Prefer.options.filter((o) => /<smiles>/i.test(String(o))).length, 4, 'S1 Q76 prefers OCR SMILES over Compare crops')
assert.match(String(s1Q76Prefer.options[3]), /CC\(Br\)c1cccc\(O\)c1/)
const s1Q76Shown = officialPyqCardAsShown(
  {
    text: s1Q76Stem,
    options: s1Q76Crops,
    questionType: 'single_correct',
    printedNumber: 76,
    adminEdited: true,
    editSource: 'auto_compare',
  },
  s1Q76Ocr,
)
assert.equal(s1Q76Shown.options.filter((o) => /<smiles>/i.test(String(o))).length, 4, 'S1 Q76 asShown shows SMILES options')
assert.match(String(s1Q76Shown.text), /s1-76-stem\.jpg/, 'S1 Q76 stem keeps the reaction figure')
assert.doesNotMatch(String(s1Q76Shown.text), /s1-76-sol/, 'S1 Q76 stem never pulls Sol. figures')

// S1 Q77: disproportionation stays text; prior Q76 Sol. crop must not become the stem figure.
const s1Q77Ocr = [
  '77. Chlorine undergoes disproportionation in alkaline medium as shown below :',
  '$\\mathrm{a} \\mathrm{Cl}_{2}+\\mathrm{b} \\mathrm{OH}^{-} \\rightarrow \\mathrm{c} \\mathrm{ClO}^{-}+\\mathrm{d} \\mathrm{Cl}^{-}$',
  'The values of a, b, c and d in a balanced redox reaction are respectively:',
  '(1) 2, 2, 1 and 3',
  '(2) 1, 2, 1 and 1',
  '(3) 2, 4, 1 and 3',
  '(4) 3, 4, 4 and 2',
  'Ans. (3)',
].join('\n')
const s1Q77Shown = officialPyqCardAsShown(
  {
    text: 'Chlorine undergoes disproportionation in alkaline medium as shown below :\n$\\mathrm{a} \\mathrm{Cl}_{2}+\\mathrm{b} \\mathrm{OH}^{-} \\rightarrow \\mathrm{c} \\mathrm{ClO}^{-}+\\mathrm{d} \\mathrm{Cl}^{-}$\nThe values of a, b, c and d in a balanced redox reaction are respectively:',
    options: ['2, 2, 1 and 3', '1, 2, 1 and 1', '2, 4, 1 and 3', '3, 4, 4 and 2'],
    questionType: 'single_correct',
    printedNumber: 77,
  },
  `${s1Q76Ocr}\n${s1Q77Ocr}`,
)
assert.equal(
  (String(s1Q77Shown.text).match(/\\includegraphics|!\[[^\]]*\]\(/g) || []).length,
  0,
  'S1 Q77 stem has no figure (equation is text; Sol. of Q76 stays out)',
)
assert.deepEqual(
  s1Q77Shown.options.map((o) => String(o).replace(/\s+/g, ' ').trim()),
  ['2, 2, 1 and 3', '1, 2, 1 and 1', '2, 4, 1 and 3', '3, 4, 4 and 2'],
)

// S1 Q78: multistep reaction — Compare crops → distinct OCR SMILES; stem keeps scheme CDN.
const s1Q78Ocr = [
  '78. The final product A formed in the following multistep reaction sequence is',
  '![](https://cdn.mathpix.com/cropped/s1-78-stem.jpg?height=158&width=570&top_left_y=297&top_left_x=382)',
  '(1)',
  '<smiles>O=C(O)Cc1ccccc1</smiles>',
  '(2)',
  '<smiles>C/C(=N\\N)c1ccccc1</smiles>',
  '(3)',
  '<smiles>N/N=C/Cc1ccccc1</smiles>',
  '(4)',
  '<smiles>CCc1ccccc1</smiles>',
  'Ans. (4)',
  'Sol.',
  '![](https://cdn.mathpix.com/cropped/s1-78-sol.jpg?height=569&width=934&top_left_y=927&top_left_x=890)',
].join('\n')
const s1Q78Crops = [
  '\\includegraphics{/api/official-pyq/original/crops/s1-78-a.png?page=29&x0=0.2053&y0=0.1893&x1=0.3874&y1=0.2798}',
  '\\includegraphics{/api/official-pyq/original/crops/s1-78-b.png?page=29&x0=0.5678&y0=0.1638&x1=0.7219&y1=0.2607}',
  '\\includegraphics{/api/official-pyq/original/crops/s1-78-c.png?page=29&x0=0.2053&y0=0.2284&x1=0.4201&y1=0.3198}',
  '\\includegraphics{/api/official-pyq/original/crops/s1-78-d.png?page=29&x0=0.5678&y0=0.2511&x1=0.7013&y1=0.3198}',
]
const s1Q78Stem =
  'The final product A formed in the following multistep reaction sequence is\n\\includegraphics{https://cdn.mathpix.com/cropped/s1-78-stem.jpg?height=158&width=570&top_left_y=297&top_left_x=382}'
const s1Q78Prefer = preferOcrSmilesOverBadOptionCrops(
  { text: s1Q78Stem, options: s1Q78Crops, printedNumber: 78 },
  s1Q78Ocr,
)
assert.equal(s1Q78Prefer.options.filter((o) => /<smiles>/i.test(String(o))).length, 4, 'S1 Q78 prefers OCR SMILES over Compare crops')
assert.match(String(s1Q78Prefer.options[3]), /CCc1ccccc1/)
const s1Q78Shown = officialPyqCardAsShown(
  {
    text: s1Q78Stem,
    options: s1Q78Crops,
    questionType: 'single_correct',
    printedNumber: 78,
    adminEdited: true,
    editSource: 'auto_compare',
  },
  s1Q78Ocr,
)
assert.equal(s1Q78Shown.options.filter((o) => /<smiles>/i.test(String(o))).length, 4, 'S1 Q78 asShown shows SMILES options')
assert.match(String(s1Q78Shown.text), /s1-78-stem\.jpg/, 'S1 Q78 stem keeps the multistep scheme')
assert.doesNotMatch(String(s1Q78Shown.text), /s1-78-sol/, 'S1 Q78 stem never pulls Sol. figures')

// Q60: PART - C (CHEMISTRY) under a Physics solution / institute field.
const cleanedPart = stripTrailingPyqSectionHeader(
  '$$v=\\sqrt{673}$$\n\nPART - C (CHEMISTRY)',
)
assert.doesNotMatch(cleanedPart, /PART\s*-\s*C/i)

// S2 Q36: tension Sol. must not keep Q37's resistor-circuit crop (two-column glue).
const S2_CIRCUIT =
  'https://cdn.mathpix.com/cropped/f53e8ce3-d097-4405-a7c6-a10c2f1f6367-15.jpg?height=351&width=551&top_left_y=998&top_left_x=1236'
const s2Q36Ocr = [
  '\\item[Q.] 36 A stone of mass 900 g is tied to a string and moved in a vertical circle of radius 1 m making 10 rpm. The tension in the string, when the stone is at the lowest point is (if $\\pi^{2}=9.8$ and $\\mathrm{g}=9.8 \\mathrm{~m} / \\mathrm{s}^{2}$ ):',
  '(1) 17.8 N',
  '(2) 8.82 N',
  '(3) 97 N',
  '(4) 9.8 N',
  '\\end{itemize}',
  'Ans. (4)',
  '\\begin{itemize}',
  '\\item[] Sol.',
  '$$\\begin{aligned}',
  '& \\mathrm{T}-\\mathrm{mg}=\\mathrm{m} \\ell \\omega^{2} \\\\',
  '& \\mathrm{~T}=\\mathrm{mg}+\\mathrm{m} \\ell \\omega^{2} \\\\',
  '& \\mathrm{~T}=9.8 \\mathrm{~N} .',
  '\\end{aligned}$$',
  `![](${S2_CIRCUIT})`,
  '\\item[37.] In the given circuit, the current in resistance $\\mathrm{R}_{3}$ is:',
  '(1) 2.5 A',
  '(2) 1 A',
  '(3) 1.5 A',
  '(4) 2 A',
  '\\end{itemize}',
  'Ans. (2)',
  '\\begin{itemize}',
  '\\item[] Sol.',
  '$$R_{eq}=5\\Omega$$',
].join('\n')
const s2Q36Healed = healUploadQuestionCard(
  {
    text: 'A stone of mass 900 g is tied to a string and moved in a vertical circle of radius 1 m making 10 rpm. The tension in the string, when the stone is at the lowest point is (if $\\pi^{2}=9.8$ and $\\mathrm{g}=9.8 \\mathrm{~m} / \\mathrm{s}^{2}$ ):',
    options: ['17.8 N', '8.82 N', '97 N', '9.8 N'],
    printedNumber: 36,
    questionNumber: 36,
    subject: 'physics',
    solution:
      '$$\\begin{aligned}\n& \\mathrm{T}-\\mathrm{mg}=\\mathrm{m} \\ell \\omega^{2} \\\\\n& \\mathrm{~T}=\\mathrm{mg}+\\mathrm{m} \\ell \\omega^{2} \\\\\n& \\mathrm{~T}=9.8 \\mathrm{~N} .\n\\end{aligned}$$\n' +
      `\\includegraphics{${S2_CIRCUIT}}`,
  },
  s2Q36Ocr,
)
assert.match(String(s2Q36Healed.solution), /T=9\.8|T\}=9\.8/, 'S2 Q36 Sol. keeps tension math')
assert.doesNotMatch(String(s2Q36Healed.solution), /f53e8ce3/, 'S2 Q36 Sol. drops stolen resistor circuit')
const s2Q37Healed = healUploadQuestionCard(
  {
    text: 'In the given circuit, the current in resistance $\\mathrm{R}_{3}$ is:',
    options: ['2.5 A', '1 A', '1.5 A', '2 A'],
    printedNumber: 37,
    questionNumber: 37,
    subject: 'physics',
    solution: '$$R_{eq}=5\\Omega$$',
  },
  s2Q36Ocr,
)
assert.match(String(s2Q37Healed.text), /f53e8ce3/, 'S2 Q37 stem recovers circuit figure from prior Sol. glue')

console.log('test-glued-mcq-figures: ok')

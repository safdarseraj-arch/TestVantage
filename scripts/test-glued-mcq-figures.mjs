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

console.log('test-glued-mcq-figures: ok')

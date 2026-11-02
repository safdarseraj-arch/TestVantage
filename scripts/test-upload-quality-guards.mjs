/**
 * Shared quality laws for EVERY TestVantages upload — Question Bank Convert
 * (parseBulk / Mathpix split / persist / JSON / CSV), not Official-PYQ-only.
 */
import assert from 'node:assert/strict'
import { latexExtractionIncomplete } from '../src/utils/healTruncatedLatex.js'
import {
  applyUploadQualityGuards,
  healUploadQuestionCard,
  matchQuestionMissingListI,
} from '../src/utils/uploadQualityGuards.js'
import { parseBulkQuestions } from '../src/utils/parseBulkQuestions.js'
import { persistQuestionForBank } from '../src/utils/persistUpload.js'
import { parseQuestionsFromJson } from '../src/utils/jsonImport.js'
import { csvToQuestions } from '../src/utils/csvQuestions.js'
import { mathpixSplitToBankDrafts } from '../src/utils/mathpixQuestionSplit.js'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { LET_ABE_SMASHED_VMATRIX_STEM } from '../src/utils/repairSmashedProseVmatrixOcr.js'
import { getQuestionPublishBlockers } from '../src/utils/questionBankReview.js'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import { parseMatchingListForDisplay } from '../src/utils/parseMatchingListDisplay.js'
import katex from 'katex'

const LIST_I_OCR = `Let $\\alpha$ and $\\beta$ be the distinct roots of the equation $x^2 + x - 1 = 0$. Match each entry in List-I to the correct entry in List-II.
List-I
(P) The number of matrices $M$ with all entries in $T$ such that $R_i = C_j = 0$ is
(Q) The number of symmetric matrices $M$ with all entries in $T$ is
(R) Let $M$ be a skew symmetric matrix with enough words here
(S) Let $M$ be a matrix with all entries in $T$ then the absolute value of det
List-II
(1) $1$
(2) $12$
(3) infinite
(4) $6$
(5) $0$`

const MATCH_OPTS = [
  '(P) -> (4) (Q) -> (2) (R) -> (5) (S) -> (1)',
  '(P) -> (2) (Q) -> (4) (R) -> (1) (S) -> (5)',
  '(P) -> (4) (Q) -> (2) (R) -> (1) (S) -> (5)',
  '(P) -> (2) (Q) -> (4) (R) -> (5) (S) -> (1)',
]

const stemListTwoOnly =
  'Match each entry in List-I to the correct entry in List-II.\nList-II\n(1) $1$\n(2) $12$\n(3) infinite\n(4) $6$\n(5) $0$'

const Q8_ORPHAN_ALIGNED =
  'Let $a = 3\\sqrt{2}$ and $b = \\frac{1}{5^{1/6}\\sqrt{6}}$. If $x, y \\in \\mathbb{R}$ are such that & 3 x+2 y= \\log _{a} (18)^{\\frac{5}{4}} \\quad \\text{ and } \\\\ & 2 x-y= \\log_{b}(\\sqrt{1080}), then $4x+5y$ is equal to ___ .'

assert.equal(
  latexExtractionIncomplete(Q8_ORPHAN_ALIGNED),
  false,
  'closed frac{5}{4} is not a cut-off fraction on bank or PYQ cards',
)

const bankAligned = applyUploadQualityGuards([{ text: Q8_ORPHAN_ALIGNED, options: ['1', '2', '3', '4'] }], '')
assert.equal(bankAligned.length, 1)
assert.match(bankAligned[0].text, /\\begin\{aligned\}/)
const alignedVisible = String(bankAligned[0].text)
  .replace(/\$\$[\s\S]*?\$\$/g, ' ')
  .replace(/\$[^$]*\$/g, ' ')
assert.doesNotMatch(alignedVisible, /& 3 x\+2 y= \\log/)

const restored = applyUploadQualityGuards(
  [{ text: stemListTwoOnly, options: MATCH_OPTS, questionType: 'single_correct' }],
  LIST_I_OCR,
)
assert.equal(matchQuestionMissingListI({ text: stemListTwoOnly, options: MATCH_OPTS }), true)
assert.match(restored[0].text, /\(P\)/)
assert.match(restored[0].text, /number of matrices/)
assert.equal(matchQuestionMissingListI(restored[0]), false)

assert.equal(
  applyUploadQualityGuards(
    [{ text: stemListTwoOnly, options: MATCH_OPTS }],
    'no lists in this OCR window at all',
  )[0].text,
  stemListTwoOnly,
  'do not invent List-I when OCR has no rows',
)

const withTail = applyUploadQualityGuards(
  [
    { text: Q8_ORPHAN_ALIGNED, options: ['1', '2', '3', '4'] },
    {
      text: 'Match the quantities mentioned in List-I with their values in List-II and choose the correct option.',
      options: [],
    },
  ],
  LIST_I_OCR,
)
assert.equal(withTail.length, 1, 'instruction-tail extra must drop on bank Convert too')

const bulkRaw = `Q.1 Let $a = 3\\sqrt{2}$. If $x, y$ are such that & 3 x+2 y= \\log _{a} (18)^{\\frac{5}{4}} \\\\ & 2 x-y= 1, then $4x+5y$ is
(A) $1$
(B) $2$
(C) $3$
(D) $4$`
const bulk = parseBulkQuestions(bulkRaw)
assert.ok(bulk.length >= 1, 'bank Convert bulk parse keeps the real question')
assert.match(bulk[0].text, /\\begin\{aligned\}|\$\$/)
assert.equal(latexExtractionIncomplete(bulk[0].text), false)

const figOcr = `Q.8 Let a particle as shown in the figure start from rest.
\\includegraphics{https://cdn.mathpix.com/p/vt-graph.png}
Then the current is
(A) 1
(B) 2
(C) 3
(D) 4`
const figBulk = parseBulkQuestions(figOcr)
assert.ok(figBulk.length >= 1)
assert.match(figBulk[0].text, /cdn\.mathpix\.com\/p\/vt-graph/)

const persistFig = persistQuestionForBank({
  questionType: 'single_correct',
  text: 'Let a particle as shown in the figure start from rest. Then the current is',
  options: ['1', '2', '3', '4'],
  extractedRaw: figOcr,
})
assert.match(persistFig.text, /cdn\.mathpix\.com\/p\/vt-graph/, 'bank persist restores Mathpix figure from OCR')

const persistMatch = persistQuestionForBank({
  questionType: 'single_correct',
  text: stemListTwoOnly,
  options: MATCH_OPTS,
  extractedRaw: LIST_I_OCR,
})
assert.match(persistMatch.text, /\(P\)/, 'bank persist restores List-I from OCR')
assert.equal(matchQuestionMissingListI(persistMatch), false)

const persistKeep = healUploadQuestionCard(
  { id: 'keep-me', text: 'A short real stem that must stay in the 1550 bank.', options: ['A', 'B', 'C', 'D'] },
  '',
)
assert.equal(persistKeep.id, 'keep-me', 'healUploadQuestionCard never drops a bank row')

const json = parseQuestionsFromJson(
  JSON.stringify({
    questions: [
      {
        subject: 'mathematics',
        text: Q8_ORPHAN_ALIGNED,
        options: ['1', '2', '3', '4'],
        correctIndex: 0,
      },
    ],
  }),
)
assert.match(json[0].text, /\\begin\{aligned\}/)

const csv = csvToQuestions(
  [
    'id,subject,questiontype,text,optiona,optionb,optionc,optiond,correctindex',
    '"csv-1",mathematics,single_correct,"Let x = \\frac{5}{4} then y is",1,2,3,4,0',
  ].join('\n'),
)
assert.ok(csv.length >= 1)
assert.match(csv[0].text, /\\frac/)

const mathpixRaw = `\\item[Q.1] Let a particle as shown in the figure start from rest.
\\includegraphics{https://cdn.mathpix.com/p/vt-graph.png}
If $x, y$ are such that & 3 x+2 y= \\log _{a} (18)^{\\frac{5}{4}} \\\\ & 2 x-y= 1, then $4x+5y$ is
(A) 1
(B) 2
(C) 3
(D) 4
\\item[Q.2] Let $2+2$ equal
(A) 3
(B) 4
(C) 5
(D) 6`
const { drafts } = mathpixSplitToBankDrafts(mathpixRaw)
assert.ok(drafts.length >= 2, 'bank Mathpix split kept real questions, got ' + drafts.length)
const figDraft = drafts.find((d) => /particle as shown/i.test(d.text))
assert.ok(figDraft, 'figure card kept')
assert.match(figDraft.text, /cdn\.mathpix\.com\/p\/vt-graph/)
assert.match(figDraft.text, /\\begin\{aligned\}/)
assert.doesNotMatch(
  String(figDraft.text)
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$]*\$/g, ' '),
  /& 3 x\+2 y= \\log/,
)

const single = parseSingleQuestionUpload(bulkRaw)
assert.match(String(single.text ?? ''), /\\begin\{aligned\}|\$\$/)

const smashedGuarded = applyUploadQualityGuards(
  [
    {
      text: LET_ABE_SMASHED_VMATRIX_STEM,
      options: ['9', '11', '12', '15'],
      correctIndex: 1,
      subject: 'mathematics',
      section: 'Algebra',
      chapter: 'Matrices',
      questionType: 'single_correct',
    },
  ],
  '',
)
assert.equal(smashedGuarded.length, 1, 'do not drop the smashed card from the bank')
assert.doesNotMatch(smashedGuarded[0].text, /\$\$/)
assert.match(smashedGuarded[0].text, /Let A be an/i)
assert.equal(latexExtractionIncomplete(smashedGuarded[0].text), true)
assert.ok(getQuestionPublishBlockers(smashedGuarded[0]).length > 0, 'healed smash is still not Publish-ready')

const { mergeOfficialPyqQuestionsBySlot } = await import('../src/utils/officialPyqMissingSlots.js')
const { repairOrphanAlignedBody } = await import('../src/utils/wrapBareLatexRuns.js')
const extras = Array.from({ length: 53 }, (_, i) => ({
  text: i >= 51 ? 'Match the quantities mentioned in List-I with their values in List-II and choose the correct option.' : `Let $f_${i + 1}(x)=x$. Then $f(1)$ is`,
  options: i >= 51 ? [] : ['1', '2', '3', '4'],
  pyqSlot: i + 1,
  questionNumber: i + 1,
}))
const rebuilt51 = extras.slice(0, 51)
const merged = mergeOfficialPyqQuestionsBySlot(extras, rebuilt51, 51)
assert.equal(merged.length, 51, 'rebuild to OCR count must drop instruction extras (53→51)')

const leftoverNoThen =
  'If $x, y$ are such that & 3 x+2 y= \\log _{a} (18)^{\\frac{5}{4}} \\\\ & 2 x-y= 1 is equal to'
const wrappedNoThen = repairOrphanAlignedBody(leftoverNoThen)
assert.match(wrappedNoThen, /\\begin\{aligned\}/)
const leftoverVisible = String(wrappedNoThen)
  .replace(/\$\$[\s\S]*?\$\$/g, ' ')
  .replace(/\$[^$]*\$/g, ' ')
assert.doesNotMatch(leftoverVisible, /& 3 x\+2 y=/)

const { stripRepeatedQuestionNumberPrefix } = await import('../src/utils/wrapBareLatexRuns.js')
const { dedupeUploadQuestionSlots } = await import('../src/utils/officialPyqMissingSlots.js')
assert.equal(
  stripRepeatedQuestionNumberPrefix('Q.8 Let $a=1$. Then $x$ is'),
  'Let $a=1$. Then $x$ is',
)
assert.equal(
  stripRepeatedQuestionNumberPrefix('8. Let $a=1$. Then $x$ is'),
  'Let $a=1$. Then $x$ is',
)
assert.match(
  stripRepeatedQuestionNumberPrefix('2.5 g of a compound is dissolved'),
  /2\.5 g/,
  'never eat a decimal mass as a question number',
)
const strippedHeal = healUploadQuestionCard(
  { text: 'Q.8 Q.8 Let $a=1$. Then $x$ is', options: ['1', '2', '3', '4'] },
  '',
)
assert.doesNotMatch(strippedHeal.text, /^Q\.8/)
const dupSlots = dedupeUploadQuestionSlots([
  { text: 'Let $a=1$. Then $x$ is', options: ['1', '2', '3', '4'], printedNumber: 8, questionNumber: 8 },
  { text: 'Let $a=1$. Then $x$ is', options: ['1', '2', '3', '4'], printedNumber: 8, questionNumber: 8 },
])
assert.equal(dupSlots.length, 1, 'consecutive reprint of the same slot must drop')

const graphOcr = `Q.9 A particle moves as shown below.
\\includegraphics{https://cdn.mathpix.com/p/circuit.png}
Then the current is
(A) 1
(B) 2
(C) 3
(D) 4`
const graphHeal = healUploadQuestionCard(
  { text: 'A particle moves as shown below. Then the current is', options: ['1', '2', '3', '4'] },
  graphOcr,
)
assert.match(graphHeal.text, /cdn\.mathpix\.com\/p\/circuit/, 'Mathpix figure restores from “as shown below”')

const tornOneQuestion = applyUploadQualityGuards(
  [
    {
      text: 'Let $\\frac{\\pi}{2}<x<\\pi$ be such that $\\cot x=\\frac{-5}{\\sqrt{11}}$. Then',
      options: [],
    },
    {
      text: '$$\\left( \\sin \\frac{11x}{2} \\right) (\\sin 6x - \\cos 6x)+\\left( \\cos \\frac{11x}{2} \\right) (\\sin 6x + \\cos 6x)$$ is equal to',
      options: ['$\\frac{\\sqrt{11}}{2}$', '$\\frac{11\\sqrt{11}}{2}$', '$\\frac{-\\sqrt{11}}{2}$', '$\\frac{-11\\sqrt{11}}{2}$'],
    },
  ],
  '',
)
assert.equal(tornOneQuestion.length, 1, 'Official PYQ must rejoin a stem torn from its display math')
assert.match(tornOneQuestion[0].text, /11x/)
assert.match(tornOneQuestion[0].text, /cot x/)

const alsoLetOne = applyUploadQualityGuards(
  [
    {
      text: 'Let $f(x)=\\sin \\pi x+\\cos \\pi x+2$ and $g(x)=x$. Also let the fundamental period of $f$ and $g$ be $T_1$ and $T_2$. Then $T_1+T_2$ is',
      options: ['1', '2', '3', '4'],
    },
  ],
  '',
)
assert.equal(alsoLetOne.length, 1, 'Also let in the same SCQ must not become two cards')

const pdfGluedTwo = `Which of the following is true?
(A) one
(B) two
(C) three
(D) four
For the reaction $N_2+3H_2$, the product is
(A) $NH_3$
(B) $NO$
(C) $N_2O$
(D) $H_2$`
const pdfSplit = parseBulkQuestions(pdfGluedTwo)
assert.equal(pdfSplit.length, 2, 'PDF/bulk must un-glue two MCQs after option D, got ' + pdfSplit.length)
assert.match(pdfSplit[0].text, /true/)
assert.match(pdfSplit[1].text, /reaction/)

const oneCardTwoQs = applyUploadQualityGuards(
  [
    {
      text: pdfGluedTwo,
      options: ['one', 'two', 'three', 'four'],
    },
  ],
  pdfGluedTwo,
)
assert.equal(oneCardTwoQs.length, 2, 'quality guards must split two questions stored as one card')

const sphereStem =
  'A light ray is incident on the surface of a sphere of refractive index $n$ at an angle of incidence $\\theta_{0}$. The ray partially refracts into the sphere. The total angle of deviation of the emergent ray with respect to the incident ray is $\\alpha$. Match the quantities mentioned in List-I with their values in List-II and choose the correct option.'
const sphereRows = `If $n=2$ and $\\alpha=180^{\\circ}$, then all the possible values of $\\theta_{0}$ will be
(Q) If $n=\\sqrt{3}$ and $\\alpha=180^{\\circ}$, then all the possible values of $\\theta_{0}$ will be
(R) If $n=\\sqrt{3}$ and $\\alpha=180^{\\circ}$, then all the possible values of $\\phi_{0}$ will be
(S) If $n=\\sqrt{2}$ and $\\theta_{0}=45^{\\circ}$, then all the possible values of $\\alpha$ will be
(A) P → 5; Q → 2; R → 1; S → 4
(B) P → 4; Q → 3; R → 2; S → 1
(C) P → 5; Q → 2; R → 1; S → 3
(D) P → 4; Q → 3; R → 1; S → 2`
const sphereJoined = applyUploadQualityGuards(
  [
    { text: sphereStem, options: [], printedNumber: 16, questionNumber: 33 },
    { text: sphereRows, options: ['30° and 0°', '45°', '60°', '90°'], printedNumber: 34, questionNumber: 34 },
  ],
  '',
)
assert.equal(sphereJoined.length, 1, 'match List-I If-rows must rejoin the previous stem, not stay two cards')
assert.match(sphereJoined[0].text, /light ray/)
assert.match(sphereJoined[0].text, /\(Q\)/)

const { splitGluedPaperItemText } = await import('../src/utils/mathpixQuestionSplit.js')
assert.equal(
  splitGluedPaperItemText(`${sphereStem}\n${sphereRows}`).stems.length,
  1,
  'do not split one match-the-column at If n=2',
)

const dupPhenol = applyUploadQualityGuards(
  [
    {
      text: 'List-I contains various reaction sequences and List-II contains different phenolic compounds. Match each entry in List-I with the appropriate entry in List-II and choose the correct option.\nList-I\n(P) reaction one with enough words here to fill the fingerprint',
      options: ['P-2, Q-3, R-4, S-5', 'P-1', 'P-3', 'P-4'],
      printedNumber: 17,
      questionNumber: 52,
    },
    {
      text: 'List-I contains various reaction sequences and List-II contains different phenolic compounds. Match each entry in List-I with the appropriate entry in List-II and choose the correct option.\nList-I\n(P) reaction one with enough words here to fill the fingerprint',
      options: ['P-2, Q-3, R-4, S-5', 'P-1', 'P-3', 'P-4'],
      printedNumber: 17,
      questionNumber: 53,
    },
  ],
  '',
)
assert.equal(dupPhenol.length, 1, 'consecutive reprint of the same match card must drop')

const Q8_LIVE_BROKEN =
  'Let $a = 3\\sqrt{2}$ and $b = \\frac{1}{5^{1/6}\\sqrt{6}}$. If $x, y \\in \\mathbb{R}$ are such that $$ 3 x+2 y=$$ \\log _{a}(18)^{\\frac{5}{4}} \\quad \\text { and } \\\\ & 2 x-y= \\log _{b}(\\sqrt{1080}), then $4x+5y$ is equal to ___ .'
const q8Live = applyUploadQualityGuards([{ text: Q8_LIVE_BROKEN, options: [] }], '')
assert.match(q8Live[0].text, /\\begin\{aligned\}/)
const q8LiveVisible = String(q8Live[0].text)
  .replace(/\$\$[\s\S]*?\$\$/g, ' ')
  .replace(/\$[^$]*\$/g, ' ')
assert.doesNotMatch(q8LiveVisible, /\\log/)
assert.doesNotMatch(q8LiveVisible, /\\\\ &/)

const polaroidStem =
  'A point source S emits unpolarized light uniformly in all directions. At two points A and B, the ratio of the intensities of light is 2.'
const polaroidOcr = `Q. 27 ${polaroidStem}
then the new value of r will be ____ .
Q. 30 A rod of length L rotates about O as shown in the figure.
\\includegraphics{https://cdn.mathpix.com/cropped/rod-figure.png}
Point P is at L/2 from the free end.`
const { restoreMissingFiguresFromSource } = await import('../src/utils/extendTruncatedStem.js')
assert.equal(
  restoreMissingFiguresFromSource(polaroidStem, polaroidOcr),
  polaroidStem,
  'do not steal the next question figure',
)
const stolenFig = applyUploadQualityGuards(
  [
    {
      text: `${polaroidStem}\n\\includegraphics{https://cdn.mathpix.com/cropped/rod-figure.png}`,
      options: [],
    },
  ],
  polaroidOcr,
)
assert.doesNotMatch(stolenFig[0].text, /rod-figure/)

const figKeepOcr = `Q. 1 Let a particle as shown in the figure start from rest.
\\includegraphics{https://cdn.mathpix.com/p/vt-graph.png}
Then the current is
Q. 2 Another question with a drawing
\\includegraphics{https://cdn.mathpix.com/p/other.png}`
const keptFig = restoreMissingFiguresFromSource(
  'Let a particle as shown in the figure start from rest. Then the current is',
  figKeepOcr,
)
assert.match(keptFig, /vt-graph/)
assert.doesNotMatch(keptFig, /other\.png/)

const sphereBothOpts = applyUploadQualityGuards(
  [
    {
      text: sphereStem,
      options: [
        'P → 5; Q → 2; R → 1; S → 4',
        'P → 4; Q → 3; R → 2; S → 1',
        'P → 5; Q → 2; R → 1; S → 3',
        'P → 4; Q → 3; R → 1; S → 2',
      ],
      printedNumber: 33,
      questionNumber: 33,
    },
    {
      text: sphereRows,
      options: ['30° and 0°', '45°', '60°', '90°'],
      printedNumber: 34,
      questionNumber: 34,
    },
  ],
  '',
)
assert.equal(sphereBothOpts.length, 1, 'torn List-I If-rows must join even when both cards have A–D')
assert.match(sphereBothOpts[0].text, /\(Q\)/)
assert.match(sphereBothOpts[0].options[0], /P → 5/)

const dopplerStem =
  'A source (S) of sound has frequency 240 Hz. When the observer (O) and the source move towards each other at a speed v with respect to the ground (as shown in Case 1 in the figure), the observer measures the frequency of the sound to be 288 Hz. However, when the observer and the source move away from each other at the same speed v with respect to the ground (as shown in Case 2 in the figure), the observer measures the frequency of sound to be n Hz. The value of n is ____ .'
const dopplerRepeat =
  'and the source move towards each other at a speed v with respect to the ground (as shown in Case 1 in the figure), the observer measures the frequency of the sound to be 288 Hz. However, when the observer and the source move away from each other at the same speed v with respect to the ground (as shown in Case 2 in the figure), the observer measures the frequency of sound to be n Hz. The'
const dopplerHealed = applyUploadQualityGuards(
  [{ text: dopplerStem, options: [dopplerRepeat, '200', '192', '180'] }],
  '',
)
assert.equal(String(dopplerHealed[0].options[0]).trim(), '', 'option A must not repeat the stem')

const { normalizeBrokenMathpixGraphics } = await import('../src/utils/mathpixMedia.js')
const brokenGfx = normalizeBrokenMathpixGraphics(
  'Match List-I \\includegraphics[alt={},max width= ]{https://cdn.mathpix.com/cropped/ab.png?height=274&width=119} height=274&width=119&top_left_y=411&top_left_x=340 ![]($ https://cdn.mathpix.com/cropped/cd.png)',
)
assert.match(brokenGfx, /\\includegraphics\{https:\/\/cdn\.mathpix\.com\/cropped\/ab\.png/)
assert.match(brokenGfx, /\\includegraphics\{https:\/\/cdn\.mathpix\.com\/cropped\/cd\.png/)
assert.doesNotMatch(brokenGfx, /!\[\]\(\$/)
assert.doesNotMatch(brokenGfx, /alt=\{\}/)

const q48Row5Gfx = normalizeBrokenMathpixGraphics(
  '(4) \\includegraphics{https://cdn.mathpix.com/cropped/ab5af785-29b3-4e7b-9cb4-55445aaafd34-27.jpg?height=258&width=329&top_left_y=1868&top_left_x=1283}\n' +
    '(5) ![](https://cdn.mathpix.com/cropped/ab5af785-29b3-4e7b-9cb4-55445aaafd34-27.jpg?hei',
)
assert.doesNotMatch(q48Row5Gfx, /!\[\]\(/)
assert.match(q48Row5Gfx, /\\includegraphics\{https:\/\/cdn\.mathpix\.com\/cropped\/ab5af785/)

const keyLeakStem = applyUploadQualityGuards(
  [
    {
      text: `${sphereStem}\nList-I\n(P) If n=2\nList-II\n(1) 30°\n(5) 0 The correct option is (A) (P)→(4) (Q)→(3)`,
      options: ['] P-4, Q-3, R-2, S-5', 'P-2', 'P-3', 'P-1'],
    },
  ],
  '',
)
assert.doesNotMatch(keyLeakStem[0].text, /The correct option is/)
assert.doesNotMatch(keyLeakStem[0].options[0], /^\]/)

const q10Flat =
  'Let S={A=( 0 1 c\n1 a d ): a, b, c, d, e \\in{0,1}.and .|A| \\in{-1,1}, where\n1 b e\n|A| denotes the determinant of A. Then the number of elements in S is ____.'
const q10Healed = applyUploadQualityGuards([{ text: q10Flat, options: [] }], '')
assert.match(q10Healed[0].text, /\\begin\{pmatrix\}/)
assert.match(q10Healed[0].text, /1 & b & e/)
assert.doesNotMatch(q10Healed[0].text.replace(/\$\$[\s\S]*?\$\$/g, ' '), /\\in\{0,1\}/)

const q14R =
  'Let M be a skew symmetric matrix such that a_{ij} in T for i > j. Then the number of elements in the set \\{( y ): x, y, z \\in\nz\n\\mathbb{R}, M( y )=(\nz\na_{12}\n0 )\\} is\n-a_{23}'
const q14Healed = applyUploadQualityGuards([{ text: q14R, options: [] }], '')
assert.match(q14Healed[0].text, /\\begin\{pmatrix\}/)
assert.match(q14Healed[0].text, /a_\{12\}/)

const q17Cases =
  'Let f : R to R be defined byf(x)= \\begin{cases} x|x| \\sin \\left( \\frac{1}{x} \\right), & x \\neq 0, \\\\ 0, & x=0, \\end{cases}\\quad \\text { and } \\quad g(x)= \\begin{cases}1-2 x, & 0 \\leq x \\leq \\frac{1}{2} \\\\ 0, & otherwise \\end{cases}. Match each entry in List-I to the correct entry in List-II. List-I (P) If a=0 List-II (1) h is one-one The correct option is (A) P → 4 (B) P → 5 (C) P → 2 (D) P → 1'
const q17Healed = applyUploadQualityGuards([{ text: q17Cases, options: ['h', 'h', 'h', 'h'] }], '')
assert.match(q17Healed[0].text, /\$\$\\begin\{cases\}/)
assert.equal(String(q17Healed[0].options[0]).trim() !== 'h', true, 'junk h options must drop or become mappings')
assert.doesNotMatch(q17Healed[0].text, /The correct option is/)

const q35Maps = applyUploadQualityGuards(
  [
    {
      text: `The circuit shown in the figure contains an inductor L. Match each entry in List-I with List-II.
List-I
(A) P → 1; Q → 3; R → 2; S → 5
(B) P → 1; Q → 2; R → 3; S → 5
List-II
(1) 0
(2) 2
(3) 4
(4) 20
(5) 200 (A) P → 1 ; Q → 3 ; R → 2 ; S → 5`,
      options: [
        'P → 1; Q → 3; R → 2; S → 5',
        'P → 1; Q → 2; R → 3; S → 5',
        'P → 1; Q → 3; R → 2; S → 4',
        'P → 2; Q → 5; R → 3; S → 4',
      ],
    },
  ],
  '',
)
assert.doesNotMatch(q35Maps[0].text, /\(A\) P → 1; Q → 3/)
assert.match(q35Maps[0].options[0], /P → 1/)

const dupSix = applyUploadQualityGuards(
  [
    { text: 'Let $a=1$ and $b=2$. If $x,y$ are such that 3x+2y = 8 then 4x+5y is equal to 20. Extra words here to fill fingerprint length enough.', options: ['1', '2', '3', '4'], printedNumber: 6, questionNumber: 6 },
    { text: 'Let $a=1$ and $b=2$. If $x,y$ are such that 3x+2y = 8 then 4x+5y is equal to 20. Extra words here to fill fingerprint length enough.', options: ['1', '2', '3', '4'], printedNumber: 7, questionNumber: 7 },
  ],
  '',
)
assert.equal(dupSix.length, 1, 'same stem printed as Q6 and Q7 must drop the extra')

const q10LiveSet =
  'Let $S=\\left\\{A=\\left(\\begin{array}{lll}0 & 1 & c \\\\ 1 & a & d \\\\ 1 & b & e\\end{array}\\right): a, b, c, d, e \\in\\{0,1\\}\\right.$ and $|A| \\in\\{-1,1\\}\\right\\}$, where $|A|$ denotes the determinant of $A$. Then the number of elements in $S$ is $____$.'
const q10LiveHealed = applyUploadQualityGuards([{ text: q10LiveSet, options: [] }], '')
assert.match(q10LiveHealed[0].text, /\\in\\\{0,1\\\}/)
assert.doesNotMatch(q10LiveHealed[0].text, /\\right\s*\./)
assert.doesNotMatch(q10LiveHealed[0].text, /\\left\s*\.\s*\|A\|/)

const q14LiveArray =
  'Then the number of elements in the set $\\left\\{\\left(\\begin{array}{l} x \\\\ y \\\\ z\\end{array}\\right): x, y, z \\in \\mathbb{R}, M\\left(\\begin{array}{l} x \\\\ y \\\\ z\\end{array}\\right)=\\left(\\begin{array}{c} a_{12} \\\\ 0 \\\\ -a_{23}\\end{array}\\right)\\right\\}$ is'
const q14LiveHealed = applyUploadQualityGuards([{ text: q14LiveArray, options: [] }], '')
assert.match(q14LiveHealed[0].text, /\\begin\{pmatrix\}x/)
assert.match(q14LiveHealed[0].text, /a_\{12\}/)

const q17DollarH = applyUploadQualityGuards(
  [
    {
      text: 'Let $f$ and $g$ be functions. Match each entry in List-I to the correct entry in List-II.\nList-I\n(P) If $a=0, b=1, c=0$, and $d=0$, then\nList-II\n(1) $h$ is one-one.',
      options: ['', '$h$', '$h$', '$h$'],
    },
  ],
  '',
)
assert.equal(
  q17DollarH[0].options.filter((o) => /\$h\$|^h$/i.test(String(o).trim())).length,
  0,
  'List-II $h$ must not become option letters',
)

const figDupUrl =
  'https://cdn.mathpix.com/cropped/ab5af785-29b3-4e7b-9cb4-55445aaafd34-15.jpg?height=219&width=897&top_left_y=555&top_left_x=649'
const dopplerDupFig = applyUploadQualityGuards(
  [
    {
      text: `${dopplerStem}\n$\n\n\\includegraphics{${figDupUrl}}\n\\includegraphics{${figDupUrl}}`,
      options: ['', '', '', ''],
    },
  ],
  '',
)
assert.equal(
  (String(dopplerDupFig[0].text).match(/\\includegraphics/g) || []).length,
  1,
  'same Mathpix crop must draw once',
)
assert.equal(
  latexExtractionIncomplete(dopplerDupFig[0].text),
  false,
  'stray $ before a figure is not incomplete math',
)

const gluedThreeMatch = `One mole of a monatomic ideal gas undergoes the cyclic process J to K to L to M to J, as shown in the P-T diagram.
Match the quantities mentioned in List-I with their values in List-II and choose the correct option.
[$R$ is the gas constant.]

Four identical thin, square metal sheets, $S_{1}, S_{2}, S_{3}$ and $S_{4}$, each of side $a$ are kept parallel to each other with equal distance $d(\\ll a)$ between them, as shown in the figure. Let $C_{0}=\\varepsilon_{0} a^{2} / d$.
Match the quantities mentioned in List-I with their values in List-II and choose the correct option.

A light ray is incident on the surface of a sphere of refractive index $n$ at an angle of incidence $\\theta_{0}$. Match the quantities mentioned in List-I with their values in List-II and choose the correct option.
If $n=2$ and $\\alpha=180^{\\circ}$, then all the possible values of $\\theta_{0}$ will be`
const ungluedThree = applyUploadQualityGuards([{ text: gluedThreeMatch, options: ['P → 5', '', 'P → 3', ''] }], '')
assert.equal(ungluedThree.length, 3, `glued physics match cards must split, got ${ungluedThree.length}`)
assert.match(ungluedThree[0].text, /One mole/)
assert.match(ungluedThree[1].text, /Four identical/)
assert.match(ungluedThree[2].text, /A light ray is incident/)
assert.doesNotMatch(ungluedThree[0].text, /Four identical/)
assert.doesNotMatch(ungluedThree[1].text, /A light ray is incident/)

function assertKatexBlock(label, text, envRe) {
  const prepared = prepareTextForMathTextDisplay(text)
  const visible = String(prepared)
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$]*\$/g, ' ')
  assert.doesNotMatch(visible, /\\(?:log|begin|in|right|left|frac)\b/, `${label} must not dump TeX as code`)
  const block = String(prepared).match(envRe)
  assert.ok(block, `${label} must keep a display math block`)
  const inner = block[0].replace(/^\$+/, '').replace(/\$+$/, '')
  const html = katex.renderToString(inner, { throwOnError: false, displayMode: true })
  assert.equal(html.includes('katex-error'), false, `${label} KaTeX must succeed`)
}

assertKatexBlock('Q8 live aligned', q8Live[0].text, /\$\$\\begin\{aligned\}[\s\S]*?\\end\{aligned\}\$\$/)

const q10Prepared = prepareTextForMathTextDisplay(q10LiveHealed[0].text)
assert.doesNotMatch(q10Prepared, /\\right\s*\./)
assert.match(q10Prepared, /\\in\\\{0,1\\\}/)
assertKatexBlock(
  'Q10 live set',
  q10LiveHealed[0].text,
  /\$[^$]*\\left\\\{[\s\S]*?\\right\\\}[^$]*\$/,
)

const MATCH_MAP_OCR = `${LIST_I_OCR}

The correct option is
(A) P → 4 ; Q → 2 ; R → 5 ; S → 1
(B) P → 2 ; Q → 4 ; R → 1 ; S → 5
(C) P → 4 ; Q → 2 ; R → 1 ; S → 5
(D) P → 2 ; Q → 4 ; R → 5 ; S → 1`
const q14Opts = applyUploadQualityGuards(
  [{ text: LIST_I_OCR, options: ['', '', '', ''] }],
  MATCH_MAP_OCR,
)
assert.ok(
  q14Opts[0].options.filter((o) => /P\s*→/.test(String(o))).length >= 2,
  'Q14 matching A–D must copy from OCR, never invent',
)

const q17Ocr = `Let f and g be functions. Match each entry in List-I to the correct entry in List-II.
List-I
(P) If a=0, b=1, c=0, and d=0, then
(Q) If a=1, b=0, c=0, and d=0, then
(R) If a=0, b=0, c=0, and d=1, then
(S) If a=1, b=1, c=1, and d=1, then
List-II
(1) h is one-one
(2) h is not one-one
(3) h is onto
(4) h is not onto
(5) h is both one-one and onto
The correct option is
(A) P → 4 ; Q → 3 ; R → 1 ; S → 2
(B) P → 5 ; Q → 2 ; R → 4 ; S → 1
(C) P → 2 ; Q → 1 ; R → 4 ; S → 3
(D) P → 1 ; Q → 2 ; R → 3 ; S → 4`
const q17Opts = applyUploadQualityGuards(
  [
    {
      text: 'Let f and g be functions. Match each entry in List-I to the correct entry in List-II.\nList-I\n(P) If a=0, b=1, c=0, and d=0, then\nList-II',
      options: ['$h$', '$h$', '$h$', '$h$'],
    },
  ],
  q17Ocr,
)
assert.equal(q17Opts[0].options.filter((o) => /\$h\$|^h$/i.test(String(o).trim())).length, 0)
assert.ok(
  q17Opts[0].options.filter((o) => /P\s*→/.test(String(o))).length >= 2,
  'Q17 matching A–D must copy from OCR',
)
assert.match(q17Opts[0].text, /\(1\)\s*h is one-one/)

const q14MathrmOcr = `${LIST_I_OCR}

The correct option is
\\begin{itemize}
\\item[] $(\\mathrm{A}) \\quad(\\mathrm{P}) \\rightarrow(4) \\quad(\\mathrm{Q}) \\rightarrow(2) \\quad(\\mathrm{R}) \\rightarrow(5) \\quad(\\mathrm{S}) \\rightarrow(1)$
\\item[] $(\\mathrm{B}) \\quad(\\mathrm{P}) \\rightarrow(2) \\quad(\\mathrm{Q}) \\rightarrow(4) \\quad(\\mathrm{R}) \\rightarrow(1) \\quad(\\mathrm{S}) \\rightarrow(5)$
\\item[] $(\\mathrm{C}) \\quad(\\mathrm{P}) \\rightarrow(4) \\quad(\\mathrm{Q}) \\rightarrow(2) \\quad(\\mathrm{R}) \\rightarrow(1) \\quad(\\mathrm{S}) \\rightarrow(5)$
\\item[] $(\\mathrm{D}) \\quad(\\mathrm{P}) \\rightarrow(2) \\quad(\\mathrm{Q}) \\rightarrow(4) \\quad(\\mathrm{R}) \\rightarrow(5) \\quad(\\mathrm{S}) \\rightarrow(1)$
\\end{itemize}`
const q14Mathrm = applyUploadQualityGuards(
  [{ text: LIST_I_OCR, options: ['', '', '', ''] }],
  q14MathrmOcr,
)
assert.ok(
  q14Mathrm[0].options.filter((o) => /P/.test(String(o)) && /rightarrow|→/.test(String(o))).length >= 2,
  'Q14 $(\\mathrm{A})$ mappings must copy from OCR',
)

const twoLetF = `Let $f$ be continuously differentiable. Then $f(1)$ is 1.
(A) 1
(B) 2

Let $f: \\mathbb{R} \\rightarrow \\mathbb{R}$ and $g: \\mathbb{R} \\rightarrow \\mathbb{R}$ be functions defined by
Match each entry in List-I to the correct entry in List-II.
List-I
(P) If a=0, b=1, c=0, and d=0, then
(Q) If a=1, b=0, c=0, and d=0, then
(R) If a=0, b=0, c=0, and d=1, then
(S) If a=1, b=1, c=1, and d=1, then
List-II
(1) h is one-one
(2) h is not one-one
(3) h is onto
(4) h is not onto
(5) h is both one-one and onto
The correct option is
$(\\mathrm{A})(\\mathrm{P}) \\rightarrow(4) \\quad(\\mathrm{Q}) \\rightarrow(3)$
$(\\mathrm{B})(\\mathrm{P}) \\rightarrow(5) \\quad(\\mathrm{Q}) \\rightarrow(2)$
$(\\mathrm{C})(\\mathrm{P}) \\rightarrow(2) \\quad(\\mathrm{Q}) \\rightarrow(1)$
$(\\mathrm{D})(\\mathrm{P}) \\rightarrow(1) \\quad(\\mathrm{Q}) \\rightarrow(2)$`
const q17Probe = applyUploadQualityGuards(
  [
    {
      text: 'Let $f: \\mathbb{R} \\rightarrow \\mathbb{R}$ and $g: \\mathbb{R} \\rightarrow \\mathbb{R}$ be functions defined by\nMatch each entry in List-I to the correct entry in List-II.\nList-I\n(P) If a=0, b=1, c=0, and d=0, then\nList-II',
      options: ['', '', '', ''],
    },
  ],
  twoLetF,
)
assert.match(q17Probe[0].text, /h is one-one/, 'Q17 List-II must come from the matching Let f, not an earlier Let f')
assert.ok(q17Probe[0].options.filter((o) => /P/.test(String(o)) && /rightarrow|→/.test(String(o))).length >= 2)

const q31SectionOcr = `One mole of a monatomic ideal gas undergoes the cyclic process as shown in the figure.
Match the quantities mentioned in List-I with their values in List-II and choose the correct option.
\\end{itemize}

\\section*{List-I}
\\begin{itemize}
\\item[(P)] Work done in the complete cyclic process
\\item[(Q)] Change in the internal energy of the gas in the process JK
\\item[(R)] Heat given to the gas in the process KL
\\item[(S)] Change in the internal energy of the gas in the process MJ
\\end{itemize}

\\section*{List-II}
\\begin{itemize}
\\item[(1)] $\\mathcal{R} T_{0}$
\\item[(2)] 0
\\item[(3)] $3 \\mathcal{R} T_{0}$
\\item[(4)] $4 \\mathcal{R} T_{0}$
\\item[(5)] $\\mathcal{R} T_{0} \\ln 2$
\\end{itemize}

Four identical thin, square metal sheets`
const q31Healed = applyUploadQualityGuards(
  [
    {
      text: 'One mole of a monatomic ideal gas undergoes the cyclic process as shown in the figure. Match the quantities mentioned in List-I with their values in List-II and choose the correct option.',
      options: ['', '', '', ''],
    },
  ],
  q31SectionOcr,
)
assert.match(q31Healed[0].text, /\(P\)/, 'Q31 List-I rows must restore from \\section*{List-I}')
assert.match(q31Healed[0].text, /Work done in the complete cyclic process/)
assert.match(q31Healed[0].text, /List-II/)
assert.doesNotMatch(q31Healed[0].text, /Four identical/)

const q33OpticsOcr = `A light ray is incident on the surface of a sphere of refractive index $n$ at an angle of incidence $\\theta_{0}$. Match the quantities mentioned in List-I with their values in List-II and choose the correct option.
\\section*{List-I}
\\begin{itemize}
\\item[(P)] If $n=2$ and $\\alpha=180^{\\circ}$, then all the possible values of $\\theta_{0}$ will be
\\item[(Q)] If $n=\\sqrt{3}$ and $\\alpha=180^{\\circ}$, then all the possible values of $\\theta_{0}$ will be
\\item[(R)] If $n=\\sqrt{3}$ and $\\alpha=180^{\\circ}$, then all the possible values of $\\phi_{0}$ will be
\\item[(S)] If $n=\\sqrt{2}$ and $\\theta_{0}=45^{\\circ}$, then all the possible values of $\\alpha$ will be
\\item[(A)] $\\mathrm{P} \\rightarrow 5$; $\\mathrm{Q} \\rightarrow 2$; R $\\rightarrow 1$; S → 4
\\item[(C)] $\\mathrm{P} \\rightarrow 3$; Q → 2; R→ 1; S→ 4
\\end{itemize}
\\section*{List-II}
\\begin{itemize}
\\item[(1)] 30° and 0°
\\item[(2)] 60° and 0°
\\item[(3)] 45° and 0°
\\item[(4)] 150°
\\item[(5)] 0°
\\item[(B)] $\\mathrm{P} \\rightarrow 5 ; \\mathrm{Q} \\rightarrow 1 ; \\mathrm{R} \\rightarrow 2 ; \\mathrm{S} \\rightarrow 4$
\\item[(D)] $\\mathrm{P} \\rightarrow 3 ; \\mathrm{Q} \\rightarrow 1 ; \\mathrm{R} \\rightarrow 2 ; \\mathrm{S} \\rightarrow 5$
\\end{itemize}`
const q33Optics = applyUploadQualityGuards(
  [
    {
      text: `A light ray is incident on the surface of a sphere of refractive index $n$ at an angle of incidence $\\theta_{0}$. Match the quantities mentioned in List-I with their values in List-II and choose the correct option.
List-I
(P) If $n=2$ and $\\alpha=180^{\\circ}$, then all the possible values of $\\theta_{0}$ will be
List-II
(1) $\\mathcal{R} T_{0}-4 \\mathcal{R} T_{0} \\ln 2$
(2) 0`,
      options: ['', '', '', ''],
    },
  ],
  q33OpticsOcr,
)
assert.doesNotMatch(q33Optics[0].text, /T_\{0\}/, 'optics List-II must not stay as gas values')
assert.match(q33Optics[0].text, /30°|30\s*\\circ|30°/)
assert.ok(q33Optics[0].options.filter((o) => /P/.test(String(o)) && /rightarrow|→/.test(String(o))).length >= 2)

const q34Circuit = applyUploadQualityGuards(
  [
    {
      text: `The circuit shown in the figure contains an inductor $L$. Match the quantities mentioned in List-I with their values in List-II and choose the correct option.
List-I
(P) The value of $I_{1}$ in Ampere is
(Q) The value of $I_{2}$ in Ampere is
(R) The value of $\\omega_{0}$ in kilo-radians/s is
(S) The value of $V_{0}$ in Volt is
List-II
(1) 0
(2) 2
(3) 4
(4) 20
(5) 200
(A) $\\mathrm{P} \\rightarrow 1 ; \\mathrm{Q} \\rightarrow 3 ; \\mathrm{R} \\rightarrow 2 ; \\mathrm{S} \\rightarrow 5$
(B) $\\mathrm{P} \\rightarrow 1 ; \\mathrm{Q} \\rightarrow 2 ; \\mathrm{R} \\rightarrow 3 ; \\mathrm{S} \\rightarrow 5$
(C) $\\mathrm{P} \\rightarrow 1 ; \\mathrm{Q} \\rightarrow 3 ; \\mathrm{R} \\rightarrow 2 ; \\mathrm{S} \\rightarrow 4$
(D) $\\mathrm{P} \\rightarrow 2 ; \\mathrm{Q} \\rightarrow 5 ; \\mathrm{R} \\rightarrow 3 ; \\mathrm{S} \\rightarrow 4$`,
      options: ['', '', '', ''],
    },
  ],
  '',
)
assert.match(q34Circuit[0].text, /\(P\)/)
assert.match(q34Circuit[0].text, /\(1\)\s*0/)
assert.doesNotMatch(q34Circuit[0].text, /\(A\)/)
assert.ok(q34Circuit[0].options.filter((o) => /P/.test(String(o)) && /rightarrow|→/.test(String(o))).length >= 2)

const q33Foreign = healUploadQuestionCard(
  {
    text: `A light ray is incident on the surface of a sphere of refractive index $n$ at an angle of incidence $\\theta_{0}$. Match the quantities mentioned in List-I with their values in List-II and choose the correct option.
List-I
(P) If $n=2$ and $\\alpha=180^{\\circ}$, then all the possible values of $\\theta_{0}$ will be
List-II
(1) $\\mathcal{R} T_{0}-4 \\mathcal{R} T_{0} \\ln 2$
(2) 0
(3) $3 \\mathcal{R} T_{0}$`,
    options: ['P → 5', 'P → 4', 'P → 3', 'P → 2'],
  },
  '',
)
assert.doesNotMatch(q33Foreign.text, /T_\{0\}/, 'optics card must not keep a gas List-II')

const gluedGasList = `${gluedThreeMatch}
List-II
(1) $0$
(2) $2R$
(3) $3R$
(4) $nR$
(5) $2nR$`
const ungluedGas = applyUploadQualityGuards(
  [{ text: gluedGasList, options: ['P → 5', '', 'P → 3', ''] }],
  gluedGasList,
)
assert.equal(ungluedGas.length, 3)
assert.doesNotMatch(ungluedGas[2].text, /2R/)

const { preCleanMathpixOcr, validateMathpixQuestion } = await import('../src/utils/mathpixCleanPipeline.js')
const schemeHead = `Page 3 of 12\n\nQ. 1 Let $x=1$. Then $x$ is equal to ____.`
const cleanedHead = preCleanMathpixOcr(schemeHead)
assert.match(cleanedHead, /Let \$x=1\$/)
assert.doesNotMatch(cleanedHead, /Page 3 of 12/)

const keepMatchWording = preCleanMathpixOcr(
  'Q. 31 One mole of gas. Match the quantities and choose the correct option.\nList-I\n(P) If n=2',
)
assert.match(keepMatchWording, /choose the correct option/)

const missingCol = validateMathpixQuestion({
  text: 'Match each entry in List-I to the correct entry in List-II.\nList-I\n(P) one\n(Q) two\n(R) three\n(S) four',
  options: ['', '', '', ''],
})
assert.equal(missingCol.status, 'missing_column')

const q17SectionLeak = applyUploadQualityGuards(
  [
    {
      text: 'Let f and g be functions. Match each entry in List-I to the correct entry in List-II.\nList-I\n(P) If a=0, b=1, c=0, and d=0, then\n(Q) If a=1, b=0, c=0, and d=0, then\n(R) If a=0, b=0, c=1, and d=0, then\n(S) If a=0, b=0, c=0, and d=1, then\nList-II\n(1) h is one-one.\n(2) h is onto.\n(3) h is differentiable on R.\n(4) the range of h is [0,1].\n(5) the range of h is {0, 1}.',
      options: [
        '(P) → (4) (Q) → (3) (R) → (1) (S) → (2)',
        '(P) → (5) (Q) → (2) (R) → (4) (S) → (3)',
        '(P) → (5) (Q) → (3) (R) → (2) (S) → (4)',
        '(P) → (4) (Q) → (2) (R) → (1) (S) → (3)\\section*{SECTION 1 (Maximum Marks: 12)} This section contains FOUR (04) questions.',
      ],
    },
  ],
  '',
)
assert.doesNotMatch(q17SectionLeak[0].options[3], /section|Maximum Marks|This section contains/i)
assert.match(q17SectionLeak[0].options[3], /\(S\)\s*→\s*\(3\)/)

const q34Bare = applyUploadQualityGuards(
  [
    {
      text: `The circuit shown in the figure.
\\includegraphics{https://cdn.mathpix.com/p/circuit34.png}
Match the quantities mentioned in List-I with their values in List-II and choose the correct option.
List-I
(P) The value of $I_{1}$ in Ampere is
(Q) The value of $I_{2}$ in Ampere is
(R) The value of $I_{3}$ in Ampere is
(S) The value of $V_{0}$ in Volt is

List-II
0
2
4
20
200

List-II
(1) 0
(2) 2
(3) 4
(4) 20
(5) 200`,
      options: ['P → 1', 'P → 4', 'P → 2', 'P → 3'],
    },
  ],
  '',
)
assert.match(q34Bare[0].text, /cdn\.mathpix\.com\/p\/circuit34/)
assert.doesNotMatch(q34Bare[0].text, /List-II\s*\n\s*0\s*\n\s*2\s*\n\s*4/)

const xenonOcr = `Based on VSEPR model, match the xenon compounds in List-I with their structures in List-II and select the correct option.
\\section*{List-I}
\\begin{itemize}
\\item[(P)] $\\mathrm{XeF}_{2}$
\\item[(Q)] $\\mathrm{XeF}_{4}$
\\item[(R)] $\\mathrm{XeO}_{3}$
\\item[(S)] $\\mathrm{XeO}_{3} \\mathrm{F}_{2}$
\\end{itemize}
\\section*{List-II}
\\begin{itemize}
\\item[(1)] trigonal bipyramidal
\\item[(2)] square planar
\\item[(3)] pyramidal
\\item[(4)] see-saw
\\item[(5)] linear
\\end{itemize}
The correct option is
(A) P-5, Q-2, R-3, S-4
(B) P-5, Q-3, R-2, S-4
(C) P-4, Q-2, R-3, S-5
(D) P-5, Q-2, R-4, S-3
List-I contains various reaction sequences and List-II contains the possible products`
const xenonHealed = applyUploadQualityGuards(
  [
    {
      text: 'Based on VSEPR model, match the xenon compounds in List-I with their structures in List-II and select the correct option.',
      options: ['', '', '', ''],
    },
  ],
  xenonOcr,
)
assert.match(xenonHealed[0].text, /XeF/)
assert.match(xenonHealed[0].text, /square planar/)
assert.doesNotMatch(xenonHealed[0].text, /reaction sequences/)
assert.ok(xenonHealed[0].options.filter((o) => /P-5/.test(String(o))).length >= 2)

const xenonEmptyRows = applyUploadQualityGuards(
  [
    {
      text: `Based on VSEPR model, match the xenon compounds given in List-I with the corresponding geometries and the number of lone pairs on xenon given in List-II and choose the correct option.
List-I
(P)
(Q)
(R)
(S)
List-II
(1) Trigonal bipyramidal and two lone pair of electrons
(2) Tetrahedral and one lone pair of electrons
(3) Octahedral and two lone pair of electrons
(4) Trigonal bipyramidal and no lone pair of electrons
(5) Trigonal bipyramidal and three lone pair of electrons`,
      options: [
        'P-5, Q-2, R-3, S-1',
        'P-5, Q-3, R-2, S-4',
        'P-4, Q-3, R-2, S-1',
        'P-4, Q-2, R-5, S-3',
      ],
    },
  ],
  xenonOcr,
)
assert.match(xenonEmptyRows[0].text, /XeF/)
assert.match(xenonEmptyRows[0].text, /XeO/)
const xenonParsed = parseMatchingListForDisplay(xenonEmptyRows[0].text, xenonEmptyRows[0].options)
assert.ok(xenonParsed)
assert.equal(xenonParsed.listI.length, 4)
assert.match(xenonParsed.listI.find((x) => x.label === '(P)').text, /XeF/)
assert.doesNotMatch(xenonParsed.intro, /\(P\)\s*\(Q\)/)

const smashedIonHeal = applyUploadQualityGuards(
  [
    {
      text: `In a conductometric titration, small volume of titrant of higher concentration is added.
The limiting ionic conductivity ( $\\Lambda_{0}$ ) values are given below:
\\begin{tabular}[t]{|l|l|}
\\hline Ions & $\\mathrm{CH}_{3} \\mathrm{COO}^{-} \\\\$\\
\\hline$$\\Lambda_{0}$$ & 4.1 \\$$
\\hline
\\end{tabular}$$
List-I
(P) Titrate: KCl
Titrant: $\\mathrm{AgNO}_{3}$$
(Q) Titrate: $\\mathrm{AgNO}_{3}$$
Titrant: KCl
(R) Titrate: NaOH
Titrant: HCl
(S) Titrate: NaOH
Titrant: $\\mathrm{CH}_{3} \\mathrm{COOH}$$`,
      options: ['P-1', 'P-2', 'P-3', 'P-4'],
    },
  ],
  `In a conductometric titration, small volume of titrant of higher concentration is added.
The limiting ionic conductivity ( $\\Lambda_{0}$ ) values are given below:
\\begin{tabular}[t]{|l|l|}
\\hline Ions & $\\mathrm{CH}_{3} \\mathrm{COO}^{-}$ \\\\
\\hline $\\Lambda_{0}$ & 4.1 \\\\
\\hline
\\end{tabular}
List-I
\\item[(P)] Titrate: KCl
Titrant: $\\mathrm{AgNO}_{3}$
\\item[(Q)] Titrate: $\\mathrm{AgNO}_{3}$
Titrant: KCl`,
)
assert.doesNotMatch(smashedIonHeal[0].text, /COO\^\{-\}\s*\\\\\$/)
const ionParsed = parseMatchingListForDisplay(smashedIonHeal[0].text)
assert.ok(ionParsed)
assert.equal(ionParsed.listI.find((x) => x.label === '(P)').text.includes('Titrant: KCl'), false)

const smilesMatchOcr = `List-I contains various reaction sequences and List-II contains the possible products. Match each entry in List-I with the appropriate entry in List-II and choose the correct option.
\\caption{List-I}
\\includegraphics{https://cdn.mathpix.com/p/rxn-p.png}
The correct option is
(A) P-3, Q-5, R-4, S-1
(B) P-3, Q-2, R-4, S-5
(C) P-3, Q-5, R-1, S-4
(D) P-5, Q-2, R-4, S-1`
const smilesMatch = applyUploadQualityGuards(
  [
    {
      text: 'List-I contains various reaction sequences and List-II contains the possible products. Match each entry in List-I with the appropriate entry in List-II and choose the correct option.\n\\caption{List-I}\n\\includegraphics{https://cdn.mathpix.com/p/rxn-p.png}',
      options: [
        '<smiles>CC1C(O)CCC1CO</smiles>',
        '<smiles>CC1C(O)CCC1C=O</smiles>',
        '<smiles>O=C1CCCC1CO</smiles>',
        '<smiles>CC1CCCC1CO</smiles>',
      ],
    },
  ],
  smilesMatchOcr,
)
assert.ok(smilesMatch[0], 'reaction-sequence match card must be kept')
assert.equal(smilesMatch[0].options.filter((o) => /<smiles>/i.test(String(o))).length, 0)
assert.ok(smilesMatch[0].options.filter((o) => /P-3/.test(String(o))).length >= 2)

const q51Tail = applyUploadQualityGuards(
  [
    {
      text: `Among the following phenolic compounds, match each entry in List-I with List-II.
List-I
(P) phenol
(Q) catechol
(R) resorcinol
(S) hydroquinone
List-II
(1) one OH
(2) ortho
(3) meta
(4) para
(5) none
(A) P-1, Q-2, R-3, S-4 $ $`,
      options: ['P-1, Q-2, R-3, S-4', 'P-2, Q-3, R-4, S-1', 'P-3, Q-4, R-1, S-2', 'P-4, Q-1, R-2, S-3'],
    },
  ],
  '',
)
assert.doesNotMatch(q51Tail[0].text, /P-1,\s*Q-2/)
assert.match(q51Tail[0].options[0], /P-1/)

console.log('test-upload-quality-guards: ok')
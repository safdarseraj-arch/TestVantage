/**
 * Permanent extractor tests — not a Q.3 plugin.
 * Founder cot-x paper text is a fixture of the general parser.
 */
import assert from 'node:assert/strict'
import {
  clipIncompleteFracRun,
  healTruncatedLatexForDisplay,
  latexExtractionIncomplete,
  normalizeFracLatex,
  normalizeSmashedChemDollars,
  spaceLatexCommandsAfterWords,
} from '../src/utils/healTruncatedLatex.js'
import {
  extendStemFromSource,
  healOfficialPyqPaperQuestions,
  joinBleedingOptions,
  mergeAdjacentOptionTails,
  mergeOrphanStemContinuations,
  restoreMissingListIFromSource,
  restoreMissingFiguresFromSource,
  matchQuestionMissingListI,
  stemLooksCutOff,
  stripKeyLeakFromOption,
  lightRepairOfficialPyqQuestions,
} from '../src/utils/extendTruncatedStem.js'
import { parseBulkQuestions } from '../src/utils/parseBulkQuestions.js'
import {
  looksLikeAnswerKeyMappingBlob,
  looksLikePyqSectionInstructionStem,
  stripPageBreakAndSectionGlue,
} from '../src/utils/bulkExtractClean.js'
import { jsonParseWithLatexSalvage } from '../src/utils/repairJsonLatexEscapes.js'
import { extractJsonValue } from '../src/utils/geminiScqTrial.js'
import { parseQuestionText } from '../src/utils/parseQuestionText.js'
import { questionsFromOfficialPyqExtract } from '../src/utils/pyqGeminiExtract.js'
import { parseMatchingListForDisplay } from '../src/utils/parseMatchingListDisplay.js'
import { normalizeMcqOptionForRender, prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import { wrapBareLatexRuns, repairOrphanAlignedBody } from '../src/utils/wrapBareLatexRuns.js'
import {
  LET_ABE_SMASHED_VMATRIX_STEM,
  looksLikeSmashedProseVmatrix,
  repairSmashedProseVmatrixOcr,
} from '../src/utils/repairSmashedProseVmatrixOcr.js'

/** Generic multi-line MCQ: fraction, then a second display expression, then (A)–(D). */
const MULTI_LINE_SOURCE = `Q.3 Let $\\frac{\\pi}{2} < x < \\pi$ be such that $\\cot x = \\frac{-5}{\\sqrt{11}}$. Then

$$\\left( \\sin \\frac{11x}{2} \\right) (\\sin 6x - \\cos 6x) + \\left( \\cos \\frac{11x}{2} \\right) (\\sin 6x + \\cos 6x)$$

is equal to
(A) $\\frac{\\sqrt{11}}{2}$
(B) $\\frac{11\\sqrt{11}}{2}$
(C) $\\frac{-\\sqrt{11}}{2}$
(D) $\\frac{-11\\sqrt{11}}{2}$`

const CUT_STEM =
  'Let $\\frac{\\pi}{2} < x < \\pi$ be such that\\cot x = \\frac{-5}{'

// (c) unclosed frac is flagged — never silently shortened
assert.equal(latexExtractionIncomplete(CUT_STEM), true)
assert.equal(stemLooksCutOff(CUT_STEM), true)
assert.match(spaceLatexCommandsAfterWords(CUT_STEM), /that \\cot/)
const spacedOnly = healTruncatedLatexForDisplay(CUT_STEM)
assert.match(spacedOnly, /that \\cot/)
assert.match(spacedOnly, /\\frac\{-5\}\{/)
assert.doesNotMatch(spacedOnly, /-5 \/ …/)

const prepared = prepareTextForMathTextDisplay(CUT_STEM)
assert.match(prepared, /that \\cot|that \$\\cot/)

const clipEnd = clipIncompleteFracRun('that \\cot x = \\frac{-5}{', 5, 24)
assert.ok(clipEnd <= 24)

// (a) multi-line stem with a fraction then a second display expression is not truncated
const restored = extendStemFromSource(CUT_STEM, MULTI_LINE_SOURCE)
assert.match(restored, /\\sqrt\{11\}/, 'parser keeps denominator from source')
assert.match(restored, /11x/, 'parser keeps the display expression after Then')
assert.match(restored, /is equal to/i)
assert.doesNotMatch(restored, /^\(A\)/)
assert.equal(latexExtractionIncomplete(restored), false)

const parsedFull = parseQuestionText(MULTI_LINE_SOURCE)
assert.match(parsedFull.text, /\\frac\{-5\}/)
assert.match(parsedFull.text, /11x/)
assert.ok(parsedFull.optionsFound >= 4)
assert.match(parsedFull.options[0] || '', /sqrt|\\\\frac/i)

const merged = mergeOrphanStemContinuations([
  { text: CUT_STEM, options: ['a', 'b', 'c', 'd'] },
  {
    text: '$$\\left( \\sin \\frac{11x}{2} \\right) (\\sin 6x - \\cos 6x)$$ is equal to',
    options: [],
  },
  {
    text: 'Let $f(x)=x^4+ax^3$ be a polynomial with real coefficients.',
    options: ['1', '2', '3', '4'],
  },
])
assert.equal(merged.length, 2, 'merge continuation only; do not eat the next Let-stem')
assert.match(merged[0].text, /11x/)
assert.match(merged[1].text, /f\(x\)/)

const paperMeta = {
  exam: 'jee-advanced',
  year: 2024,
  session: 'Paper 1',
  paperLabel: 'JEE Advanced 2024 Paper 1',
  sourceLabel: 'Official archive',
}
const fromExtract = questionsFromOfficialPyqExtract(
  {
    engine: 'cloud-vision',
    text: MULTI_LINE_SOURCE,
    questions: [
      {
        stem: CUT_STEM,
        options: [
          '$\\frac{\\sqrt{11}}{2}$',
          '$\\frac{11\\sqrt{11}}{2}$',
          '$\\frac{-\\sqrt{11}}{2}$',
          '$\\frac{-11\\sqrt{11}}{2}$',
        ],
      },
    ],
  },
  paperMeta,
)
assert.equal(fromExtract.questions.length, 1)
assert.match(fromExtract.questions[0].text, /\\sqrt\{11\}/)
assert.match(fromExtract.questions[0].text, /11x/)

const geminiDump = String.raw`{"questions":[{"stem":"Let $\frac{\pi}{2} < x < \pi$ be such that $\cot x = \frac{-5}{\sqrt{11}}$. Then $$\left( \sin \frac{11x}{2} \right)$$ is equal to","options":["1","2","3","4"]}]}`
assert.equal(JSON.parse.length > 0, true)
let threw = false
try {
  JSON.parse(geminiDump)
} catch {
  threw = true
}
assert.equal(threw, true, 'raw TeX JSON is invalid until salvaged')
const salvaged = jsonParseWithLatexSalvage(geminiDump)
assert.ok(salvaged?.questions?.[0]?.stem)
assert.match(salvaged.questions[0].stem, /\\frac\{-5\}/)
assert.match(salvaged.questions[0].stem, /11x/)
const extractedJson = extractJsonValue(geminiDump)
assert.match(extractedJson.questions[0].stem, /\\sqrt\{11\}/)

const okPoly =
  'Let $f(x) = x^4 + ax^3 + bx^2 + c$ be a polynomial with real coefficients such that $f(1) = -9$. Suppose that $i\\sqrt{3}$ is a root.'
assert.equal(latexExtractionIncomplete(okPoly), false)

// (b) match-column splits into List-I / List-II rows
const matchStem = `
Let $\\alpha$ and $\\beta$ be roots. Match each entry in List-I to List-II. **List-I** (P) First row here with enough words (Q) Second row here with enough words (R) Third row here with enough words (S) Fourth row here with enough words **List-II** (1) $1$ (2) $2$ (3) $3$ (4) $4$
`
const parsedMatch = parseMatchingListForDisplay(matchStem)
assert.ok(parsedMatch?.listI?.length >= 3)
assert.ok(parsedMatch?.listII?.length >= 3)

// Page-break cut: join the next-page formula, never glue SECTION 2
const PAGE_BREAK_SOURCE = `Q.3 Let $\\frac{\\pi}{2} < x < \\pi$ be such that $\\cot x = \\frac{-5}{
--- page ---
\\sqrt{11}}$. Then

$$\\left( \\sin \\frac{11x}{2} \\right) (\\sin 6x - \\cos 6x) + \\left( \\cos \\frac{11x}{2} \\right) (\\sin 6x + \\cos 6x)$$

is equal to
(A) $\\frac{\\sqrt{11}}{2}$
(B) $\\frac{11\\sqrt{11}}{2}$
(C) $\\frac{-\\sqrt{11}}{2}$
(D) $\\frac{-11\\sqrt{11}}{2}$
--- page ---
JEE (Advanced) 2024 Paper 1
SECTION 2 (Maximum Marks: 12)
This section contains THREE (03) questions. ONE OR MORE THAN ONE of the four options is correct. Choose the option(s)`

const healedPageBreak = extendStemFromSource(CUT_STEM, PAGE_BREAK_SOURCE)
assert.match(healedPageBreak, /\\sqrt\{11\}/, 'page-break join restores the denominator')
assert.match(healedPageBreak, /11x/, 'page-break join keeps the display math after Then')
assert.match(healedPageBreak, /is equal to/i)
assert.doesNotMatch(healedPageBreak, /SECTION\s+2/i, 'do not glue SECTION 2 onto the stem')
assert.doesNotMatch(healedPageBreak, /--- page ---/i)
assert.equal(latexExtractionIncomplete(healedPageBreak), false)

const sectionGlueOnly = extendStemFromSource(
  CUT_STEM,
  `Q.3 Let $\\frac{\\pi}{2} < x < \\pi$ be such that $\\cot x = \\frac{-5}{
--- page ---
SECTION 2 (Maximum Marks: 12) This section contains THREE (03) questions.`,
)
assert.doesNotMatch(sectionGlueOnly, /SECTION\s+2/i)
assert.doesNotMatch(sectionGlueOnly, /this section contains/i)

const ANSWER_KEY_SECTION_BLOB = `The correct option is (A) (P)→(4)(Q)→(3)(R)→(1)(S)→(2) (B) (P)→(3)(Q)→(4)(R)→(2)(S)→(1) (C) (P)→(2)(Q)→(1)(R)→(4)(S)→(3) (D) (P)→(1)(Q)→(2)(R)→(3)(S)→(4)
--- page ---
JEE (Advanced) 2024 Paper 1
SECTION 2 (Maximum Marks: 12)
This section contains THREE (03) questions. ONE OR MORE THAN ONE of the four options is correct. Choose the option(s)`

assert.equal(looksLikeAnswerKeyMappingBlob(ANSWER_KEY_SECTION_BLOB), true)
assert.equal(looksLikePyqSectionInstructionStem(ANSWER_KEY_SECTION_BLOB), true)
assert.equal(looksLikePyqSectionInstructionStem(stripPageBreakAndSectionGlue(ANSWER_KEY_SECTION_BLOB)), true)

const blobParsed = parseBulkQuestions(`${MULTI_LINE_SOURCE}\n\n${ANSWER_KEY_SECTION_BLOB}`)
assert.ok(blobParsed.length >= 1, 'real MCQ still parses')
assert.ok(
  blobParsed.every((q) => !/SECTION\s+2/i.test(q.text) && !looksLikeAnswerKeyMappingBlob(q.text)),
  'answer-key + SECTION 2 preamble is not a question',
)

const extractBlob = questionsFromOfficialPyqExtract(
  {
    engine: 'cloud-vision',
    text: `${MULTI_LINE_SOURCE}\n\n${ANSWER_KEY_SECTION_BLOB}`,
    questions: [
      {
        stem: CUT_STEM,
        options: [
          '$\\frac{\\sqrt{11}}{2}$',
          '$\\frac{11\\sqrt{11}}{2}$',
          '$\\frac{-\\sqrt{11}}{2}$',
          '$\\frac{-11\\sqrt{11}}{2}$',
        ],
      },
      { stem: ANSWER_KEY_SECTION_BLOB, options: ['(P)→(4)', '(Q)→(3)', '(R)→(1)', '(S)→(2)'] },
    ],
  },
  paperMeta,
)
assert.ok(extractBlob.questions.every((q) => !looksLikeAnswerKeyMappingBlob(q.text)))
assert.ok(extractBlob.questions.every((q) => !/SECTION\s+2/i.test(q.text)))
assert.ok(extractBlob.questions.some((q) => /11x/.test(q.text)))

const listIOnly =
  'Match each entry in List-I to the correct entry in List-II. List-I (P) First row here with enough words (Q) Second row here with enough words (R) Third row here with enough words (S) Fourth row here with enough words'
const listIICard = {
  text: 'List-II (1) $5$ (2) $(-2,4)$ (3) $\\sqrt{5}$ (4) $(-2,6)$',
  options: ['5', '(-2,4)', '$\\sqrt{5}$', '(-2,6)'],
}
const mergedLists = mergeOrphanStemContinuations([
  { text: listIOnly, options: [] },
  listIICard,
  { text: ANSWER_KEY_SECTION_BLOB, options: ['A', 'B', 'C', 'D'] },
])
assert.match(mergedLists[0].text, /List-II/)
assert.ok(mergedLists[0].options.filter(Boolean).length >= 2, 'orphan List-II options attach to List-I')

const healedPaper = healOfficialPyqPaperQuestions({
  notes: PAGE_BREAK_SOURCE,
  questions: [
    { text: CUT_STEM, options: ['a', 'b', 'c', 'd'] },
    { text: ANSWER_KEY_SECTION_BLOB, options: ['(P)→(4)', '(Q)→(3)', '(R)→(1)', '(S)→(2)'] },
  ],
})
assert.equal(healedPaper.length, 1, 'heal drops answer-key + SECTION 2 row')
assert.match(healedPaper[0].text, /\\sqrt\{11\}/)
assert.match(healedPaper[0].text, /11x/)
assert.doesNotMatch(healedPaper[0].text, /SECTION\s+2/i)

const iffMerged = mergeOrphanStemContinuations([
  { text: 'Let $z = a+ib$ be such that $z^2$ is real', options: ['1', '2', '3', ''] },
  { text: 'if and only if $b = 0$, where $i = \\sqrt{-1}$.', options: [] },
])
assert.equal(iffMerged.length, 1, 'orphan if-and-only-if joins the previous option')
assert.match(String(iffMerged[0].options[3] ?? ''), /if and only if/)
assert.doesNotMatch(iffMerged[0].text, /if and only if/)
assert.match(iffMerged[0].text, /z\^2|z = a/)

const numberedIff = mergeOrphanStemContinuations([
  {
    text: 'Let $z=a+ib$. Then $z$ is purely imaginary',
    options: ['real', 'imaginary', 'zero', ''],
  },
  { text: '6. if and only if $b = 0$, where $i = \\sqrt{-1}$.', options: [] },
])
assert.equal(numberedIff.length, 1, 'numbered if-and-only-if is not a new question')
assert.match(String(numberedIff[0].options[3] ?? ''), /if and only if/)

const cutD = mergeOrphanStemContinuations([
  {
    text: 'Let $S=\\{a+b\\sqrt{2}\\}$. Then which of the following statements is (are) TRUE?',
    options: [
      '$\\mathbb{Z} \\cup T_1 \\cup T_2 \\subset S$',
      '$T_1 \\cap (0, \\frac{1}{2024}) = \\emptyset$',
      '$T_2 \\cap (2024, \\infty) \\neq \\emptyset$',
      'For any given $a, b \\in \\mathbb{Z}$, $\\cos(\\pi(a+b\\sqrt{2}))+i\\sin(\\pi(a+b\\sqrt{2})) \\in \\mathbb{Z}$',
    ],
  },
  { text: '6. if and only if $b = 0$, where $i = \\sqrt{-1}$.', options: [] },
])
assert.equal(cutD.length, 1, 'cut option D + numbered iff tail is one card')
assert.match(String(cutD[0].options[3] ?? ''), /if and only if/)
assert.match(String(cutD[0].options[3] ?? ''), /mathbb\{Z\}/)
assert.doesNotMatch(String(cutD[0].text), /^6\./)

const gluedNumIff = mergeAdjacentOptionTails([
  {
    text: 'Let $S=\\{a+b\\sqrt{2}\\}$. Then which of the following statements is (are) TRUE?',
    options: [
      '$\\mathbb{Z} \\cup T_1 \\cup T_2 \\subset S$',
      '$T_1 \\cap (0, \\frac{1}{2024}) = \\emptyset$',
      '$T_2 \\cap (2024, \\infty) \\neq \\emptyset$',
      'For any given $a, b \\in \\mathbb{Z}$, $\\cos(\\pi(a+b\\sqrt{2}))+i\\sin(\\pi(a+b\\sqrt{2})) \\in \\mathbb{Z}$',
    ],
  },
  { text: '6.if and only if $b = 0$, where $i = \\sqrt{-1}$.', options: [] },
])
assert.equal(gluedNumIff.length, 1, 'mergeAdjacentOptionTails must merge OCR "6.if" tail')
assert.match(String(gluedNumIff[0].options[3] ?? ''), /if and only if/)

const bankFiftyThree = mergeAdjacentOptionTails([
  ...Array.from({ length: 49 }, (_, i) => ({
    text: `Let $g_{${i}}(x)=x$. Then $g_{${i}}(1)$ is equal to`,
    options: ['$1$', '$2$', '$3$', '$4$'],
  })),
  {
    text: 'Let $z=a+ib$. Then $z$ is purely imaginary',
    options: ['real', 'imaginary', 'zero', ''],
  },
  { text: '6. if and only if $b = 0$, where $i = \\sqrt{-1}$.', options: [] },
  {
    text: 'Match the quantities mentioned in List-I with their values in List-II and choose the correct option.',
    options: [],
  },
  {
    text: 'List-II (1) $3C_0$ (2) $C_0/2$ (3) $C_0/3$ (4) $2C_0/3$ Answer.',
    options: [],
  },
])
assert.equal(bankFiftyThree.length, 50, `bank leftover cards must drop, got ${bankFiftyThree.length}`)
assert.ok(bankFiftyThree.every((q) => !/if and only if/i.test(String(q.text))))
assert.match(String(bankFiftyThree[49].options[3] ?? ''), /if and only if/)
assert.ok(bankFiftyThree.every((q) => !/^Match the quantities/i.test(String(q.text).trim())))
assert.ok(bankFiftyThree.every((q) => !/^List-II\b/i.test(String(q.text).trim())))

const squareMerged = mergeOrphanStemContinuations([
  {
    text: 'There is a quadrilateral with vertices chosen from two sets $S$ and $T$',
    options: ['A choice', 'B choice', 'C choice', ''],
  },
  {
    text: 'two of whose vertices are from $S$ and the other two vertices are from $T$. (D) There is a square of perimeter 48,',
    options: [],
  },
])
assert.equal(squareMerged.length, 1, 'lowercase tail + leaked (D) joins the previous stem')
assert.match(squareMerged[0].text, /two of whose vertices/)
assert.doesNotMatch(squareMerged[0].text, /\(D\)/)
assert.match(String(squareMerged[0].options[3] ?? ''), /perimeter 48/)

const textFracCut = 'Let $\\frac{\\pi}{2} < x < \\pi$ be such that $\\cot x = \\text{frac}{-5}{'
const restoredTextFrac = extendStemFromSource(textFracCut, MULTI_LINE_SOURCE)
assert.match(restoredTextFrac, /\\frac\{-5\}/)
assert.match(restoredTextFrac, /\\sqrt\{11\}/)
assert.doesNotMatch(restoredTextFrac, /\\text\s*\{\s*frac/)
assert.equal(latexExtractionIncomplete(restoredTextFrac), false)

const fracOpt = normalizeMcqOptionForRender('\\text{frac}{\\sqrt{11}-1}{2 \\sqrt{3}}')
assert.match(fracOpt, /\\frac/)
assert.match(fracOpt, /\$/)
assert.doesNotMatch(fracOpt, /\\text\s*\{\s*frac/)

const MATCH_INSTRUCTION =
  'Match the quantities mentioned in List-I with their values in List-II and choose the correct option.'
const MATCH_LISTS = `Four identical thin, square metal sheets, $S_1, S_2, S_3$ and $S_4$, each of side $a$ are kept parallel to each other with equal distance $d$ between them.
List-I
(P) The capacitance between $S_1$ and $S_4$, with $S_2$ and $S_3$ not connected, is
(Q) The capacitance between $S_1$ and $S_4$, with $S_2$ shorted to $S_3$, is
(R) The capacitance between $S_1$ and $S_3$, with $S_2$ shorted to $S_4$, is
(S) The capacitance between $S_1$ and $S_2$, with $S_3$ shorted to $S_1$, and $S_2$ shorted to $S_4$, is
List-II
(1) $3C_0$
(2) $C_0/2$
(3) $C_0/3$
(4) $2C_0/3$
(5) $2C_0$`
const MATCH_MAP_OPTS = [
  'P → 3; Q → 2; R → 4; S → 5',
  'P → 2; Q → 3; R → 2; S → 1',
  'P → 3; Q → 2; R → 4; S → 1',
  'P → 3; Q → 2; R → 2; S → 5',
]
const threeMatchFrags = mergeOrphanStemContinuations([
  { text: MATCH_INSTRUCTION, options: [] },
  { text: MATCH_LISTS, options: [] },
  { text: 'List-II (1) $3C_0$ (2) $C_0/2$ (3) $C_0/3$ (4) $2C_0/3$ (5) $2C_0$ Answer.', options: MATCH_MAP_OPTS },
])
assert.equal(threeMatchFrags.length, 1, 'instruction + List-I/II + mapping options is one question')
assert.match(threeMatchFrags[0].text, /Four identical/)
assert.match(threeMatchFrags[0].text, /List-I/)
assert.match(threeMatchFrags[0].text, /List-II/)
assert.ok(threeMatchFrags[0].options.filter(Boolean).length >= 4)
assert.doesNotMatch(threeMatchFrags[0].text, /^List-II/)

const healedMatchPaper = healOfficialPyqPaperQuestions({
  questions: [
    { text: 'List-II (1) $6$ (2) $1$ (3) $12$ (4) infinite', options: ['6', '1', '12', 'infinite (5) 0'] },
    { text: MATCH_INSTRUCTION, options: [] },
    { text: MATCH_LISTS, options: [] },
    { text: 'List-II (1) $3C_0$ (2) $C_0/2$ Answer.', options: MATCH_MAP_OPTS },
  ],
})
assert.ok(healedMatchPaper.every((q) => !/^List-II\b/i.test(String(q.text).trim())), 'no List-II-only extra card')
assert.ok(
  healedMatchPaper.every((q) => !/^Match the quantities mentioned in List-I/i.test(String(q.text).trim()) || /List-I[\s\S]*\(P\)/.test(q.text)),
  'instruction-only extra card is dropped or joined',
)
assert.ok(healedMatchPaper.some((q) => /Four identical/.test(q.text) && /P →/.test(q.options.join(' '))))

const bled = joinBleedingOptions([
  'Set-I: [\\text {Ni',
  '$[\\mathrm{PdCl}_2(\\mathrm{PPh}_3)_2]$',
  '}_4] and [PdCl_2(PPh_3)_2]',
  'D option full text here',
])
assert.match(bled[0], /Ni/)
assert.match(bled[0], /\}_4\]/)
assert.equal(String(bled[2]).trim(), '')

const chemHealed = healOfficialPyqPaperQuestions({
  questions: [
    {
      text: 'At room temperature, disproportionation of nitrous acid (HNO$_2$) gives the species',
      options: [
        '\\text{H}_3\\text{O}^+, \\text{NO}_3^- and \\text{NO}',
        '\\text{H}_3\\text{O}^+, \\text{NO}_3^- and \\text{NO}_2',
        '\\text{H}_3\\text{O}^+, \\text{NO}^- and \\text{NO}_2',
        '\\text{H}_3\\text{O}^+, \\text{NO}_3^- and \\text{N}_2\\text{O}',
      ],
    },
  ],
})
assert.match(String(chemHealed[0].options[0]), /\$/, 'chemistry \\text{} options get math delimiters')
assert.match(String(chemHealed[0].options[0]), /\\text\{H\}/)

const enDup = healOfficialPyqPaperQuestions({
  questions: [
    {
      text: 'Among the following options, select the option in which each complex in Set-I shows geometrical isomerism. $[en = \\text{H}_2\\text{NCH}_2\\text{CH}_2\\text{NH}_2]$',
      options: ['Set-I: [Ni(CO)4] full A', 'full B option text here', 'full C option text here', 'full D option text here'],
    },
    {
      text: '[en = H2NCH2CH2NH2 ] Answer.',
      options: ['Set-I: [\\text {Ni', 'full B option text here', '}_4] and [PdCl_2(PPh_3)_2]', 'D'],
    },
  ],
})
assert.equal(enDup.length, 1, 'junk [en=] Answer. twin is not a second question')
assert.match(enDup[0].text, /geometrical isomerism/)
assert.doesNotMatch(enDup[0].text, /^\[en\s*=/)

const ESCAPED_FRAC_CUT =
  'Let $\\frac{\\pi}{2} < x < \\pi$ be such that $\\cot x = \\text{frac}\\{-5\\}\\{$'
assert.equal(latexExtractionIncomplete(ESCAPED_FRAC_CUT), true, 'escaped \\text{frac}\\{-5\\}\\{ is incomplete')
assert.match(normalizeFracLatex(ESCAPED_FRAC_CUT), /\\frac\{-5\}\{/)
const restoredEscaped = extendStemFromSource(ESCAPED_FRAC_CUT, MULTI_LINE_SOURCE)
assert.match(restoredEscaped, /\\frac\{-5\}\{\\sqrt\{11\}\}/)
assert.match(restoredEscaped, /11x/)
assert.match(restoredEscaped, /is equal to/i)
assert.equal(latexExtractionIncomplete(restoredEscaped), false)

const TABULAR_MATCH = String.raw`Let $\alpha$ and $\beta$ be the distinct roots of the equation $x^2 + x - 1 = 0$. Consider the set $T = \{1, \alpha, \beta\}$. Match each entry in List-I to the correct entry in List-II.
\begin{tabular}{ll}
\textbf{List-I} & \textbf{List-II} \\
(P) The number of matrices $M$ with all entries in $T$ such that $R_i = C_j = 0$ Ofor all $i, j$, is & (1) $1$ \\
(Q) The number of symmetric matrices $M$ with all entries in $T$ such that $C_j = 0$ for all $j$, is & (2) $12$ \\
(R) Let $M$ be a skew symmetric matrix. Then the number of elements in the set $\left\{ \begin{pmatrix} x \\ y \\ z \end{pmatrix} : M \begin{pmatrix} x \\ y \\ z \end{pmatrix} = \begin{pmatrix} a_{12} \\ 0 \\ -a_{23} \end{pmatrix} \right\}$ is & (3) infinite \\
(S) Let $M$ be a matrix with all entries in $T$. Then the absolute value of the determinant of Mis & (4) $6$ \\
 & (5) $0$ \\
\end{tabular}`
const parsedTabular = parseMatchingListForDisplay(TABULAR_MATCH)
assert.ok(parsedTabular, 'tabular List-I/List-II must parse')
assert.ok(parsedTabular.listI.length >= 4, `List-I rows, got ${parsedTabular.listI.length}`)
assert.ok(parsedTabular.listII.length >= 4, `List-II rows, got ${parsedTabular.listII.length}`)
assert.doesNotMatch(parsedTabular.intro, /\\begin\{tabular\}/)
assert.ok(parsedTabular.listI.every((row) => !/\\begin\{tabular\}|&|\\\\textbf/.test(row.text)))
assert.ok(parsedTabular.listI.some((row) => /pmatrix/.test(row.text)), 'item (R) keeps pmatrix')
assert.ok(parsedTabular.listI.some((row) => /0 for all/.test(row.text)), 'Ofor → 0 for')
assert.ok(parsedTabular.listI.some((row) => /M is/.test(row.text)), 'Mis → M is')

assert.equal(stripKeyLeakFromOption('(key)'), '')
assert.equal(stripKeyLeakFromOption('$\\frac{1}{2}$ (key)').includes('(key)'), false)

const MATCH_MAP_FROM_PAPER = [
  '(key)',
  '(P) → (2) (Q) → (4) (R) → (1) (S) → (5)',
  '(P) → (2) (Q) → (4) (R) → (3) (S) → (5)',
  '(P) → (1) (Q) → (5) (R) → (3) (S) → (4)',
]
const dummies = Array.from({ length: 49 }, (_, i) => ({
  text: `Let $f_{${i}}(x)=x^{2}+${i}$. Then $f_{${i}}(1)$ is equal to`,
  options: ['$1$', '$2$', '$3$', '$4$'],
}))
const fiftyThree = healOfficialPyqPaperQuestions({
  notes: `${MULTI_LINE_SOURCE}\n\n${TABULAR_MATCH}\n(A) (P) → (4) (Q) → (2) (R) → (5) (S) → (1)\n(B) (P) → (2) (Q) → (4) (R) → (1) (S) → (5)\n(C) (P) → (2) (Q) → (4) (R) → (3) (S) → (5)\n(D) (P) → (1) (Q) → (5) (R) → (3) (S) → (4)`,
  questions: [
    ...dummies,
    { text: ESCAPED_FRAC_CUT, options: ['$\\frac{\\sqrt{11}-1}{2\\sqrt{3}}$', '$\\frac{\\sqrt{11}+1}{2\\sqrt{3}}$', '$\\frac{\\sqrt{11}+1}{3\\sqrt{2}}$', '$\\frac{\\sqrt{11}-1}{3\\sqrt{2}}$'] },
    { text: TABULAR_MATCH, options: MATCH_MAP_FROM_PAPER, questionType: 'matrix_match' },
    { text: MATCH_INSTRUCTION, options: [] },
    { text: 'List-II (1) $1$ (2) $12$ (3) infinite (4) $6$ (5) $0$ Answer.', options: MATCH_MAP_FROM_PAPER },
  ],
})
assert.equal(fiftyThree.length, 51, `fragment extras must drop 53 → 51, got ${fiftyThree.length}`)
const cotCard = fiftyThree.find((q) => /\\cot|cot x/.test(q.text))
assert.ok(cotCard, 'cot-x question kept')
assert.match(cotCard.text, /\\frac\{-5\}\{\\sqrt\{11\}\}/)
assert.match(cotCard.text, /11x/)
const matchCard = fiftyThree.find((q) => /distinct roots/.test(q.text))
assert.ok(matchCard, 'match-list question kept')
assert.doesNotMatch(matchCard.text, /\\begin\{tabular\}/)
assert.match(matchCard.text, /List-I/)
assert.match(matchCard.text, /List-II/)
assert.match(matchCard.text, /pmatrix/)
assert.equal(matchCard.questionType, 'single_correct')
assert.ok(fiftyThree.every((q) => !looksLikeMatchInstructionOnlyForTest(q.text)))
assert.ok(fiftyThree.every((q) => !/^List-II\b/i.test(String(q.text).trim())))
assert.ok(matchCard.options.every((o) => !/\(key\)/i.test(String(o))))
assert.match(String(matchCard.options[0] ?? ''), /P/)

const TABULAR_NO_BREAKS = `Let $\\alpha$ and $\\beta$ be the distinct roots of the equation $x^2 + x - 1 = 0$. Consider the set $T = \\{1, \\alpha, \\beta\\}$. Match each entry in List-I to the correct entry in List-II.
\\begin{tabular}{ll}
\\textbf{List-I} & \\textbf{List-II}
(P) The number of matrices $M$ with all entries in $T$ such that $R_i = C_j = 0$ Ofor all $i, j$, is & (1) $1$
(Q) The number of symmetric matrices $M$ with all entries in $T$ such that $C_j = 0$ for all $j$, is & (2) $12$
(R) Let $M$ be a skew symmetric matrix. Then the number of elements in the set $\\left\\{ \\begin{pmatrix} x \\\\ y \\\\ z \\end{pmatrix} : M \\begin{pmatrix} x \\\\ y \\\\ z \\end{pmatrix} = \\begin{pmatrix} a_{12} \\\\ 0 \\\\ -a_{23} \\end{pmatrix} \\right\\}$ is & (3) infinite
(S) Let $M$ be a matrix with all entries in $T$. Then the absolute value of the determinant of Mis & (4) $6$
 & (5) $0$
\\end{tabular}`
const parsedNoBreaks = parseMatchingListForDisplay(TABULAR_NO_BREAKS)
assert.ok(parsedNoBreaks, 'tabular without \\\\ row breaks must still parse')
assert.ok(parsedNoBreaks.listI.length >= 4, `no-break List-I rows, got ${parsedNoBreaks.listI.length}`)
assert.ok(parsedNoBreaks.listII.length >= 4, `no-break List-II rows, got ${parsedNoBreaks.listII.length}`)
assert.doesNotMatch(parsedNoBreaks.intro, /\\begin\{tabular\}/)

const COT_OPTS = [
  '$\\frac{\\sqrt{11}-1}{2\\sqrt{3}}$',
  '$\\frac{\\sqrt{11}+1}{2\\sqrt{3}}$',
  '$\\frac{\\sqrt{11}+1}{3\\sqrt{2}}$',
  '$\\frac{\\sqrt{11}-1}{3\\sqrt{2}}$',
]
const DISPLAY_MATH_SIBLING = {
  text: '$$\\left( \\sin \\frac{11x}{2} \\right) (\\sin 6x - \\cos 6x) + \\left( \\cos \\frac{11x}{2} \\right) (\\sin 6x + \\cos 6x)$$ is equal to',
  options: COT_OPTS,
}
const LIST_I_DUP = {
  text: 'Match each entry in List-I to the correct entry in List-II. List-I (P) The number of matrices $M$ with all entries in $T$ such that $R_i = C_j = 0$ (Q) The number of symmetric matrices $M$ (R) Let $M$ be a skew symmetric matrix (S) Let $M$ be a matrix with all entries in $T$',
  options: MATCH_MAP_FROM_PAPER,
}
const realFiftyThree = healOfficialPyqPaperQuestions({
  notes: `${MULTI_LINE_SOURCE}\n\n${TABULAR_NO_BREAKS}\n(A) (P) → (4) (Q) → (2) (R) → (5) (S) → (1)\n(B) (P) → (2) (Q) → (4) (R) → (1) (S) → (5)`,
  questions: [
    ...dummies,
    { text: ESCAPED_FRAC_CUT, options: COT_OPTS },
    DISPLAY_MATH_SIBLING,
    { text: TABULAR_NO_BREAKS, options: MATCH_MAP_FROM_PAPER, questionType: 'matrix_match' },
    LIST_I_DUP,
  ],
})
assert.equal(realFiftyThree.length, 51, `live-style extras must drop 53 → 51, got ${realFiftyThree.length}`)
const realCot = realFiftyThree.find((q) => /\\cot|cot x/.test(q.text))
assert.ok(realCot, 'cot-x kept after merging display-math sibling')
assert.match(realCot.text, /\\frac\{-5\}\{\\sqrt\{11\}\}/)
assert.match(realCot.text, /11x/)
assert.match(realCot.text, /is equal to/i)
const realMatch = realFiftyThree.find((q) => /distinct roots/.test(q.text))
assert.ok(realMatch, 'match-list kept')
assert.doesNotMatch(realMatch.text, /\\begin\{tabular\}/)
assert.match(realMatch.text, /List-I/)
assert.match(realMatch.text, /List-II/)
assert.ok(realFiftyThree.every((q) => !looksLikeMatchInstructionOnlyForTest(q.text)))

function looksLikeMatchInstructionOnlyForTest(text) {
  const t = String(text ?? '').trim()
  return /^Match the quantities mentioned in List-I/i.test(t) && !/\(P\)/.test(t)
}

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
const stemListTwoOnly =
  'Match each entry in List-I to the correct entry in List-II.\nList-II\n(1) $1$\n(2) $12$\n(3) infinite\n(4) $6$\n(5) $0$'
assert.equal(matchQuestionMissingListI({ text: stemListTwoOnly, options: MATCH_MAP_FROM_PAPER }), true)
const restoredListI = restoreMissingListIFromSource(stemListTwoOnly, MATCH_MAP_FROM_PAPER, LIST_I_OCR)
assert.match(restoredListI, /\(P\)/)
assert.match(restoredListI, /number of matrices/)
assert.match(restoredListI, /List-II/)
assert.equal(matchQuestionMissingListI({ text: restoredListI, options: MATCH_MAP_FROM_PAPER }), false)
assert.equal(
  restoreMissingListIFromSource(stemListTwoOnly, MATCH_MAP_FROM_PAPER, 'no lists in this OCR window at all'),
  stemListTwoOnly,
  'do not invent List-I when OCR has no rows',
)

const healedListI = healOfficialPyqPaperQuestions(
  {
    exam: 'jee-advanced',
    preparedText: LIST_I_OCR,
    notes: LIST_I_OCR,
    questions: [
      ...dummies,
      { text: ESCAPED_FRAC_CUT, options: COT_OPTS },
      { text: stemListTwoOnly, options: MATCH_MAP_FROM_PAPER, questionType: 'matrix_match' },
    ],
  },
  { skipOcrRebuild: true },
)
const healedMatch = healedListI.find((q) => /infinite/.test(q.text) && /List-II/.test(q.text))
assert.ok(healedMatch, 'heal keeps the match question')
assert.match(healedMatch.text, /\(P\)/)
assert.match(healedMatch.text, /number of matrices/)
assert.doesNotMatch(healedMatch.text, /\\begin\{itemize\}/)
assert.equal(matchQuestionMissingListI(healedMatch), false)

const Q8_ORPHAN_ALIGNED =
  'Let $a = 3\\sqrt{2}$ and $b = \\frac{1}{5^{1/6}\\sqrt{6}}$. If $x, y \\in \\mathbb{R}$ are such that & 3 x+2 y= \\log _{a} (18)^{\\frac{5}{4}} \\quad \\text{ and } \\\\ & 2 x-y= \\log_{b}(\\sqrt{1080}), then $4x+5y$ is equal to ___ .'
assert.equal(
  latexExtractionIncomplete(Q8_ORPHAN_ALIGNED),
  false,
  'closed \\frac{5}{4} in an aligned leftover is not a cut-off fraction',
)
const q8Repaired = repairOrphanAlignedBody(Q8_ORPHAN_ALIGNED)
assert.match(q8Repaired, /\\begin\{aligned\}/)
assert.match(q8Repaired, /\\end\{aligned\}/)
assert.match(q8Repaired, /\$\$\\begin\{aligned\}/)
const q8Wrapped = wrapBareLatexRuns(Q8_ORPHAN_ALIGNED)
assert.match(q8Wrapped, /\\begin\{aligned\}/)
const q8Prepared = prepareTextForMathTextDisplay(Q8_ORPHAN_ALIGNED)
assert.match(q8Prepared, /\\begin\{aligned\}/)
const q8Visible = q8Prepared.replace(/\$\$[\s\S]*?\$\$/g, ' ').replace(/\$[^$]*\$/g, ' ')
assert.doesNotMatch(q8Visible, /& 3 x\+2 y= \\log/)
assert.doesNotMatch(q8Visible, /\\log/)
assert.doesNotMatch(q8Visible, /\\frac/)
assert.doesNotMatch(q8Visible, /\\text/)
assert.doesNotMatch(q8Visible, /\\quad/)
assert.doesNotMatch(q8Visible, /\\sqrt/)
assert.equal(latexExtractionIncomplete(q8Prepared), false)
assert.equal(repairOrphanAlignedBody(q8Repaired), q8Repaired, 'aligned repair is idempotent')

const q8Light = lightRepairOfficialPyqQuestions(
  [
    { text: Q8_ORPHAN_ALIGNED, options: [] },
    {
      text: 'Match the quantities mentioned in List-I with their values in List-II and choose the correct option.',
      options: [],
    },
  ],
  LIST_I_OCR,
)
assert.equal(q8Light.length, 1, 'instruction-tail extra must drop (53 → 51 style)')
assert.match(q8Light[0].text, /\\begin\{aligned\}/)
const q8LightVisible = String(q8Light[0].text)
  .replace(/\$\$[\s\S]*?\$\$/g, ' ')
  .replace(/\$[^$]*\$/g, ' ')
assert.doesNotMatch(q8LightVisible, /& 3 x\+2 y= \\log/)

const Q8_LIVE_DISPLAY =
  'Let $a = 3\\sqrt{2}$ and $b = \\frac{1}{5^{1/6}\\sqrt{6}}$. If $x, y \\in \\mathbb{R}$ are such that $$ 3 x+2 y=$$ \\log _{a}(18)^{\\frac{5}{4}} \\quad \\text { and } \\\\ & 2 x-y= \\log _{b}(\\sqrt{1080}), then $4x+5y$ is equal to ___ .'
const q8LiveRepaired = repairOrphanAlignedBody(Q8_LIVE_DISPLAY)
assert.match(q8LiveRepaired, /\\begin\{aligned\}/)
const q8LivePrep = prepareTextForMathTextDisplay(Q8_LIVE_DISPLAY)
const q8LiveVis = q8LivePrep.replace(/\$\$[\s\S]*?\$\$/g, ' ').replace(/\$[^$]*\$/g, ' ')
assert.doesNotMatch(q8LiveVis, /\\log/)
assert.doesNotMatch(q8LiveVis, /\\\\ &/)

const figOcrHeal = `Let a particle as shown in the figure start from rest.
\\includegraphics{https://cdn.mathpix.com/p/vt-graph.png}
Then the current is`
const restoredFigHeal = restoreMissingFiguresFromSource(
  'Let a particle as shown in the figure start from rest. Then the current is',
  figOcrHeal,
)
assert.match(restoredFigHeal, /cdn\.mathpix\.com\/p\/vt-graph/)
assert.equal(
  restoreMissingFiguresFromSource(
    'Let a particle as shown in the figure start from rest. Then the current is',
    'plain OCR with no drawings here at all',
  ),
  'Let a particle as shown in the figure start from rest. Then the current is',
)

assert.equal(looksLikeSmashedProseVmatrix(LET_ABE_SMASHED_VMATRIX_STEM), true)
assert.equal(
  latexExtractionIncomplete(LET_ABE_SMASHED_VMATRIX_STEM),
  true,
  'Let/Abe smashed vmatrix + leftover $$ is incomplete',
)
const healedLetAbe = repairSmashedProseVmatrixOcr(LET_ABE_SMASHED_VMATRIX_STEM)
assert.doesNotMatch(healedLetAbe, /\\begin\{vmatrix\}/)
assert.doesNotMatch(healedLetAbe, /\$\$/)
assert.match(healedLetAbe, /Let A be an/i)
assert.equal(
  latexExtractionIncomplete(healedLetAbe),
  true,
  'unwrapping Let/Abe must not invent the missing matrix — still incomplete',
)
assert.equal(
  latexExtractionIncomplete(
    'Let $$\\begin{vmatrix} 1 & 2 \\\\ 3 & 4 \\end{vmatrix}$$ then the value is',
  ),
  false,
  'real closed vmatrix is complete',
)
assert.equal(
  latexExtractionIncomplete('The value of k + p is $$ leftover'),
  true,
  'unclosed leftover $$ is incomplete — do not invent the rest',
)

const smashedIonTable = String.raw`In a conductometric titration the limiting ionic conductivity ( $\Lambda_{0}$ ) values are given below:
\begin{tabular}[t]{|c|c|c|}
\hline
Ions & $\mathrm{Ag}^{+}$ & $\mathrm{CH}_{3} \mathrm{COO}^{-}$ $$$\hline$$\Lambda_{0}$$ & 6.2 & 4.1 \\$$\hline
\end{tabular}$$
Match each entry in List-I with List-II.`
assert.equal(
  latexExtractionIncomplete(smashedIonTable),
  false,
  'odd $ glue inside a closed ion table is not incomplete extraction',
)

const smashedBhCaption = String.raw`List-I
(P) \includegraphics{https://cdn.mathpix.com/p/p.png}
iv) a) $\mathrm{BH}_{3}$, b) $$\mathrm{H}_{2}\mathrm{O}_{2}$, NaOH
(Q) next row`
assert.equal(
  latexExtractionIncomplete(wrapBareLatexRuns(smashedBhCaption)),
  false,
  'smashed $$ around complete \\mathrm chemistry is not incomplete',
)
assert.match(normalizeSmashedChemDollars(String.raw`$$\mathrm{H}_{2}\mathrm{O}_{2}$`), /^\$\\mathrm/)
assert.equal(
  latexExtractionIncomplete('The value of k + p is $$ leftover'),
  true,
  'real unclosed $$ leftover stays incomplete',
)

const liveQ50Smashed = `List-I contains various reaction sequences and List-II contains the possible products.
List-I
\\includegraphics{https://cdn.mathpix.com/p/p50.png}
i) $\\mathrm{O}_{3}$, Zn
aq. $\\mathrm{NaOH}, \\Delta$
List-II
\\includegraphics{https://cdn.mathpix.com/p/one50.png}
$\\mathrm{H}_{3} \\mathrm{O}^{+} \\mathrm{NaBH}_{4} 

(P) \\includegraphics{https://cdn.mathpix.com/p/p50b.png}
(Q)

_{3}$$, b) $\\mathrm{H}_{2} \\mathrm{O}_{2}$$, $\\mathrm{NaOH}$$$}
\\includegraphics{https://cdn.mathpix.com/p/q50.png}
(R)
\\includegraphics{https://cdn.mathpix.com/p/r50.png}`
const liveQ50Healed = normalizeSmashedChemDollars(wrapBareLatexRuns(liveQ50Smashed))
assert.equal(
  latexExtractionIncomplete(liveQ50Healed),
  false,
  'Q50 leftover H3O+/NaBH4 and BH3 caption tail are complete OCR, not a cut formula',
)
assert.match(liveQ50Healed, /\\mathrm\{H\}_\{3\}/)
assert.doesNotMatch(liveQ50Healed, /_\{3\}\$\$/)
assert.equal(
  latexExtractionIncomplete('$\n$\nList-I\n(P) phenol'),
  false,
  'Q51 leftover empty $ lines are not incomplete List-I',
)

const q46Given = String.raw`Starting with one mole of $\mathbf{Q}$, the amount of $\mathbf{R}$ produced in gram is $____$.
[Given, atomic weight: $\mathrm{H}=1$, C=12, $\mathrm{~N}=14$, $\mathrm{O}=16$, $\mathrm{Na}=23$, $\mathrm{Cl}=35$, $\mathrm{Ca}=40$$ ]`
assert.equal(
  latexExtractionIncomplete(normalizeSmashedChemDollars(q46Given)),
  false,
  'Q46 leftover $$ before ] is complete atomic weights',
)
assert.equal(
  normalizeSmashedChemDollars('$[-1, \\sqrt{7}]$'),
  '$[-1, \\sqrt{7}]$',
  'interval option closer ]$ is not a leftover Given dollar',
)

const q47En = String.raw`Among the following complexes, the total number of diamagnetic species is $____$.
$$\left[\mathrm{Mn}\left(\mathrm{NH}_{3}\right)_{6}\right]^{3+}$$
[Given, atomic number: $\mathrm{Mn}=25, \mathrm{Fe}=26, \mathrm{Co}=27$;
$$\text { en } \left.=\mathrm{H}_{2} \mathrm{NCH}_{2} \mathrm{CH}_{2} \mathrm{NH}_{2}\right]$$`
assert.equal(
  latexExtractionIncomplete(normalizeSmashedChemDollars(q47En)),
  false,
  'Q47 closed $$ en = $$ display is complete',
)
assert.equal(
  latexExtractionIncomplete('The value of k + p is $$ leftover'),
  true,
  'real unclosed $$ leftover stays incomplete after chem-dollar heal',
)

// JEE Adv 2024 Q17: match list cut at empty List-II + 1.6MB notes must not hang.
const q17Cut =
  'Let $f: \\mathbb{R} \\rightarrow \\mathbb{R}$ and $g: \\mathbb{R} \\rightarrow \\mathbb{R}$ be functions. ' +
  'Match each entry in List-I to the correct entry in List-II. List-I ' +
  '(P) If $a=0, b=1, c=0$, and $d=0$, then (Q) If $a=1, b=0, c=0$, and $d=0$, then ' +
  '(R) If $a=0, b=0, c=1$, and $d=0$, then (S) If $a=0, b=0, c=0$, and $d=1$, then List-II'
const q17ListII =
  'List-II\n(1) $h$ is not continuous at $x=0$\n(2) $h$ is continuous but not differentiable at $x=0$\n' +
  '(3) $h$ is differentiable at $x=0$\n(4) $h$ is not differentiable at $x=1$'
const q17HugeSource = `${'SECTION padding line\n'.repeat(80_000)}\n${q17Cut}\n${q17ListII}\nLet k(x) be the next stem.`
assert.equal(stemLooksCutOff(q17Cut), true, 'empty List-II is a cut match stem')
const q17T0 = Date.now()
const q17Restored = extendStemFromSource(q17Cut, q17HugeSource)
const q17Ms = Date.now() - q17T0
assert.ok(q17Ms < 500, `extendStemFromSource Q17 hung on 1.6MB OCR (${q17Ms}ms)`)
assert.match(q17Restored, /List-II/i)
assert.match(q17Restored, /not continuous at/, 'restore List-II from OCR — never invent rows')
assert.match(q17Restored, /List-I/i, 'keep List-I')

console.log('ok general stem parser (multi-line + match-list + unclosed-frac flag + page-break + answer-key)')

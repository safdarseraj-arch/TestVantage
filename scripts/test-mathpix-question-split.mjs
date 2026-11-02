/**
 * Mathpix page dump must never become one question-bank card.
 * No live API. Does not touch the stored question bank.
 */
import assert from 'node:assert/strict'
import {
  countMathpixQuestionMarkers,
  dedupePaperItemsByNumber,
  findGluedNextQuestionStart,
  geminiStructureFailedSplit,
  healPaperItemCards,
  looksLikeMarkingSchemeOption,
  looksLikeMathpixLatexPaper,
  mathpixSplitToBankDrafts,
  normalizeMathpixQuestionMarkers,
  paperItemsFromMathpixOcr,
  recoverOptionsFromStem,
  sanitizeMathpixOcrText,
  shouldRebuildFromMathpixOcr,
  splitGluedPaperItemText,
  splitMathpixQuestionBlocks,
} from '../src/utils/mathpixQuestionSplit.js'
import { questionsFromOfficialPyqExtract, localMathpixSplitGoodEnough, inferOcrQuestionCount, expectedPyqPaperQuestionTarget } from '../src/utils/pyqGeminiExtract.js'
import {
  extractMathpixImageUrls,
  hasMathpixMedia,
  mathpixFiguresSupplyListI,
} from '../src/utils/mathpixMedia.js'
import {
  healOfficialPyqPaperQuestions,
  looksLikeFullPaperItem,
  looksLikeOrphanFragment,
  matchQuestionMissingListI,
} from '../src/utils/extendTruncatedStem.js'
import {
  importQuestionsToOfficialPyqPending,
  reExtractOfficialPyqPendingPaper,
} from '../src/utils/officialPyqApproval.js'
import { reExtractOfficialPyqPendingPaperLocal } from '../src/utils/officialPyqLocalReparse.js'
import { clearOfficialPyqPendingPapers } from '../src/utils/officialPyqPendingStore.js'

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
}
if (typeof globalThis.sessionStorage === 'undefined') {
  const store = new Map()
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis
}

const DUMP = `
If ONLY the correct option is chosen, the candidate is awarded +3 marks.
SECTION 1 (Maximum Marks: 12)
This section contains FOUR (4) questions.

\\item[Q . ]1 Let $f:\\mathbf{R}\\to\\mathbf{R}$is given by
$f(x)=\\begin{cases} x & x\\geq 0 \\\\ -x & \\text { otherwise }\\end{cases}$.
Then $f(2)$ equals
(A) $1$
(B) $2$
(C) $4$
(D) $8$

\\item[Q.] 10 The order of the reaction is
(A) $0$
(B) $1$
(C) $2$
(D) $3$

\\item[Q.] 11 A compound of carbon has the formula
(A) $\\mathrm{CH}_4$
(B) $\\mathrm{C}_2\\mathrm{H}_6$
(C) $\\mathrm{CO}_2$
(D) $\\mathrm{C}_6\\mathrm{H}_6$
`.replace('R}$is given', 'R}\uFFFD is given')

assert.ok(DUMP.includes('\uFFFD'), 'fixture includes replacement char')
const clean = sanitizeMathpixOcrText(DUMP)
assert.ok(!clean.includes('\uFFFD'), 'U+FFFD stripped')
assert.match(sanitizeMathpixOcrText('\\mathbf{R}is'), /\\mathbf\{R\} is/, 'smashed \\mathbf{R}is gets a space')
assert.match(clean, /\\mathbf\{R\}/, 'latex command kept after sanitize')

assert.ok(countMathpixQuestionMarkers(DUMP) >= 3, `markers=${countMathpixQuestionMarkers(DUMP)}`)
assert.equal(looksLikeMathpixLatexPaper(DUMP), true)
assert.equal(geminiStructureFailedSplit(1, DUMP), true, '1 Gemini blob is a failed split')
assert.equal(geminiStructureFailedSplit(3, DUMP), false)

const { blocks, instructionText } = splitMathpixQuestionBlocks(DUMP)
assert.ok(blocks.length >= 3, `expected >=3 blocks, got ${blocks.length}`)
assert.match(instructionText, /ONLY the correct option|SECTION 1|Maximum Marks/i)
assert.ok(!/The order of the reaction/.test(blocks[0]), 'Q.1 must not glue chemistry Q.10')
assert.match(blocks[1], /order of the reaction/)
assert.match(blocks[2], /compound of carbon/)

const normalized = normalizeMathpixQuestionMarkers(DUMP)
assert.match(normalized, /Q\.\s*1/)
assert.match(normalized, /Q\.\s*10/)
assert.match(normalized, /Q\.\s*11/)

const { drafts } = mathpixSplitToBankDrafts(DUMP, { paperMeta: { exam: 'jee-advanced' } })
assert.ok(drafts.length >= 3, `drafts=${drafts.length}`)
assert.ok(drafts.every((d) => d.bankStatus === 'draft'))
assert.ok(drafts.every((d) => !/\\item\[Q/.test(d.text + drafts.map((x) => x.text).join('').slice(0, 0))))
assert.ok(
  drafts.some((d) => /order of the reaction/i.test(d.text)),
  'chemistry Q.10 is its own draft',
)
assert.ok(
  drafts.some((d) => /compound of carbon/i.test(d.text)),
  'chemistry Q.11 is its own draft',
)
assert.ok(
  !drafts.some((d) => /Let \$f:/.test(d.text) && /order of the reaction/i.test(d.text)),
  'math + chemistry must not stay in one card',
)

const blobExtract = questionsFromOfficialPyqExtract(
  {
    engine: 'mathpix',
    text: DUMP,
    questions: [
      {
        text: DUMP,
        options: ['', '', '', ''],
        questionType: 'single_correct',
      },
    ],
  },
  { exam: 'jee-advanced', year: 2024, session: 'Paper 1', paperLabel: 'Mathpix blob test' },
)
assert.ok(
  blobExtract.questions.length >= 3,
  `1-blob Gemini must not win; got ${blobExtract.questions.length}`,
)
assert.equal(blobExtract.questions.length === 1, false)
assert.ok(
  !blobExtract.questions.some((q) => /order of the reaction/i.test(q.text) && /Let \$f:/.test(q.text)),
  'merged math+chem blob rejected',
)
assert.equal(blobExtract.summary.lowCountWarning, true, 'still under 40 — do not approve')

clearOfficialPyqPendingPapers()
const pending = importQuestionsToOfficialPyqPending({
  exam: 'jee-advanced',
  year: 2024,
  session: 'Paper 1',
  sourceLabel: 'Official JEE Advanced archive',
  paperLabel: 'JEE Advanced Mathpix 1-blob heal',
  notes: `Imported from fixture.pdf\n\n--- prepared-ocr ---\n\n${DUMP}`,
  preparedText: DUMP,
  questions: [
    {
      text: DUMP,
      options: ['', '', '', ''],
      subject: 'mathematics',
      chapter: 'General',
      answerSource: 'unknown',
    },
  ],
})
assert.equal(pending.questions.length, 1)
const healed = reExtractOfficialPyqPendingPaper(pending)
assert.equal(healed.ok, true, healed.error)
assert.ok(healed.count >= 3, `Re-parse must heal 1-Q row in place, got ${healed.count}`)
assert.ok(healed.count !== 1)

const MIXED = `A student takes a true-false quiz. The probability that the student guesses is $\\frac{1}{2}$ and the probability that the student is correct given a guess is $\\frac{1}{6}$. Then the probability that the student knows the answer of a randomly chosen question is Let $\\frac{\\pi}{2}<x<\\pi$ be such that $\\cot x=\\frac{-5}{\\sqrt{11}}$. Then
(A) $\\frac{\\sqrt{11}-1}{2 \\sqrt{3}}$
(B) $\\frac{\\sqrt{11}+1}{2 \\sqrt{3}}$
(C) $\\frac{\\sqrt{11}+1}{3 \\sqrt{2}}$
(D) $\\frac{\\sqrt{11}-1}{3 \\sqrt{2}}$`
const glued = splitGluedPaperItemText(MIXED)
assert.ok(glued.stems.length >= 2, `mixed stems=${glued.stems.length}`)
assert.match(glued.stems[0], /true-false quiz/)
assert.ok(!/cot x/.test(glued.stems[0]), 'probability card must not keep cot-x')
assert.match(glued.stems[1], /cot x|Let/)
const mixedCards = healPaperItemCards([{ text: MIXED, options: ['$\\frac{\\sqrt{11}-1}{2 \\sqrt{3}}$ (key)', '$\\frac{\\sqrt{11}+1}{2 \\sqrt{3}}$', '', ''] }])
assert.ok(mixedCards.length >= 2, `heal mixed cards=${mixedCards.length}`)
assert.ok(!mixedCards.some((c) => /true-false quiz/.test(c.text) && /cot x/.test(c.text)))

const ALIGNED_MIX = `A student appears for a quiz consisting of only true-false type questions and answers all the questions. The student knows the answers of some questions and guesses the answers for the remaining questions. Whenever the student knows the answer of a question, he gives the correct Assume that the probability of the student giving the correct answer for a question, given that he has guessed it, is $\\frac{1}{2}$. Also assume that the probability of the answer for a question being guessed, given that the student's answer is correct, is $\\frac{1}{6}$. Then the probability that the student knows the answer of a randomly chosen question is
$$\\begin{aligned} & \\text { Let } \\frac{\\pi}{2}<x<\\pi \\text { be such that } \\cot x=\\frac{-5}{\\sqrt{11}} \\text {. Then } \\\\ & \\left(\\sin \\frac{11 x}{2}\\right)(\\sin 6 x-\\cos 6 x)+\\left(\\cos \\frac{11 x}{2}\\right)(\\sin 6 x+\\cos 6 x)\\end{aligned}$$`
const alignedGlued = splitGluedPaperItemText(ALIGNED_MIX)
assert.ok(alignedGlued.stems.length >= 2, `aligned mixed stems=${alignedGlued.stems.length}`)
assert.match(alignedGlued.stems[0], /true-false|probability/)
assert.ok(!/cot x|\\\\begin\{aligned\}/.test(alignedGlued.stems[0]), 'probability card must not keep aligned cot-x')
assert.match(alignedGlued.stems[1], /cot x|\\\\frac\{\\\\pi\}|aligned/)
const alignedCards = healPaperItemCards([
  {
    text: ALIGNED_MIX,
    options: [
      '$\\frac{\\sqrt{11}-1}{2 \\sqrt{3}}$',
      '$\\frac{\\sqrt{11}+1}{2 \\sqrt{3}}$',
      '$\\frac{\\sqrt{11}+1}{3 \\sqrt{2}}$',
      '$\\frac{\\sqrt{11}-1}{3 \\sqrt{2}}$',
    ],
  },
])
assert.ok(alignedCards.length >= 2, `aligned heal cards=${alignedCards.length}`)
assert.ok(!alignedCards.some((c) => /true-false|randomly chosen/.test(c.text) && /cot x/.test(c.text)))
assert.equal(
  looksLikeOrphanFragment(alignedCards.find((c) => /cot x|aligned/.test(c.text))?.text || alignedCards[1]?.text),
  false,
  'aligned cot-x card must not be treated as an orphan',
)
assert.equal(looksLikeFullPaperItem(alignedCards[1]?.text || ''), true)
const liveHeal = healOfficialPyqPaperQuestions({
  questions: [
    {
      text: ALIGNED_MIX,
      options: [
        '$\\frac{\\sqrt{11}-1}{2 \\sqrt{3}}$',
        '$\\frac{\\sqrt{11}+1}{2 \\sqrt{3}}$',
        '$\\frac{\\sqrt{11}+1}{3 \\sqrt{2}}$',
        '$\\frac{\\sqrt{11}-1}{3 \\sqrt{2}}$',
      ],
    },
  ],
})
assert.ok(liveHeal.length >= 2, `preview heal must keep both cards, got ${liveHeal.length}`)
assert.ok(liveHeal.some((c) => /probability|true-false/.test(c.text)))
assert.ok(liveHeal.some((c) => /cot x|\\\\sin|aligned/.test(c.text)))
assert.ok(liveHeal.some((c) => (c.options || []).filter((o) => String(o).trim()).length >= 2))
const cotLive = liveHeal.find((c) => /cot x/.test(c.text) && !/true-false quiz/.test(c.text))
assert.ok(cotLive, 'cot-x card present')
assert.match(String(cotLive.text), /\\sqrt\{11\}/)
assert.match(String(cotLive.text), /\\begin\{aligned\}/)
assert.match(String(cotLive.text), /\\end\{aligned\}/)
assert.doesNotMatch(String(cotLive.text), /\\frac\{-5\}\{\s*$/)

const iffAfterD = `Let $z=a+ib$. Then
(A) $z$ is real
(B) $z$ is imaginary
(C) $z=0$
(D) $z$ is purely imaginary if and only if $b = 0$, where $i = \\sqrt{-1}$.`
assert.equal(
  findGluedNextQuestionStart(iffAfterD),
  -1,
  'if and only if after (D) is not a new question',
)
const itemizedD = `A particle is thrown with speed $v$. The correct statement(s) is/are:
\\begin{itemize}
\\item[(A)] If $\\theta=45^{\\circ}$, then $v=\\frac{5\\sqrt{g}}{2}$.
\\item[(B)] If $\\theta=45^{\\circ}$, the particle reaches its maximum height before $P$.
\\item[(C)] If $\\theta=30^{\\circ}$, the particle reaches its maximum height after $P$.
\\item[(D)] If $\\theta=\\tan^{-1}\\left(\\frac{1}{5}\\right)$, then $v=125\\sqrt{g}$.
\\end{itemize}`
assert.equal(
  findGluedNextQuestionStart(itemizedD),
  -1,
  'If at the start of \\\\item[(D)] is that option, not the next question',
)
const itemizedCards = healPaperItemCards([{ text: itemizedD, options: [] }])
assert.equal(itemizedCards.length, 1)
assert.match(String(itemizedCards[0].options?.[3] || ''), /125/)
const iffCards = healPaperItemCards([{ text: iffAfterD, options: [] }])
assert.equal(iffCards.length, 1, `iff must stay one card, got ${iffCards.length}`)
assert.match(String(iffCards[0].options?.[3] || iffCards[0].text), /if and only if/)

const iffSplitCards = healPaperItemCards([
  {
    text: 'Let $S = \\{a + b\\sqrt{2}\\}$. Then which of the following statements is (are) TRUE?',
    options: [
      '$\\mathbb{Z} \\cup T_1 \\cup T_2 \\subset S$',
      '$T_1 \\cap (0, \\frac{1}{2024}) = \\emptyset$',
      '$T_2 \\cap (2024, \\infty) \\neq \\emptyset$',
      'For any given $a, b \\in \\mathbb{Z}$, $\\cos(\\pi(a+b\\sqrt{2}))+i\\sin(\\pi(a+b\\sqrt{2})) \\in \\mathbb{Z}$',
    ],
  },
  { text: '6. if and only if $b = 0$, where $i = \\sqrt{-1}$.', options: [] },
])
assert.equal(iffSplitCards.length, 1, 'numbered if-and-only-if must merge into previous option D')
assert.match(String(iffSplitCards[0].options[3] ?? ''), /if and only if/)
assert.doesNotMatch(String(iffSplitCards[0].text), /^6\.\s*if and only if/)

const iffGluedNum = healPaperItemCards([
  {
    text: 'Let $S = \\{a + b\\sqrt{2}\\}$. Then which of the following statements is (are) TRUE?',
    options: [
      '$\\mathbb{Z} \\cup T_1 \\cup T_2 \\subset S$',
      '$T_1 \\cap (0, \\frac{1}{2024}) = \\emptyset$',
      '$T_2 \\cap (2024, \\infty) \\neq \\emptyset$',
      'For any given $a, b \\in \\mathbb{Z}$, $\\cos(\\pi(a+b\\sqrt{2}))+i\\sin(\\pi(a+b\\sqrt{2})) \\in \\mathbb{Z}$',
    ],
  },
  { text: '6.if and only if $b = 0$, where $i = \\sqrt{-1}$.', options: [] },
])
assert.equal(iffGluedNum.length, 1, 'OCR "6.if" without space must merge into option D')
assert.match(String(iffGluedNum[0].options[3] ?? ''), /if and only if/)

const ITEMIZE_MSQ = `Let $S = \\{a + b\\sqrt{2} : a, b \\in \\mathbb{Z}\\}$. Then which of the following statements is (are) TRUE? \\begin{itemize} \\item[`
const ITEMIZE_OPTS = `A. ] $\\mathbb{Z} \\cup T_1 \\cup T_2 \\subset S$
\\item[]
$T_1 \\cap T_2 = \\phi$
\\item[]
$\\frac{1}{2024}$
\\item[]
$\\phi$ denotes the empty set`
const itemizeCards = healPaperItemCards([{ text: ITEMIZE_MSQ, options: [ITEMIZE_OPTS, '', '', ''] }])
assert.equal(itemizeCards.length, 1, `itemize cards=${itemizeCards.length}`)
assert.ok(!/\\begin\{itemize\}|\\item\[/.test(itemizeCards[0].text), 'stem must not keep itemize code')
assert.ok(
  itemizeCards[0].options.filter((o) => String(o).trim()).length >= 3,
  `itemize options=${JSON.stringify(itemizeCards[0].options)}`,
)
assert.ok(!itemizeCards[0].options.some((o) => /\\item\[/.test(o)), 'options must not show \\item[]')

const ELLIPSE = `The ellipse $\\frac{x^{2}}{9}+\\frac{y^{2}}{4}=1$ has $\\triangle ORT$. Then
(A) $q=2, p=3\\sqrt{3}$
(B) $q=2, p=6\\sqrt{3}$
(C) $q=1, p=3\\sqrt{3}$
(D) $q=1, p=6\\sqrt{3}$
\\end{itemize} \\section*{SECTION 2 (Maximum Marks: 12)} \\begin{itemize} \\item[-] This section contains THREE (03) questions. ONE OR MORE THAN ONE of these four option(s) is(are) correct.`
const ellipseCards = healPaperItemCards([
  {
    text: ELLIPSE,
    options: [
      'will get +1 mark; choosing ONLY (key)',
      'unanswered will get 0 mark',
      '(P) → (4) (Q) → (2) (R) → (5) (S) → (3)',
      'negative marks if more options',
    ],
  },
])
assert.equal(ellipseCards.length, 1, `ellipse cards=${ellipseCards.length}`)
assert.ok(!/SECTION 2|This section contains|Maximum Marks/i.test(ellipseCards[0].text))
assert.ok(!ellipseCards[0].options.some((o) => looksLikeMarkingSchemeOption(o)))
assert.match(ellipseCards[0].options[0] || '', /q=2|\\sqrt\{3\}/)
assert.ok(!/\(key\)/i.test(ellipseCards[0].options.join(' ')))

const PIECEWISE = `Given $$ f(x)=\\begin{cases} x^{2}e^{2(x-1)}, & 0\\le x\\le 1 \\\\ a\\operatorname{sgn}(x+1)\\cos(2x-2)+bx^{2}, & 1<x\\le 2 \\end{cases} $$
If $f(x)$ is differentiable at $x=1$, then the value of $|a-b|$ is`
assert.equal(splitGluedPaperItemText(PIECEWISE).stems.length, 1, 'piecewise If f(x) must stay one question')
assert.equal(healPaperItemCards([{ text: PIECEWISE, options: ['', '', '', ''] }]).length, 1)

const SAME_LET = `Let $f(x)=x$ and let $g(x)=x^{2}$. Then $f+g$ equals
(A) $x$
(B) $x^{2}$
(C) $x+x^{2}$
(D) $2x$`
assert.equal(
  splitGluedPaperItemText(SAME_LET).stems.length,
  1,
  'and let in the same stem must not unmerge',
)

const GLUED_PAIRS = [
  MIXED,
  `A coin is tossed twice. The probability that both faces are heads is Let $a>0$ be such that $a^{2}=4$. Then
(A) $1$
(B) $2$
(C) $3$
(D) $4$`,
  `The value of the definite integral equals Let $z\\in\\mathbb{C}$ satisfy $|z|=1$. Then
(A) $0$
(B) $1$
(C) $2$
(D) $3$`,
  `Find the number of real roots of the cubic. The number of real roots is Consider the reaction $2\\mathrm{H}_2+\\mathrm{O}_2$. Then
(A) $1$
(B) $2$
(C) $3$
(D) $4$`,
  `Let $p$ be a prime. Then $p+1$ equals
(A) $2$
(B) $3$
(C) $4$
(D) $5$
Let $\\theta\\in(0,\\pi/2)$ be such that $\\sin\\theta=1/2$. Then
(A) $30$
(B) $45$
(C) $60$
(D) $90$`,
  `Let $n=3$. Then $n!$ equals
(A) $3$
(B) $6$
(C) $9$
(D) $12$
\\item[Q.] 40 A cell has the potential
(A) $1$
(B) $2$
(C) $3$
(D) $4$`,
  `Which of the following identities is true?
(A) $1=1$
(B) $2=2$
(C) $3=3$
(D) $4=4$
Q. 41 The nucleus of helium-4 contains
(A) protons
(B) only electrons
(C) only neutrons
(D) photons`,
  `${ELLIPSE}
Let $k>0$ be such that $k^{2}=9$. Then
(A) $1$
(B) $2$
(C) $3$
(D) $4$`,
]
for (let i = 0; i < GLUED_PAIRS.length; i++) {
  const bits = splitGluedPaperItemText(GLUED_PAIRS[i])
  assert.ok(bits.stems.length >= 2, `glued pair ${i + 1} stems=${bits.stems.length}`)
}
const gluedFortyThree = [
  ...Array.from({ length: 35 }, (_, i) => ({
    text: `Let $x_{${i + 1}}$ be a real number. Then $x_{${i + 1}}^{2}$ equals`,
    options: ['$0$', '$1$', '$2$', '$3$'],
    questionType: 'single_correct',
  })),
  ...GLUED_PAIRS.map((text) => ({ text, options: ['$1$', '$2$', '$3$', '$4$'], questionType: 'single_correct' })),
]
assert.equal(gluedFortyThree.length, 43, '43 stored cards')
const unmerged = healPaperItemCards(gluedFortyThree)
assert.equal(unmerged.length, 51, `8 glued pairs must become 51, got ${unmerged.length}`)

const markerPaper = Array.from({ length: 51 }, (_, i) => {
  return `\\item[Q.] ${i + 1} Let $x_{${i + 1}}$ be a real. Then
(A) $0$
(B) $1$
(C) $2$
(D) $3$`
}).join('\n\n')
assert.ok(countMathpixQuestionMarkers(markerPaper) >= 51)
assert.equal(geminiStructureFailedSplit(43, markerPaper), true, '43 vs 51 markers is a failed split')
assert.equal(geminiStructureFailedSplit(51, markerPaper), false)

const extract51 = questionsFromOfficialPyqExtract(
  {
    engine: 'mathpix',
    text: markerPaper,
    questions: gluedFortyThree,
  },
  { exam: 'jee-advanced', year: 2024, session: 'Paper 1', paperLabel: 'JEE Advanced 2024' },
)
assert.equal(extract51.source, 'mathpix-canonical', 'Mathpix OCR is the paper, not a Gemini merge')
assert.ok(
  extract51.questions.length >= 49 && extract51.questions.length <= 53,
  `Official extract must unmerge toward 51, got ${extract51.questions.length}`,
)
const nums = extract51.questions.map((q) => Number(q.questionNumber)).filter((n) => n > 0)
assert.equal(new Set(nums).size, nums.length, 'no duplicate question numbers')
assert.equal(shouldRebuildFromMathpixOcr(markerPaper, 41), true)
assert.equal(shouldRebuildFromMathpixOcr(markerPaper, 41, 51), true)
assert.equal(
  shouldRebuildFromMathpixOcr(markerPaper, 51, 51),
  false,
  'do not re-split a full 51 — leftover glue only',
)
assert.equal(
  shouldRebuildFromMathpixOcr(markerPaper, 53, 51),
  false,
  '53 leftover cards: glue, do not re-split OCR',
)
assert.equal(
  shouldRebuildFromMathpixOcr(markerPaper, 50, 51),
  true,
  '50 stored vs 51 OCR markers must re-split',
)
assert.equal(
  shouldRebuildFromMathpixOcr(markerPaper, 50, 50),
  true,
  '50 stored with 51 markers must re-split even when inferOcr matched stored count',
)
assert.equal(inferOcrQuestionCount(markerPaper), 51)
assert.equal(expectedPyqPaperQuestionTarget('jee-advanced', 'Paper 1', markerPaper), 51)
const markerPaper50 = Array.from({ length: 50 }, (_, i) => {
  return `\\item[Q.] ${i + 1} Let $x_{${i + 1}}$ be a real. Then
(A) $0$
(B) $1$
(C) $2$
(D) $3$`
}).join('\n\n')
const markerPaper53 = Array.from({ length: 53 }, (_, i) => {
  return `\\item[Q.] ${i + 1} Let $x_{${i + 1}}$ be a real. Then
(A) $0$
(B) $1$
(C) $2$
(D) $3$`
}).join('\n\n')
assert.equal(countMathpixQuestionMarkers(markerPaper50), 50)
assert.equal(countMathpixQuestionMarkers(markerPaper53), 53)
assert.equal(expectedPyqPaperQuestionTarget('jee-advanced', 'Paper 1', markerPaper50), 50)
assert.equal(expectedPyqPaperQuestionTarget('jee-advanced', 'Paper 1', markerPaper53), 53)
const fromOcr = paperItemsFromMathpixOcr(markerPaper)
assert.equal(fromOcr.length, 51)
assert.ok(fromOcr.every((q) => (q.options || []).filter((o) => String(o).trim()).length >= 2))
const healedFromOcr = healOfficialPyqPaperQuestions({
  preparedText: markerPaper,
  questions: fromOcr,
  exam: 'jee-advanced',
})
assert.equal(
  localMathpixSplitGoodEnough(healedFromOcr, markerPaper, { exam: 'jee-advanced', session: 'Paper 1' }),
  true,
  '51 clean Mathpix cards must skip Gemini',
)
assert.equal(
  localMathpixSplitGoodEnough(gluedFortyThree, markerPaper, { exam: 'jee-advanced' }),
  false,
  '43 glued cards vs 51 markers must not skip Gemini',
)
const previewFromOcr = healOfficialPyqPaperQuestions({
  preparedText: markerPaper,
  questions: gluedFortyThree,
  exam: 'jee-advanced',
})
assert.equal(previewFromOcr.length, 51, `preview must rebuild from OCR, got ${previewFromOcr.length}`)
const previewFromFifty = healOfficialPyqPaperQuestions({
  preparedText: markerPaper,
  questions: extract51.questions.slice(0, 50),
  exam: 'jee-advanced',
})
assert.equal(
  previewFromFifty.length,
  51,
  `50 stored cards must recover to 51 from OCR, got ${previewFromFifty.length}`,
)
assert.equal(
  healOfficialPyqPaperQuestions({
    preparedText: markerPaper,
    questions: fromOcr,
    exam: 'jee-advanced',
  }).length,
  51,
  'heal must not drop one card from a full 51',
)
const numberedInstrPaper = `${markerPaper}

\\item[Q.] 52 This section contains FOUR questions.
Let $x$ be a real. Then
(A) $0$
(B) $1$
(C) $2$
(D) $3$`
assert.ok(
  paperItemsFromMathpixOcr(numberedInstrPaper).length >= 51,
  'numbered question after a section line must still become a card',
)

const threeSubjects = ['MATH', 'PHYSICS', 'CHEM']
  .flatMap((sub) =>
    Array.from({ length: 17 }, (_, i) => {
      return `\\item[Q.] ${i + 1} Let ${sub} $x_{${i + 1}}$ be a real. Then
(A) $0$
(B) $1$
(C) $2$
(D) $3$`
    }),
  )
  .join('\n\n')
assert.equal(countMathpixQuestionMarkers(threeSubjects), 51)
const fromThree = paperItemsFromMathpixOcr(threeSubjects)
assert.ok(
  fromThree.length >= 49 && fromThree.length <= 53,
  `three subjects × Q.1–17 must stay ~51, got ${fromThree.length}`,
)
assert.equal(new Set(fromThree.map((q) => q.pyqSlot)).size, fromThree.length, 'unique pyqSlot 1–51')
assert.equal(fromThree.filter((q) => Number(q.printedNumber) === 1).length, 3, 'printed Q.1 kept thrice')

const sameStem = {
  text: 'Let $f(x)=x$. Then $f(2)$ equals',
  options: ['$0$', '$1$', '$2$', '$3$'],
  questionNumber: 5,
}
const otherStem = {
  text: 'A source of sound has frequency 240 Hz. Then n equals',
  options: ['$200$', '$220$', '$240$', '$260$'],
  questionNumber: 5,
}
assert.equal(
  dedupePaperItemsByNumber([sameStem, { ...sameStem }, otherStem]).length,
  2,
  'consecutive same-number same-stem drops; later Q.5 in another subject stays',
)

const sparse18 = Array.from({ length: 18 }, (_, i) => {
  return `\\item[Q.] ${i + 1} Let $x_{${i + 1}}$ be a real. Then
(A) $0$
(B) $1$
(C) $2$
(D) $3$`
}).join('\n\n')
assert.equal(
  expectedPyqPaperQuestionTarget('jee-advanced', 'Paper 1', sparse18),
  18,
  'a short OCR keeps its real marker count',
)
assert.equal(
  localMathpixSplitGoodEnough(fromOcr.slice(0, 18), sparse18, { exam: 'jee-advanced' }),
  false,
  'sparse OCR must not skip Gemini',
)
assert.equal(shouldRebuildFromMathpixOcr(sparse18, 0, 51), false, 'JEE Adv must not rebuild from <40 markers')
assert.equal(shouldRebuildFromMathpixOcr(sparse18, 41, 51), false, 'must not shrink 41 using 18 markers')
assert.equal(shouldRebuildFromMathpixOcr(sparse18, 0), true, 'without expected, 18 markers may still rebuild')
assert.ok(!extract51.questions.some((q) => /true-false quiz/.test(q.text) && /cot x/.test(q.text)))
assert.ok(!extract51.questions.some((q) => /ellipse/.test(q.text) && /SECTION 2|This section contains/i.test(q.text)))

clearOfficialPyqPendingPapers()
const pending43 = importQuestionsToOfficialPyqPending({
  exam: 'jee-advanced',
  year: 2024,
  session: 'Paper 1',
  sourceLabel: 'Official JEE Advanced archive',
  paperLabel: 'JEE Advanced 2024',
  notes: `Imported from fixture.pdf\n\n--- prepared-ocr ---\n\n${markerPaper}`,
  preparedText: markerPaper,
  questions: gluedFortyThree,
})
assert.equal(pending43.questions.length, 43)
const reparsed = reExtractOfficialPyqPendingPaper(pending43)
assert.equal(reparsed.ok, true, reparsed.error)
assert.ok(
  reparsed.count >= 49 && reparsed.count <= 53,
  `Re-parse stored OCR must heal 43 → ~51 in place, got ${reparsed.count}`,
)

clearOfficialPyqPendingPapers()
const pending50 = importQuestionsToOfficialPyqPending({
  exam: 'jee-advanced',
  year: 2024,
  session: 'Paper 1',
  sourceLabel: 'Official JEE Advanced archive',
  paperLabel: 'JEE Advanced 2024 fifty stored',
  notes: `Imported from fixture.pdf\n\n--- prepared-ocr ---\n\n${markerPaper}`,
  preparedText: markerPaper,
  questions: fromOcr.slice(0, 50),
})
assert.equal(pending50.questions.length, 50)
const local50 = reExtractOfficialPyqPendingPaperLocal(pending50)
assert.equal(local50.ok, true, local50.error)
assert.ok(
  local50.count >= 49 && local50.count <= 53,
  `Local re-parse must rebuild 50 stored → ~51, got ${local50.count}`,
)

clearOfficialPyqPendingPapers()
const pendingKeep43 = importQuestionsToOfficialPyqPending({
  exam: 'jee-advanced',
  year: 2024,
  session: 'Paper 1',
  sourceLabel: 'Official JEE Advanced archive',
  paperLabel: 'JEE Advanced 2024 keep-43',
  notes: `Imported from fixture.pdf\n\n--- prepared-ocr ---\n\n${sparse18}`,
  preparedText: sparse18,
  questions: gluedFortyThree,
})
assert.equal(pendingKeep43.questions.length, 43)
const blockedShrink = reExtractOfficialPyqPendingPaper(pendingKeep43)
assert.equal(blockedShrink.ok, false, 'must not save 18 over a 43-question paper')
assert.equal(blockedShrink.count, 43, `kept old cards, got ${blockedShrink.count}`)
assert.match(String(blockedShrink.error ?? ''), /keeping the existing 43/i)

const FIG52 = `\\item[Q.] 52 List-I contains various reaction sequences and List-II contains different phenolic compounds. Match each entry in List-I with the appropriate entry in List-II and choose the correct option.
\\begin{figure}
\\includegraphics[width=\\textwidth]{https://cdn.mathpix.com/cropped/ab.jpg?height=324&width=573&top_left_y=452&top_left_x=338}
\\caption{List-I}
\\end{figure}
\\caption{(P)}
\\begin{figure}
\\includegraphics{https://cdn.mathpix.com/cropped/cd.jpg?height=100&width=100&top_left_y=1&top_left_x=1}
\\caption{List-II}
\\end{figure}`
assert.equal(hasMathpixMedia(FIG52), true)
assert.ok(extractMathpixImageUrls(FIG52).length >= 2)
assert.equal(mathpixFiguresSupplyListI(FIG52), true)
assert.equal(matchQuestionMissingListI({ text: FIG52 }), false)
const figDrafts = paperItemsFromMathpixOcr(`${markerPaper}\n\n${FIG52}`)
assert.ok(
  figDrafts.some((q) => Number(q.questionNumber) === 52 && hasMathpixMedia(q.text)),
  'figure match question must stay in the paper',
)

const soundStem =
  'A source (S) of sound has frequency 240 Hz. When the observer (O) and the source move towards each other, the observer measures 288 Hz. The value of n is ____.'
const leakedSound = recoverOptionsFromStem(soundStem, [
  'source (S) of sound has frequency 240 Hz. When the observer',
  '',
  '',
  '',
])
assert.equal(
  leakedSound.options.filter((o) => /source \(S\) of sound has frequency/i.test(o)).length,
  0,
  'fake option A that repeats the stem must be dropped',
)
const leakedSoundCards = healPaperItemCards([
  {
    text: soundStem,
    options: [
      'source (S) of sound has frequency 240 Hz. When the observer',
      '',
      '',
      '',
    ],
  },
])
assert.equal(
  leakedSoundCards[0].options.filter((o) => /source \(S\) of sound has frequency/i.test(o)).length,
  0,
  'bank/heal path must blank stem-leak option A',
)

const smilesMcq = `Aspartame is a dipeptide.
\\begin{itemize}
\\item[] <smiles>COC(=O)[C@H](Cc1ccccc1)NC(=O)C[C@H](N)C(=O)O</smiles>
\\item[] <smiles>COC(=O)[C@H](Cc1ccccc1)NC(=O)C[C@H](N)CC(=O)O</smiles>
\\item[] <smiles>COC(=O)[C@H](CC(=O)O)NC(=O)C(N)Cc1ccccc1</smiles>
\\item[] <smiles>COC(=O)C[C@H](N)C(=O)N[C@H](Cc1ccccc1)C(=O)O</smiles>
\\end{itemize}`
const smilesRec = recoverOptionsFromStem(smilesMcq, [])
assert.equal(smilesRec.options.filter((o) => /<smiles>/i.test(o)).length, 4, 'SMILES itemize becomes A–D')
assert.doesNotMatch(smilesRec.stem, /<smiles>/i)

const aspartameDup = `The structure of aspartame is
<smiles>COC(=O)[C@H](Cc1ccccc1)NC(=O)C[C@H](N)C(=O)O</smiles>
(A)
(B)
(C)
(D)
<smiles>COC(=O)[C@H](Cc1ccccc1)NC(=O)C[C@H](N)C(=O)O</smiles>
<smiles>COC(=O)[C@H](Cc1ccccc1)NC(=O)[C@H](N)CC(=O)O</smiles>
<smiles>COC(=O)[C@H](CC(=O)O)NC(=O)C(N)Cc1ccccc1</smiles>
<smiles>COC(=O)C[C@H](N)C(=O)N[C@H](Cc1ccccc1)C(=O)O</smiles>`
const aspRec = recoverOptionsFromStem(aspartameDup, [])
assert.equal(aspRec.options.filter((o) => /<smiles>/i.test(o)).length, 4)
assert.doesNotMatch(aspRec.stem, /<smiles>/i, 'option-A SMILES must not stay on the stem')
assert.doesNotMatch(aspRec.stem, /\(A\)[\s\S]*\(D\)/)

const smilesMatchStem = `List-I contains various reaction sequences and List-II contains the possible products.
Match each entry in List-I with List-II.
\\caption{List-I}
<smiles>CC1C(O)CCC1CO</smiles>
<smiles>CC1C(O)CCC1C=O</smiles>
<smiles>O=C1CCCC1CO</smiles>
<smiles>CC1CCCC1CO</smiles>`
const smilesMatchRec = recoverOptionsFromStem(smilesMatchStem, [])
assert.equal(
  smilesMatchRec.options.filter((o) => /<smiles>/i.test(o)).length,
  0,
  'match-column SMILES stay in List-I/II, not A–D',
)

const MATCH_ITEMIZE = `Match each entry in List-I to the correct entry in List-II.
List-I
\\begin{itemize}
\\item[(P)] The number of matrices $M$ with all entries in $T$ such that $R_i = C_j = 0$ is
\\item[(Q)] The number of symmetric matrices $M$ with all entries in $T$ is
\\item[(R)] Let $M$ be a skew symmetric matrix with enough words here
\\item[(S)] Let $M$ be a matrix with all entries in $T$ then det
\\end{itemize}
List-II (1) $1$ (2) $12$ (3) infinite (4) $6$`
const matchItemRec = recoverOptionsFromStem(MATCH_ITEMIZE, [
  '(P) → (1)',
  '(P) → (2)',
  '(P) → (3)',
  '(P) → (4)',
])
assert.match(matchItemRec.stem, /\(P\)/, 'List-I itemize labels stay on the stem')
assert.doesNotMatch(matchItemRec.stem, /\\begin\{itemize\}/)
assert.doesNotMatch(matchItemRec.stem, /\\item/)
assert.equal(matchQuestionMissingListI({ text: matchItemRec.stem, options: matchItemRec.options }), false)

const THREE_GLUED = `One mole of a monatomic ideal gas undergoes the cyclic process as shown in the P-T diagram.
Match the quantities mentioned in List-I with their values in List-II and choose the correct option.

Four identical thin, square metal sheets, $S_{1}$ and $S_{2}$, each of side $a$ are kept parallel to each other with equal distance $d$ between them, as shown in the figure.
Match the quantities mentioned in List-I with their values in List-II and choose the correct option.

A light ray is incident on the surface of a sphere of refractive index $n$ at an angle of incidence $\\theta_{0}$. Match the quantities mentioned in List-I with their values in List-II and choose the correct option.`
const threeGlued = splitGluedPaperItemText(THREE_GLUED)
assert.equal(threeGlued.stems.length, 3, `got ${threeGlued.stems.length}: ${threeGlued.stems.map((s) => s.slice(0, 24)).join(' | ')}`)
assert.ok(findGluedNextQuestionStart(THREE_GLUED) > 40)

const Q31_SECTION_LIST = `One mole of a monatomic ideal gas undergoes the cyclic process as shown in the figure.
Match the quantities mentioned in List-I with their values in List-II and choose the correct option.
\\end{itemize}

\\section*{List-I}
\\begin{itemize}
\\item[(P)] Work done in the complete cyclic process
\\item[(Q)] Change in the internal energy of the gas in the process JK
\\end{itemize}

\\section*{List-II}
\\begin{itemize}
\\item[(1)] $\\mathcal{R} T_{0}$
\\item[(2)] 0
\\end{itemize}

Four identical thin, square metal sheets, $S_{1}$ and $S_{2}$ each of side $a$.`
const q31Split = splitGluedPaperItemText(Q31_SECTION_LIST)
assert.match(q31Split.stems[0], /List-I/, 'do not cut List-I after question \\end{itemize}')
assert.match(q31Split.stems[0], /Work done in the complete cyclic process/)
assert.doesNotMatch(q31Split.stems[0], /Four identical/)
assert.ok(q31Split.stems.some((s) => /Four identical/.test(s)))

const ADV_P2_PARAGRAPH = `
\\item[Q.] 4 A particle moves in a straight line. Then $v$ equals
(A) $1$
(B) $2$
(C) $3$
(D) $4$

Paragraph for Questions 5 and 6

Let $S$ be the set of all real numbers. If $x \\in S$ then the energy is
$$E = \\frac{1}{2}mv^{2}$$
\\includegraphics{https://cdn.mathpix.com/cropped/2024_p2_rod.jpg?height=120&width=200}

\\item[Q.] 5 The kinetic energy of the particle is
(A) $E$
(B) $2E$
(C) $3E$
(D) $4E$

\\item[Q.] 6 The potential energy of the particle is
(A) $0$
(B) $E$
(C) $2E$
(D) $3E$

\\item[Q.] 7 Let $f(x)=x$. Then $f(2)$ equals
(A) $1$
(B) $2$
(C) $4$
(D) $8$
`

const paraBlocks = splitMathpixQuestionBlocks(ADV_P2_PARAGRAPH)
assert.ok(
  paraBlocks.blocks.some((b) => /kinetic energy/i.test(b)),
  'Q.5 stays its own block',
)
assert.ok(
  paraBlocks.blocks.some((b) => /potential energy/i.test(b)),
  'Q.6 stays its own block',
)
const paraCards = paperItemsFromMathpixOcr(ADV_P2_PARAGRAPH)
assert.equal(paraCards.length, 4, `paragraph must not be an extra question, got ${paraCards.length}`)
const paraNums = paraCards.map((q) => Number(q.printedNumber || q.questionNumber))
assert.deepEqual(paraNums, [4, 5, 6, 7], `printed numbers must stay 4,5,6,7 got ${paraNums}`)
assert.equal(new Set(paraNums).size, 4, 'no duplicate numbers around the paragraph')
const q5 = paraCards.find((q) => Number(q.printedNumber) === 5)
const q6 = paraCards.find((q) => Number(q.printedNumber) === 6)
const q4 = paraCards.find((q) => Number(q.printedNumber) === 4)
const q7 = paraCards.find((q) => Number(q.printedNumber) === 7)
assert.ok(q5?.passageText, 'Q.5 must keep the shared passage')
assert.ok(q6?.passageText, 'Q.6 must keep the shared passage')
assert.match(String(q5.passageText), /Let \$S\$ be the set/)
assert.match(String(q5.passageText), /\$\$E = \\frac\{1\}\{2\}\s*mv\^\{2\}\$\$/)
assert.match(String(q5.passageText), /\\includegraphics\{https:\/\/cdn\.mathpix\.com/)
assert.equal(q5.passageText, q6.passageText, 'both children share the same passage')
assert.ok(!q4?.passageText, 'Q.4 before the paragraph must not steal it')
assert.ok(!q7?.passageText, 'Q.7 after the pair must not inherit it')
assert.ok(!/Paragraph\s+for/i.test(q5.text), 'child stem is the question, not the paragraph header')
assert.ok(!paraCards.some((q) => /^Paragraph\s+for\b/i.test(String(q.text ?? '').trim())), 'passage is not a question')
assert.ok(
  !paraCards.some((q) => /kinetic energy/i.test(q.text) && /potential energy/i.test(q.text)),
  'Q.5 and Q.6 must stay two questions',
)
const letBlob =
  'Paragraph for Questions 5 and 6\nLet $S$ be the set of all real numbers. If $x \\in S$ then\n$$E=1$$\nQ. 5 The kinetic energy is'
const letInside = findGluedNextQuestionStart(letBlob)
assert.ok(
  letInside < 0 || /^Q\.\s*5/.test(letBlob.slice(letInside).trim()),
  'do not split the passage on Let',
)

const gluedPrev = healPaperItemCards([
  {
    text: `A particle moves in a straight line. Then $v$ equals
(A) $1$
(B) $2$
Paragraph for Questions 5 and 6
Let $S$ be the set. If $x \\in S$ then $$E = \\frac{1}{2}mv^{2}$$`,
    options: ['$1$', '$2$', '$3$', '$4$'],
    questionNumber: 4,
  },
  {
    text: 'The kinetic energy of the particle is',
    options: ['$E$', '$2E$', '$3E$', '$4E$'],
    questionNumber: 5,
  },
  {
    text: 'The potential energy of the particle is',
    options: ['$0$', '$E$', '$2E$', '$3E$'],
    questionNumber: 6,
  },
])
assert.ok(!gluedPrev.some((q) => /^Paragraph\s+for\b/i.test(String(q.text ?? '').trim())))
assert.equal(gluedPrev.length, 3, `glued previous stem must not count the passage, got ${gluedPrev.length}`)
assert.ok(gluedPrev[1].passageText && gluedPrev[2].passageText)
assert.match(String(gluedPrev[1].passageText), /\\frac\{1\}\{2\}/)
assert.ok(!gluedPrev[0].passageText)

const PARA_I_OCR =
  '\\section*{PARAGRAPH "I"}\n' +
  'Let $S=\\{1,2,3,4,5,6\\}$ and $X$ be the set of all relations $R$ from $S$ to $S$ that satisfy both the following properties:\n' +
  '\\begin{itemize}\n' +
  '\\item[i.] $R$ has exactly 6 elements.\n' +
  '\\item[ii.] For each $(a,b)\\in R$, we have $|a-b|\\geq 2$.\n' +
  '\\end{itemize}\n' +
  'Let $Y=\\{R\\in X:$ The range of $R$ has exactly one element$\\}$ and $Z=\\{R\\in X: R$ is a function from $S$ to $S\\}$.\n' +
  'Let $n(A)$ denote the number of elements in a set $A$.\n' +
  '(There are two questions based on PARAGRAPH "I", the question given below is one of them)\n'

const ADV_P2_PAIRS = `
\\item[Q.] 3 Let $k \\in \\mathbb{R}$. If $\\lim_{x \\to 0+}(\\sin(\\sin kx)+\\cos x+x)^{2/x}=e^{6}$, then the value of $k$ is ______.

\\item[Q.] 13 Let the function f : [1, \\infty) \\rightarrow \\mathbb{R} be defined by f(t)={
(-1)^{n+1}2, if t=2n-1, n \\in \\mathbb{N},
\\frac{(2n+1-t)}{2}f(2n-1)+\\frac{(t-(2n-1))}{2}f(2n+1), if 2n-1 < t < 2n+1, n \\in \\mathbb{N}.
Define g(x)=\\int_{?}^{x} f(t) dt, x \\in (1,\\infty). Let \\alpha denote the number of solutions of the equation g(x)=0 in the interval (1,8) and \\beta=\\lim_{x \\rightarrow 1+} \\frac{g(x)}{x-1}. Then the value of \\alpha+\\beta is equal to ______.

\\item[Q.] 14 If $n(X)={}^{m}C_{6}$, then the value of $m$ is ______.
${PARA_I_OCR}
\\item[Q.] 15 If the value of $n(Y)+n(Z)$ is $k^{2}$, then $|k|$ is ______.

Paragraph for Questions 16 and 17
Let $U$ be the fixture set used only for the 16-17 grouping contract.

\\item[Q.] 16 If $n(U)=1$ then the value is ______.
\\item[Q.] 17 If $n(U)=2$ then the value is ______.

Paragraph for Questions 31 and 32
Let $P$ be the fixture set used only for the 31-32 grouping contract.

\\item[Q.] 31 If $n(P)=1$ then the value is ______.
\\item[Q.] 32 If $n(P)=2$ then the value is ______.

Paragraph for Questions 33 and 34
Let $Q$ be the fixture set used only for the 33-34 grouping contract.

\\item[Q.] 33 If $n(Q)=1$ then the value is ______.
\\item[Q.] 34 If $n(Q)=2$ then the value is ______.

Paragraph for Questions 48 and 49
Let $C$ be the fixture set used only for the 48-49 grouping contract.

\\item[Q.] 48 If $n(C)=1$ then the value is ______.
\\item[Q.] 49 If $n(C)=2$ then the value is ______.

Paragraph for Questions 50 and 51
Let $D$ be the fixture set used only for the 50-51 grouping contract.

\\item[Q.] 50 If $n(D)=1$ then the value is ______.
\\item[Q.] 51 If $n(D)=2$ then the value is ______.
`

const pairCards = paperItemsFromMathpixOcr(ADV_P2_PAIRS)
const byNum = (n) => pairCards.find((q) => Number(q.printedNumber || q.questionNumber) === n)
const q3 = byNum(3)
const q13 = byNum(13)
const q14 = byNum(14)
const q15 = byNum(15)
assert.ok(q3, 'Q3 limit-k must exist')
assert.ok(!q3.passageId, 'Q3 must have no passageId')
assert.ok(!q3.passageText, 'Q3 must not receive Paragraph I')
assert.doesNotMatch(String(q3.text), /relations R from S/)
assert.match(String(q3.text), /Let \$k/)
assert.ok(q13, 'Q13 must exist')
assert.ok(q14 && q15, 'Q14 and Q15 must stay two questions')
assert.equal(q14.passageText, q15.passageText, 'Paragraph I once, shared')
assert.equal(q14.passageId, q15.passageId)
assert.equal(q14.passageRole, 'comprehension_child')
assert.equal(q15.passageRole, 'comprehension_child')
assert.match(String(q14.passageText), /Let \$S=\\\{1,2,3,4,5,6\\\}/)
assert.doesNotMatch(String(q14.passageText), /\\section/)
assert.doesNotMatch(String(q14.text), /exactly 6 elements/)
assert.doesNotMatch((q14.options || []).join('\n'), /exactly 6 elements/)
assert.match(String(q14.text), /n\(X\)/)
assert.match(String(q15.text), /n\(Y\)/)
assert.equal(q14.questionType, 'numerical', 'Paragraph I children are NVQ, not SCQ')
assert.equal(q15.questionType, 'numerical')
assert.equal((q14.options || []).filter((o) => String(o).trim()).length, 0)
assert.ok(!q13.passageText, 'Q13 must not steal Paragraph I')
assert.match(String(q13.text), /\\int_\{\?\}/)
assert.doesNotMatch(String(q13.text), /\\int_\{1\}/)

const PAIR_NUMS = [
  [16, 17, /fixture set used only for the 16-17/],
  [31, 32, /fixture set used only for the 31-32/],
  [33, 34, /fixture set used only for the 33-34/],
  [48, 49, /fixture set used only for the 48-49/],
  [50, 51, /fixture set used only for the 50-51/],
]
for (const [a, b, body] of PAIR_NUMS) {
  const qa = byNum(a)
  const qb = byNum(b)
  assert.ok(qa && qb, `Q${a} and Q${b} must stay two questions`)
  assert.equal(qa.passageText, qb.passageText, `Q${a}+Q${b} share one passage`)
  assert.equal(qa.passageId, qb.passageId)
  assert.equal(qa.passageRole, 'comprehension_child')
  assert.equal(qb.passageRole, 'comprehension_child')
  assert.match(String(qa.passageText), body)
}

const matchThenFigure = String.raw`
\item[Q.] 1 The List-II contains products. Match each entry and choose the correct option.
List-I
\item[(P)] <smiles>CC1CCCC2=C1CCCC2C</smiles>
\item[(Q)] <smiles>CC1CCCC(C)C2=C1CCC2</smiles>
\item[(R)] <smiles>CC1CCC(C)C2=C1CCCC2</smiles>
\item[(S)] <smiles>CC1CCCC2(C)CCCC12</smiles>
List-II
\item[(1)] <smiles>CC1CCC(=O)C2(C)CCCCC12O</smiles>
\item[(5)] <smiles>CC1CCCC2(C)C(=O)CCCC12O</smiles>
\begin{tabular}{|l|l|}
\hline (A) & P $\rightarrow$ 2 ; Q $\rightarrow$ 1 ; R $\rightarrow$ 5 ; S $\rightarrow$ 4 \\
\hline (B) & P $\rightarrow$ 1 ; Q $\rightarrow$ 2 ; R $\rightarrow$ 4 ; S $\rightarrow$ 5 \\
\hline (C) & P $\rightarrow$ 1 ; Q $\rightarrow$ 2 ; R $\rightarrow$ 3 ; S $\rightarrow$ 4 \\
\hline (D) & P $\rightarrow$ 2 ; Q $\rightarrow$ 1 ; R $\rightarrow$ 3 ; S $\rightarrow$ 5 \\
\hline
\end{tabular}
\item[Q.] 2 Match the major products obtained in the reactions given in List-I with the corresponding structures in List-II and choose the correct option.
List-I
\item[(P)] first product ring
\item[(Q)] second product ring
\item[(R)] third product ring
\item[(S)] fourth product ring
List-II
(1) <smiles>N#Cc1ccccc1O</smiles>
(5) \includegraphics{https://cdn.mathpix.com/cropped/next-q.jpg?height=40&width=40&top_left_y=9&top_left_x=9}
\begin{tabular}{|l|l|}
\hline (A) & P $\rightarrow$ 5 ; Q $\rightarrow$ 1 ; R $\rightarrow$ 4 ; S $\rightarrow$ 3 \\
\hline (B) & P $\rightarrow$ 4 ; Q $\rightarrow$ 5 ; R $\rightarrow$ 1 ; S $\rightarrow$ 2 \\
\hline (C) & P $\rightarrow$ 3 ; Q $\rightarrow$ 4 ; R $\rightarrow$ 5 ; S $\rightarrow$ 1 \\
\hline (D) & P $\rightarrow$ 5 ; Q $\rightarrow$ 4 ; R $\rightarrow$ 2 ; S $\rightarrow$ 1 \\
\hline
\end{tabular}
`
const matchCards = paperItemsFromMathpixOcr(matchThenFigure, {
  paperMeta: { exam: 'jee-advanced', year: 2026 },
})
const firstMatch = matchCards.find((c) => /List-II contains products/.test(String(c.text)))
const secondMatch = matchCards.find((c) => /major products/.test(String(c.text)))
assert.ok(firstMatch && secondMatch, 'both match questions stay separate')
const firstOpts = (firstMatch.options || []).map((o) => String(o))
assert.equal(firstOpts.filter((o) => o.trim()).length, 4, 'options after List-II stay on that question')
assert.match(firstOpts[0], /P\s*(?:\\rightarrow|→)\s*2/)
assert.doesNotMatch(firstOpts.join('\n'), /next-q\.jpg/)
assert.doesNotMatch(String(firstMatch.text), /next-q\.jpg/)
const secondOpts = (secondMatch.options || []).map((o) => String(o))
assert.equal(secondOpts.filter((o) => o.trim()).length, 4, 'next question keeps its own options')
assert.match(secondOpts[0], /P\s*(?:\\rightarrow|→)\s*5/)
assert.doesNotMatch(secondOpts.join('\n'), /P\s*(?:\\rightarrow|→)\s*2/)
assert.match(String(secondMatch.text), /next-q\.jpg/)
assert.doesNotMatch(String(secondMatch.text), /CC1CCCC2\(C\)C\(=O\)CCCC12O/)

const listsThenNextTable = String.raw`
\item[Q.] 1 The List-II contains products obtained from ozone then cyclization. Match each entry in List-I with the appropriate entry in List-II and choose the correct option.
List-I
\item[(P)] <smiles>CC1CCCC2=C1CCCC2C</smiles>
\item[(Q)] <smiles>CC1CCCC(C)C2=C1CCC2</smiles>
\item[(R)] <smiles>CC1CCC(C)C2=C1CCCC2</smiles>
\item[(S)] <smiles>CC1CCCC2(C)CCCC12</smiles>
List-II
\item[(1)] <smiles>CC1CCC(=O)C2(C)CCCCC12O</smiles>
\item[(5)] <smiles>CC1CCCC2(C)C(=O)CCCC12O</smiles>
\item[Q.] 2 Match the major products obtained in the reactions given in List-I with the corresponding structures in List-II and choose the correct option.
List-I
\item[(P)] aldehyde product
\item[(Q)] bromide product
\item[(R)] amide product
\item[(S)] oxime product
List-II
(5) \includegraphics{https://cdn.mathpix.com/cropped/later-q.jpg?height=40&width=40&top_left_y=9&top_left_x=9}
\begin{tabular}{|l|l|}
\hline (A) & P $\rightarrow$ 2 ; Q $\rightarrow$ 1 ; R $\rightarrow$ 5 ; S $\rightarrow$ 4 \\
\hline (B) & P $\rightarrow$ 1 ; Q $\rightarrow$ 2 ; R $\rightarrow$ 4 ; S $\rightarrow$ 5 \\
\hline (C) & P $\rightarrow$ 1 ; Q $\rightarrow$ 2 ; R $\rightarrow$ 3 ; S $\rightarrow$ 4 \\
\hline (D) & P $\rightarrow$ 2 ; Q $\rightarrow$ 1 ; R $\rightarrow$ 3 ; S $\rightarrow$ 5 \\
\hline
\end{tabular}
`
const laterCards = paperItemsFromMathpixOcr(listsThenNextTable, {
  paperMeta: { exam: 'jee-advanced', year: 2026 },
})
const ozoneCard = laterCards.find((c) => /ozone then cyclization/.test(String(c.text)))
const laterCard = laterCards.find((c) => /major products/.test(String(c.text)))
assert.ok(ozoneCard && laterCard, 'a list question without a table stays separate from the next match')
assert.equal(
  (ozoneCard.options || []).filter((o) => String(o).trim()).length,
  0,
  'do not steal the next question options table',
)
assert.doesNotMatch(String(ozoneCard.text), /later-q\.jpg/)
assert.match(String(ozoneCard.text), /CC1CCCC2\(C\)C\(=O\)CCCC12O/)
const laterOpts = (laterCard.options || []).map((o) => String(o))
assert.equal(laterOpts.filter((o) => o.trim()).length, 4, 'options after the later lists stay on that question')
assert.match(laterOpts[0], /P\s*(?:\\rightarrow|→)\s*2/)
assert.match(String(laterCard.text), /later-q\.jpg/)
assert.doesNotMatch(String(laterCard.text), /CC1CCCC2\(C\)C\(=O\)CCCC12O/)

console.log('test-mathpix-question-split: Mathpix dump splits; 1-blob Gemini is failure; Re-parse heals')

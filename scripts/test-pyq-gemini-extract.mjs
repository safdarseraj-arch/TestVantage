/**
 * Garbled Gemini PYQ generate/extract -> repaired or rejected.
 * No live API. Does not touch the question bank.
 */
import assert from 'node:assert/strict'

const {
  parseAndValidateScqTrialResponse,
  finalizeGeminiTrialQuestions,
  extractJsonValue,
  trialItemToPyqBankItem,
} = await import('../src/utils/geminiScqTrial.js')

const {
  repairGeminiPyqLatex,
  validateGeminiPyqGenerateItem,
  validateGeminiPyqExtractItem,
  optionListFromGemini,
  questionsFromOfficialPyqExtract,
  officialPyqPaperDefaults,
  coercePyqExtractPayload,
  runPyqGeminiPageJobs,
} = await import('../src/utils/pyqGeminiExtract.js')

const { pyqPaperKey } = await import('../src/utils/pyqSlotMeta.js')

const job = {
  examId: 'jee-main',
  subject: 'mathematics',
  section: 'Calculus',
  chapter: 'Integration',
  topics: ['Substitution', 'Parts'],
  pyqStyle: true,
  pyqYear: 2024,
  pyqDate: '2024-01-27',
  pyqShift: 2,
}

const paperMeta = {
  exam: 'jee-main',
  year: 2024,
  pyqDate: '2024-01-27',
  pyqShift: 2,
  paperLabel: '27 Jan 2024 Shift 2',
  sourceLabel: 'Teacher upload',
}

const goodStem = 'The value of integral 2x dx from 0 to 1 is:'
const goodOpts = ['0', '1', '2', '1/2']
const goodSol = 'Antiderivative x^2 from 0 to 1 equals 1.'

const garbledCases =
  'Given f(x)=\\begin{cases} x^{2}e^{2(x-1)}, & 0\\le x\\le 1 a sgn(x+1)\\cos(2x-2)+bx^{2}, & 1<x\\le 2 \\end{cases} If f(x) is differentiable at x=1, then |a-b| is'
const repairedCases = repairGeminiPyqLatex(garbledCases)
assert.match(repairedCases, /operatorname\{sgn\}/)
assert.match(repairedCases, /\\\\/)
assert.doesNotMatch(repairedCases, /\ba\s+sgn\s*\(/)

const generateRepaired = validateGeminiPyqGenerateItem(
  {
    stem: garbledCases,
    options: ['0', '1', '2', '3'],
    correctIndex: 1,
    solution: 'Match f and f prime at x=1 to get |a-b|.',
    toughness: 8,
    topic: 'Substitution',
  },
  job,
)
assert.equal(generateRepaired.ok, true, generateRepaired.error)
assert.match(generateRepaired.item.stem, /operatorname\{sgn\}/)
assert.equal(generateRepaired.item.toughness, 8, 'actual toughness kept')

const fromObj = optionListFromGemini({ A: '1', B: '2', C: '3', D: '4' })
assert.deepEqual(fromObj, ['1', '2', '3', '4'])

const objItem = validateGeminiPyqGenerateItem(
  {
    stem: goodStem,
    options: { A: '0', B: '1', C: '2', D: '1/2' },
    correct: 'B',
    explanation: goodSol,
    toughness: 3,
    topic: 'Parts',
  },
  job,
)
assert.equal(objItem.ok, true, objItem.error)
assert.equal(objItem.item.correctIndex, 1)
assert.equal(objItem.item.options.length, 4)

assert.equal(
  validateGeminiPyqGenerateItem(
    { stem: goodStem, options: ['a', 'b', 'c'], correctIndex: 0, solution: goodSol },
    job,
  ).ok,
  false,
)
assert.equal(
  validateGeminiPyqGenerateItem(
    { stem: '', options: goodOpts, correctIndex: 0, solution: goodSol },
    job,
  ).ok,
  false,
)
assert.equal(
  validateGeminiPyqGenerateItem(
    {
      stem: goodStem,
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctIndex: 0,
      solution: goodSol,
    },
    job,
  ).ok,
  false,
)
assert.equal(
  validateGeminiPyqGenerateItem(
    {
      stem: 'Let f(x)=|x+pi|/sin x, then :',
      options: ['f(-pi+)=-1', 'f(-pi-)=1', '\\lim', ''],
      correctIndex: 2,
      solution: goodSol,
    },
    job,
  ).ok,
  false,
)
assert.equal(
  validateGeminiPyqGenerateItem(
    { stem: goodStem, options: goodOpts, correctIndex: 1, solution: 'nope' },
    job,
  ).ok,
  false,
)

const truncated =
  '{"questions":[{"stem":"' +
  goodStem +
  '","options":["0","1","2","1/2"],"correctIndex":1,"solution":"' +
  goodSol +
  '","toughness":4,"topic":"Substitution"}'
const repairedJson = extractJsonValue(truncated)
assert.ok(repairedJson)
assert.equal(repairedJson.questions.length, 1)
const parsedTrunc = parseAndValidateScqTrialResponse(truncated, job)
assert.equal(parsedTrunc.ok, true)
assert.equal(parsedTrunc.questions.length, 1)
assert.equal(parsedTrunc.questions[0].toughness, 4)

const tenSame = {
  questions: Array.from({ length: 10 }, (_, i) => ({
    stem: 'Stem ' + (i + 1) + ' ' + goodStem,
    options: goodOpts,
    correctIndex: 0,
    solution: goodSol,
    toughness: 5,
    topic: 'Substitution',
  })),
}
const pyqMix = parseAndValidateScqTrialResponse(tenSame, { ...job, count: 10 })
assert.equal(pyqMix.questions.length, 10)
assert.ok(
  pyqMix.questions.every((q) => q.toughness === 5),
  'PYQ generate keeps actual toughness; no 4+3+3 rewrite',
)

const practiceMix = parseAndValidateScqTrialResponse(tenSame, {
  examId: 'jee-main',
  subject: 'mathematics',
  section: 'Calculus',
  chapter: 'Integration',
  topics: ['Substitution'],
  count: 10,
  typePlan: Array.from({ length: 10 }, () => ({ type: 'single_correct' })),
})
assert.equal(practiceMix.questions.filter((q) => q.toughness >= 1 && q.toughness <= 3).length, 4)

const hallucinated = parseAndValidateScqTrialResponse(
  {
    questions: [
      {
        stem: goodStem,
        options: goodOpts,
        correctIndex: 1,
        solution: goodSol,
        toughness: 6,
        topic: 'Substitution',
        pyqYear: 2010,
        pyqDate: '2010-04-01',
        pyqShift: 1,
      },
    ],
  },
  job,
)
const bankItem = trialItemToPyqBankItem(hallucinated.questions[0], job, { now: 1, index: 0 })
assert.equal(bankItem.pyqYear, 2024)
assert.equal(bankItem.pyqDate, '2024-01-27')
assert.equal(bankItem.pyqShift, 2)
assert.equal(bankItem.pyqStyle, true)
assert.equal(bankItem.officialPyq, false)
assert.equal(pyqPaperKey(bankItem), 'jee-main:2024:2024-01-27:s2')
assert.match(String(bankItem.paperLabel), /Shift 2/)
assert.equal(bankItem.bankSource, 'pyq_style_ai')

const advItem = trialItemToPyqBankItem(
  hallucinated.questions[0],
  {
    ...job,
    examId: 'jee-advanced',
    pyqSession: 'Paper 2',
    pyqDate: undefined,
    pyqShift: undefined,
  },
  { now: 2, index: 0 },
)
assert.equal(advItem.pyqSession, 'Paper 2')
assert.equal(pyqPaperKey(advItem), 'jee-advanced:2024:p2')

const neetItem = trialItemToPyqBankItem(
  hallucinated.questions[0],
  {
    ...job,
    examId: 'neet',
    subject: 'biology',
    pyqDate: undefined,
    pyqShift: undefined,
  },
  { now: 3, index: 0 },
)
assert.equal(pyqPaperKey(neetItem), 'neet:2024')

const officialExtract = {
  engine: 'cloud-vision',
  text: 'IGNORE THIS GARBLED PAGE DUMP asgn Usxst',
  questions: [
    {
      number: 1,
      text: garbledCases,
      options: ['0', '1', '2', '3'],
      answerKeyVisible: false,
      correctIndex: null,
      chapter: 'Limits',
      subject: 'mathematics',
    },
    {
      number: 2,
      stem: '',
      options: ['a', 'b', 'c', 'd'],
    },
    {
      number: 3,
      text: 'Let f(x)=x then :',
      options: ['f(-pi+)=-1', 'f(-pi-)=1', '\\lim', ''],
    },
  ],
}

const official = questionsFromOfficialPyqExtract(officialExtract, paperMeta)
assert.equal(official.source, 'gemini-structured')
assert.equal(official.questions.length, 1, 'only the repairable structured item is kept')
assert.ok(official.rejected.length >= 2)
assert.equal(official.questions[0].pyqYear, 2024)
assert.equal(official.questions[0].pyqDate, '2024-01-27')
assert.equal(official.questions[0].pyqShift, 2)
assert.match(official.questions[0].text, /operatorname\{sgn\}/)
assert.notEqual(official.questions[0].pyqYear, 2010)

const extractItemOk = validateGeminiPyqExtractItem(officialExtract.questions[0])
assert.equal(extractItemOk.ok, true)
assert.equal(extractItemOk.item.correctIndex, undefined, 'do not invent an answer key')

const extractTrunc = validateGeminiPyqExtractItem(officialExtract.questions[2])
assert.equal(extractTrunc.ok, false)

const defaults = officialPyqPaperDefaults(paperMeta)
assert.equal(defaults.examPatternId, 'jee-main')
assert.equal(defaults.pyqShift, 2)

const coerced = coercePyqExtractPayload('plain OCR text')
assert.equal(coerced.engine, 'builtin')
assert.equal(coerced.questions.length, 0)

const {
  recoverLabeledOptionsFromStem,
  mergeGeminiPyqPageExtracts,
  repairGeminiPyqBankItem,
} = await import('../src/utils/pyqGeminiExtract.js')

const glued =
  'Let $f(x)=x^2$ then : (A) $0$ (B) $1$ (C) $2$ (D) $4$'
const pulled = recoverLabeledOptionsFromStem(glued)
assert.ok(pulled)
assert.match(pulled.stem, /f\(x\)/)
assert.doesNotMatch(pulled.stem, /\(\s*A\s*\)/)
assert.equal(pulled.options.length, 4)
assert.equal(pulled.options.filter(Boolean).length, 4)

const gluedOk = validateGeminiPyqExtractItem({ text: glued, options: [] })
assert.equal(gluedOk.ok, true, gluedOk.error)
assert.equal(gluedOk.item.options.filter(Boolean).length, 4)

const merged = mergeGeminiPyqPageExtracts([
  {
    engine: 'cloud-vision',
    text: 'page 1',
    questions: [
      {
        number: 1,
        text: goodStem,
        options: goodOpts,
        toughness: 7,
        subject: 'mathematics',
        chapter: 'Integration',
      },
    ],
  },
  {
    engine: 'cloud-vision',
    text: 'page 2',
    questions: [
      {
        number: 1,
        text: 'If $x+1=0$ then $x$ is:',
        options: ['$-1$', '$0$', '$1$', '$2$'],
        toughness: 2,
        subject: 'mathematics',
        chapter: 'Algebra',
      },
    ],
  },
])
assert.equal(merged.questions.length, 2)
assert.equal(merged.questions[0].number, 1)
assert.equal(merged.questions[1].number, 2)
assert.match(merged.text, /page 1/)
assert.match(merged.text, /page 2/)

const mergedPyq = questionsFromOfficialPyqExtract(merged, paperMeta)
assert.equal(mergedPyq.questions.length, 2)
assert.equal(mergedPyq.questions[0].pyqYear, 2024)
assert.equal(mergedPyq.questions[0].pyqDate, '2024-01-27')
assert.equal(mergedPyq.questions[0].pyqShift, 2)
assert.equal(mergedPyq.questions[1].pyqYear, 2024)
assert.equal(mergedPyq.questions[0].toughnessLevel, undefined, 'toughness is a Hybrid AI tag, filled after approval')
assert.equal(mergedPyq.questions[1].chapter, 'General', 'chapter is a Hybrid AI tag, filled after approval')

const repairedRow = repairGeminiPyqBankItem({
  text: garbledCases,
  options: ['0', '1', '2', '3'],
  toughnessLevel: 9,
  pyqYear: 2024,
  pyqDate: '2024-01-27',
  pyqShift: 2,
})
assert.match(repairedRow.text, /operatorname\{sgn\}/)
assert.equal(repairedRow.toughnessLevel, 9)
assert.equal(repairedRow.pyqShift, 2)

const apiSkip = finalizeGeminiTrialQuestions(
  {
    questions: [
      {
        text: goodStem,
        options: goodOpts,
        correctIndex: 1,
        solution: goodSol,
        toughness: 6,
        topic: 'Substitution',
      },
      {
        stem: '',
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctIndex: 0,
        solution: 'x',
      },
    ],
  },
  job,
)
assert.equal(apiSkip.ok, true)
assert.equal(apiSkip.questions.length, 1, 'garbled API row rejected')
assert.equal(apiSkip.questions[0].toughness, 6)
const fromApi = trialItemToPyqBankItem(apiSkip.questions[0], job, { now: 9, index: 0 })
assert.equal(fromApi.text, goodStem)
assert.equal(fromApi.toughnessLevel, 6)
assert.equal(fromApi.pyqDate, '2024-01-27')
assert.equal(fromApi.pyqShift, 2)

const sectionGarbage = {
  engine: 'cloud-vision',
  text: `SECTION 1 (Maximum Marks: 18)
This section contains SIX (6) questions.
The answer to each question is a SINGLE DIGIT INTEGER ranging from 0 to 9, both inclusive.
For each question, enter the correct integer in the space provided.

1. Let $f(x)=x^2$. Then $f(2)$ equals
(A) $1$
(B) $2$
(C) $4$
(D) $8$

2. If $x+y=5$ then $x$ when $y=2$ is
(A) $1$
(B) $2$
(C) $3$
(D) $4$`,
  questions: [
    {
      stem: 'SECTION 1 (Maximum Marks: 18) This section contains SIX (6) questions.',
      options: [',', 'and', 'marking scheme', 'ONLY ONE of these four options is correct'],
    },
    {
      stem: 'Let $f(x)=x^2$. Then $f(2)$ equals',
      options: ['$1$', '$2$', '$4$', '$8$'],
    },
  ],
}
const sectionFiltered = questionsFromOfficialPyqExtract(sectionGarbage, {
  exam: 'jee-advanced',
  year: 2024,
  session: 'Paper 1',
  paperLabel: 'JEE Advanced 2024 Paper 1',
  sourceLabel: 'Official archive',
})
assert.ok(sectionFiltered.rejected.some((r) => /instruction/i.test(r)), 'section header rejected')
assert.ok(sectionFiltered.questions.length >= 2, 'real MCQs kept from OCR text merge')
assert.ok(
  sectionFiltered.questions.every((q) => !/^section\s+/i.test(String(q.text))),
  'no SECTION garbage in output',
)

const { looksLikePyqSectionInstructionStem } = await import('../src/utils/bulkExtractClean.js')

const multiSectionText = `SECTION 1 (Maximum Marks: 18)
This section contains SIX (6) questions.
The answer to each question is a SINGLE DIGIT INTEGER ranging from 0 to 9, both inclusive.
For each question, enter the correct integer in the space provided.

1. Let $f(x)=x^2$. Then $f(2)$ equals
(A) $1$
(B) $2$
(C) $4$
(D) $8$

2. If $x+y=5$ then $x$ when $y=2$ is
(A) $1$
(B) $2$
(C) $3$
(D) $4$

3. The value of $\\int_0^1 2x\\,dx$ is
(A) $0$
(B) $1$
(C) $2$
(D) $3$

--- page ---

SECTION 2 (Maximum Marks: 24)
This section contains SIX (6) questions.
Each question has FOUR options (A), (B), (C) and (D). ONLY ONE of these four options is correct.

4. Which of the following is equal to $2+2$?
(A) $3$
(B) $4$
(C) $5$
(D) $6$

5. Let $z=1+i$. Then $|z|$ is
(A) $1$
(B) $\\sqrt{2}$
(C) $2$
(D) $4$

6. If $\\sin\\theta=\\frac{1}{2}$, then $\\theta$ could be
(A) $30^\\circ$
(B) $45^\\circ$
(C) $60^\\circ$
(D) $90^\\circ$

7. The number of roots of $x^2-4=0$ is
(A) $0$
(B) $1$
(C) $2$
(D) $3$

--- page ---

SECTION 3 (Maximum Marks: 24)
Single Correct Answer Type. This section contains SIX (6) questions.

8. Let $a,b$ be positive reals. If $a+b=10$, then maximum of $ab$ is
(A) $20$
(B) $25$
(C) $30$
(D) $40$

9. Which of the following is a prime number?
(A) $21$
(B) $23$
(C) $27$
(D) $33$

10. If $|A|=1$ for identity matrix $A$, then $|A|$ is
(A) $0$
(B) $1$
(C) $2$
(D) $-1$

11. The slope of the line $y=3x+2$ is
(A) $2$
(B) $3$
(C) $5$
(D) $6$

12. If $P(A)=0.5$ and $P(B)=0.5$ for independent events, then $P(A\\cap B)$ is
(A) $0$
(B) $0.25$
(C) $0.5$
(D) $1$

13. Let $f(x)=x^3$. Then $f'(x)$ is
(A) $x$
(B) $x^2$
(C) $3x^2$
(D) $3x^3$

14. Which of the following is the derivative of $\\sin x$?
(A) $\\cos x$
(B) $-\\cos x$
(C) $\\sin x$
(D) $-\\sin x$

15. If $\\vec{a}\\cdot\\vec{b}=0$, then vectors are
(A) parallel
(B) perpendicular
(C) equal
(D) opposite

16. The integral $\\int e^x\\,dx$ equals
(A) $e^x+C$
(B) $xe^x+C$
(C) $\\frac{e^x}{x}+C$
(D) $\\ln x+C$

17. If $\\lim_{x\\to 0}\\frac{\\sin x}{x}=L$, then $L$ is
(A) $0$
(B) $1$
(C) $2$
(D) undefined

18. The solution of $2x=8$ is
(A) $2$
(B) $3$
(C) $4$
(D) $8$`

const geminiPartialNoise = {
  engine: 'cloud-vision',
  text: multiSectionText,
  questions: [
    { stem: 'SECTION 1 (Maximum Marks: 18)', options: [',', 'and', '.', 'marking scheme'] },
    { stem: 'SECTION 2 (Maximum Marks: 24)', options: [',', 'and', '.', 'ONLY ONE of these four options is correct'] },
    { stem: 'Let $f(x)=x^2$. Then $f(2)$ equals', options: ['$1$', '$2$', '$4$', '$8$'] },
    { stem: 'Which of the following is equal to $2+2$?', options: ['$3$', '$4$', '$5$', '$6$'] },
    { stem: 'SECTION 3 Single Correct Answer Type', options: ['correct option', 'incorrect option', ',', 'and'] },
    { stem: 'If $A$ is identity matrix then $|A|$ is', options: ['$0$', '$1$', '$2$', '$-1$'] },
    { stem: 'For each question enter integer answer', options: [',', 'and', '.', 'marking'] },
  ],
}
const advMeta = {
  exam: 'jee-advanced',
  year: 2024,
  session: 'Paper 1',
  paperLabel: 'JEE Advanced 2024 Paper 1',
  sourceLabel: 'Official archive',
}
const multiParsed = questionsFromOfficialPyqExtract(geminiPartialNoise, advMeta)
assert.ok(multiParsed.questions.length >= 15, `multi-section fixture: expected >=15, got ${multiParsed.questions.length}`)
assert.ok(multiParsed.summary?.lowCountWarning === false || multiParsed.questions.length >= 15)
assert.ok(
  multiParsed.questions.every((q) => !looksLikePyqSectionInstructionStem(String(q.text))),
  'no instruction stems in multi-section output',
)
const reParseA = questionsFromOfficialPyqExtract(
  { engine: 'builtin', text: multiSectionText, questions: [] },
  advMeta,
)
const reParseB = questionsFromOfficialPyqExtract(
  { engine: 'builtin', text: multiSectionText, questions: [] },
  advMeta,
)
assert.equal(reParseA.questions.length, reParseB.questions.length, 're-parse must be deterministic')
assert.ok(reParseA.questions.length >= 15, 'text-only re-parse gets full fixture')

const { looksLikeMatchingListStem } = await import('../src/utils/parseMatchingListDisplay.js')
const { extendStemFromSource } = await import('../src/utils/extendTruncatedStem.js')

const matchColumnOk = validateGeminiPyqExtractItem({
  stem: `Match each entry in List-I to the correct entries in List-II.
List-I (P) $x^2$ (Q) $x^3$ (R) $e^x$ (S) $\\ln x$
List-II (1) even (2) odd (3) neither (4) always positive (5) always negative`,
  options: [],
  questionType: 'matrix_match',
})
assert.equal(matchColumnOk.ok, true, matchColumnOk.error)
assert.equal(matchColumnOk.item.questionType, 'matrix_match')

const { LET_ABE_SMASHED_VMATRIX_STEM } = await import('../src/utils/repairSmashedProseVmatrixOcr.js')
const smashExtract = validateGeminiPyqExtractItem({
  stem: LET_ABE_SMASHED_VMATRIX_STEM,
  options: ['9', '11', '12', '15'],
  correctIndex: 1,
})
assert.equal(smashExtract.ok, false, 'Let/Abe smashed vmatrix must fail extract')
assert.match(String(smashExtract.error ?? ''), /incomplete/i)

const leftoverDollars = validateGeminiPyqExtractItem({
  stem: 'Let $x=1$. Then the value is $$',
  options: ['1', '2', '3', '4'],
  correctIndex: 0,
})
assert.equal(leftoverDollars.ok, false, 'leftover $$ must fail extract — do not approve')
assert.match(String(leftoverDollars.error ?? ''), /incomplete/i)

const thenStem = extendStemFromSource(
  'Let $f(x)=x^2$. Then',
  'Let $f(x)=x^2$. Then $f(2)$ is equal to\n(A) $1$\n(B) $2$\n(C) $4$\n(D) $8$',
)
assert.match(thenStem, /is equal to/)
assert.doesNotMatch(thenStem, /\(\s*A\s*\)/)

const sevenStructuredTrap = {
  engine: 'cloud-vision',
  text: `SECTION 1 (Maximum Marks: 12)
This section contains FOUR (4) questions.
The answer to each question is a SINGLE DIGIT INTEGER ranging from 0 to 9, both inclusive.
For each question, enter the correct integer in the space provided.

1. Let $n$ be the number of real roots of $x^2-1=0$. Then $n$ equals

2. A particle starts from rest. The number of seconds to travel $4\\,\\mathrm{m}$ at $2\\,\\mathrm{m/s}^2$ is

3. The number of prime factors of $12$ is

4. Let $S$ be the set of integers from 1 to 9. The number of even members of $S$ is

SECTION 2 (Maximum Marks: 12)
This section contains FOUR (4) questions.
Each question has FOUR options (A), (B), (C) and (D). ONLY ONE of these four options is correct.

5. Let $f(x)=x^2$. Then $f(2)$ equals
(A) $1$
(B) $2$
(C) $4$
(D) $8$

6. If $x+y=5$ then $x$ when $y=2$ is
(A) $1$
(B) $2$
(C) $3$
(D) $4$

7. Which of the following is equal to $2+2$?
(A) $3$
(B) $4$
(C) $5$
(D) $6$

8. The slope of the line $y=3x+2$ is
(A) $2$
(B) $3$
(C) $5$
(D) $6$

SECTION 3 (Maximum Marks: 12)
Match Following Answer Type. This section contains TWO (2) questions.

9. Match each entry in List-I to the correct entries in List-II.
List-I
(P) $x^2$
(Q) $x^3$
(R) $e^x$
(S) $\\sin x$
List-II
(1) even
(2) odd
(3) neither
(4) always positive
(5) always negative
(A) P-1, Q-2
(B) P-2, Q-1
(C) P-3, Q-1
(D) P-1, Q-3

10. Match each entry in List-I to the correct entries in List-II.
List-I
(P) $1$
(Q) $2$
(R) $3$
(S) $4$
List-II
(1) even
(2) odd
(3) prime
(4) composite
(5) neither
(A) P-2, Q-1
(B) P-1, Q-2
(C) P-3, Q-4
(D) P-2, Q-3
`,
  questions: [
    { stem: 'SECTION 1 (Maximum Marks: 12)', options: [',', 'and', '.', 'marking scheme'] },
    { stem: 'This section contains FOUR (4) questions.', options: [',', 'and', '.', 'ONLY ONE'] },
    { stem: 'SECTION 2 (Maximum Marks: 12)', options: [',', 'and', '.', 'marking'] },
    { stem: 'SECTION 3 Match Following Answer Type', options: ['correct option', 'incorrect option', ',', 'and'] },
    { stem: 'Let $f(x)=x^2$. Then $f(2)$ equals', options: ['$1$', '$2$', '$4$', '$8$'] },
    { stem: 'Which of the following is equal to $2+2$?', options: ['$3$', '$4$', '$5$', '$6$'] },
    { stem: 'For each question enter integer answer', options: [',', 'and', '.', 'marking'] },
  ],
}
const trapParsed = questionsFromOfficialPyqExtract(sevenStructuredTrap, advMeta)
assert.ok(
  trapParsed.questions.length >= 8,
  `6-7 trap: expected >=8 real Q (integers + MCQ + match-column), got ${trapParsed.questions.length}`,
)
assert.ok(
  trapParsed.questions.every((q) => !looksLikePyqSectionInstructionStem(String(q.text))),
  'trap fixture must not keep SECTION stems',
)
assert.ok(
  trapParsed.questions.some((q) => looksLikeMatchingListStem(String(q.text))),
  'match-column List-I/II kept',
)
assert.ok(
  trapParsed.summary?.source === 'text+structured-merge' || trapParsed.summary?.source === 'text-fallback',
  `must not trust 7 structured rows, source=${trapParsed.summary?.source}`,
)
assert.equal(trapParsed.questions.length < 40, true)
assert.equal(trapParsed.summary?.lowCountWarning, true)

const { hasPyqSectionInstructionPayload } = await import('../src/utils/bulkExtractClean.js')
const {
  extractPreparedTextFromPaperNotes,
  PYQ_PREPARED_OCR_MARKER,
} = await import('../src/utils/pyqGeminiExtract.js')

const adv2024P1Wording = [
  'Let the following marking scheme apply. SECTION 1 (Maximum Marks: 12) This section contains FOUR (4) questions.',
  '1. SECTION 1 (Maximum Marks: 12) This section contains FOUR (4) questions. Each question has FOUR options (A), (B), (C) and (D). ONLY ONE OF THESE FOUR OPTIONS is the correct answer.',
  'PHYSICS SECTION 1 (Maximum Marks: 12) This section contains FOUR (4) questions.',
  'JEE (Advanced) 2024 Paper 1',
  'The answer to each question is a NUMERICAL VALUE. This section contains SIX (6) questions.',
  'SECTION 2 (Maximum Marks: 12) This section contains THREE (3) questions. ONE OR MORE THAN ONE of these four option(s) is (are) correct.',
]
for (const stem of adv2024P1Wording) {
  assert.equal(
    looksLikePyqSectionInstructionStem(stem),
    true,
    `2024 P1 wording must be instruction: ${stem.slice(0, 64)}`,
  )
  assert.equal(hasPyqSectionInstructionPayload(stem), true, `payload miss: ${stem.slice(0, 40)}`)
}

const sixInstructionJsonEmptyText = {
  engine: 'cloud-vision',
  text: '',
  questions: [
    { stem: 'SECTION 1 (Maximum Marks: 12) This section contains FOUR (4) questions.', options: [',', 'and', '.', 'marking scheme'] },
    { stem: 'SECTION 2 (Maximum Marks: 12) This section contains THREE (3) questions.', options: [',', 'and', '.', 'ONLY ONE'] },
    { stem: 'SECTION 3 (Maximum Marks: 24) This section contains SIX (6) questions.', options: ['+', '0', '−1', 'unanswered'] },
    { stem: 'PHYSICS SECTION 1 (Maximum Marks: 12)', options: [',', 'and', '.', 'marking'] },
    { stem: 'Let the marking scheme apply. SECTION 1 This section contains FOUR (4) questions.', options: ['+3', '0', '−1', 'unanswered'] },
    { stem: 'The answer to each question is a NUMERICAL VALUE. This section contains SIX (6) questions.', options: [',', 'and', '.', 'enter'] },
  ],
}
const sixEmpty = questionsFromOfficialPyqExtract(sixInstructionJsonEmptyText, advMeta)
assert.equal(
  sixEmpty.questions.length,
  0,
  `empty OCR + 6 Gemini rows must not become the paper, got ${sixEmpty.questions.length}`,
)
assert.ok(
  sixEmpty.rejected.some((r) => /refused|instruction/i.test(r)),
  'must reject sparse Gemini JSON when there is no PDF text',
)
assert.ok(
  sixEmpty.summary?.source === 'rejected-sparse-gemini' ||
    sixEmpty.summary?.source === 'empty' ||
    sixEmpty.summary?.source === 'rejected-garbled-text',
  `sparse Gemini source=${sixEmpty.summary?.source}`,
)
assert.equal(sixEmpty.summary?.lowCountWarning, true)

function numberedMcq(n, stem) {
  return `${n}. ${stem}
(A) $1$
(B) $2$
(C) $3$
(D) $4$`
}

const longOcr2024P1 = `JEE (Advanced) 2024 Paper 1
PHYSICS
SECTION 1 (Maximum Marks: 12)
This section contains FOUR (4) questions.
Each question has FOUR options (A), (B), (C) and (D). ONLY ONE OF THESE FOUR OPTIONS is the correct answer.
For each question, choose the option corresponding to the correct answer.
Answer to each question will be evaluated according to the following marking scheme:
Full Marks : +3 If ONLY the correct option is chosen;
Zero Marks : 0 If none of the options is chosen (i.e. the question is unanswered);
Negative Marks : −1 In all other cases.

${numberedMcq(1, 'Let $f(x)=x^2$. Then $f(2)$ equals')}
${numberedMcq(2, 'If $x+y=5$ then $x$ when $y=2$ is')}
${numberedMcq(3, 'The value of $\\int_0^1 2x\\,dx$ is')}
${numberedMcq(4, 'Which of the following is equal to $2+2$?')}

SECTION 2 (Maximum Marks: 12)
This section contains THREE (3) questions.
Each question has FOUR options (A), (B), (C) and (D). ONE OR MORE THAN ONE of these four option(s) is (are) correct.

${numberedMcq(5, 'Let $z=1+i$. Then $|z|$ is')}
${numberedMcq(6, 'If $\\sin\\theta=\\frac{1}{2}$, then $\\theta$ could be')}
${numberedMcq(7, 'The number of roots of $x^2-4=0$ is')}

SECTION 3 (Maximum Marks: 24)
This section contains SIX (6) questions.
The answer to each question is a NUMERICAL VALUE.

${numberedMcq(8, 'Let $a,b$ be positive reals. If $a+b=10$, then maximum of $ab$ is')}
${numberedMcq(9, 'Which of the following is a prime number?')}
${numberedMcq(10, 'If $|A|=1$ for identity matrix $A$, then $|A|$ is')}
${numberedMcq(11, 'The slope of the line $y=3x+2$ is')}
${numberedMcq(12, 'If $P(A)=0.5$ and $P(B)=0.5$ for independent events, then $P(A\\cap B)$ is')}
${numberedMcq(13, 'Let $f(x)=x^3$. Then $f\\prime(x)$ is')}

CHEMISTRY
SECTION 1 (Maximum Marks: 12)
This section contains FOUR (4) questions.

${numberedMcq(14, 'Which of the following is the derivative of $\\sin x$?')}
${numberedMcq(15, 'If $\\vec{a}\\cdot\\vec{b}=0$, then vectors are')}
${numberedMcq(16, 'The integral $\\int e^x\\,dx$ equals')}
${numberedMcq(17, 'If $\\lim_{x\\to 0}\\frac{\\sin x}{x}=L$, then $L$ is')}
${numberedMcq(18, 'The solution of $2x=8$ is')}
`

const sixPlusLongOcr = questionsFromOfficialPyqExtract(
  { ...sixInstructionJsonEmptyText, text: longOcr2024P1 },
  advMeta,
)
assert.ok(
  sixPlusLongOcr.questions.length >= 16,
  `6-row instruction JSON + long 2024 P1 OCR must produce >>6, got ${sixPlusLongOcr.questions.length}`,
)
assert.ok(
  sixPlusLongOcr.questions.every((q) => !looksLikePyqSectionInstructionStem(String(q.text))),
  'long OCR merge must not keep SECTION stems',
)
assert.ok(
  sixPlusLongOcr.summary?.source === 'text+structured-merge' ||
    sixPlusLongOcr.summary?.source === 'text-fallback',
  `must not trust 6 structured rows, source=${sixPlusLongOcr.summary?.source}`,
)

const notesWithMarker = `Imported from adv-2024-p1.pdf

Extract summary: Found 6 questions (expected ~51) · DO NOT APPROVE if under 40

${PYQ_PREPARED_OCR_MARKER}

${longOcr2024P1}`
const storedOcr = extractPreparedTextFromPaperNotes(notesWithMarker)
assert.ok(storedOcr.includes('Let $f(x)=x^2$'), 'prepared OCR marker must yield full text for Re-parse')
assert.ok(!storedOcr.startsWith('Extract summary'), 'summary line must not be the OCR body')

const {
  localPyqTextLooksGarbled,
  localPyqTextLooksComplete,
  formatOfficialPyqStoredNotes,
  PYQ_VISION_TEXT_MARKER,
  PYQ_PDF_TEXT_MARKER,
} = await import('../src/utils/pyqGeminiExtract.js')

const garbledAdvLayer = `Q.1 Let $f () x$ be a continuously differentiable function on the interval (0, ∞ ) such that f (1) = 2 and lim t 10 f () x - ×10 ft() = 1t → xt ⁹ - x⁹ for each x > 0. Then, for all x > 0, f () x is equal to
(A) 11 31 x - 11 9 × 10
(B) 11 9 x + 13 11 × 10
(C) 11 - 9 x + 11 31 × 10
(D) 11 13 x + 11 9 × 10

Q.2 Let $g () x$ be continuously differentiable. Then lim t 10 g () x = 1t → xt
(A) 11 31 x - 11 9 × 10
(B) 11 9 x + 13 11 × 10
(C) 11 - 9 x + 11 31 × 10
(D) 11 13 x + 11 9 × 10

Q.3 If ONLY the correct option is chosen; Zero Marks: 0 If none of the options is chosen
(A) 11 31 x
(B) 11 9 x
(C) 11 13 x
(D) 11 31 x

Q.4 Let $h () x$ be differentiable. Then for all x > 0, h () x is
(A) 11 31 x - 11 9 × 10
(B) 11 9 x + 13 11 × 10
(C) 11 - 9 x + 11 31 × 10
(D) 11 13 x + 11 9 × 10

Q.5 Let $p () x$ be continuously differentiable. Then p () x equals
(A) 11 31 x - 11 9 × 10
(B) 11 9 x + 13 11 × 10
(C) 11 - 9 x + 11 31 × 10
(D) 11 13 x + 11 9 × 10
`
assert.equal(localPyqTextLooksGarbled(garbledAdvLayer), true, '2024 P1 smashed text layer is garbled')
assert.equal(localPyqTextLooksComplete(garbledAdvLayer, 'jee-advanced'), false, 'garbled layer is not a complete paper')

const fiveGarbledOnly = questionsFromOfficialPyqExtract(
  { engine: 'builtin', text: garbledAdvLayer, questions: [] },
  advMeta,
)
assert.equal(
  fiveGarbledOnly.questions.length,
  0,
  `5 garbled stems must not become the paper, got ${fiveGarbledOnly.questions.length}`,
)
assert.equal(fiveGarbledOnly.summary?.source, 'rejected-garbled-text')
assert.ok(fiveGarbledOnly.rejected.some((r) => /garbled|scanned/i.test(r)))

const visionRows = Array.from({ length: 16 }, (_, i) => ({
  stem: `Let $f_{${i + 1}}(x)=x^{${i + 1}}$. Then $f_{${i + 1}}(2)$ equals`,
  options: ['$1$', '$2$', '$4$', '$8$'],
}))
const garbledPlusVision = questionsFromOfficialPyqExtract(
  { engine: 'cloud-vision', text: garbledAdvLayer, questions: visionRows },
  advMeta,
)
assert.ok(
  garbledPlusVision.questions.length >= 16,
  `garbled PDF text + good vision must use vision, got ${garbledPlusVision.questions.length}`,
)
assert.ok(
  garbledPlusVision.summary?.source === 'gemini-structured',
  `expected gemini-structured, got ${garbledPlusVision.summary?.source}`,
)
assert.ok(
  garbledPlusVision.questions.every((q) => !/f\s*\(\s*\)\s*x/i.test(String(q.text))),
  'vision rows must replace smashed f () x stems',
)

const dualNotes = formatOfficialPyqStoredNotes({
  fileName: 'adv-2024-p1.pdf',
  summaryLine: 'Extract summary: Found 16 questions (expected ~51)',
  pdfText: garbledAdvLayer,
  visionText: longOcr2024P1,
})
assert.ok(dualNotes.includes(PYQ_PDF_TEXT_MARKER))
assert.ok(dualNotes.includes(PYQ_VISION_TEXT_MARKER))
const fromDual = extractPreparedTextFromPaperNotes(dualNotes)
assert.ok(fromDual.includes('Let $f(x)=x^2$'), 'Re-parse must prefer vision OCR over garbled PDF text')
assert.ok(!/f\s*\(\s*\)\s*x/i.test(fromDual), 'must not return smashed PDF text when vision exists')

const eighteenClean = Array.from(
  { length: 18 },
  (_, i) =>
    `Q.${i + 1} Let $f_{${i}}(x)=x^{2}+${i}$. Then the value of $f(1)$ is equal to\n(A) $1$\n(B) $2$\n(C) $3$\n(D) $4$\n`,
).join('\n')
assert.ok(eighteenClean.length >= 800)
assert.equal(
  localPyqTextLooksComplete(eighteenClean.padEnd(2600, ' let x '), 'jee-advanced'),
  false,
  '18 numbered stems is not a complete JEE Advanced paper — keep reading pages',
)

const { formatOfficialPyqUploadError, formatOfficialPyqProgress } = await import('../src/utils/pyqGeminiExtract.js')
const { pdfItemsToPlainText } = await import('../src/utils/pdfMathTextLayer.js')

assert.match(formatOfficialPyqUploadError(new Error('Failed to fetch')), /3001/)
const timeoutErr = new Error('Official PYQ extract timed out after 90 seconds.')
timeoutErr.code = 'PYQ_EXTRACT_TIMEOUT'
assert.match(formatOfficialPyqUploadError(timeoutErr), /timed out/)
assert.match(
  formatOfficialPyqUploadError(new Error('boom'), { aborted: true, timeoutMs: 270000 }),
  /timed out after 270/,
)
const visionErr = new Error('need key')
visionErr.code = 'PYQ_VISION_REQUIRED'
assert.equal(formatOfficialPyqUploadError(visionErr), 'need key')
const apiDown = new Error('Could not reach the API on port 3001.')
apiDown.code = 'PYQ_API_DOWN'
assert.match(formatOfficialPyqUploadError(apiDown), /3001/)
const openHang = new Error('Could not open the PDF in time')
openHang.code = 'PYQ_PDF_OPEN_TIMEOUT'
assert.match(formatOfficialPyqUploadError(openHang), /open the PDF/)
assert.deepEqual(formatOfficialPyqProgress(6, 'Reading PDF text layer… 0%'), {
  pct: 6,
  label: 'Reading PDF text layer…',
})
assert.equal(formatOfficialPyqProgress(8, 'Gemini page 1/24').label, 'Gemini page 1/24')
assert.ok(!/%/.test(formatOfficialPyqProgress(8, 'Gemini page 1/24 8%').label))

assert.equal(pdfItemsToPlainText([{ str: 'Let' }, { str: 'f(x)' }]), 'Let f(x)')
assert.equal(pdfItemsToPlainText([]), '')

const ranPages = []
const reports = []
const pageJob = await runPyqGeminiPageJobs(
  24,
  async (i) => {
    ranPages.push(i)
    if (i === 17) throw new Error('simulated fail at 17')
    return {
      engine: 'cloud-vision',
      text: `Q.${i} Let $x=${i}$. Then $x$ is`,
      questions: [{ stem: `Q.${i} Let $x=${i}$`, options: ['1', '2', '3', '4'] }],
    }
  },
  {
    pageTimeoutMs: 50,
    report: (pct, label) => reports.push({ pct, label: String(label ?? '') }),
  },
)
assert.equal(ranPages.length, 24, 'page 17 fail must not stop pages 18–24')
assert.deepEqual(ranPages.slice(16, 20), [17, 18, 19, 20])
assert.equal(pageJob.failures.length, 1)
assert.equal(pageJob.failures[0].page, 17)
assert.equal(pageJob.pages.length, 23)
assert.ok(reports.length >= 24, 'progress callback must fire for every page')
assert.ok(reports.some((r) => /1\/24/.test(r.label)))
assert.ok(reports.some((r) => /24\/24/.test(r.label) || /finished 23\/24/.test(r.label)))
assert.ok(reports.every((r) => Number.isFinite(r.pct)))

console.log('test-pyq-gemini-extract: ok')

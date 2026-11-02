/**
 * Paper instructions are read FIRST, then stems are cleaned, then type is stamped.
 * Official PYQ + any-paper share parsePaperSectionMap / stampQuestionTypesFromSectionMap.
 */
import assert from 'node:assert/strict'
import {
  inferInstructionQuestionType,
  parsePaperSectionMap,
  parseQuestionCountFromInstruction,
  parseExplicitQuestionRange,
  passageRangeContains,
  sectionTypeForPrintedNumber,
  stampQuestionTypesFromSectionMap,
} from '../src/utils/parsePaperSectionMap.js'
import { officialPyqCardAllowsPassage, extractOfficialPyqParagraphsFromOcr, officialPyqPassageRanges, looksLikePhysicsComprehension, looksLikeChemistryComprehension } from '../src/utils/passage.js'
import { paperItemsFromMathpixOcr } from '../src/utils/mathpixQuestionSplit.js'
import { parsePyqPaperContent } from '../src/utils/pyqPaperParse.js'
import { inferBulkQuestionType } from '../src/utils/bulkExtractClean.js'

assert.equal(
  inferInstructionQuestionType(
    'Each question has FOUR options. ONLY ONE of these four options is the correct answer.',
  ),
  'single_correct',
)
assert.equal(
  inferInstructionQuestionType(
    'ONE OR MORE THAN ONE of these four option(s) is(are) correct.',
  ),
  'multiple_correct',
)
assert.equal(
  inferInstructionQuestionType('The answer to each question is a NUMERICAL VALUE.'),
  'numerical',
)
assert.equal(
  inferInstructionQuestionType('This section contains FOUR matching list sets.'),
  'matrix_match',
)
assert.equal(parseQuestionCountFromInstruction('This section contains SIX (06) questions.'), 6)
assert.deepEqual(parseExplicitQuestionRange('For questions 13, 14, 15, 16, 17 and 18'), {
  from: 13,
  to: 18,
})

const RAW = `
JEE (Advanced) 2024 Paper 2

SECTION 1 (Maximum Marks: 12)
This section contains FOUR (04) questions.
Each question has FOUR options (A), (B), (C) and (D). ONLY ONE of these four options is the correct answer.

\\item[Q.] 1 Let $f(x)=x$. Then $f(2)$ is
(A) $1$
(B) $2$
(C) $3$
(D) $4$

\\item[Q.] 2 Let $g(x)=2x$. Then $g(1)$ is
(A) $2$
(B) $4$
(C) $6$
(D) $8$

SECTION 2 (Maximum Marks: 24)
This section contains SIX (06) questions.
The answer to each question is a NUMERICAL VALUE.
There are THREE paragraphs. Each paragraph has TWO questions.
For questions 13, 14, 15, 16, 17 and 18, enter the correct numerical value.

\\item[Q.] 13 If $n(S)=k$ then $|k|$ is ______.

\\section*{PARAGRAPH "I"}
Let $S=\\{1,2,3,4,5,6\\}$ and $X$ be the set of all relations $R$ from $S$ to $S$ that satisfy both the following properties:
\\begin{itemize}
\\item[i.] $R$ has exactly 6 elements.
\\item[ii.] For each $(a,b)\\in R$, we have $|a-b|\\geq 2$.
\\end{itemize}
Let $n(A)$ denote the number of elements in a set $A$.
(There are two questions based on PARAGRAPH "I", the question given below is one of them)

\\item[Q.] 14 If $n(X)={}^{m}C_{6}$, then the value of $m$ is ______.
\\item[Q.] 15 If the value of $n(Y)+n(Z)$ is $k^{2}$, then $|k|$ is ______.
\\item[Q.] 16 If $n(U)=1$ then the value is ______.
\\item[Q.] 17 If $n(U)=2$ then the value is ______.
\\item[Q.] 18 If $n(U)=3$ then the value is ______.
`

const map = parsePaperSectionMap(RAW)
assert.equal(sectionTypeForPrintedNumber(map, 1), 'single_correct', 'Q1 section is SCQ')
assert.equal(sectionTypeForPrintedNumber(map, 4), 'single_correct')
assert.equal(sectionTypeForPrintedNumber(map, 13), 'numerical', 'Q13-18 from NUMERICAL VALUE instruction')
assert.equal(sectionTypeForPrintedNumber(map, 14), 'numerical')
assert.equal(sectionTypeForPrintedNumber(map, 15), 'numerical')
assert.equal(sectionTypeForPrintedNumber(map, 18), 'numerical')

const cards = paperItemsFromMathpixOcr(RAW)
const byNum = (n) => cards.find((q) => Number(q.printedNumber || q.questionNumber) === n)
const q1 = byNum(1)
const q14 = byNum(14)
const q15 = byNum(15)
assert.ok(q1 && q14 && q15, 'extract must keep Q1, Q14, Q15')
assert.equal(q1.questionType, 'single_correct', 'Q1 in ONLY ONE section stays SCQ')
assert.ok((q1.options || []).filter((o) => String(o).trim()).length >= 2, 'Q1 keeps printed A-D')
assert.equal(q14.questionType, 'numerical', 'passage child is NVQ because the paper said NUMERICAL VALUE')
assert.equal(q15.questionType, 'numerical')
assert.equal((q14.options || []).filter((o) => String(o).trim()).length, 0, 'do not steal i/ii as SCQ options')
assert.doesNotMatch(String(q14.text), /SECTION\s+2|This section contains|NUMERICAL VALUE|Maximum Marks/i)
assert.doesNotMatch(String(q1.text), /SECTION\s+1|ONLY ONE of these four/i)
assert.match(String(q14.text), /n\(X\)/)
assert.match(String(q14.text), /______/)
assert.match(String(q14.passageText), /Let \$S=/, 'Paragraph I stays on Q14')
assert.match(String(q15.passageText), /Let \$S=/, 'Paragraph I stays on Q15')

const parsed = parsePyqPaperContent(RAW, 'mathpix')
const byParsed = (n) =>
  parsed.questions.find((q) => Number(q.printedNumber || q.questionNumber) === n)
const p14 = byParsed(14)
const p1 = byParsed(1)
assert.equal(p1?.questionType, 'single_correct')
assert.equal(p14?.questionType, 'numerical')

assert.equal(
  inferBulkQuestionType('If $n(X)={}^{m}C_{6}$, then the value of $m$ is ______.', { optionsFound: 0 }),
  'numerical',
)

const conflictRaw = `
SECTION 2 (Maximum Marks: 24)
This section contains TWO (02) questions.
The answer to each question is a NUMERICAL VALUE.
For questions 20 to 21 enter the value.

\\item[Q.] 20 Let $f(x)=x$. Then $f(2)$ is
(A) $1$
(B) $2$
(C) $3$
(D) $4$
`
const conflict = stampQuestionTypesFromSectionMap(
  [
    {
      text: 'Let $f(x)=x$. Then $f(2)$ is\n(A) $1$\n(B) $2$\n(C) $3$\n(D) $4$',
      options: ['$1$', '$2$', '$3$', '$4$'],
      questionType: 'numerical',
      printedNumber: 20,
    },
  ],
  conflictRaw,
)
assert.equal(conflict[0].questionType, 'single_correct', 'real A-D in Mathpix beat NVQ instruction')
assert.ok(conflict[0].typeConflictWarning)
assert.equal((conflict[0].options || []).filter((o) => String(o).trim()).length, 4, 'never invent or drop real options')

const geminiSaidScq = stampQuestionTypesFromSectionMap(
  [
    {
      text: 'If $n(X)={}^{m}C_{6}$, then the value of $m$ is ______.',
      options: ['', '', '', ''],
      questionType: 'single_correct',
      printedNumber: 14,
      passageRole: 'comprehension_child',
      passageText: 'Let $S=\\{1,2,3,4,5,6\\}$.',
    },
    {
      text: 'If $n(U)=1$ then the value is ______.',
      options: ['', '', '', ''],
      questionType: 'passage_scq',
      printedNumber: 16,
      passageRole: 'comprehension_child',
    },
  ],
  RAW,
)
assert.equal(geminiSaidScq[0].questionType, 'numerical', 'Gemini SCQ must not beat NUMERICAL VALUE instruction')
assert.equal(geminiSaidScq[1].questionType, 'numerical', 'Gemini PSCQ passage child is NVQ when the paper said numerical')

const { assignUniqueOfficialPyqNumbers } = await import('../src/utils/officialPyqMissingSlots.js')
const dupNums = assignUniqueOfficialPyqNumbers([
  { text: 'A', printedNumber: 6, questionNumber: 6, pyqSlot: 6 },
  { text: 'B', printedNumber: 6, questionNumber: 6, pyqSlot: 6 },
  { text: 'C', printedNumber: 8, questionNumber: 8, pyqSlot: 8 },
])
assert.deepEqual(
  dupNums.map((q) => q.questionNumber),
  [1, 2, 3],
  'duplicate 6,6,8 labels must become unique 1,2,3',
)
assert.equal(new Set(dupNums.map((q) => q.pyqSlot)).size, 3)

const PROCESS_RAW = `
SECTION 1
Each question has FOUR options. ONLY ONE of these four options is the correct answer.
\\item[Q.] 3 Let $k \\in \\mathbb{R}$. If $\\lim_{x \\to 0+}(\\sin(\\sin kx)+\\cos x+x)^{2/x}=e^{6}$, then the value of $k$ is
(A) $1$ (B) $2$ (C) $3$ (D) $4$
\\section*{PARAGRAPH "I"}
Let $S=\\{1,2,3,4,5,6\\}$ and $X$ be the set of all relations $R$ from $S$ to $S$.
(There are two questions based on PARAGRAPH "I", the question given below is one of them)
\\item[Q.] 14 If $n(X)={}^{m}C_{6}$, then the value of $m$ is ______.
\\item[Q.] 15 If the value of $n(Y)+n(Z)$ is $k^{2}$, then $|k|$ is ______.
`
assert.match(PROCESS_RAW, /SECTION 1|ONLY ONE/, 'step 1: raw still has section instructions')
const processMap = parsePaperSectionMap(PROCESS_RAW)
assert.ok(processMap.passageRanges?.length, 'step 2: passage ranges come from RAW, before split')
assert.equal(passageRangeContains(processMap, 3), false, 'Q3 is not in any paragraph child range')
assert.equal(passageRangeContains(processMap, 14), true, 'Q14 is in Paragraph I range')
assert.equal(passageRangeContains(processMap, 15), true, 'Q15 is in Paragraph I range')
assert.equal(
  officialPyqCardAllowsPassage({ printedNumber: 3, text: 'Let $k$', passageId: 'leak' }, PROCESS_RAW),
  false,
  'default is no passage — leftover passageId is not permission',
)
assert.equal(
  officialPyqCardAllowsPassage({ printedNumber: 14, text: 'If $n(X)$' }, PROCESS_RAW),
  true,
  'attach only if printed number is in the range',
)
const processCards = paperItemsFromMathpixOcr(PROCESS_RAW)
const processQ3 = processCards.find((q) => Number(q.printedNumber || q.questionNumber) === 3)
const processQ14 = processCards.find((q) => Number(q.printedNumber || q.questionNumber) === 14)
assert.ok(processQ3 && !processQ3.passageText, 'step 5: Q3 stays the k-limit card with no paragraph')
assert.doesNotMatch(String(processQ3.text), /relations R from S|set of all relations/)
assert.match(String(processQ3.text), /Let \$k/)
assert.match(String(processQ14?.passageText), /Let \$S=/, 'Q14 keeps its own paragraph after clean')

// Multi-subject Paper 2: printed 14–17 repeat; child lists stay tight (no 8–196 glue).
const MULTI_SUBJ = `
\\section*{PARAGRAPH "I"}
Let \$S=\\{1,2,3,4,5,6\\} and \$X\$ be the set of all relations \$R\$ from \$S\$ to \$S\$.
(There are two questions based on PARAGRAPH "I", the question given below is one of them)
\\item[Q.] 14 If \$n(X)={}^{m}C_{6}\$, then the value of \$m\$ is ____.
\\item[Q.] 15 If the value of \$n(Y)+n(Z)\$ is \$k^{2}\$, then \$|k|\$ is ____.
\\section*{PARAGRAPH I}
In a Young's double slit experiment, two slits oscillate as shown in the figure.
(There are two questions based on PARAGRAPH I, the question given below is one of them)
\\item[Q.] 14 The fringe width is ____.
\\item[Q.] 15 The intensity is ____.
"PARAGRAPH I"
An organic compound P with molecular formula \$C_{9}H_{18}O_{2}\$ is treated as follows.
(There are two questions based on PARAGRAPH I, the question given below is one of them)
Q. 14 Sum of number of oxygen atoms in S and T is ____.
Q. 15 The molecular weight of U is ____.
`
const multiParas = extractOfficialPyqParagraphsFromOcr(MULTI_SUBJ)
assert.ok(multiParas.every((p) => !p.nums.length || Math.max(...p.nums) - Math.min(...p.nums) <= 3))
assert.ok(multiParas.every((p) => (p.nums || []).every((n) => n >= 14 && n <= 15)))
assert.ok(multiParas.some((p) => looksLikePhysicsComprehension(p.passageText)))
assert.ok(multiParas.some((p) => looksLikeChemistryComprehension(p.passageText)))
const multiRanges = officialPyqPassageRanges(MULTI_SUBJ)
assert.ok(multiRanges.every((r) => r.to - r.from <= 3 && r.to < 80), 'no huge passage ranges')
const multiCards = paperItemsFromMathpixOcr(MULTI_SUBJ)
const math14 = multiCards.find((q) => /n\(X\)/.test(String(q.text)))
const phys14 = multiCards.find((q) => /fringe width/i.test(String(q.text)))
const chem14 = multiCards.find((q) => /oxygen atoms/i.test(String(q.text)))
assert.match(String(math14?.passageText), /relations \$R\$ from \$S\$|set of all relations/)
assert.match(String(phys14?.passageText), /Young|double slit/i)
assert.match(String(chem14?.passageText), /organic compound|C_\{?9\}/)
assert.ok(!looksLikePhysicsComprehension(math14?.passageText))
assert.ok(!/relations R from S|set of all relations/i.test(String(phys14?.passageText)))
assert.ok(!/relations R from S|set of all relations/i.test(String(chem14?.passageText)))

console.log('test-paper-section-map: ok')

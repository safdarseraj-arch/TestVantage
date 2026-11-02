import assert from 'node:assert/strict'
import { isPyqInstructionBlock, looksLikeQuestionBlock, extractQuestionNumber } from '../src/utils/bulkExtractClean.js'
import { fixOcrStructure } from '../src/utils/fixOcrStructure.js'
import { polishExtractedText } from '../src/utils/ocrExtractPolish.js'
import { parseBulkQuestions, splitIntoQuestionBlocks } from '../src/utils/parseBulkQuestions.js'

const functionsSheet = `MATHEMATICS — Functions

1. If $f(x) = x^2 - 4x + 3$, find the minimum value of $f$.
2. Let $g(x) = \\frac{1}{x-1}$. Find the domain of $g$.
3. If $f(x) = 2x + 1$ and $g(x) = x^2$, find $(f \\circ g)(2)$.

--- page ---

4. Find the number of solutions of $x^2 = |x|$.
5. If $f(x) = \\sin x$, determine the range on $[0, \\pi]$.`

const blocks = splitIntoQuestionBlocks(functionsSheet)
assert.ok(blocks.length >= 4, `numbered split: expected >=4 blocks, got ${blocks.length}`)

const bulk = parseBulkQuestions(functionsSheet)
assert.ok(bulk.length >= 4, `bulk parse: expected >=4 questions, got ${bulk.length}`)
assert.ok(bulk[0].text.includes('minimum') || bulk[0].text.includes('$f'), 'first stem kept')

const pageOnly = `Page one content about limits and continuity for JEE practice.

--- page ---

Second page: 1. Evaluate $\\lim_{x \\to 0} \\frac{\\sin x}{x}$.
2. Find derivative of $x^x$.`

const pageBulk = parseBulkQuestions(pageOnly)
assert.ok(pageBulk.length >= 2, `page+numbered: expected >=2, got ${pageBulk.length}`)

const classicMcq = `Q1. What is 2+2?
A) 3
B) 4
C) 5
D) 6
Answer: B

Q2. Value of pi?
A) 3.14
B) 2
C) 1
D) 0
Answer: A`

assert.equal(parseBulkQuestions(classicMcq).length, 2, 'Q1/Q2 MCQ bulk')

const graphMcq =
  '1. Which of the following best suits the graph of $f(x) = \\text{Sgn } |x|^{1111}$'
const graphMcqLegacy =
  '1. Which of the following represents the graph of $f(x) = \\operatorname{sgn} |x| yyy y^1 111(A)(B)(C)$'
const graphParsed = parseBulkQuestions(graphMcq)[0]
assert.ok(graphParsed, 'graph MCQ parsed')
assert.equal(graphParsed.questionType, 'single_correct', 'graph MCQ type')
assert.ok(!graphParsed.text.includes('(A)'), 'bare markers stripped from stem')
assert.ok(!graphParsed.text.includes('yyy'), 'OCR garbage stripped')
assert.ok(!graphParsed.text.includes('1111'), 'spurious exponent stripped')
assert.ok(graphParsed.text.includes('operatorname{sgn}'), 'Sgn repaired')

const graphLegacy = parseBulkQuestions(graphMcqLegacy)[0]
assert.ok(graphLegacy?.questionType === 'single_correct', 'legacy graph MCQ')

const withAnswerKey = `1. If $f(x)=x^2$, find minimum.
2. Let $g(x)=1/x$, find domain.

Answer Key
70. A
75. B
76. C
83. D
91. A`
assert.equal(parseBulkQuestions(withAnswerKey).length, 2, 'answer key section excluded')

const hatStem =
  '2. If $f(x) = \\hat{i}2$, then the value of $-\\hat{i}x + 1$ on $(0,1]$ is equal to\n(A) 1\n(B) 2\n(C) 3\n(D) 4\nAnswer: A'
const hatParsed = parseBulkQuestions(hatStem)[0]
assert.equal(hatParsed?.questionType, 'single_correct', 'vector MCQ typed correctly')
assert.ok(hatParsed?.options?.filter((o) => o.trim()).length >= 2, 'options parsed')

const surjectiveMcq =
  '3. Which of the following function is surjective but not injective (A) $f : R \\circledR R f(x) = x^4 + 2x^3 - x^2 + 1$\n(B) $f(x)=x^3$\n(C) $f(x)=|x|$\n(D) $f(x)=x^2$\nAnswer: A'
const surjParsed = parseBulkQuestions(surjectiveMcq)[0]
assert.ok(surjParsed?.text.includes('surjective'), 'surjective stem kept')
assert.ok(!surjParsed?.text.includes('(A)'), 'options cut from surjective stem')
assert.ok(surjParsed?.options?.[0]?.includes('x^4'), 'option A parsed')

const periodicStem =
  '4. Let $f : R \\circledR R$ be a real valued function such that $f(10 + x) = f(10 - x) \\text{ " } x \\hat{I} R$ and $f(20 + x) = -f(20 - x) \\text{ " } x \\hat{I} R$. Then find the period.'
const periodicParsed = parseBulkQuestions(periodicStem)[0]
assert.ok(periodicParsed?.text.includes('forall') || periodicParsed?.text.includes('\\in'), 'forall/in repaired')
assert.ok(!periodicParsed?.text.includes('circledR'), 'arrow repaired')

const multiPagePolish = polishExtractedText(functionsSheet, 'builtin')
assert.ok(multiPagePolish.includes('--- page ---'), 'polish keeps page markers')
assert.ok(multiPagePolish.includes('4. Find'), 'polish keeps later pages')
const polishedBulk = parseBulkQuestions(multiPagePolish)
assert.ok(polishedBulk.length >= 4, `after polish: expected >=4, got ${polishedBulk.length}`)

const withSupplement = `1. First question here.

<!-- OCR supplement -->
duplicate ocr noise

--- page ---

2. Second question on next page.`
const fixed = fixOcrStructure(withSupplement)
assert.ok(!fixed.includes('OCR supplement'), 'supplement stripped')
assert.ok(fixed.includes('--- page ---'), 'page marker kept after supplement strip')
assert.ok(fixed.includes('Second question'), 'page 2 content kept')

const gluedAfterD =
  '3. Which of the following is true? (A) one (B) two (C) three (D) four 4. Let $f(x)=x^2$. Find the minimum.'
const gluedBlocks = splitIntoQuestionBlocks(gluedAfterD)
assert.ok(gluedBlocks.length >= 2, `glued after (D): expected >=2 blocks, got ${gluedBlocks.length}`)
const gluedParsed = parseBulkQuestions(gluedAfterD)
assert.ok(gluedParsed.length >= 2, `glued after (D) parse: expected >=2, got ${gluedParsed.length}`)
assert.ok(gluedParsed[1]?.text.includes('minimum') || gluedParsed[1]?.text.includes('$f'), 'Q4 stem kept')

const qNoFormat = `Q. No. 1. If $x=2$, find $x^2$.
Q. No. 2. Let $y=3$. Find $y^3$.`
const qNoParsed = parseBulkQuestions(qNoFormat)
assert.ok(qNoParsed.length >= 2, `Q.No format: expected >=2, got ${qNoParsed.length}`)

const jeeAdvancedChunk = `An integer m is chosen at random. The probability that the student knows the answer is $\\frac{1}{2}$. Then the probability that the student knows the answer to a randomly chosen question is
(A) $\\frac{1}{10}$
(B) $\\frac{1}{5}$
(C) $\\frac{3}{10}$
(D) $\\frac{2}{5}$

JEE (Advanced) 2024 Paper 1 Q.3 Let $x$ be such that $\\cot x = 2$. Then $\\sin(\\sin 6x - \\cos 6x) + \\cos(\\sin 6x + \\cos 6x)$ is equal to
(A) $12$
(B) $7$
(C) $7$
(D) $12$

Q.4 Two tangents are drawn from $S$ to the ellipse, of which one meets the ellipse at one end point of the minor axis and the other meets the ellipse at a point $T$ in the fourth quadrant. Let $R$ be the vertex of the ellipse with positive $x$-coordinate and $O$ be the center of the ellipse. If the area of the triangle $ORT$ is $3$, then which of the following options is correct?
(A) $1$
(B) $2$
(C) $3$
(D) $4$`

assert.ok(!isPyqInstructionBlock(jeeAdvancedChunk), 'JEE chunk must not be classified as instructions')
assert.ok(looksLikeQuestionBlock(jeeAdvancedChunk), 'JEE chunk looks like questions')

const jeeBlocks = splitIntoQuestionBlocks(jeeAdvancedChunk)
assert.ok(jeeBlocks.length >= 3, `JEE multi-MCQ split: expected >=3 blocks, got ${jeeBlocks.length}`)
const jeeParsed = parseBulkQuestions(jeeAdvancedChunk)
assert.ok(jeeParsed.length >= 3, `JEE multi-MCQ parse: expected >=3 questions, got ${jeeParsed.length}`)
assert.ok(
  jeeBlocks.some((b) => extractQuestionNumber(b) === 3) || jeeParsed.some((q) => q.text.includes('\\cot')),
  'Q.3 trigonometry kept',
)
assert.ok(
  jeeBlocks.some((b) => extractQuestionNumber(b) === 4) || jeeParsed.some((q) => q.text.includes('tangents')),
  'Q.4 ellipse kept',
)

const locusMcq =
  'If area of the triangle formed by the points A(3, 0), B(0, 3) & P(a, b) is : sq. units, then identify the correct statement(s) (A) locus of P will be a union of two parallel lines (B) Locus of P will be a union of two perpendicular lines (C) Locus of P is given by xX + a +2xy-6(x+y)+8= 0 (D) Locus of P is given by x -y +2y-6x+8= 0'
assert.equal(parseBulkQuestions(locusMcq).length, 1, 'single SCQ with "is given by" option D stays one question')
const locusParsed = parseBulkQuestions(locusMcq)[0]
assert.equal(locusParsed?.questionType, 'single_correct', 'locus MCQ typed SCQ')
assert.match(locusParsed?.text ?? '', /\\frac\{3\}\{2\}/, 'bulk stem restores missing area 3/2')
assert.ok(locusParsed?.options?.[3]?.includes('given by'), 'option D keeps "given by" tail')

const chemistryGlued =
  'Which of the following is true? (A) one (B) two (C) three (D) four For the reaction $N_2$, the product is (A) a (B) b (C) c (D) d'
assert.ok(
  parseBulkQuestions(chemistryGlued).length >= 2,
  'PDF glued after (D) then For the … must become two questions',
)

console.log('test-bulk-pdf-split: ok')

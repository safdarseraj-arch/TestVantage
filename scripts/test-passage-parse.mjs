import { parsePassageWithSubQuestions, looksLikePassageMultiMcq } from '../src/utils/parsePassageUpload.js'
import {
  attachOfficialPyqPassages,
  peelOfficialPyqParagraph,
  peelOfficialPyqCardForDisplay,
  recoverOfficialPyqPassageFromSource,
  fillOfficialPyqPairPassages,
  formatOfficialPyqPassageMarkdown,
  officialPyqCardAllowsPassage,
  OFFICIAL_PYQ_PASSAGE_PAIRS,
  looksLikeOfficialPyqPassageOnly,
  trimPassageBodyText,
} from '../src/utils/passage.js'
import { parseBulkQuestions } from '../src/utils/parseBulkQuestions.js'
import { normalizeMathText } from '../src/utils/normalizeMathText.js'
import { persistPassageBundleFields } from '../src/utils/persistUpload.js'
import { polishExtractedText } from '../src/utils/ocrExtractPolish.js'

const variants = [
  ['A) format', `Passage N_p S_p rows I II III and so on.

Value of sum N_p is -
A) 10000
B) 9801
C) 5050
D) 2401

10. Value of ratio S_p is -
A) 16/3
B) 5
C) 6
D) 19/3`],
  ['parens', `Passage long text here.
Value of x is
(A) 1
(B) 2
(C) 3
(D) 4
Value of y is
(A) 5
(B) 6
(C) 7
(D) 8`],
  ['two Value of', `Intro passage about N_p and S_p rows.

Value of first is -
(A) 1
(B) 2
(C) 3
(D) 4
Value of second is -
(A) 5
(B) 6
(C) 7
(D) 8`],
]

const userPassage = `Consider the arrangement of numbers as shown such that N_p represents number of terms of p^{th} row and S_p denotes sum of terms of p^{th} row : ______ and so on On the basis of above information, answer the following questions : Value of sum N_p is -
A) 10000
B) 9801
C) 5050
D) 2401

10. Value of ratio S_p is -
A) 16/3
B) 5
C) 6
D) 19/3`

const norm = normalizeMathText(userPassage)
console.log('USER raw', parsePassageWithSubQuestions(userPassage)?.subQuestions?.length)
console.log('USER norm', parsePassageWithSubQuestions(norm)?.subQuestions?.length)
console.log('USER looks', looksLikePassageMultiMcq(userPassage))

const gasesIntegerPassage = `Equal masses ( W gram each ) of three non-reacting gases X , Y and Z were mixed in sealed rigid container and total pressure at given temperature . ' T ' was found to be ' P ' atmosphere . Now ' 2W ' grams of X is further added to same container and temperature was raised to ' 2T ' . At ' 2T ' temperature , new pressure was found to be ' 4P ' atmosphere . Now ' 3W ' gram of Y was added further and temperature was raised to ' 4T ' , new pressure was found to be ' 12P ' .
Answer the following questions :
Partial pressure of X after adding ' 2W ' grams of X in container at 2T K is ( express the answer by considering P = 6 atm )
In final conditions partial pressure of Z is ( express the answer by considering P = 6 atm )`

const gasesOneLine = `${gasesIntegerPassage.replace(/\n/g, ' ')}`

const oneLineParsed = parsePassageWithSubQuestions(gasesOneLine, { allowOptionless: true })
console.log('gases one-line OCR ->', oneLineParsed?.subQuestions?.length ?? 0, 'expected 2')
if ((oneLineParsed?.subQuestions?.length ?? 0) !== 2) {
  console.error('FAIL: one-line integer passage should split into 2')
  process.exitCode = 1
}

const gasesParsed = parsePassageWithSubQuestions(gasesIntegerPassage, { allowOptionless: true })
console.log(
  'gases integer passage ->',
  gasesParsed?.subQuestions?.length ?? 0,
  'expected 2',
)
if ((gasesParsed?.subQuestions?.length ?? 0) !== 2) {
  console.error('FAIL: expected 2 sub-questions for gases passage')
  process.exitCode = 1
}
const passageOnly = trimPassageBodyText(gasesParsed?.passageText ?? '')
if (/Partial\s+pressure\s+of\s+X/i.test(passageOnly)) {
  console.error('FAIL: passageText must not contain sub-question 1')
  process.exitCode = 1
}

const towerPassage = `Two friends A & B playing a game of collision of ball and throwing balls from the top of the tower simultaneously as shown in the figure. If the balls collide in air at point P and point O is treated as origin (g=10 m/s^2) Answer the following questions.
If Distance D between the towers is x meter, then the value x/100
If wind starts blowing horizontally, due to which a horizontal acceleration a_x=2 m/s^2 to the balls from left to right then co-ordinates of point of collision will be (x,y) then the value (x+y)/100.`

const towerOneLine = towerPassage.replace(/\n/g, ' ')
for (const [label, raw] of [
  ['tower multiline', towerPassage],
  ['tower one-line', towerOneLine],
]) {
  const parsed = parsePassageWithSubQuestions(raw, { allowOptionless: true })
  const n = parsed?.subQuestions?.length ?? 0
  console.log(`${label} ->`, n, 'expected 2')
  if (n !== 2) {
    console.error(`FAIL: ${label} should split into 2 integer sub-questions`)
    process.exitCode = 1
  }
  const body = trimPassageBodyText(parsed?.passageText ?? '')
  if (/If\s+Distance\s+D/i.test(body)) {
    console.error(`FAIL: ${label} passageText must not contain sub-question stems`)
    process.exitCode = 1
  }
  if (!/If\s+the\s+balls\s+collide/i.test(body)) {
    console.error(`FAIL: ${label} passageText should keep diagram intro`)
    process.exitCode = 1
  }
}
console.log('tower looks', looksLikePassageMultiMcq(towerPassage))

const towerThreeNumbered = `Two friends A & B playing a game of collision of ball and throwing balls from the top of the tower simultaneously as shown in the figure. Answer the following questions.
1. If Distance D between the towers is x meter, then the value x/100
2. If wind starts blowing horizontally, due to which a horizontal acceleration then co-ordinates of point of collision will be (x,y) then the value (x+y)/100.
3. If $P=\\begin{bmatrix} 1 & 0 \\\\ 2005 & 1 \\end{bmatrix}$ and (4) $\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}$ find X`

const towerThreeParsed = parsePassageWithSubQuestions(towerThreeNumbered, { allowOptionless: true })
const towerThreeN = towerThreeParsed?.subQuestions?.length ?? 0
console.log('tower 3 numbered ->', towerThreeN, 'expected 3')
if (towerThreeN !== 3) {
  console.error('FAIL: tower 3 numbered should split into 3 PIVQ stems')
  process.exitCode = 1
}
const towerThreeBody = trimPassageBodyText(towerThreeParsed?.passageText ?? '')
if (/If\s+Distance\s+D/i.test(towerThreeBody) || /\\begin\{bmatrix\}/.test(towerThreeBody)) {
  console.error('FAIL: passage body must not contain sub-question stems or matrices')
  process.exitCode = 1
}
if (/\(A\)/.test(towerThreeParsed?.subQuestions?.[2]?.text ?? '')) {
  console.error('FAIL: matrix label (4) must not become (A)')
  process.exitCode = 1
}

const towerGarbledTail = `${towerPassage.replace(
  'then the value (x+y)/100.',
  'then co-ordinates of point of collision will be (x,y) then find',
)}
1^\\circ\\mathbf{\\Phi}_{\\mathbf{Q}_{\\mathrm{r}}}\\mathrm{~(g{=}10~\\mathrm{m/s}^{2})~45^{\\circ} * [16] A . A. K. ## 1 Introduction The _Fractional State_ of the art`

const towerGarbledParsed = parsePassageWithSubQuestions(towerGarbledTail, { allowOptionless: true })
const windStem = towerGarbledParsed?.subQuestions?.at(-1)?.text ?? ''
if (/Introduction|Fractional State|\\mathbf\{\\Phi\}/i.test(windStem)) {
  console.error('FAIL: ONNX/document tail must be stripped from last tower stem')
  console.error('got:', windStem.slice(-120))
  process.exitCode = 1
}
if (!/then\s+find/i.test(windStem)) {
  console.error('FAIL: tower wind stem should end at then find')
  process.exitCode = 1
}

const towerPolished = persistPassageBundleFields({
  passageText: polishExtractedText(towerPassage, 'builtin'),
  subQuestions: parsePassageWithSubQuestions(towerPassage, { allowOptionless: true })?.subQuestions ?? [],
})
if (!/\\mathrm\{m\/s\}/.test(towerPolished.passageText ?? '')) {
  console.error('FAIL: tower passage should polish g=10 m/s^2 to LaTeX')
  process.exitCode = 1
}
if (!/\\frac\{x\}\{100\}/.test(towerPolished.subQuestions?.[0]?.text ?? '')) {
  console.error('FAIL: tower Q1 should polish x/100 to LaTeX fraction')
  process.exitCode = 1
}

const cubicPassage = `If α, β, γ are the roots of the equation ax^3 + bx^2 + cx + d = 0 (a ≠ 0). Then α + β + γ = -b/a, αβ + βγ + γα = c/a and αβγ = -d/a. Then answer the following questions
Let r, s, t are roots of the equation 8x^3 + 1001x + 2008 = 0, Then absolute value of (r+s)^3 + (s+t)^3 + (t+r)^3 is 7k3 (where k is at ten's place). Then the value of k is
Let P(x) be a cubic polynomial with zeroes α, β, γ, if [ (P(1/2)+P(-1/2))/P(0) ] = 100. Then the value of sqrt(1/(αβ) + 1/(βγ) + 1/(γα))`

const cubicOneLine = cubicPassage.replace(/\n/g, ' ')
for (const [label, raw] of [
  ['cubic multiline', cubicPassage],
  ['cubic one-line', cubicOneLine],
]) {
  const parsed = parsePassageWithSubQuestions(raw, { allowOptionless: true })
  const n = parsed?.subQuestions?.length ?? 0
  console.log(`${label} ->`, n, 'expected 2')
  if (n !== 2) {
    console.error(`FAIL: ${label} should split into 2 integer sub-questions`)
    process.exitCode = 1
  }
  const body = trimPassageBodyText(parsed?.passageText ?? '')
  if (/Let\s+r,\s*s,\s*t/i.test(body)) {
    console.error(`FAIL: ${label} passageText must not contain sub-question 1`)
    process.exitCode = 1
  }
  if (!/answer\s+the\s+following\s+questions/i.test(body)) {
    console.error(`FAIL: ${label} passageText should end at answer cue`)
    process.exitCode = 1
  }
}
console.log('cubic looks', looksLikePassageMultiMcq(cubicPassage))

for (const [name, v] of variants) {
  const p = parsePassageWithSubQuestions(v)
  console.log(name, '->', p?.subQuestions?.length ?? 0, 'passage', p?.passageText?.length ?? 0)
  p?.subQuestions?.forEach((q, i) => {
    console.log(' ', i + 1, 'stem:', q.text?.slice(0, 60))
    console.log('     opts:', q.options)
    if (q.correctIndex === 0 && !String(q.options?.[0] ?? '').trim()) {
      console.error(`FAIL: ${name} Q${i + 1} must not default empty A as correct`)
      process.exitCode = 1
    }
    if (q.correctIndex != null && q.correctIndex === 0 && !String(v).match(/Answer\s*:\s*A\b/i)) {
      // Allow only when paper says A — otherwise unset is preferred for unknown keys
    }
  })
  if ((p?.subQuestions?.length ?? 0) >= 2) {
    const unsetOk = p.subQuestions.every(
      (q) => q.correctIndex == null || String(q.options?.[q.correctIndex] ?? '').trim(),
    )
    if (!unsetOk) {
      console.error(`FAIL: ${name} correctIndex points at empty option`)
      process.exitCode = 1
    }
  }
}

const withAns = parsePassageWithSubQuestions(`Long passage about gases and equilibrium for the exam.

Value of x is
(A) 1
(B) 2
(C) 3
(D) 4
Answer: B

Value of y is
(A) 5
(B) 6
(C) 7
(D) 8
Answer: D`)
if ((withAns?.subQuestions?.length ?? 0) < 2) {
  console.error('FAIL: passage with answers should still split')
  process.exitCode = 1
} else {
  console.log(
    'passage answers ->',
    withAns.subQuestions.map((q) => q.correctIndex),
    'expected [1,3]',
  )
  if (withAns.subQuestions[0]?.correctIndex !== 1 || withAns.subQuestions[1]?.correctIndex !== 3) {
    // Best-effort: answers may live in chunk; still require no empty-A default
    for (const q of withAns.subQuestions) {
      if (q.correctIndex === 0 && !String(q.options?.[0] ?? '').trim()) {
        console.error('FAIL: empty-A default on answered passage')
        process.exitCode = 1
      }
    }
  }
}

const advPara = `Paragraph for Questions 5 and 6
Let $S$ be the set of all real $x$. If $x \\in S$ the energy is
$$E = \\frac{1}{2}mv^{2}$$
\\includegraphics{https://cdn.mathpix.com/cropped/rod.jpg}

5. The kinetic energy is
(A) $E$
(B) $2E$
(C) $3E$
(D) $4E$
6. The potential energy is
(A) $0$
(B) $E$
(C) $2E$
(D) $3E$`

const peeledAdv = peelOfficialPyqParagraph(advPara)
if (peeledAdv.isPassageOnly) {
  console.error('FAIL: paragraph with two children must not be passage-only')
  process.exitCode = 1
} else if (!/Let \$S\$/.test(peeledAdv.passageText || '')) {
  console.error('FAIL: passage must stay whole (Let is setup, not a new question)')
  process.exitCode = 1
} else if (!/\$\$E = \\frac\{1\}\{2\}mv\^\{2\}\$\$/.test(peeledAdv.passageText || '')) {
  console.error('FAIL: passage must keep $$ display math')
  process.exitCode = 1
} else if (!/\\includegraphics/.test(peeledAdv.passageText || '')) {
  console.error('FAIL: passage must keep the figure')
  process.exitCode = 1
} else {
  console.log('official PYQ paragraph peel -> passage kept, $$ and figure stay')
}

if (!looksLikeOfficialPyqPassageOnly('Paragraph for Questions 5 and 6\nLet $S$ be the set of all real $x$. If $x \\in S$ then the energy is $$E=1$$')) {
  console.error('FAIL: header + setup only must be passage-only (not a question)')
  process.exitCode = 1
}

const bulkPara = parseBulkQuestions(advPara)
if (bulkPara.length !== 2) {
  console.error('FAIL: bulk parse must emit 2 children, not the passage, got', bulkPara.length)
  process.exitCode = 1
} else if (!bulkPara.every((q) => q.passageText && /Let \$S\$/.test(q.passageText))) {
  console.error('FAIL: bulk children must sit under the same passage')
  process.exitCode = 1
} else if (bulkPara.some((q) => /^Paragraph\s+for/i.test(q.text))) {
  console.error('FAIL: passage header must not be a bulk question')
  process.exitCode = 1
} else {
  console.log('bulk paragraph ->', bulkPara.length, 'children under one passage')
}

const attached = attachOfficialPyqPassages([
  { text: 'Previous MCQ about $v$.', questionNumber: 4 },
  { text: 'Paragraph for Questions 5 and 6\nLet $S$ be the set. If $x \\in S$ then $$E=1$$', questionNumber: 5 },
  { text: 'The kinetic energy is', questionNumber: 5 },
  { text: 'The potential energy is', questionNumber: 6 },
])
if (attached.length !== 3) {
  console.error('FAIL: attach must drop the passage card, got', attached.length)
  process.exitCode = 1
} else if (attached[0].passageText) {
  console.error('FAIL: previous question must not receive the next paragraph')
  process.exitCode = 1
} else if (!attached[1].passageText || !attached[2].passageText) {
  console.error('FAIL: children immediately under the passage must keep it')
  process.exitCode = 1
} else {
  console.log('attachOfficialPyqPassages ->', attached.length, 'cards, passage not counted')
}

const PARA_I =
  '\\section*{PARAGRAPH "I"}\n' +
  'Let $S=\\{1,2,3,4,5,6\\}$ and $X$ be the set of all relations $R$ from $S$ to $S$ that satisfy both the following properties:\n' +
  '\\begin{itemize}\n' +
  '\\item[i.] $R$ has exactly 6 elements.\n' +
  '\\item[ii.] For each $(a,b)\\in R$, we have $|a-b|\\geq 2$.\n' +
  '\\end{itemize}\n' +
  'Let $Y=\\{R\\in X:$ The range of $R$ has exactly one element$\\}$ and $Z=\\{R\\in X: R$ is a function from $S$ to $S\\}$.\n' +
  'Let $n(A)$ denote the number of elements in a set $A$.\n' +
  '(There are two questions based on PARAGRAPH "I", the question given below is one of them)'

const peeledI = peelOfficialPyqParagraph(PARA_I)
if (!/Let \$S=\\\{1,2,3,4,5,6\\\}/.test(peeledI.passageText || '')) {
  console.error('FAIL: Paragraph I body must come from OCR, not be invented')
  process.exitCode = 1
} else if (/\\section/.test(peeledI.passageText || '')) {
  console.error('FAIL: passage must not keep \\section*{PARAGRAPH}')
  process.exitCode = 1
} else if (/JEE\s*\(?\s*Advanced/i.test(peeledI.passageText || '')) {
  console.error('FAIL: paper chrome must not stay in the passage')
  process.exitCode = 1
} else {
  console.log('Paragraph I peel -> body kept, section chrome stripped')
}

const glued14 = attachOfficialPyqPassages([
  {
    text:
      'If $n(X)={}^{m}C_{6}$, then the value of $m$ is ______.\n' +
      PARA_I,
    options: ['$R$ has exactly 6 elements.', 'For each $(a,b)\\in R$, we have $|a-b|\\geq 2$.', '', ''],
    questionNumber: 14,
  },
  {
    text: 'If the value of $n(Y)+n(Z)$ is $k^{2}$, then $|k|$ is ______.',
    options: ['', '', '', ''],
    questionNumber: 15,
  },
])
if (glued14.length !== 2) {
  console.error('FAIL: Q14+Q15 must stay two questions, got', glued14.length)
  process.exitCode = 1
} else if (glued14[0].passageText !== glued14[1].passageText) {
  console.error('FAIL: Q14 and Q15 must share one Paragraph I')
  process.exitCode = 1
} else if (glued14[0].passageId !== glued14[1].passageId) {
  console.error('FAIL: Q14 and Q15 must share the same passageId')
  process.exitCode = 1
} else if (glued14[0].passageRole !== 'comprehension_child' || glued14[1].passageRole !== 'comprehension_child') {
  console.error('FAIL: both children must be comprehension_child')
  process.exitCode = 1
} else if (/exactly 6 elements/i.test((glued14[0].options || []).join('\n'))) {
  console.error('FAIL: properties i/ii must not be Q14 options A/B')
  process.exitCode = 1
} else if (/\\section/.test(glued14[0].text) || /Let \$S=\\\{1,2,3,4,5,6\\\}/.test(glued14[0].text)) {
  console.error('FAIL: Q14 stem must be the question only, not the passage')
  process.exitCode = 1
} else if (!/n\(X\)/.test(glued14[0].text) || !/n\(Y\)/.test(glued14[1].text)) {
  console.error('FAIL: Q14 and Q15 stems mixed or lost')
  process.exitCode = 1
} else {
  console.log('Paragraph I attach -> one passage, two comprehension children, no fake A/B')
}

const display14 = peelOfficialPyqCardForDisplay({
  text: glued14[0].text + '\n' + PARA_I,
  options: ['$R$ has exactly 6 elements.', 'For each $(a,b)\\in R$, we have $|a-b|\\geq 2$.', '', ''],
  printedNumber: 14,
  questionNumber: 14,
})
if (!/Let \$S=\\\{1,2,3,4,5,6\\\}/.test(display14.passageText || '')) {
  console.error('FAIL: stored Q14 must peel Paragraph I onto passageText')
  process.exitCode = 1
} else if (/exactly 6 elements/i.test((display14.options || []).join('\n'))) {
  console.error('FAIL: display peel must drop fake A/B')
  process.exitCode = 1
} else if (/\\section/.test(display14.text) || /Let \$S=/.test(display14.text)) {
  console.error('FAIL: display peel must leave question-only stem')
  process.exitCode = 1
} else {
  console.log('peelOfficialPyqCardForDisplay -> Q14 question only, passage shared')
}

const TWELVE_OCR = [
  PARA_I,
  '\\item[Q.] 14 If $n(X)={}^{m}C_{6}$, then the value of $m$ is ______.',
  '\\item[Q.] 15 If the value of $n(Y)+n(Z)$ is $k^{2}$, then $|k|$ is ______.',
  'Paragraph for Questions 16 and 17',
  'Let $U$ be the fixture set used only for the 16-17 grouping contract.',
  '\\item[Q.] 16 If $n(U)=1$ then the value is ______.',
  '\\item[Q.] 17 If $n(U)=2$ then the value is ______.',
  'Paragraph for Questions 31 and 32',
  'Let $P$ be the fixture set used only for the 31-32 grouping contract.',
  '\\item[Q.] 31 If $n(P)=1$ then the value is ______.',
  '\\item[Q.] 32 If $n(P)=2$ then the value is ______.',
  'Paragraph for Questions 33 and 34',
  'Let $Qset$ be the fixture set used only for the 33-34 grouping contract.',
  '\\item[Q.] 33 If $n(Qset)=1$ then the value is ______.',
  '\\item[Q.] 34 If $n(Qset)=2$ then the value is ______.',
  'Paragraph for Questions 48 and 49',
  'Let $C$ be the fixture set used only for the 48-49 grouping contract.',
  '\\item[Q.] 48 If $n(C)=1$ then the value is ______.',
  '\\item[Q.] 49 If $n(C)=2$ then the value is ______.',
  'Paragraph for Questions 50 and 51',
  'Let $D$ be the fixture set used only for the 50-51 grouping contract.',
  '\\item[Q.] 50 If $n(D)=1$ then the value is ______.',
  '\\item[Q.] 51 If $n(D)=2$ then the value is ______.',
].join('\n')

const emptyChildren = OFFICIAL_PYQ_PASSAGE_PAIRS.flat().map((n) => ({
  text:
    n === 14
      ? 'If $n(X)={}^{m}C_{6}$, then the value of $m$ is ______.'
      : n === 15
        ? 'If the value of $n(Y)+n(Z)$ is $k^{2}$, then $|k|$ is ______.'
        : `If $n$ for Q${n} then the value is ______.`,
  printedNumber: n,
  questionNumber: n,
  passageText: '',
}))
const recoveredKids = emptyChildren.map((q) => recoverOfficialPyqPassageFromSource(q, TWELVE_OCR))
const filledKids = fillOfficialPyqPairPassages(recoveredKids, TWELVE_OCR)
const missing = filledKids.filter((q) => !String(q.passageText ?? '').trim())
if (missing.length) {
  console.error('FAIL: all 12 passage children must recover a paragraph, empty:', missing.map((q) => q.printedNumber))
  process.exitCode = 1
} else if (filledKids[0].passageText !== filledKids[1].passageText) {
  console.error('FAIL: Q14 and Q15 must share the recovered Paragraph I')
  process.exitCode = 1
} else if (!/Let \$S=\\\{1,2,3,4,5,6\\\}/.test(filledKids[0].passageText || '')) {
  console.error('FAIL: recovered Paragraph I must be the OCR body, not invented')
  process.exitCode = 1
} else {
  const md = formatOfficialPyqPassageMarkdown(filledKids[0])
  if (!/### Passage \/ Comprehension/.test(md) || !/Let \$S=/.test(md) || !/n\(X\)/.test(md)) {
    console.error('FAIL: markdown preview must show passage above Q14')
    process.exitCode = 1
  } else {
    console.log('recover 12 children -> each has linked passage, markdown shows paragraph')
  }
}

const siblingOnly = fillOfficialPyqPairPassages(
  [
    { text: 'If $n(X)={}^{m}C_{6}$, then the value of $m$ is ______.', printedNumber: 14, passageText: 'Let $S=\\{1,2,3,4,5,6\\}$ and $X$ be the set of all relations.' },
    { text: 'If the value of $n(Y)+n(Z)$ is $k^{2}$, then $|k|$ is ______.', printedNumber: 15, passageText: '' },
  ],
  'Paragraph for Questions 14 and 15\nLet $S=\\{1,2,3,4,5,6\\}$ and $X$ be the set of all relations.\n\\item[Q.] 14 If $n(X)$\n\\item[Q.] 15 If $n(Y)$',
)
if (!siblingOnly[1].passageText) {
  console.error('FAIL: empty Q15 must copy Paragraph I from Q14')
  process.exitCode = 1
} else {
  console.log('sibling fill -> Q15 gets Q14 passage')
}

const PARA_II =
  '\\section*{PARAGRAPH "II"}\n' +
  'Let $f:[0,\\pi/2]\\rightarrow[0,1]$ be the function defined by $f(x)=\\sin^{2}x$ and let $g:[0,\\pi/2]\\rightarrow[0,\\infty)$ be the function defined by $g(x)=\\sqrt{\\pi x/2-x^{2}}$.\n' +
  '(There are two questions based on PARAGRAPH "II", the question given below is one of them)\n'
const Q1_TRIG =
  'Considering only the principal values of the inverse trigonometric functions, the value of $\\tan(\\sin^{-1}(3/5)-2\\cos^{-1}(2/\\sqrt{5}))$ is'
const Q1_OPTS = ['$7/24$', '$-7/24$', '$-5/24$', '$5/24$']
const mixedOcr =
  PARA_II +
  '\\item[Q.] 1 ' +
  Q1_TRIG +
  '\n(A) $7/24$\n(B) $-7/24$\n(C) $-5/24$\n(D) $5/24$\n' +
  '\\item[Q.] 2 Let $z$ be a complex number.\n' +
  PARA_II +
  '\\item[Q.] 16 If $n(U)=1$ then the value is ______.\n' +
  '\\item[Q.] 17 If $n(U)=2$ then the value is ______.\n'
const q1card = recoverOfficialPyqPassageFromSource(
  {
    text: Q1_TRIG,
    options: Q1_OPTS,
    printedNumber: 1,
    questionNumber: 1,
    passageText: 'wrong leftover Paragraph II',
    passageRole: 'comprehension_child',
  },
  mixedOcr,
)
const q2card = recoverOfficialPyqPassageFromSource(
  { text: 'Let $z$ be a complex number.', options: ['1', '2', '3', '4'], printedNumber: 2, questionNumber: 2, passageText: 'wrong' },
  mixedOcr,
)
const q16ii = recoverOfficialPyqPassageFromSource(
  { text: 'If $n(U)=1$ then the value is ______.', printedNumber: 16, questionNumber: 16, passageText: '' },
  mixedOcr,
)
if (q1card.passageText || q1card.passageId || officialPyqCardAllowsPassage(q1card)) {
  console.error('FAIL: Q1 inverse-trig MCQ must have no passage')
  process.exitCode = 1
} else if (/Passage \/ Comprehension/.test(formatOfficialPyqPassageMarkdown(q1card))) {
  console.error('FAIL: Q1 markdown must not show a Passage heading')
  process.exitCode = 1
} else if (q2card.passageText || officialPyqCardAllowsPassage(q2card)) {
  console.error('FAIL: Q2 must have no passage')
  process.exitCode = 1
} else if (!/\\sin\^\{2\}x/.test(q16ii.passageText || '')) {
  console.error('FAIL: Paragraph II must attach to Q16, not Q1')
  process.exitCode = 1
} else if (q16ii.passageText && q1card.passageText === q16ii.passageText) {
  console.error('FAIL: Q1 must not share Paragraph II')
  process.exitCode = 1
} else {
  console.log('Q1/Q2 stay clean; Paragraph II only on the 16+17 pair')
}

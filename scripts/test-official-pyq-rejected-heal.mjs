/**
 * Permanent guards: rejected Official PYQ cards must not leak raw array,
 * T_frac, END OF PAPER, or physics spring onto chemistry. Shared path only.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sanitizeStemForDisplay } from '../src/utils/sanitizeStemForDisplay.js'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import { healUploadQuestionCard } from '../src/utils/uploadQualityGuards.js'
import { applyUploadQualityGuards } from '../src/utils/extendTruncatedStem.js'
import {
  officialPyqCardAllowsPassage,
  peelOfficialPyqCardForDisplay,
  recoverOfficialPyqPassageFromSource,
} from '../src/utils/passage.js'
import { paperItemsFromMathpixOcr } from '../src/utils/mathpixQuestionSplit.js'
import { normalizeStemForStorage } from '../src/utils/stemStorage.js'
import { officialPyqNeedsAutoResplit } from '../src/utils/officialPyqLocalReparse.js'

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() {
      return store.size
    },
    key: (i) => [...store.keys()][i] ?? null,
  }
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function mathStripped(s) {
  return String(s ?? '')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$]*\$/g, ' ')
}

const previewMath = readFileSync(join(ROOT, 'src/pages/OfficialPyqPreviewMath.jsx'), 'utf8')
assert.match(previewMath, /officialPyqCardAsShown\(q, sourceText\)/)
const cardAsShown = readFileSync(join(ROOT, 'src/utils/officialPyqCardAsShown.js'), 'utf8')
assert.match(cardAsShown, /healUploadQuestionCard\(q, sourceText\)/)

const pendingPage = readFileSync(join(ROOT, 'src/pages/OfficialPyqPending.jsx'), 'utf8')
assert.match(
  pendingPage,
  /status === 'pending_review'[\s\S]{0,160}officialPyqNeedsAutoResplit/,
  'Pending approval papers must rebuild from Mathpix, not only Rejected',
)

const Q4 =
  '{x^2}\\sin(\\frac{\\pi}{x^2}), & if x\\neq0, \\\\ 0, & if x=0. \\end{array} Then which is TRUE?'
const Q13 =
  'f(t)=\\{ (-1)^{n+1}2, if t=2n-1, \\\\ \\frac{(2n+1-t)}{2}f(2n-1), if 2n-1 < t < 2n+1. \\end{array} Define g(x)=\\int_{1}^{x} f(t) dt.'
for (const raw of [Q4, Q13]) {
  const san = sanitizeStemForDisplay(raw)
  const prep = prepareTextForMathTextDisplay(san)
  const stored = normalizeStemForStorage(raw)
  assert.doesNotMatch(mathStripped(san), /\\end\{array\}/, 'sanitize must wrap leftover array')
  assert.doesNotMatch(mathStripped(prep), /\\end\{array\}/, 'display prep must wrap leftover array')
  assert.doesNotMatch(mathStripped(stored), /\\end\{array\}/, 'save path must wrap leftover array')
}

const q26 = sanitizeStemForDisplay('The ratio is (T_\\frac{1}{T_2}^2) then')
assert.doesNotMatch(mathStripped(q26), /T_\\frac/)
assert.match(q26, /T_1\^\{2\}|T_\{1\}\^\{2\}/)

assert.doesNotMatch(
  sanitizeStemForDisplay('as shown in th END OF THE QUESTION PAPER'),
  /END OF THE QUESTION PAPER/i,
)

const SPRING = '\\includegraphics{https://cdn.mathpix.com/cropped/spring-mass.png}'
const YDSE = '\\includegraphics{https://cdn.mathpix.com/cropped/ydse.png}'
const OCR = [
  '\\section*{PARAGRAPH "I"}',
  "In a Young's double slit experiment, two slits are oscillating as shown in the figure.",
  YDSE,
  '\\item[Q.] 31 The fringe width is ______.',
  '\\item[Q.] 32 The intensity as shown in the figure is ______.',
  '\\section*{PARAGRAPH "II"}',
  'Three particles 1, 2 and 3 connected by a spring-mass system oscillate with amplitude A as shown in the figure.',
  SPRING,
  '\\item[Q.] 33 The amplitude of particle 2 is ______.',
  '\\item[Q.] 34 The amplitude of particle 3 is ______.',
  '\\section*{PARAGRAPH "I"}',
  'An organic compound P with molecular formula $C_{9}H_{18}O_{2}$ is treated as follows.',
  '\\item[Q.] 48 Sum of number of oxygen atoms in S and T is ____',
  '\\section*{PARAGRAPH "II"}',
  'A ferricyanide complex is treated with KI. The molecular weight of U is needed.',
  '\\item[Q.] 49 The molecular weight of U is ____',
  '\\item[Q.] 50 The moles of KI to produce 2 moles of P is ____',
  '\\item[Q.] 51 The number of zinc ions in the formula of Q is ____',
  'END OF THE QUESTION PAPER',
].join('\n')

function previewHeal(q) {
  return peelOfficialPyqCardForDisplay(healUploadQuestionCard(q, OCR), OCR)
}

const mixed = `Three particles 1, 2 and 3 connected by a spring-mass system oscillate with amplitude A as shown in the figure.\n${SPRING}\nSum of number of oxygen atoms in S and T is ____`
assert.doesNotMatch(sanitizeStemForDisplay(mixed), /spring-mass/i, 'sanitizer peels physics off a chemistry stem')

const chem48 = previewHeal({
  text: mixed,
  options: ['', '', '', ''],
  printedNumber: 48,
  questionNumber: 48,
  subject: 'chemistry',
  passageText: `Three particles 1, 2 and 3 spring-mass ${SPRING} END OF THE QUESTION PAPER`,
})
const chemBlob = `${chem48.text}\n${chem48.passageText || ''}`
assert.doesNotMatch(chemBlob, /spring-mass/i, 'chemistry card must not contain spring-mass')
assert.doesNotMatch(chemBlob, /spring-mass\.png/, 'chemistry card must not contain spring figure')
assert.doesNotMatch(chemBlob, /END OF THE QUESTION PAPER/i)
assert.match(chemBlob, /C_\{9\}H_\{18\}O_\{2\}|oxygen atoms in S and T/i)

const phys33 = previewHeal({
  text: 'The amplitude of particle 2 is ______.',
  options: ['', '', '', ''],
  printedNumber: 33,
  questionNumber: 33,
  subject: 'physics',
  passageText: 'Three particles 1, 2 and 3 spring-mass oscillate with amplititu',
})
assert.match(String(phys33.passageText), /as shown in the figure/i)
assert.match(String(phys33.passageText), /spring-mass\.png/)
assert.doesNotMatch(`${phys33.text}\n${phys33.passageText || ''}`, /C_\{9\}H_\{18\}O_\{2\}/)
assert.doesNotMatch(String(phys33.passageText), /END OF THE QUESTION PAPER/i)

const q43 = healUploadQuestionCard(
  {
    text: "van't Hoff boiling point elevation uses w2g and w1g.",
    options: ['', '', '', ''],
    printedNumber: 43,
  },
  'proportional to $\\mathrm{w}_1$ and $\\mathrm{w}_2$.',
)
assert.doesNotMatch(q43.text, /\bw2g\b|\bw1g\b/)
assert.match(q43.text, /w_\{?1\}?|\\mathrm\{w\}_\{?1\}?/)

const PARA_I_REL =
  '\\section*{PARAGRAPH "I"}\n' +
  'Let $S=\\{1,2,3,4,5,6\\}$ and $X$ be the set of all relations $R$ from $S$ to $S$ that satisfy both the following properties:\n' +
  '$R$ has exactly 6 elements. For each $(a,b)\\in R$, we have $|a-b|\\geq 2$.\n' +
  'Let $Y=\\{R\\in X:$ The range of $R$ has exactly one element$\\}$ and $Z=\\{R\\in X: R$ is a function from $S$ to $S\\}$.\n' +
  'Let $n(A)$ denote the number of elements in a set $A$.\n' +
  '(There are two questions based on PARAGRAPH "I", the question given below is one of them)\n'
const Q3_LIMIT =
  'Let $k \\in \\mathbb{R}$. If $\\lim_{x \\to 0+}(\\sin(\\sin kx)+\\cos x+x)^{2/x}=e^{6}$, then the value of $k$ is'
const Q3_OCR = [
  '\\item[Q.] 1 Considering only the principal values, $\\tan(\\sin^{-1}(3/5))$ is',
  '(A) $7/24$ (B) $-7/24$ (C) $-5/24$ (D) $5/24$',
  '\\item[Q.] 3 ' + Q3_LIMIT,
  PARA_I_REL,
  '\\item[Q.] 14 If $n(X)={}^{m}C_{6}$, then the value of $m$ is ______.',
  '\\item[Q.] 15 If the value of $n(Y)+n(Z)$ is $k^{2}$, then $|k|$ is ______.',
].join('\n')

assert.equal(
  officialPyqCardAllowsPassage({
    printedNumber: 3,
    text: Q3_LIMIT,
    passageId: 'pyq-para-14-15-leak',
    passageText: PARA_I_REL,
    passageRole: 'comprehension_child',
  }),
  false,
  'Q3 leftover passageId is not permission',
)

// Long MCQ that reused a child slot number (15) must not keep Paragraph I.
const MCQ_ON_CHILD_SLOT = {
  printedNumber: 15,
  questionNumber: 15,
  text:
    'Let the function $f:[1, \\infty) \\rightarrow \\mathbb{R}$ be defined by a long piecewise formula and then ask which statement is TRUE about differentiability.',
  options: ['(A) only I', '(B) only II', '(C) I and II', '(D) none'],
  passageId: 'pyq-para-14-15-leak',
  passageText: PARA_I_REL,
  passageRole: 'comprehension_child',
}
assert.equal(
  officialPyqCardAllowsPassage(MCQ_ON_CHILD_SLOT, Q3_OCR),
  false,
  'standalone MCQ on slot 15 must not keep a paragraph',
)
const peeledMcqSlot = peelOfficialPyqCardForDisplay(MCQ_ON_CHILD_SLOT, Q3_OCR)
assert.ok(!peeledMcqSlot.passageText, 'display peel drops foreign paragraph on MCQ slot-15')
assert.ok(!peeledMcqSlot.passageId, 'display peel drops passageId when passage is cleared')

const leakedQ3 = peelOfficialPyqCardForDisplay(
  {
    text: Q3_LIMIT,
    options: ['', '', '', ''],
    printedNumber: 3,
    questionNumber: 3,
    passageId: 'pyq-para-14-15-leak',
    passageText: PARA_I_REL,
    passageRole: 'comprehension_child',
  },
  Q3_OCR,
)
assert.ok(!leakedQ3.passageId, 'Q3 must not keep leaked passageId')
assert.ok(!leakedQ3.passageText, 'Q3 must not keep Paragraph I')
assert.doesNotMatch(String(leakedQ3.text), /relations R from S/)

const gluedQ3 = peelOfficialPyqCardForDisplay(
  {
    text: `${PARA_I_REL}\n${Q3_LIMIT}`,
    options: ['', '', '', ''],
    printedNumber: 3,
    questionNumber: 3,
  },
  Q3_OCR,
)
assert.doesNotMatch(String(gluedQ3.text), /relations R from S/)
assert.ok(!gluedQ3.passageText)
assert.ok(!gluedQ3.passageId)

const recoveredQ3 = recoverOfficialPyqPassageFromSource(
  {
    text: Q3_LIMIT,
    printedNumber: 3,
    questionNumber: 3,
    passageId: 'pyq-para-14-15-leak',
    passageText: PARA_I_REL,
  },
  Q3_OCR,
)
assert.ok(!recoveredQ3.passageId)
assert.ok(!recoveredQ3.passageText)

const q3Paper = paperItemsFromMathpixOcr(Q3_OCR)
const byNum = (n) => q3Paper.find((q) => Number(q.printedNumber || q.questionNumber) === n)
const q3card = byNum(3)
const q14card = byNum(14)
const q15card = byNum(15)
const q1card = byNum(1)
assert.ok(q3card, 'Q3 limit-k must exist')
assert.ok(!q3card.passageId, 'Q3 has no passageId')
assert.ok(!q3card.passageText, 'Q3 has no passage')
assert.doesNotMatch(String(q3card.text), /relations R from S/)
assert.match(String(q3card.text), /Let \$k/)
assert.ok(q14card?.passageText && q15card?.passageText, 'Q14-15 must have Paragraph I')
assert.match(String(q14card.passageText), /relations \$R\$ from \$S\$|relations R from S|set of all relations/)
assert.ok(!q1card?.passageText, 'Q1 must not receive a paragraph')
assert.doesNotMatch(String(q1card?.passageText ?? ''), /PARAGRAPH "II"|sin\^\{2\}x/)

const PARA_II_MATH =
  '\\section*{PARAGRAPH "II"}\nLet $U$ be the fixture set used only for the 16-17 grouping contract.\n'
const FULL_51_OCR = [
  '\\item[Q.] 1 Considering only the principal values, $\\tan(\\sin^{-1}(3/5))$ is',
  '(A) $7/24$ (B) $-7/24$ (C) $-5/24$ (D) $5/24$',
  '\\item[Q.] 2 Let $g$ be another MCQ. (A) 1 (B) 2 (C) 3 (D) 4',
  '\\item[Q.] 3 ' + Q3_LIMIT,
  PARA_I_REL,
  '\\item[Q.] 14 If $n(X)={}^{m}C_{6}$, then the value of $m$ is ______.',
  '\\item[Q.] 15 If the value of $n(Y)+n(Z)$ is $k^{2}$, then $|k|$ is ______.',
  PARA_II_MATH,
  '\\item[Q.] 16 If $n(U)=1$ then the value is ______.',
  '\\item[Q.] 17 If $n(U)=2$ then the value is ______.',
  '\\section*{PARAGRAPH "I"}',
  "In a Young's double slit experiment, two slits are oscillating as shown in the figure.",
  YDSE,
  '\\item[Q.] 31 The fringe width is ______.',
  '\\item[Q.] 32 The intensity as shown in the figure is ______.',
  '\\section*{PARAGRAPH "II"}',
  'Three particles 1, 2 and 3 connected by a spring-mass system oscillate with amplitude A as shown in the figure.',
  SPRING,
  '\\item[Q.] 33 The amplitude of particle 2 is ______.',
  '\\item[Q.] 34 The amplitude of particle 3 is ______.',
  '\\section*{PARAGRAPH "I"}',
  'An organic compound P with molecular formula $C_{9}H_{18}O_{2}$ is treated as follows.',
  '\\item[Q.] 48 Sum of number of oxygen atoms in S and T is ____',
  '\\section*{PARAGRAPH "II"}',
  'A ferricyanide complex is treated with KI. The molecular weight of U is needed.',
  '\\item[Q.] 49 The molecular weight of U is ____',
  '\\item[Q.] 50 The moles of KI to produce 2 moles of P is ____',
  '\\item[Q.] 51 The number of zinc ions in the formula of Q is ____',
  'END OF THE QUESTION PAPER',
].join('\n')

const PAIR_SLOTS = new Set([14, 15, 16, 17, 31, 32, 33, 34, 48, 49, 50, 51])
const pairStem = {
  3: Q3_LIMIT,
  14: 'If $n(X)={}^{m}C_{6}$, then the value of $m$ is ______.',
  15: 'If the value of $n(Y)+n(Z)$ is $k^{2}$, then $|k|$ is ______.',
  16: 'If $n(U)=1$ then the value is ______.',
  17: 'If $n(U)=2$ then the value is ______.',
  31: 'The fringe width is ______.',
  32: 'The intensity as shown in the figure is ______.',
  33: 'The amplitude of particle 2 is ______.',
  34: 'The amplitude of particle 3 is ______.',
  48: 'Sum of number of oxygen atoms in S and T is ____',
  49: 'The molecular weight of U is ____',
  50: 'The moles of KI to produce 2 moles of P is ____',
  51: 'The number of zinc ions in the formula of Q is ____',
}
const leaked51 = Array.from({ length: 51 }, (_, i) => {
  const n = i + 1
  const leak = !PAIR_SLOTS.has(n)
  const text =
    n === 4
      ? Q4
      : n === 13
        ? Q13
        : pairStem[n] || `Standalone stem for question ${n} about a unique topic.`
  return {
    printedNumber: n,
    questionNumber: n,
    pyqSlot: n,
    text,
    options: n <= 13 ? ['1', '2', '3', '4'] : ['', '', '', ''],
    passageId: leak ? 'pyq-para-14-15-leak' : undefined,
    passageText: leak ? PARA_I_REL : '',
    subject: n >= 35 ? 'chemistry' : n >= 18 ? 'physics' : 'math',
  }
})
leaked51[47] = {
  ...leaked51[47],
  text: `Three particles 1, 2 and 3 connected by a spring-mass system oscillate with amplitude A as shown in the figure.\n${SPRING}\nSum of number of oxygen atoms in S and T is ____`,
  passageText: `Three particles spring-mass ${SPRING} END OF THE QUESTION PAPER`,
}

const healed51 = applyUploadQualityGuards(leaked51, FULL_51_OCR)
assert.equal(healed51.length, 51, `heal must keep 51 cards, got ${healed51.length}`)
console.log('n\ttype\tpassageId\tstem80\tfig\tendPaper\tarray')
for (const q of healed51) {
  const n = Number(q.printedNumber || q.questionNumber)
  const blob = `${q.text || ''}\n${q.passageText || ''}`
  const stem80 = String(q.text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  console.log(
    [
      n,
      q.questionType || '',
      q.passageId || '-',
      stem80,
      /includegraphics|cdn\.mathpix/i.test(blob) ? 'Y' : 'N',
      /END OF THE QUESTION PAPER/i.test(blob) ? 'Y' : 'N',
      /\\end\{array\}/.test(blob) ? 'Y' : 'N',
    ].join('\t'),
  )
}

const H = (n) => healed51.find((q) => Number(q.printedNumber || q.questionNumber) === n)
const h3 = H(3)
assert.ok(h3, 'healed Q3 exists')
assert.ok(!h3.passageId, 'healed Q3 has no passageId')
assert.ok(!h3.passageText, 'healed Q3 has no passage')
assert.doesNotMatch(String(h3.text), /relations R from S/)
assert.match(String(h3.text), /Let \$k/)
assert.match(String(H(14)?.passageText), /relations \$R\$ from \$S\$|set of all relations/)
assert.match(String(H(15)?.passageText), /relations \$R\$ from \$S\$|set of all relations/)
assert.ok(!H(1)?.passageText, 'Q1 has no paragraph')
assert.doesNotMatch(String(H(1)?.passageText ?? ''), /sin\^\{2\}x|PARAGRAPH "II"/)
for (const n of [48, 49, 50, 51]) {
  const blob = `${H(n)?.text || ''}\n${H(n)?.passageText || ''}`
  assert.doesNotMatch(blob, /spring-mass/i, `Q${n} must not keep the physics spring`)
  assert.doesNotMatch(blob, /END OF THE QUESTION PAPER/i)
}
for (const n of [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 18, 19, 20]) {
  assert.ok(!H(n)?.passageId, `Q${n} standalone must not keep leaked passageId`)
  assert.ok(!H(n)?.passageText, `Q${n} standalone must not keep Paragraph I`)
}

let foreignOrRaw = 0
for (const q of healed51) {
  const n = Number(q.printedNumber || q.questionNumber)
  const blob = `${q.text || ''}\n${q.passageText || ''}`
  const san = sanitizeStemForDisplay(q.text)
  const foreignPass = Boolean(String(q.passageText ?? '').trim()) && !PAIR_SLOTS.has(n)
  const stemHasPara = /relations R from S|two questions based on\s+PARAGRAPH/i.test(String(q.text))
  const rawArray = /\\end\{array\}/.test(mathStripped(san))
  if (foreignPass || stemHasPara || rawArray) foreignOrRaw += 1
  if (n === 4 || n === 13) {
    assert.doesNotMatch(mathStripped(san), /\\end\{array\}/, `Q${n} sanitizer must wrap leftover array`)
  }
  if (n === 34 || n === 51) {
    assert.doesNotMatch(blob, /END OF THE QUESTION PAPER/i)
  }
}
assert.equal(foreignOrRaw, 0, `51-card scan: ${foreignOrRaw} cards still have a foreign passage or raw \\end{array}`)

assert.equal(
  officialPyqNeedsAutoResplit({
    id: 'jee-adv-2024-p2-pending',
    status: 'pending_review',
    exam: 'jee-advanced',
    questions: leaked51,
    preparedText: FULL_51_OCR,
  }),
  true,
  'Pending Paper 2 with glued paragraphs must rebuild from stored Mathpix',
)

const { addOfficialPyqPendingPaper, getOfficialPyqPendingPaper } = await import(
  '../src/utils/officialPyqPendingStore.js'
)
const { reExtractOfficialPyqPendingPaperLocal } = await import(
  '../src/utils/officialPyqLocalReparse.js'
)
const pendingPaper = addOfficialPyqPendingPaper({
  id: 'jee-adv-2024-p2-pending-reparse',
  exam: 'jee-advanced',
  year: 2024,
  session: 'Paper 2',
  paperLabel: 'JEE Advanced 2024 Paper 2',
  sourceLabel: 'test-reparse',
  status: 'pending_review',
  preparedText: FULL_51_OCR,
  questions: leaked51,
})
assert.equal(pendingPaper.status, 'pending_review')
const reparsed = reExtractOfficialPyqPendingPaperLocal(pendingPaper)
assert.equal(reparsed.ok, true, reparsed.error || 'Re-parse stored OCR must succeed on pending Paper 2')
const storedPending = getOfficialPyqPendingPaper(pendingPaper.id)
assert.equal(storedPending.status, 'pending_review', 'Re-parse must stay on Pending approval')
const reparsedQs = storedPending.questions || []
assert.equal(reparsedQs.length, 51, `Re-parse must keep 51 cards, got ${reparsedQs.length}`)

const CLASSES = { glued_passage: 0, raw_array: 0, wrong_figure: 0, wrong_type: 0 }
const PAIR_OK = new Set([14, 15, 16, 17, 31, 32, 33, 34, 48, 49, 50, 51])
for (const q of reparsedQs) {
  const n = Number(q.printedNumber || q.questionNumber)
  const blob = `${q.text || ''}\n${q.passageText || ''}`
  const san = sanitizeStemForDisplay(q.text)
  if (String(q.passageText ?? '').trim() && !PAIR_OK.has(n)) CLASSES.glued_passage += 1
  if (/relations R from S|two questions based on\s+PARAGRAPH/i.test(String(q.text))) {
    CLASSES.glued_passage += 1
  }
  if (/\\end\{array\}/.test(mathStripped(san))) CLASSES.raw_array += 1
  if (n >= 48 && /spring-mass/i.test(blob)) CLASSES.wrong_figure += 1
  if (PAIR_OK.has(n) && /numerical|integer/.test(String(q.questionType)) === false && n >= 14) {
    if (n >= 14 && String(q.passageText ?? '').trim() && q.questionType === 'single_correct') {
      CLASSES.wrong_type += 1
    }
  }
}
console.log('reparse class scan', CLASSES)
assert.equal(CLASSES.glued_passage, 0, 'class glued_passage must be 0 after Re-parse')
assert.equal(CLASSES.raw_array, 0, 'class raw_array must be 0 after Re-parse')
assert.equal(CLASSES.wrong_figure, 0, 'class wrong_figure must be 0 after Re-parse')
assert.equal(CLASSES.wrong_type, 0, 'class wrong_type must be 0 after Re-parse')

console.log('test-official-pyq-rejected-heal: ok')

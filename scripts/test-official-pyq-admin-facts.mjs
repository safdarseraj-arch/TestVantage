/**
 * Admin-confirmed paper facts: slots, pre-fill from instructions, passage and
 * junk card removal, the facts check, and the one-card check that must not
 * report paper-level count lines.
 */
import assert from 'node:assert/strict'
import {
  applyAdminFactsToQuestions,
  cutAdminPassagesFromOcr,
  draftAdminFacts,
  enforceAdminFactsOnQuestions,
  parsePassageGroups,
  validateAdminFacts,
} from '../src/utils/officialPyqAdminFacts.js'
import { stampSubjectsFromPaper } from '../src/utils/parsePaperSectionMap.js'
import {
  cleanOfficialPyqPassageBody,
  fillOfficialPyqPairPassages,
  officialPyqCardHasMistakenPassage,
  peelOfficialPyqCardForDisplay,
} from '../src/utils/passage.js'
import { shapeOfficialPyqDrafts } from '../src/utils/officialPyqPaperFacts.js'
import { applyOfficialPyqQualityGuards, healUploadQuestionCard } from '../src/utils/uploadQualityGuards.js'
import {
  findGluedNextQuestionStart,
  paperItemsFromMathpixOcr,
  recoverOptionsFromStem,
} from '../src/utils/mathpixQuestionSplit.js'
import { mergeAdjacentOptionTails } from '../src/utils/extendTruncatedStem.js'
import { looksLikePyqSectionInstructionStem } from '../src/utils/bulkExtractClean.js'
import { reviewOfficialPyqCards } from '../src/utils/officialPyqUnifiedCheck.js'
import { officialPyqContentReviewMessages } from '../src/utils/officialPyqReviewFlags.js'
import { keepAdminEditedOfficialPyqCards } from '../src/utils/officialPyqPendingStore.js'
import { mathDrawFailure } from '../src/utils/mathDrawCheck.js'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import { restoreLabelledFigureOptions } from '../src/utils/labelledFigureOptions.js'
import { extractMathpixImageUrls, splitMathpixMediaSegments } from '../src/utils/mathpixMedia.js'
import { adminFactsMatchingScan, numberingPrintedInOcr } from '../src/utils/officialPyqAdminFacts.js'
import { convertLatexTabularToArray } from '../src/utils/latexTabularDisplay.js'
import { latexExtractionIncomplete } from '../src/utils/healTruncatedLatex.js'
import { reviewMarkSpans } from '../src/utils/officialPyqReviewFlags.js'
import { officialPyqDrawnText } from '../src/utils/officialPyqOriginalCompare.js'

let passed = 0
function test(name, fn) {
  try {
    fn()
    passed += 1
  } catch (err) {
    console.error(`FAIL: ${name}`)
    throw err
  }
}

const jeePattern = {
  totalQuestions: 57,
  subjectOrder: ['physics', 'chemistry', 'mathematics'],
  numbering: 'restart',
  samePattern: true,
  pattern: {
    rows: [
      { from: 1, to: 6, type: 'multiple_correct', options: 4 },
      { from: 7, to: 12, type: 'numerical', options: 0 },
      { from: 13, to: 19, type: 'single_correct', options: 4 },
    ],
    passages: '7-8, 9-10, 11-12',
  },
}

test('passage groups parse and reject bad pieces', () => {
  const { groups, bad } = parsePassageGroups('13-14, Q15 and Q16; 17')
  assert.deepEqual(groups, [[13, 14], [15, 16]])
  assert.deepEqual(bad, ['17'])
})

test('same pattern, restart numbering → 57 slots, printed numbers restart', () => {
  const { errors, slots } = validateAdminFacts(jeePattern)
  assert.deepEqual(errors, [])
  assert.equal(slots.length, 57)
  assert.equal(slots[19].subject, 'chemistry')
  assert.equal(slots[19].printed, 1)
  assert.equal(slots[6].type, 'numerical')
  assert.equal(slots[6].options, 0)
  assert.equal(slots[6].passage, 'physics:7-8')
  assert.equal(slots[12].passage, '')
})

test('continuous numbering shifts later subjects', () => {
  const { errors, slots } = validateAdminFacts({ ...jeePattern, numbering: 'continuous' })
  assert.deepEqual(errors, [])
  assert.equal(slots[19].printed, 20)
  assert.equal(slots[56].printed, 57)
  assert.equal(slots[25].passage, 'chemistry:26-27')
})

test('form mistakes are reported in plain words', () => {
  const gap = validateAdminFacts({
    ...jeePattern,
    pattern: { rows: [{ from: 1, to: 6, type: 'single_correct', options: 4 }, { from: 8, to: 19, type: 'integer' }] },
  })
  assert.ok(gap.errors.some((e) => /Q7–Q7 are in no section/.test(e)), gap.errors.join(' | '))
  const total = validateAdminFacts({ ...jeePattern, totalQuestions: 54 })
  assert.ok(total.errors.some((e) => /add up to 57 questions, and the total says 54/.test(e)))
  const outside = validateAdminFacts({ ...jeePattern, pattern: { ...jeePattern.pattern, passages: '19-20' } })
  assert.ok(outside.errors.some((e) => /outside Q1–Q19/.test(e)))
})

test('pre-fill reads the printed instructions', () => {
  const block = (subject) => `\\section*{${subject}}
SECTION 1 (Maximum Marks: 24)
This section contains SIX (06) questions. Each question has FOUR options. ONE OR MORE THAN ONE of these four option(s) is(are) correct answer(s).
SECTION 2 (Maximum Marks: 24)
This section contains THREE (03) question stems. There are TWO (02) questions corresponding to each question stem. The answer to each question is a NUMERICAL VALUE.
SECTION 3 (Maximum Marks: 21)
This section contains SEVEN (07) questions. Each question has FOUR options. ONLY ONE of these four options is the correct answer.
`
  const ocr = [block('PHYSICS'), block('CHEMISTRY'), block('MATHEMATICS')].join('\n')
  const draft = draftAdminFacts(ocr, [])
  assert.equal(draft.totalQuestions, 57)
  assert.deepEqual(draft.subjectOrder, ['physics', 'chemistry', 'mathematics'])
  assert.equal(draft.samePattern, true)
  assert.equal(draft.numbering, 'restart')
  assert.deepEqual(
    draft.pattern.rows.map((r) => [r.from, r.to, r.type]),
    [
      [1, 6, 'multiple_correct'],
      [7, 12, 'numerical'],
      [13, 19, 'single_correct'],
    ],
  )
  assert.equal(draft.pattern.passages, '7-8, 9-10, 11-12')
  assert.deepEqual(validateAdminFacts(draft).errors, [])
})

const small = {
  totalQuestions: 4,
  subjectOrder: ['physics'],
  numbering: 'restart',
  samePattern: true,
  pattern: {
    rows: [
      { from: 1, to: 2, type: 'single_correct', options: 4 },
      { from: 3, to: 4, type: 'numerical' },
    ],
    passages: '3-4',
  },
}
const opts = ['$1$', '$2$', '$3$', '$4$']
const cards = [
  { id: 'a', text: 'A block of mass m slides on a smooth incline of angle theta. Find its acceleration.', options: opts, printedNumber: 1, questionType: 'single_correct' },
  { id: 'b', text: 'A ball is thrown up with speed u from the ground. Find the maximum height reached.', options: opts, printedNumber: 2, questionType: 'single_correct' },
  { id: 'p', text: 'Paragraph\nA uniform rod of length L is pivoted at one end and released from rest when horizontal. It swings freely in a vertical plane under gravity.', options: [], printedNumber: 16 },
  { id: 'c', text: 'The angular speed of the rod when it becomes vertical is ____ rad/s.', options: [], printedNumber: 3, questionType: 'numerical' },
  { id: 'd', text: 'The speed of the free end of the rod when vertical is ____ m/s.', options: [], printedNumber: 4, questionType: 'numerical' },
  { id: 'j', text: 'Zero Marks : 0 In all other cases.', options: [], printedNumber: 22 },
]

test('applying facts drops passage and marks-text cards and shares the passage', () => {
  const { questions, facts } = applyAdminFactsToQuestions(cards, small, '')
  assert.ok(facts)
  assert.deepEqual(questions.map((q) => q.id), ['a', 'b', 'c', 'd'])
  assert.match(String(questions[2].passageText), /uniform rod of length L/)
  assert.match(String(questions[3].passageText), /uniform rod of length L/)
  assert.deepEqual(questions.map((q) => q.printedNumber), [1, 2, 3, 4])
  assert.ok(questions.every((q) => q.subject === 'physics'))
})

test('facts check flags count, options and leftover passage cards', () => {
  const { facts } = applyAdminFactsToQuestions([], small, '')
  const wrongCount = reviewOfficialPyqCards(cards, '', facts)
  assert.equal(wrongCount.passed, false)
  assert.ok(wrongCount.messages.some((m) => /confirmed by you\) say 4 questions\. This paper has 6/.test(m)))
  assert.ok(wrongCount.messages.some((m) => /Go to Q 3\. This card is a passage/.test(m)), wrongCount.messages.join(' | '))

  const { questions } = applyAdminFactsToQuestions(cards, small, '')
  const threeOptions = questions.map((q, i) => (i === 0 ? { ...q, options: opts.slice(0, 3) } : q))
  const review = reviewOfficialPyqCards(threeOptions, '', facts)
  assert.deepEqual(review.failedGoTo, [1])
  assert.ok(review.messages.some((m) => /number of options does not match the paper facts \(4\)/.test(m)))
})

test('one-card check never reports the paper count (it blocked every Approve)', () => {
  const clean = { text: cards[0].text, options: opts, questionType: 'single_correct' }
  const lines = officialPyqContentReviewMessages([clean])
  assert.ok(!lines.some((m) => /facts card|This section contains|Do not approve/i.test(m)), lines.join(' | '))
  const cardsOnly = reviewOfficialPyqCards([clean], '', null, { cardsOnly: true })
  assert.deepEqual(cardsOnly.messages, [])
})

const STEM_OCR = [
  '\\section*{Question Stem for Question Nos. 5 and 6}',
  '',
  'Question Stem',
  'A projectile is thrown from a point O on the ground at an angle 45° from the vertical. The acceleration due to gravity $g=10 \\mathrm{~m} / \\mathrm{s}^{2}$.',
  'Q. 5 The value of $t$ is \\_\\_\\_\\_.',
  'Q. 6 The value of $x$ is \\_\\_\\_\\_.',
  '',
  '\\section*{Question Stem for Question Nos. 7 and 8}',
  '',
  'Question Stem',
  'In the circuit shown below, the switch S is connected to position P for a long time so that the charge on the capacitor becomes $q_{1} \\mu \\mathrm{C}$.',
  '![](https://cdn.mathpix.com/cropped/circuit-03.jpg?height=289&width=844&top_left_y=2286&top_left_x=676)',
  '\\begin{itemize}',
  '\\item[Q.] 7 The magnitude of $q_{1}$ is \\_\\_\\_\\_.',
  '\\item[Q.] 8 The magnitude of $q_{2}$ is \\_\\_\\_\\_.',
  '\\end{itemize}',
  '',
  '\\section*{Question Stem for Question Nos. 9 and 10}',
  '',
  'Question Stem',
  'Two point charges $-Q$ and $+Q / \\sqrt{3}$ are placed in the $x y$-plane as shown in the figure. All lengths are measured in meters.',
  '![](https://cdn.mathpix.com/cropped/charges-04.jpg?height=327&width=621&top_left_y=1131&top_left_x=749)',
  '\\begin{itemize}',
  '\\item[Q.] 9 The value of $R$ is \\_\\_\\_\\_ meter.',
  '\\item[Q.] 10 The value of $b$ is \\_\\_\\_\\_ meter.',
  '\\end{itemize}',
  '',
  '\\section*{SECTION 3}',
].join('\n')

test('question-stem passage keeps only its body (2021 P1 Q5-Q10)', () => {
  const leaked = [
    '}',
    '',
    'Question Stem',
    'A projectile is thrown from a point O on the ground.',
    'The value of $t$ is \\_\\_\\_\\_.',
    'The value of $x$ is \\_\\_\\_\\_.',
  ].join('\n')
  assert.equal(cleanOfficialPyqPassageBody(leaked), 'A projectile is thrown from a point O on the ground.')
  const listOpener = '}\n\nQuestion Stem\nIn the circuit shown below.\n![](https://cdn.mathpix.com/cropped/c.jpg)\n\\begin{itemize}'
  assert.equal(cleanOfficialPyqPassageBody(listOpener), 'In the circuit shown below.\n![](https://cdn.mathpix.com/cropped/c.jpg)')
  const plain = 'A passage with no heading.\nSecond line of it.'
  assert.equal(cleanOfficialPyqPassageBody(plain), plain)
  const cards = [5, 6, 7, 8, 9, 10].map((n) => ({
    id: `s${n}`,
    text: n < 7 ? `The value of ${n === 5 ? '$t$' : '$x$'} is ____.` : `The magnitude of $q_{${n - 6}}$ is ____.`,
    options: [],
    printedNumber: n,
    questionType: 'numerical',
  }))
  const { questions } = shapeOfficialPyqDrafts(cards, STEM_OCR)
  for (const q of questions) {
    assert.doesNotMatch(q.passageText, /^\s*(?:\}|Question\s+Stem)/, `Q${q.printedNumber} heading`)
    assert.doesNotMatch(q.passageText, /The value of|The magnitude of|\\begin\{itemize\}\s*$/, `Q${q.printedNumber} tail`)
  }
})

test('the second child of a shared stem keeps the stem figure (2021 P1 Q8)', () => {
  const passage = 'In the circuit shown below, the switch S is connected to position P for a long time so that the charge on the capacitor becomes $q_{1} \\mu \\mathrm{C}$.\n![](https://cdn.mathpix.com/cropped/circuit-03.jpg?height=289&width=844&top_left_y=2286&top_left_x=676)'
  for (const n of [7, 8]) {
    const card = {
      id: `c${n}`,
      text: `The magnitude of $q_{${n - 6}}$ is ____.`,
      options: [],
      printedNumber: n,
      questionNumber: n,
      questionType: 'numerical',
      passageText: passage,
      passageSource: 'ocr-header',
      passageId: 'admin-physics-7-8',
    }
    const shown = peelOfficialPyqCardForDisplay(healUploadQuestionCard(card, STEM_OCR), STEM_OCR)
    assert.match(String(shown.passageText ?? ''), /circuit-03\.jpg/, `Q${n} lost the circuit figure`)
  }
})

test('missing-OCR check stops at the question end (2021 P2 Q6, Q19, Q47 false alarms)', () => {
  const q6Stem = 'Two concentric circular loops lie in the $x y$-plane. Which of the following statement(s) is(are) correct?'
  const q6Opts = ['perpendicular', 'radial only', 'non-zero', 'outward']
  const q19Stem = 'The work functions for metals $P, Q$ and $R$ are 4.0 eV, 4.5 eV and 5.5 eV. The photon energy, in eV, is ____.'
  const q47Stem = 'The value of $2 m_{1}+3 n_{1}+m_{1} n_{1}$ is ____.'
  const ocr = [
    q6Stem,
    '\\begin{itemize} \\item[(A)] perpendicular \\item[(B)] radial only \\item[(C)] non-zero \\item[(D)] outward \\end{itemize}',
    '\\section*{SECTION 2} \\section*{Question Stem} The test-tube glass has density 2.5 gm/cc and the trapped air is 3.3 cc.',
    'Q. 9',
    q19Stem.replace('____', '\\_\\_\\_\\_'),
    '\\end{itemize} \\section*{SECTION 1} Each question has FOUR options (A), (B), (C) and (D).',
    'Q. 10',
    q47Stem.replace('____', '\\_\\_\\_\\_'),
    'Q. 11 The value is 1.25. \\section*{SECTION 3} Each question has FOUR options (A), (B), (C) and (D).',
  ].join('\n')
  const blank = ['', '', '', '']
  const cardsIn = [
    { text: q6Stem, options: q6Opts, questionType: 'multiple_correct' },
    { text: q19Stem, options: blank, questionType: 'integer' },
    { text: q47Stem, options: blank, questionType: 'numerical' },
  ]
  const clean = reviewOfficialPyqCards(cardsIn, ocr, null, { cardsOnly: true })
  assert.deepEqual(clean.messages, [], clean.messages.join(' | '))
  const lostOption = reviewOfficialPyqCards([{ ...cardsIn[0], options: q6Opts.slice(0, 3) }], ocr, null, { cardsOnly: true })
  assert.ok(lostOption.messages.some((m) => /4 options in the scan/.test(m)), lostOption.messages.join(' | '))
})

test('a hand-edited card that moved slot keeps its edit and does not overwrite another card', () => {
  const edited = { id: 'b', text: 'Edited by admin', options: opts, pyqSlot: 3, adminEdited: true, adminEditedAt: 5 }
  const prev = [
    { id: 'a', text: 'Question A', options: opts, pyqSlot: 1 },
    { id: 'p', text: 'Paragraph only', options: [], pyqSlot: 2 },
    edited,
  ]
  const next = [
    { id: 'a', text: 'Question A', options: opts, pyqSlot: 1 },
    { ...edited, pyqSlot: 2 },
  ]
  const out = keepAdminEditedOfficialPyqCards(prev, next)
  assert.equal(out.length, 2)
  assert.equal(out[0].text, 'Question A')
  assert.equal(out[1].text, 'Edited by admin')
})

const twoSubject = {
  confirmedAt: 1,
  totalQuestions: 12,
  subjectOrder: ['physics', 'chemistry'],
  numbering: 'restart',
  samePattern: true,
  pattern: {
    rows: [
      { from: 1, to: 2, type: 'single_correct', options: 4 },
      { from: 3, to: 6, type: 'numerical', options: 0 },
    ],
    passages: '3-4, 5-6',
  },
}
const subjectOcr = (name, a, b) => `\\section*{${name}}
Q.1 First single-correct question of ${name}.
(A) 1 (B) 2 (C) 3 (D) 4
Q.2 Second single-correct question of ${name}.
(A) 1 (B) 2 (C) 3 (D) 4
Question Stem for Question Nos. 3 and 4
Question Stem
${a}
Q.3 The value of X in ${name} is ____.
Q.4 The value of Y in ${name} is ____.
Paragraph
${b}
Q.5 The value of P in ${name} is ____.
Q.6 The value of R in ${name} is ____.
`
const twoOcr = [
  subjectOcr('PHYSICS', 'A soft plastic bottle filled with water of density 1 gm/cc carries an inverted glass test-tube.', 'A pendulum of length L swings in a lift that accelerates upward with acceleration a.'),
  subjectOcr('CHEMISTRY', 'Tin is obtained from cassiterite by reduction with coke in a blast furnace.', 'A solution of a weak acid HA is titrated against NaOH at 298 K.'),
].join('\n')

test('passage cut stops at its own first question and never takes the next passage', () => {
  const { slots } = validateAdminFacts(twoSubject)
  const cut = cutAdminPassagesFromOcr(twoOcr, slots)
  assert.match(cut.get('physics:3-4'), /^A soft plastic bottle/)
  assert.doesNotMatch(cut.get('physics:3-4'), /Q\.3|pendulum|Question Stem/)
  assert.match(cut.get('physics:5-6'), /^A pendulum of length L/)
  assert.doesNotMatch(cut.get('physics:5-6'), /Q\.4|Q\.5|bottle/)
  assert.match(cut.get('chemistry:3-4'), /^Tin is obtained/)
  assert.match(cut.get('chemistry:5-6'), /^A solution of a weak acid/)
})

const twelve = Array.from({ length: 12 }, (_, i) => ({
  id: `q${i}`,
  text: `Card ${i + 1} text that is long enough.`,
  options: i % 6 < 2 ? opts : [],
  subject: 'mathematics',
  passageText: 'Wrong passage that belongs to Q9-10 and also holds Q.7 and Q.8 text.',
  passageId: 'old',
}))

test('confirmed facts put subject, type and the right passage on every card', () => {
  const out = enforceAdminFactsOnQuestions(twelve, twoSubject, twoOcr)
  assert.deepEqual(out.map((q) => q.subject), [...Array(6).fill('physics'), ...Array(6).fill('chemistry')])
  assert.equal(out[2].questionType, 'numerical')
  assert.equal(out[0].passageText, undefined)
  assert.equal(out[1].passageId, undefined)
  assert.match(out[2].passageText, /^A soft plastic bottle/)
  assert.equal(out[3].passageText, out[2].passageText)
  assert.equal(out[3].passageId, out[2].passageId)
  assert.match(out[4].passageText, /^A pendulum/)
  assert.match(out[10].passageText, /^A solution of a weak acid/)
  assert.equal(out[2].passageSource, 'admin_facts')
})

test('a passage typed by the admin stays; heals keep fact passages', () => {
  const typed = twelve.map((q, i) => (i === 2 ? { ...q, passageText: 'Typed by admin, keep this.', passageSource: 'admin_edit' } : q))
  const out = enforceAdminFactsOnQuestions(typed, twoSubject, twoOcr)
  assert.equal(out[2].passageText, 'Typed by admin, keep this.')
  assert.match(out[3].passageText, /^A soft plastic bottle/)
  const healed = fillOfficialPyqPairPassages(out)
  assert.equal(healed[2].passageText, 'Typed by admin, keep this.')
  assert.match(healed[3].passageText, /^A soft plastic bottle/)
  assert.equal(peelOfficialPyqCardForDisplay(out[4], twoOcr), out[4])
  assert.equal(officialPyqCardHasMistakenPassage(out[4], twoOcr), false)
})

test('subject from facts is not re-guessed', () => {
  const out = enforceAdminFactsOnQuestions(twelve, twoSubject, twoOcr)
  const stamped = stampSubjectsFromPaper(out, twoOcr)
  assert.deepEqual(stamped.map((q) => q.subject), out.map((q) => q.subject))
})

test('wrong card count leaves cards alone', () => {
  const out = enforceAdminFactsOnQuestions(twelve.slice(0, 11), twoSubject, twoOcr)
  assert.equal(out[0].subject, 'mathematics')
})

test('facts set as continuous still find passages the paper numbers per subject (2021 P1 Chemistry Q24)', () => {
  const continuous = { ...twoSubject, numbering: 'continuous' }
  const { slots } = validateAdminFacts(continuous)
  assert.equal(slots[8].printed, 9)
  const cut = cutAdminPassagesFromOcr(twoOcr, slots)
  assert.match(cut.get(slots[8].passage), /^Tin is obtained/)
  assert.match(cut.get(slots[10].passage), /^A solution of a weak acid/)
  const out = enforceAdminFactsOnQuestions(twelve, continuous, twoOcr)
  assert.match(out[8].passageText, /^Tin is obtained/)
  assert.match(out[11].passageText, /^A solution of a weak acid/)
  const approved = twelve.map((q, i) => (i === 8 ? { ...q, passageText: 'Approved as shown.', adminApproved: true } : q))
  assert.equal(enforceAdminFactsOnQuestions(approved, continuous, twoOcr)[8].passageText, 'Approved as shown.')
})

test('an answer blank after \\left|…\\right| display math still draws (2021 P1 Q55)', () => {
  const text =
    'For $x \\in \\mathbb{R}$, the number of real roots of the equation\n$$3 x^{2}-4\\left|x^{2}-1\\right|+x-1=0$$\nis $____$.'
  assert.equal(mathDrawFailure(text), '')
  assert.doesNotMatch(prepareTextForMathTextDisplay(text), /\$____\$/)
})

test('option pictures labelled (B) and (D) leave the stem and join the bare A and C options (2021 P1 Q21)', () => {
  const imgB = 'https://cdn.mathpix.com/cropped/x-12.jpg?height=171&width=186&top_left_y=2164&top_left_x=1210'
  const imgD = 'https://cdn.mathpix.com/cropped/x-12.jpg?height=177&width=203&top_left_y=2445&top_left_x=1209'
  const card = {
    questionType: 'single_correct',
    text: `Among the following, the conformation that corresponds to the most stable conformation of meso-butane-2,3-diol is\n\n(B)\n\n\\includegraphics{${imgB}}\n\n(D)\n\n\\includegraphics{${imgD}}`,
    options: ['<smiles>C[C@@H](O)[C@H](C)O</smiles>', '<smiles>C[C@H](O)[C@@H](C)O</smiles>'],
  }
  const out = restoreLabelledFigureOptions(card)
  assert.equal(out.text, 'Among the following, the conformation that corresponds to the most stable conformation of meso-butane-2,3-diol is')
  assert.deepEqual(out.options, [card.options[0], `\\includegraphics{${imgB}}`, card.options[1], `\\includegraphics{${imgD}}`])
  const three = { ...card, options: [...card.options, 'third'] }
  assert.equal(restoreLabelledFigureOptions(three), three)
  const healed = healUploadQuestionCard(card, '')
  assert.equal(healed.options.filter((o) => String(o).trim()).length, 4)
  assert.doesNotMatch(healed.text, /includegraphics/)
  const batch = applyOfficialPyqQualityGuards([card], '')[0]
  assert.deepEqual(batch.options, out.options)

  const scan = `\\item[Q.] 2 ${out.text}\n\n${card.options[0]}\n\n\\begin{figure}\n\\captionsetup{labelformat=empty}\n\\caption{(B)}\n\\includegraphics[alt={},max width=\\textwidth]{${imgB}}\n\\end{figure}\n\n${card.options[1]}\n\n\\begin{figure}\n\\captionsetup{labelformat=empty}\n\\caption{(D)}\n\\includegraphics[alt={},max width=\\textwidth]{${imgD}}\n\\end{figure}\n\\end{itemize}\n\\begin{itemize}\n\\item[Q.] 3 Next question here.`
  const unlabelled = { ...card, text: `${out.text}\n\n\\includegraphics{${imgB}}\n\n\\includegraphics{${imgD}}`, options: [...card.options, '', ''] }
  assert.equal(restoreLabelledFigureOptions(unlabelled, ''), unlabelled)
  const fromScan = restoreLabelledFigureOptions(unlabelled, scan)
  assert.equal(fromScan.text, out.text)
  assert.deepEqual(fromScan.options, out.options)
  const split = recoverOptionsFromStem(scan.slice(scan.indexOf('Among'), scan.indexOf('\\item[Q.] 3')), [])
  assert.deepEqual(split.options, out.options)
  assert.doesNotMatch(split.stem, /includegraphics|\(B\)|\(D\)/)
})

test('a picture cropped from the original page draws and survives heal and quality fix (2021 P1 Q21 A, C)', () => {
  const cropA = '/api/official-pyq/original/crops/opyq-1-p12-0123456789abcdef.png'
  const cropC = '/api/official-pyq/original/crops/opyq-1-p12-fedcba9876543210.png'
  const imgB = 'https://cdn.mathpix.com/cropped/x-12.jpg?height=171&width=186&top_left_y=2164&top_left_x=1210'
  const imgD = 'https://cdn.mathpix.com/cropped/x-12.jpg?height=177&width=203&top_left_y=2445&top_left_x=1209'
  const options = [`\\includegraphics{${cropA}}`, `\\includegraphics{${imgB}}`, `\\includegraphics{${cropC}}`, `\\includegraphics{${imgD}}`]
  const card = {
    questionType: 'single_correct',
    text: 'Among the following, the conformation that corresponds to the most stable conformation of meso-butane-2,3-diol is',
    options,
    adminEdited: true,
  }
  assert.deepEqual(splitMathpixMediaSegments(options[0]), [{ kind: 'img', value: cropA }])
  assert.deepEqual(extractMathpixImageUrls(`${card.text}\n${options.join('\n')}`), [cropA, imgB, cropC, imgD])
  for (const opt of options) assert.equal(mathDrawFailure(opt), '')
  assert.deepEqual(healUploadQuestionCard(card, '').options, options)
  assert.deepEqual(applyOfficialPyqQualityGuards([card], '')[0].options, options)
  const cropStem = '/api/official-pyq/original/crops/opyq-1-p12-00000000aaaaaaaa.png'
  const inStem = { ...card, text: `${card.text}\n\\includegraphics{${cropStem}}` }
  assert.match(healUploadQuestionCard(inStem, '').text, /opyq-1-p12-00000000aaaaaaaa\.png/)
  assert.match(applyOfficialPyqQualityGuards([inStem], '')[0].text, /opyq-1-p12-00000000aaaaaaaa\.png/)
})

test('option D that starts with "If" stays on its question, and a cross-section question is not a SECTION header (2022 P2 Q29, Q35)', () => {
  const bubble =
    'Q. 11  A bubble has surface tension $S$. The ideal gas inside the bubble has ratio of specific heats $\\gamma=\\frac{5}{3}$. When the atmospheric pressure is $P_{a 2}$, the radius of the bubble and the temperature of the enclosed gas are $r_{2}$ and $T_{2}$, respectively.\nWhich of the following statement(s) is(are) correct?\n(A) If the surface of the bubble is a perfect heat insulator, then $r_{1}=r_{2}$.\n(B) If the surface of the bubble is a perfect heat insulator, then the total internal energy does not change.\n(C) If the surface of the bubble is a perfect heat conductor, then $r_{1}>r_{2}$.\n(D) If the surface of the bubble is a perfect heat insulator, then $T_{2}=T_{1}$.\n\\end{itemize}'
  assert.equal(findGluedNextQuestionStart(bubble), -1)
  const items = paperItemsFromMathpixOcr(`${bubble}\n\\begin{itemize}\n\\item[Q.] 12 A disk of radius R with uniform positive charge density $\\sigma$ is placed on the $x y$ plane. Which of the following statement(s) is(are) correct?\n\\begin{itemize}\n\\item[(A)] For $\\beta=1$ the particle reaches the origin.\n\\item[(B)] For $\\beta=2$ the particle reaches the origin.\n\\item[(C)] For $\\beta=3$ the particle returns.\n\\item[(D)] For $\\beta>1$ the particle always reaches the origin.\n\\end{itemize}`)
  assert.equal(items.length, 2)
  assert.match(items[0].options[3], /T_\{2\}=T_\{1\}/)

  const screw =
    'Area of the cross-section of a wire is measured using a screw gauge. The pitch of the main scale is 0.5 mm. The measured readings are listed below.\n\n\\begin{tabular}[t]{|l|l|l|}\n\\hline Measurement condition & Main scale reading & Circular scale reading \\\\\n\\hline Attempt-1: With wire & 4 divisions & 20 divisions \\\\\n\\hline\n\\end{tabular}\nWhat are the diameter and cross-sectional area of the wire measured using the screw gauge?'
  assert.equal(looksLikePyqSectionInstructionStem(screw), false)
  assert.equal(looksLikePyqSectionInstructionStem('SECTION 2 (Maximum marks: 24)\nThis section contains SIX (06) questions.'), true)
  assert.equal(looksLikePyqSectionInstructionStem('Section-A contains FOUR questions. Each question has FOUR options.'), true)
  const photo = {
    text: 'When light of a given wavelength is incident on a metallic surface, the minimum potential needed to stop the emitted photoelectrons is $6.0 V$. What are the wavelength of the first source and the work function of the metal, respectively?',
    options: ['$1.72 \\times 10^{-7} m, 1.20 eV$', '$1.72 \\times 10^{-7} m, 5.60 eV$', '$3.78 \\times 10^{-7} m, 5.60 eV$', '$3.78 \\times 10^{-7} m, 1.20 eV$'],
    printedNumber: 16,
  }
  const gauge = {
    text: screw,
    options: ['$2.22 \\pm 0.02 mm$', '$2.22 \\pm 0.01 mm$', '$2.14 \\pm 0.02 mm$', '$2.14 \\pm 0.01 mm$'],
    printedNumber: 17,
  }
  const kept = mergeAdjacentOptionTails([photo, gauge])
  assert.equal(kept.length, 2)
  assert.match(kept[1].text, /^Area of the cross-section/)
})

test('a table followed by a $…$ line keeps that dollar, raises Z^(n+), and the graph is not flagged (2022 P2 Q39)', () => {
  const q39 =
    'The value of (m + n + p) is ____.\nGiven:\n\n\\begin{tabular}[t]{|l|l|l|}\n\\hline Ion & \\mathrm{Z}^{\\mathrm{n}+} & \\mathrm{X}^{\\mathrm{m}-} \\\\\n\\hline \\lambda^{0}(\\mathrm{~S} \\mathrm{~cm}^{2} \\mathrm{~mol}^{-1}) & 50.0 & 80.0 \\\\\n\\hline\n\\end{tabular}\n$\\lambda^{0}$ is the limiting molar conductivity of ions\nThe plot of molar conductivity ( $\\Lambda$ ) of $\\mathrm{Z}_{\\mathrm{m}} \\mathrm{X}_{\\mathrm{n}}$ vs $\\mathrm{c}^{1 / 2}$ is given below.\n\\includegraphics{https://cdn.mathpix.com/cropped/45dff9a8-20.jpg?height=554&width=625&top_left_y=845&top_left_x=783}'
  const drawn = convertLatexTabularToArray(q39)
  assert.match(drawn, /<\/table>\s*\$\\lambda\^\{0\}\$ is the limiting/)
  assert.match(drawn, /Z<sup>n\+<\/sup>/)
  assert.match(drawn, /X<sup>m−<\/sup>/)
  assert.match(drawn, /cm²/)
  assert.equal(latexExtractionIncomplete(q39), false)
  assert.deepEqual(reviewMarkSpans(q39), [])
  assert.match(convertLatexTabularToArray('$\\begin{tabular}{|l|l|}\\hline A & 1 \\\\ \\hline\\end{tabular}$ next'), /\\end\{array\}\$\$ next/)

  const forCompare = officialPyqDrawnText(q39)
  assert.match(forCompare, /Ion \| Z\^\(n\+\) \| X\^\(m−\)/)
  assert.match(forCompare, /\[picture\]$/)
  assert.doesNotMatch(forCompare, /tabular|includegraphics/)
})

test('the scan settles restart vs continuous numbering, so Chemistry Q.3 is not stamped Q39', () => {
  const subject = (name) =>
    `\\section*{${name}}\n` +
    Array.from({ length: 18 }, (_, i) => `\\item[Q.] ${i + 1} Question ${i + 1} of ${name} text here.`).join('\n')
  const restartOcr = ['MATHEMATICS', 'PHYSICS', 'CHEMISTRY'].map(subject).join('\n')
  const continuousOcr = Array.from({ length: 54 }, (_, i) => `Q. ${i + 1} Question ${i + 1} text here.`).join('\n')
  assert.equal(numberingPrintedInOcr(restartOcr, 18), 'restart')
  assert.equal(numberingPrintedInOcr(continuousOcr, 18), 'continuous')
  assert.equal(numberingPrintedInOcr('Q. 1 only', 18), '')

  const rows = [
    { from: 1, to: 8, type: 'integer', options: 0, listI: '', listII: '' },
    { from: 9, to: 14, type: 'multiple_correct', options: 4, listI: '', listII: '' },
    { from: 15, to: 18, type: 'single_correct', options: 4, listI: '', listII: '' },
  ]
  const admin = {
    totalQuestions: 54,
    subjectOrder: ['mathematics', 'physics', 'chemistry'],
    numbering: 'continuous',
    samePattern: true,
    pattern: { rows, passages: '' },
    confirmedAt: 1,
  }
  assert.equal(adminFactsMatchingScan(admin, restartOcr).numbering, 'restart')
  assert.equal(adminFactsMatchingScan(admin, continuousOcr), admin)
  const cards = Array.from({ length: 54 }, (_, i) => ({ text: `Question ${i + 1}`, options: [], printedNumber: i + 1 }))
  const stamped = enforceAdminFactsOnQuestions(cards, admin, restartOcr)
  assert.equal(stamped[38].printedNumber, 3)
  assert.equal(stamped[38].subject, 'chemistry')
  assert.equal(enforceAdminFactsOnQuestions(cards, admin, continuousOcr)[38].printedNumber, 39)
  assert.equal(draftAdminFacts(restartOcr, cards).numbering, 'restart')
})

console.log(`official-pyq admin facts: ${passed} tests passed`)

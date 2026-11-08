/**
 * Official PYQ scan damage: each problem is flagged by the local quality check and
 * repaired from the stored scan or a sibling card, never invented.
 *   Leading number lost at a per-subject restart ("Q. 12 mol" for Q.1 "2 mol" — 2022 P1).
 *   First letter lost ("he reactivity" — 2014 P1 Q22), also on a hand-edited card.
 *   Words lost from a saved card that the scan still has ("correct Assume" — 2024 P1 Q2).
 *   A paragraph copy without the figure its sibling has (2023 P2 Q14, 2024 P2 Q14/Q16).
 *   An answer label ("from the paper", "AI") on a card with no answer.
 *   Saving one card keeps those flags; a lowercase "let" is not a cut-off word.
 *   Approve / Publish re-check an old quality mark; facts with a lost section instruction are unknown.
 */
import assert from 'node:assert/strict'

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
if (typeof globalThis.sessionStorage === 'undefined') {
  globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} }
}
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis

const { paperItemsFromMathpixOcr, restoreGluedQuestionNumbers } = await import('../src/utils/mathpixQuestionSplit.js')
const { LOCAL_QUALITY_REVISION, localOfficialPyqQualityCheck, repairOfficialPyqUntilQuality } = await import(
  '../src/utils/officialPyqLocalQuality.js'
)
const { importQuestionsToOfficialPyqPending, validateOfficialPyqForPublish } = await import('../src/utils/officialPyqApproval.js')
const { getOfficialPyqPendingPaper, updateOfficialPyqPendingPaper } = await import('../src/utils/officialPyqPendingStore.js')
const { recheckOfficialPyqCardQuality } = await import('../src/utils/officialPyqCardEdit.js')
const { buildPaperFacts } = await import('../src/utils/officialPyqPaperFacts.js')

let failed = 0
function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    failed += 1
    console.error(`FAIL - ${name}\n${err?.stack || err}`)
  }
}

const OCR = [
  'Q. 1 he reactivity of compound Z with different halogens under appropriate conditions is given below. The observed pattern of electrophilic substitution can be explained by',
  '(A) the steric effect of the halogen',
  '(B) the steric effect of the tert-butyl group',
  '(C) the electronic effect of the phenolic group',
  '(D) the electronic effect of the tert-butyl group',
  'Q. 2 A student appears for a quiz consisting of only true-false type questions and answers all the questions. Whenever the student knows the answer of a question, he gives the correct answer. Assume that the probability of a correct guess is one half. Then the probability that the student knows the answer is',
  '(A) $\\frac{1}{12}$',
  '(B) $\\frac{1}{7}$',
  '(C) $\\frac{5}{7}$',
  '(D) $\\frac{5}{12}$',
  'Q. 3 2 mol of $\\mathrm{Hg}(g)$ is combusted in a fixed volume bomb calorimeter with excess of $\\mathrm{O}_{2}$ at 298 K and 1 atm into $\\mathrm{HgO}(s)$. The magnitude of the heat released in kilojoules is closest to',
  '(A) 90.39',
  '(B) 45.20',
  '(C) 30.10',
  '(D) 12.50',
].join('\n')

const ITEMS = paperItemsFromMathpixOcr(OCR)

/** Cards as an older split saved them: first letter lost in the scan, "answer." dropped, "2" dropped, answer label with no answer. */
function damagedCards() {
  return [
    { ...ITEMS[0], answerSource: 'unknown' },
    { ...ITEMS[1], text: ITEMS[1].text.replace('correct answer. Assume', 'correct Assume'), answerSource: 'unknown' },
    { ...ITEMS[2], text: ITEMS[2].text.replace(/^2 mol/, 'mol'), answerSource: 'from_paper', correctIndex: undefined },
  ]
}

const FIGURE = '![](https://cdn.mathpix.com/cropped/abc-16.jpg?height=448&width=662&top_left_y=1562&top_left_x=694)'
const PARAGRAPH =
  'In a double slit experiment, each of the two slits A and B, as shown in the figure, oscillates about its fixed centre.'
function paragraphPair() {
  return [
    {
      text: 'The separation between the two extreme positions of the eighth bright fringe is',
      questionType: 'numerical',
      options: [],
      passageId: 'para-1',
      passageText: PARAGRAPH,
    },
    {
      text: 'The maximum speed of the eighth bright fringe on the screen is',
      questionType: 'numerical',
      options: [],
      passageId: 'para-1',
      passageText: `${PARAGRAPH}\n${FIGURE}`,
    },
  ]
}

const META = { exam: 'jee-advanced', year: 2014, session: 'Paper 1', sourceLabel: 'test' }

test('a label glued to the first number at a subject restart is split back ("Q. 12 mol" → Q.1 "2 mol", 2022 P1)', () => {
  const glued = restoreGluedQuestionNumbers(
    '\\item[Q.] 18 Last physics question.\n\\section*{CHEMISTRY}\n\\item[Q.] 12 mol of $\\mathrm{Hg}(g)$ is combusted.\n\\item[Q.] 2 Next question.',
  )
  assert.match(glued, /\\item\[Q\.\] 1 2 mol of/)
  const real12 = '\\item[Q.] 11 Eleven.\n\\item[Q.] 12 Real twelve.\n\\item[Q.] 13 Next.'
  assert.equal(restoreGluedQuestionNumbers(real12), real12, 'a real Q.12 stays Q.12')
})

test('first letter lost, words lost and an empty answer label are flagged in plain words', () => {
  assert.equal(ITEMS.length, 3)
  const check = localOfficialPyqQualityCheck({ questions: damagedCards(), preparedText: OCR })
  assert.deepEqual(check.failedGoTo, [1, 2, 3])
  const lines = check.lines.join(' | ')
  assert.match(lines, /Go to Q 1\. The first word looks cut off \(“he”\)/)
  assert.match(lines, /Go to Q 2\. Words printed in the scan are missing from the card/)
  assert.match(lines, /Go to Q 3\. The card is marked “answer from the paper”, and no answer is saved/)
})

test('auto-fix repairs them from the scan: "The reactivity", "correct answer. Assume", "2 mol of", label → unknown', () => {
  const fixed = repairOfficialPyqUntilQuality({ questions: damagedCards(), preparedText: OCR })
  assert.deepEqual(fixed.quality.failedGoTo, [], fixed.quality.lines.join(' | '))
  const [q1, q2, q3] = fixed.paper.questions
  assert.match(q1.text, /^The reactivity of compound Z/)
  assert.match(q2.text, /he gives the correct answer\. Assume that/)
  assert.match(q3.text, /^2 mol of \$\\mathrm\{Hg\}\(g\)\$/)
  assert.equal(q3.answerSource, 'unknown', 'Hybrid AI fill can now answer it')
  const ai = repairOfficialPyqUntilQuality({ questions: [{ ...ITEMS[1], answerSource: 'ai_generated', correctIndex: undefined }], preparedText: '' })
  assert.equal(ai.paper.questions[0].answerSource, 'unknown', 'an "AI answer" label with no answer is cleared too')
})

test('a paragraph copy without the figure its sibling has is flagged and gets the sibling copy', () => {
  const pair = paragraphPair()
  const check = localOfficialPyqQualityCheck({ questions: pair, preparedText: '' })
  assert.deepEqual(check.failedGoTo, [1])
  assert.match(check.lines.join(' | '), /paragraph lost its figure/)
  const fixed = repairOfficialPyqUntilQuality({ questions: pair, preparedText: '' })
  assert.equal(fixed.paper.questions[0].passageText, pair[1].passageText)
  assert.deepEqual(fixed.quality.failedGoTo, [])
  const otherWords = [{ ...pair[0], passageText: 'A different paragraph about a spring and two particles on a frictionless plane.' }, pair[1]]
  assert.deepEqual(localOfficialPyqQualityCheck({ questions: otherWords, preparedText: '' }).failedGoTo, [], 'different words are not the same paragraph')
})

test('a lost first letter is repaired on a hand-edited card too; the hand edit stays marked', () => {
  localStorage.clear()
  const saved = importQuestionsToOfficialPyqPending({
    ...META,
    preparedText: OCR,
    questions: [{ ...damagedCards()[0], adminEdited: true, adminEditedAt: Date.now() }, ITEMS[1], ITEMS[2]],
  })
  assert.match(saved.questions[0].text, /^The reactivity/)
  assert.equal(saved.questions[0].adminEdited, true)
  localStorage.clear()
})

test('saving one card does not clear a flag that needs its sibling card or the scan', () => {
  localStorage.clear()
  const paper = importQuestionsToOfficialPyqPending({ ...META, session: 'Paper 2', preparedText: '', questions: paragraphPair() })
  assert.equal(paper.questions[0].passageText, paragraphPair()[1].passageText, 'upload repairs the paragraph copy')
  updateOfficialPyqPendingPaper(paper.id, { questions: paragraphPair() })
  recheckOfficialPyqCardQuality(paper.id, 0)
  assert.deepEqual(getOfficialPyqPendingPaper(paper.id).localQuality.failedGoTo, [1])
  localStorage.clear()
})

test('a stem opening with a lowercase "let" or a chemical prefix is not a cut-off word', () => {
  const cards = [
    { text: 'let $f(x)=x^{2}+1$ for every real number $x$. Then the minimum value of $f$ over the real line is', questionType: 'numerical', options: [] },
    { text: 'tert-butyl chloride reacts with aqueous sodium hydroxide by the mechanism named', questionType: 'numerical', options: [] },
    { text: 'cis and trans isomers of but-2-ene differ in their dipole moment, which is larger for', questionType: 'numerical', options: [] },
  ]
  const check = localOfficialPyqQualityCheck({ questions: cards, preparedText: '' })
  assert.doesNotMatch(check.lines.join(' | '), /first word looks cut off/)
  assert.deepEqual(repairOfficialPyqUntilQuality({ questions: cards, preparedText: '' }).paper.questions.map((q) => q.text), cards.map((q) => q.text))
})

test('Approve and Publish trust only a current quality mark; confirmed facts stand in for a scan with no section counts', () => {
  const answered = {
    id: 'a1',
    subject: 'physics',
    questionType: 'single_correct',
    text: 'A block of mass 2 kg is pushed by a force of 10 N on a smooth floor. Its acceleration is',
    options: ['2', '5', '10', '20'],
    correctIndex: 1,
    answerSource: 'from_paper',
  }
  const base = { id: 'x', status: 'approved', year: 2024, exam: 'jee-advanced', questions: [answered] }
  const unknownFacts = 'OCR does not contain “This section contains …” instructions, so the facts card is unknown.'
  const factsOnly = {
    ...base,
    adminFacts: { confirmedAt: 1 },
    localQuality: { revision: LOCAL_QUALITY_REVISION, passed: false, failedGoTo: [], lines: [unknownFacts] },
  }
  assert.doesNotMatch(validateOfficialPyqForPublish(factsOnly).errors.join(' '), /quality check/)
  assert.match(
    validateOfficialPyqForPublish({ ...factsOnly, adminFacts: undefined }).errors.join(' '),
    /quality check has not passed\. OCR does not contain/,
    'without confirmed facts the unknown facts card still blocks',
  )
  const current = { ...base, localQuality: { revision: LOCAL_QUALITY_REVISION, passed: false, failedGoTo: [1] } }
  assert.match(validateOfficialPyqForPublish(current).errors.join(' '), /quality check has not passed\. Go to Q 1/)
  const stale = { ...base, localQuality: { revision: 1, passed: true, failedGoTo: [] }, questions: [{ ...answered, correctIndex: undefined }] }
  assert.match(validateOfficialPyqForPublish(stale).errors.join(' '), /quality check has not passed\. Go to Q 1/, 'an old pass is checked again')
})

test('paper facts are unknown when the scan prints question numbers above its section instructions total', () => {
  const header =
    'SECTION 1\nThis section contains FOUR (04) questions.\nEach question has FOUR options. ONLY ONE of these four options is the correct answer.\n'
  const lost = buildPaperFacts(`${header}${Array.from({ length: 51 }, (_, i) => `Q. ${i + 1} Question ${i + 1}.`).join('\n')}`)
  assert.equal(lost.known, false)
  assert.match(lost.notes.join(' '), /prints Q\. 51/)
  const whole = buildPaperFacts(`${header}${Array.from({ length: 4 }, (_, i) => `Q. ${i + 1} Question ${i + 1}.`).join('\n')}`)
  assert.equal(whole.known, true)
  assert.equal(whole.expectedQuestionCount, 4)
})

if (failed) {
  console.error(`\n${failed} scan-damage test(s) failed`)
  process.exit(1)
}
console.log('\nOfficial PYQ scan-damage tests passed')
process.exit(0)

/**
 * Institute solutions (Allen, Resonance, FIITJEE…) added to an Official PYQ paper.
 *   The institute layout repeats each question with its options, then "Ans." and "Sol.": only the
 *   answer and the solution are taken, per subject when the numbering restarts; page headers,
 *   section instructions and paragraphs never end up in a solution.
 *   The official key wins: a printed or admin answer is never changed; a different institute
 *   answer is listed in the Quality check. Solutions fill only empty or AI ones.
 *   Each stem is checked against the institute's copy (no Gemini).
 *   Hybrid AI then fills tags only; Publish carries the answer and solution to students.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'

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
  const store = new Map()
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
}
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis

const {
  instituteCardNotes,
  instituteStemOnly,
  instituteTextDifference,
  normalizeInstituteAnswer,
  readInstituteSolutions,
} = await import('../src/utils/instituteSolutionsParse.js')
const {
  applyInstituteSolutionsToOfficialPyqPaper,
  instituteResultNote,
  keepInstitutePicturesLocal,
} = await import('../src/utils/officialPyqInstituteSolutions.js')
const { addOfficialPyqPendingPaper, clearOfficialPyqPendingPapers, getOfficialPyqPendingPaper, updateOfficialPyqPendingPaper } =
  await import('../src/utils/officialPyqPendingStore.js')
const { publishOfficialPyqPaper, pendingQuestionToPyqItem } = await import('../src/utils/officialPyqApproval.js')
const { applyHybridPatchToCard, hybridFillRequestForQuestion, officialPyqCardTagsOnly } = await import(
  '../src/utils/officialPyqPendingFill.js'
)
const { localOfficialPyqQualityCheck } = await import('../src/utils/officialPyqLocalQuality.js')
const { mathpixPictureLinksOfPaper } = await import('../src/utils/mathpixLocalPictures.js')
const { copyAnswersOntoCanonical } = await import('../src/utils/officialPyqLocalReparse.js')
const { applyEndAnswerSection, readAnswerFileSection } = await import('../src/utils/printedEndSolutions.js')
const { clearImportedPyqs, loadImportedPyqs } = await import('../src/utils/pyqStore.js')
const { clearQuestionBank } = await import('../src/utils/questionBank.js')

const ALLEN = fs.readFileSync(new URL('./fixtures/institute-solutions-allen-mathpix.txt', import.meta.url), 'utf8')
const PICTURE = 'https://cdn.mathpix.com/cropped/1111aaaa-2222-3333-4444-555566667777-02.jpg?height=200&width=300&top_left_y=400&top_left_x=500'

let failed = 0
async function test(name, fn) {
  try {
    await fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    failed += 1
    console.error(`FAIL - ${name}\n${err?.stack || err}`)
  }
}

function login(role) {
  sessionStorage.setItem('testvantage-session', JSON.stringify({ role, email: `${role}@test`, name: role, loggedInAt: 1 }))
}

const PHYS = 'physics'
const CHEM = 'chemistry'
const MATH = 'mathematics'

/** The paper as split from the official PDF: the same questions the institute repeats. */
function paperCards() {
  return [
    {
      text: 'A block of mass $2 \\mathrm{~kg}$ is placed on a rough horizontal surface with coefficient of friction 0.4. A horizontal force of $10 \\mathrm{~N}$ acts on it. The acceleration of the block is',
      options: ['$1 \\mathrm{~m} / \\mathrm{s}^{2}$', '$3 \\mathrm{~m} / \\mathrm{s}^{2}$', '$5 \\mathrm{~m} / \\mathrm{s}^{2}$', '$0$'],
      answerSource: 'unknown',
    },
    {
      text: 'A ball is thrown vertically upward with speed $20 \\mathrm{~m} / \\mathrm{s}$. The maximum height reached by the ball is (take $g=10 \\mathrm{~m} / \\mathrm{s}^{2}$ )',
      options: ['$10 \\mathrm{~m}$', '$20 \\mathrm{~m}$', '$30 \\mathrm{~m}$', '$40 \\mathrm{~m}$'],
      correctIndex: 1,
      answerSource: 'from_paper',
      solution: 'Using energy conservation the height is 20 m.\nAnswer: (B)',
      solutionSource: 'hybrid_ai',
    },
    {
      text: 'Two identical charges of $5 \\mu \\mathrm{C}$ are kept $30 \\mathrm{~cm}$ apart in air. The force between them is',
      options: ['$1.5 \\mathrm{~N}$', '$2.5 \\mathrm{~N}$', '$3.5 \\mathrm{~N}$', '$4.5 \\mathrm{~N}$'],
      correctIndex: 1,
      answerSource: 'from_paper',
    },
    {
      text: 'A wire of resistance is stretched uniformly to twice its',
      options: ['$2 \\Omega$', '$4 \\Omega$', '$8 \\Omega$', '$16 \\Omega$'],
      correctIndex: 3,
      answerSource: 'from_paper',
    },
    {
      text: 'Which of the following physical quantities are vector quantities?',
      options: ['Velocity', 'Speed', 'Force', 'Work'],
      questionType: 'multiple_correct',
    },
    { text: 'The value of $x$ satisfying the equation $2 x=4.5$ is', options: [], questionType: 'numerical' },
  ]
    .map((q, i) => ({ ...q, subject: PHYS, printedNumber: i + 1 }))
    .concat(
      [
        {
          text: 'The number of moles present in $22 \\mathrm{~g}$ of carbon dioxide gas is',
          options: ['0.25', '0.5', '1', '2'],
          correctIndex: 1,
          answerSource: 'from_paper',
          solution: 'Printed on the paper: $n=22 / 44=0.5$',
          solutionSource: 'from_paper',
        },
        {
          text: 'The work done by the gas in kilojoule is closest to',
          passageText:
            'One mole of an ideal monatomic gas expands isothermally at $300 \\mathrm{~K}$ against a constant external pressure.',
          passageGroup: 'chem-p1',
          options: [],
          questionType: 'numerical',
        },
        {
          text: 'The pH of a $10^{-3} \\mathrm{M}$ aqueous hydrochloric acid solution at $25^{\\circ} \\mathrm{C}$ is',
          options: [],
          questionType: 'numerical',
          correctInteger: 2,
          answerSource: 'hybrid_ai',
          solution: 'pH is 2.\nAnswer: 2',
          solutionSource: 'hybrid_ai',
        },
        {
          text: 'Which of the following is an example of an amphoteric oxide?',
          options: ['$\\mathrm{Al}_{2} \\mathrm{O}_{3}$', '$\\mathrm{Na}_{2} \\mathrm{O}$', '$\\mathrm{SO}_{3}$', '$\\mathrm{CaO}$'],
          correctIndex: 0,
          answerSource: 'admin_edit',
          adminEdited: true,
          adminEditedAt: 1,
          solution: 'My own working: $\\mathrm{Al}_{2} \\mathrm{O}_{3}$ is amphoteric.',
          solutionSource: 'manual',
        },
        {
          text: 'The hybridisation of carbon in methane is',
          options: ['sp', '$\\mathrm{sp}^{2}$', '$\\mathrm{sp}^{3}$', '$\\mathrm{dsp}^{2}$'],
        },
      ].map((q, i) => ({ ...q, subject: CHEM, printedNumber: i + 1 })),
    )
    .concat(
      [
        { text: 'If $f(x)=x^{2}+1$, then the value of $f^{\\prime}(3)$ is', options: ['3', '6', '9', '12'] },
        { text: 'The number of solutions of $\\sin x=0$ in the closed interval $[0,2 \\pi]$ is', options: [], questionType: 'numerical' },
      ].map((q, i) => ({ ...q, subject: MATH, printedNumber: i + 1 })),
    )
    .map((q, i) => ({ ...q, id: `inst-q${i + 1}`, pyqSlot: i + 1, questionType: q.questionType || 'single' }))
}

function newPaper(extra = {}) {
  return addOfficialPyqPendingPaper({
    exam: 'jee-advanced',
    year: 2024,
    session: 'Paper 1',
    paperLabel: 'JEE Advanced 2024 Paper 1 (institute fixture)',
    paperId: `jee-advanced-2024-p1-institute-${Math.random().toString(36).slice(2, 8)}`,
    sourceLabel: 'Official (test fixture)',
    questions: paperCards(),
    ...extra,
  })
}

function resetAll() {
  clearOfficialPyqPendingPapers()
  clearImportedPyqs()
  clearQuestionBank()
}

await test('answer values as institutes print them', () => {
  const cases = [
    ['(B)', 'B'],
    ['(A,C)', 'A, C'],
    ['(A), (C) and (D)', 'A, C, D'],
    ['ACD', 'A, C, D'],
    ['\\((\\mathrm{B})\\)', 'B'],
    ['is (c)', 'C'],
    ['2.25', '2.25'],
    ['(6)', '6'],
    ['[0.50 - 0.60]', '[0.50 to 0.60]'],
    ['2.20 to 2.30', '[2.20 to 2.30]'],
    ['4 m/s', '4'],
    ['0.5 OR 0.75', '0.5 OR 0.75'],
    ['Bonus', ''],
    ['(A) → (P, Q); (B) → (R)', ''],
  ]
  for (const [raw, want] of cases) assert.equal(normalizeInstituteAnswer(raw), want, raw)
})

await test('Allen layout: answer and solution per question, repeated question kept apart', () => {
  const read = readInstituteSolutions(ALLEN, { institute: 'Allen' })
  assert.ok(read)
  assert.equal(read.layout, 'repeated_questions')
  assert.deepEqual(read.subjects, [PHYS, CHEM, MATH])
  assert.deepEqual([...read.entries.keys()], [
    'physics:1', 'physics:2', 'physics:3', 'physics:4', 'physics:5', 'physics:6',
    'chemistry:1', 'chemistry:2', 'chemistry:3', 'chemistry:4',
    'mathematics:1', 'mathematics:2',
  ])
  const e = (k) => read.entries.get(k)
  assert.deepEqual(
    [...read.entries.values()].map((x) => x.answer),
    ['A', 'B', 'C', 'D', 'A, C', '2.25', 'B', '[0.50 to 0.60]', '3', 'A', 'B', '3'],
  )
  assert.match(e('physics:1').solution, /^Friction \$f=\\mu m g/)
  assert.match(e('physics:1').solution, /1\. Find the friction first\.\n2\. Then \$a=/, 'numbered steps stay in the solution')
  assert.match(e('physics:2').solution, /cdn\.mathpix\.com\/cropped\/1111aaaa/, 'the solution keeps its picture')
  assert.match(e('physics:6').solution, /^\$x=\\frac\{4\.5\}\{2\}=2\.25\$$/)
  assert.match(e('chemistry:1').solution, /^Molar mass/)
  assert.match(e('chemistry:2').solution, /^\$W=P_/, '"Sol^n." is a solution mark')
  assert.match(e('mathematics:1').solution, /^\$f\^\{\\prime\}\(x\)=2 x\$/)
  for (const [key, entry] of read.entries) {
    assert.doesNotMatch(entry.solution, /\(A\)\s|\(B\)\s|Ans\.|Answer:/, `${key}: no options or answer line in the solution`)
    assert.doesNotMatch(
      entry.solution,
      /ALLEN|www\.|Corporate|Page 3|Toll Free|This section contains|Full Marks|PARAGRAPH|ideal monatomic/,
      `${key}: no page furniture, instructions or paragraph`,
    )
    assert.doesNotMatch(entry.question, /ALLEN|www\.|This section contains/, `${key}: clean question copy`)
  }
  assert.match(e('physics:4').question, /^A wire of resistance \$4 \\Omega\$ is stretched uniformly to twice its original length/)
  assert.match(e('physics:4').question, /\(D\) \$16 \\Omega\$$/)
  assert.equal(instituteStemOnly(e('physics:4').question), 'A wire of resistance $4 \\Omega$ is stretched uniformly to twice its original length. Its new resistance is')
  assert.match(e('mathematics:1').question, /^If \$f\(x\)=x\^\{2\}\+1\$/, '"Q.1" number is taken off')
})

await test('a question whose "Ans." Mathpix lost does not end up in the previous solution', () => {
  const text = [
    '1. The first question asks about a falling stone near the ground?',
    '(A) one (B) two (C) three (D) four',
    'Ans. (A)',
    'Sol. The stone falls freely under gravity.',
    '2. The second question asks about a rolling sphere on an incline?',
    '(A) one (B) two (C) three (D) four',
    'The sphere rolls without slipping, so friction does no work.',
    '3. The third question asks about a spinning disc and its torque?',
    'Ans. (C)',
    'Sol. Torque equals moment of inertia times angular acceleration.',
  ].join('\n')
  const read = readInstituteSolutions(text)
  assert.deepEqual([...read.entries.keys()], ['#0:1', '#0:3'])
  assert.doesNotMatch(read.entries.get('#0:1').solution, /second question/)
})

await test('a file with answers and solutions only is read as an answer file', () => {
  const read = readInstituteSolutions('ANSWER KEY\n1. (B) 2. (C) 3. 7 4. (A)')
  assert.equal(read.layout, 'answers_only')
  assert.equal(read.entries.size, 4)
})

await test('text check: same question passes, LaTeX spelling does not matter, a cut stem differs', () => {
  const card = { text: 'A ball of mass $2 \\mathrm{~kg}$ moves with speed $\\frac{1}{2} \\mathrm{~m} / \\mathrm{s}$ on a smooth floor', options: ['1', '2'] }
  assert.equal(instituteTextDifference(card, 'A ball of mass $2\\,kg$ moves with speed $\\tfrac{1}{2}\\, m/s$ on a smooth floor\n(A) 1\n(B) 2').differs, false)
  const cut = instituteTextDifference({ ...card, text: 'A ball of mass moves on a' }, card.text)
  assert.equal(cut.differs, true)
  assert.ok(cut.missingWords.includes('speed'))
  const number = instituteTextDifference({ ...card, text: card.text.replace('2 \\mathrm{~kg}', '3 \\mathrm{~kg}') }, `${card.text}\n(A) 12.5`)
  assert.equal(number.differs, true)
  assert.ok(number.missingNumbers.includes('12.5'))
  assert.equal(instituteTextDifference(card, 'Too short'), null)
})

let paperId = ''
await test('official key wins; empty or AI answers and solutions are filled; text differences found', () => {
  resetAll()
  paperId = newPaper().id
  const result = applyInstituteSolutionsToOfficialPyqPaper(paperId, ALLEN, { institute: '  Allen ', fileName: 'allen-2024-p1.pdf' })
  assert.equal(result.ok, true, result.error)
  const q = getOfficialPyqPendingPaper(paperId).questions
  // Q1: no answer → institute answer and solution.
  assert.equal(q[0].correctIndex, 0)
  assert.equal(q[0].answerSource, 'institute')
  assert.equal(q[0].answerInstitute, 'Allen')
  assert.equal(q[0].solutionSource, 'institute')
  assert.equal(q[0].solutionInstitute, 'Allen')
  assert.match(q[0].solution, /^Friction/)
  // Q2: printed answer agrees; the AI solution is replaced.
  assert.equal(q[1].correctIndex, 1)
  assert.equal(q[1].answerSource, 'from_paper')
  assert.equal(q[1].solutionSource, 'institute')
  assert.equal(q[1].instituteAnswerDisagrees, undefined)
  // Q3: official B, institute C → B kept, disagreement noted, the institute's solution (which reaches C) is not used.
  assert.equal(q[2].correctIndex, 1)
  assert.equal(q[2].answerSource, 'from_paper')
  assert.equal(q[2].instituteAnswerDisagrees, 'C')
  assert.equal(q[2].solution, undefined)
  // Q4: printed answer, no solution → institute solution; the stem was cut short.
  assert.equal(q[3].solutionSource, 'institute')
  assert.match(q[3].instituteQuestionText, /twice its original length/)
  // Q5, Q6: one-or-more and numerical answers.
  assert.deepEqual(q[4].correctIndices, [0, 2])
  assert.equal(q[5].correctNumerical, 2.25)
  // Chemistry restarts at 1: Q1 printed answer and printed solution stay.
  assert.equal(q[6].solutionSource, 'from_paper')
  assert.match(q[6].solution, /^Printed on the paper/)
  // Paragraph question: band answer.
  assert.equal(q[7].correctNumerical, 0.55)
  assert.equal(q[7].numericalTolerance, 0.05)
  // An AI answer is not the official key: the institute's replaces it.
  assert.equal(q[8].correctNumerical, 3)
  assert.equal(q[8].correctInteger, undefined)
  assert.equal(q[8].answerSource, 'institute')
  assert.equal(q[8].solutionSource, 'institute')
  // Admin-edited answer and hand-written solution stay.
  assert.equal(q[9].correctIndex, 0)
  assert.equal(q[9].answerSource, 'admin_edit')
  assert.match(q[9].solution, /^My own working/)
  assert.equal(q[9].solutionSource, 'manual')
  // Not in the file.
  assert.equal(q[10].answerSource, undefined)
  // Mathematics restarts at 1.
  assert.equal(q[11].correctIndex, 1)
  assert.equal(q[12].correctNumerical, 3)

  assert.equal(result.answers, 7)
  assert.equal(result.solutions, 9)
  assert.deepEqual(result.disagreements, [{ n: 3, institute: 'C', official: 'B' }])
  assert.deepEqual(result.notFound, [11])
  assert.deepEqual(result.textDiffers, [4])
  assert.deepEqual(result.noAnswer, [])
  const saved = getOfficialPyqPendingPaper(paperId).instituteSolutions
  assert.equal(saved.institute, 'Allen')
  assert.equal(saved.fileName, 'allen-2024-p1.pdf')
  assert.deepEqual(saved.disagreements, [3])

  const note = instituteResultNote(result, { institute: 'Allen', fileName: 'allen-2024-p1.pdf', pictures: { kept: 1, failed: 0 }, pdfStored: true })
  assert.match(note, /7 answer\(s\) filled, 9 solution\(s\) filled/)
  assert.match(note, /1 answer\(s\) differ from the official key — the official answer is kept/)
  assert.match(note, /Q3: institute C, official B/)
  assert.match(note, /Not found in the file: Q 11\./)
  assert.match(note, /Question text differs from the institute copy on Q 4/)
  assert.match(note, /1 solution picture\(s\) kept/)
})

await test('the same file again changes nothing', () => {
  const again = applyInstituteSolutionsToOfficialPyqPaper(paperId, ALLEN, { institute: 'Allen' })
  assert.equal(again.ok, true, again.error)
  assert.equal(again.answers, 0)
  assert.equal(again.solutions, 0)
  assert.deepEqual(again.disagreements.map((d) => d.n), [3])
})

await test('Quality check lists the disagreement and the text difference, and drops them once fixed', () => {
  const paper = getOfficialPyqPendingPaper(paperId)
  const lines = localOfficialPyqQualityCheck(paper).lines
  assert.ok(lines.includes('Go to Q 3. Institute says C, official key says B — check.'), lines.join(' | '))
  assert.ok(lines.includes('Go to Q 4. Question text differs from the institute copy — check against the original.'), lines.join(' | '))
  assert.deepEqual(instituteCardNotes(paper.questions[2]).answer, { said: 'C', official: 'B' })
  const fixed = paper.questions.map((q, i) => {
    if (i === 2) return { ...q, correctIndex: 2 }
    if (i === 3) return { ...q, text: instituteStemOnly(q.instituteQuestionText) }
    return q
  })
  const after = localOfficialPyqQualityCheck({ ...paper, questions: fixed }).lines
  assert.ok(!after.some((l) => /Institute says|institute copy/.test(l)), after.join(' | '))
})

await test('Hybrid AI: institute answer and solution are kept, so the card gets tags only', () => {
  const q = getOfficialPyqPendingPaper(paperId).questions
  assert.equal(officialPyqCardTagsOnly(q[0]), true, 'institute answer + institute solution')
  assert.equal(officialPyqCardTagsOnly(q[1]), true, 'printed answer + institute solution')
  assert.equal(officialPyqCardTagsOnly(q[2]), false, 'printed answer, no solution')
  assert.equal(hybridFillRequestForQuestion(q[0], 'jee-advanced', { tagsOnly: true }).tags_only, true)
  const patched = applyHybridPatchToCard(q[0], { correctIndex: 3, solution: 'AI says D.\nAnswer: D', chapter: 'Laws of Motion' })
  assert.equal(patched.correctIndex, 0)
  assert.equal(patched.answerSource, 'institute')
  assert.match(patched.solution, /^Friction/)
  assert.equal(patched.solutionSource, 'institute')
  assert.equal(patched.chapter, 'Laws of Motion')
})

await test('Publish carries the institute answer and solution to students', () => {
  const paper = getOfficialPyqPendingPaper(paperId)
  const item = pendingQuestionToPyqItem(paper, paper.questions[0], 0)
  assert.equal(item.correctIndex, 0)
  assert.match(item.solution, /^Friction/, 'shown as is, with no AI label')
  assert.equal(item.solutionSource, 'institute')
  login('admin')
  const approvedPaper = newPaper({ status: 'approved' })
  const filled = applyInstituteSolutionsToOfficialPyqPaper(approvedPaper.id, ALLEN, { institute: 'Allen' })
  assert.equal(filled.ok, true, filled.error)
  updateOfficialPyqPendingPaper(approvedPaper.id, { adminFacts: { confirmedAt: Date.now(), confirmedBy: 'test' } })
  const pub = publishOfficialPyqPaper(approvedPaper.id)
  assert.equal(pub.ok, true, pub.errors?.join(' '))
  const rows = loadImportedPyqs().filter((r) => r.paperId === approvedPaper.paperId)
  assert.equal(rows.length, 13)
  const first = rows.find((r) => Number(r.pyqSlot) === 1)
  assert.equal(first.correctIndex, 0)
  assert.match(first.solution, /^Friction/)
  assert.equal(first.answerSource, 'institute')
  const locked = applyInstituteSolutionsToOfficialPyqPaper(approvedPaper.id, ALLEN, { institute: 'Allen' })
  assert.equal(locked.ok, false)
  assert.match(locked.error, /Unpublish first/)
})

await test('works on an Approved paper; refused for other papers and without a name or a match', () => {
  resetAll()
  login('admin')
  const id = newPaper({ status: 'approved' }).id
  const done = applyInstituteSolutionsToOfficialPyqPaper(id, ALLEN, { institute: 'Resonance' })
  assert.equal(done.ok, true, done.error)
  assert.equal(getOfficialPyqPendingPaper(id).status, 'approved')
  assert.equal(getOfficialPyqPendingPaper(id).questions[0].answerSource, 'institute')
  assert.equal(getOfficialPyqPendingPaper(id).questions[0].solutionInstitute, 'Resonance')
  assert.match(applyInstituteSolutionsToOfficialPyqPaper(id, ALLEN, { institute: ' ' }).error, /institute name/)
  const noMatch = applyInstituteSolutionsToOfficialPyqPaper(id, '41. Q text here?\nAns. (A)\nSol. working\n42. Q text?\nAns. (B)\nSol. more', {
    institute: 'Allen',
  })
  assert.equal(noMatch.ok, false)
  assert.match(noMatch.error, /none of its question numbers matched/)
  const other = addOfficialPyqPendingPaper({ paperKind: 'other', paperName: 'Allen Major Test', exam: 'jee-main', year: 2026, questions: paperCards() })
  assert.match(applyInstituteSolutionsToOfficialPyqPaper(other.id, ALLEN, { institute: 'Allen' }).error, /Official PYQ papers/)
})

await test('the exam\'s own answer file still overwrites as before', () => {
  const read = readAnswerFileSection('ANSWER KEY\n1. (B) 2. (C)')
  const out = applyEndAnswerSection([{ printedNumber: 1, correctIndex: 0, answerSource: 'institute' }, { printedNumber: 2 }], read)
  assert.equal(out[0].correctIndex, 1)
  assert.equal(out[0].answerSource, 'from_paper')
  assert.equal(out[1].correctIndex, 2)
})

await test('institute pictures are kept from the institute PDF, never cut from the original', async () => {
  const paper = {
    questions: [
      { text: 'Q', solution: `See ![](${PICTURE})`, solutionSource: 'institute' },
      { text: 'Q2', instituteQuestionText: `copy ![](${PICTURE.replace('-02', '-03')})` },
    ],
  }
  assert.deepEqual(mathpixPictureLinksOfPaper(paper), [])
  const realFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) })
    if (String(url).includes('/institute/mathpix-crops')) {
      return new Response(JSON.stringify({ ok: true, crops: { [PICTURE]: '/api/official-pyq/original/crops/x.png' }, skipped: ['https://cdn.mathpix.com/cropped/other-01.jpg?x=1'] }))
    }
    return new Response(JSON.stringify({ ok: true, saved: 1, kept: 0, failed: [] }))
  }
  try {
    const kept = await keepInstitutePicturesLocal('opyq-x', [PICTURE, 'https://cdn.mathpix.com/cropped/other-01.jpg?x=1'], { pdfStored: true })
    assert.deepEqual(kept, { kept: 2, failed: 0 })
    assert.match(calls[0].url, /\/api\/official-pyq\/original\/opyq-x\/institute\/mathpix-crops$/)
    assert.match(calls[1].url, /mathpix-picture\/keep$/)
    assert.deepEqual(calls[1].body.urls, ['https://cdn.mathpix.com/cropped/other-01.jpg?x=1'])
  } finally {
    globalThis.fetch = realFetch
  }
})

await test('a re-parse of the paper keeps the institute notes on the card', () => {
  const old = { questionNumber: 3, text: 'old', correctIndex: 1, answerSource: 'from_paper', instituteAnswerDisagrees: 'C', solutionInstitute: 'Allen', solution: 'x', solutionSource: 'institute' }
  const [next] = copyAnswersOntoCanonical([{ questionNumber: 3, text: 'new' }], [old])
  assert.equal(next.instituteAnswerDisagrees, 'C')
  assert.equal(next.solutionInstitute, 'Allen')
  assert.equal(next.solutionSource, 'institute')
})

await test('page and helper wiring', () => {
  const page = fs.readFileSync(new URL('../src/pages/OfficialPyqPending.jsx', import.meta.url), 'utf8')
  assert.match(page, /Add institute solutions \(PDF\)/)
  assert.match(page, /data-testid="official-pyq-institute-name"/)
  assert.match(page, /data-testid="official-pyq-institute-file-input"/)
  assert.match(page, /!isOtherPaper\(selected\) &&/)
  const tools = fs.readFileSync(new URL('../src/components/OfficialPyqCardAdminTools.jsx', import.meta.url), 'utf8')
  assert.match(tools, /Use institute wording/)
  const vite = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')
  assert.match(vite, /'\/api\/official-pyq\/original': hybridFastApiProxy\(\)/)
  const main = fs.readFileSync(new URL('../main.py', import.meta.url), 'utf8')
  assert.match(main, /@app\.post\("\/api\/official-pyq\/original\/\{paper_id\}\/institute"/)
  assert.match(main, /@app\.post\("\/api\/official-pyq\/original\/\{paper_id\}\/institute\/mathpix-crops"/)
})

resetAll()
if (failed) {
  console.error(`\n${failed} institute solutions test(s) failed`)
  process.exit(1)
}
console.log('\nAll institute solutions tests passed')

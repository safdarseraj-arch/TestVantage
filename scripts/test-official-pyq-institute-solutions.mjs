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
  cleanInstituteSolutionBody,
  healInstituteSolutionMath,
  instituteSolutionDirtyReason,
  instituteSolutionIsUsable,
  instituteSolutionLooksLikeRawPdf,
  instituteSolutionLooksPoorForStudents,
  mergeInstituteSolutionReads,
  pdfTextIsMathFontJunk,
  preferredInstituteQuestion,
  instituteStemOnly,
  instituteTextDifference,
  normalizeInstituteAnswer,
  pickInstituteSolutionsText,
  readInstituteSolutions,
  salvageInstituteSolutionBody,
} = await import('../src/utils/instituteSolutionsParse.js')
const {
  applyInstituteSolutionsToOfficialPyqPaper,
  injectInstituteSolutionFigure,
  instituteResultNote,
  instituteSolutionHasFigure,
  keepInstitutePicturesLocal,
  rebuildOfficialPyqFromInstituteSolutionsOcr,
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
const FIITJEE = fs.readFileSync(new URL('./fixtures/institute-solutions-fiitjee-mathpix.txt', import.meta.url), 'utf8')
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
  assert.equal(result.byContent, 12)
  assert.equal(result.byNumber, 0)
  assert.deepEqual(result.unmatched, [])
  assert.deepEqual(result.unsure, [])
  const saved = getOfficialPyqPendingPaper(paperId).instituteSolutions
  assert.equal(saved.institute, 'Allen')
  assert.equal(saved.fileName, 'allen-2024-p1.pdf')
  assert.deepEqual(saved.disagreements, [3])

  const note = instituteResultNote(result, { institute: 'Allen', fileName: 'allen-2024-p1.pdf', pictures: { kept: 1, failed: 0 }, pdfStored: true })
  assert.match(note, /7 answer\(s\) filled, 9 solution\(s\) filled/)
  assert.match(note, /Matched 12 question\(s\) by wording and 0 by number; 0 institute question\(s\) not matched; 0 not sure\./)
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
  assert.match(noMatch.error, /none of its questions matched a question on this paper \(by wording or by number\)/)
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

await test('a missing Sol. drawing is put back as includegraphics (empty $ $ $$ hole)', () => {
  const crop = '/api/official-pyq/original/crops/opyq-x-institute-p3-abc.png?page=3&x0=0.1&y0=0.2&x1=0.4&y1=0.5'
  const raw =
    'Also $\\mathrm{q}=2 \\Rightarrow \\mathrm{~S}(\\mathrm{p}, 2)$ $ $ $ $$\\mathrm{T}: \\frac{\\sqrt{3} x}{6}=1$$'
  assert.equal(instituteSolutionHasFigure(raw), false)
  const next = injectInstituteSolutionFigure(raw, crop)
  assert.match(next, /\\includegraphics\{\/api\/official-pyq\/original\/crops\/opyq-x-institute-p3-abc\.png/)
  assert.match(next, /\$\$\\mathrm\{T\}:/)
  assert.equal(instituteSolutionHasFigure(next), true)
  assert.equal(injectInstituteSolutionFigure(next, crop), next)
})

await test('figure-only chemistry Sol. with several drawings is kept', () => {
  const sol = [
    '\\includegraphics{https://cdn.mathpix.com/cropped/x-30.jpg?height=158&width=663&top_left_y=2267&top_left_x=385}',
    '\\includegraphics{https://cdn.mathpix.com/cropped/x-31.jpg?height=161&width=702&top_left_y=255&top_left_x=383}',
    '\\includegraphics{https://cdn.mathpix.com/cropped/x-31.jpg?height=158&width=593&top_left_y=435&top_left_x=385}',
  ].join('\n')
  assert.equal(instituteSolutionLooksPoorForStudents(sol), false)
})

await test('booklet-as-paper keeps institute Sol. Mathpix links for local crops', () => {
  const picture = 'https://cdn.mathpix.com/cropped/6b8031a5-d7d4-4570-987a-d0b6d84e7400-30.jpg?height=158&width=663&top_left_y=2267&top_left_x=385'
  const paper = {
    notes: 'Extract summary: Rebuilt 90 questions from institute solutions OCR (FIITJEE) · 90 answers · 90 solutions',
    instituteSolutions: { rebuiltFromOcr: true },
    questions: Array.from({ length: 30 }, (_, i) => ({
      text: 'Q' + (i + 1),
      solution: i === 0 ? ('See \\includegraphics{' + picture + '}') : 'words enough here for a prose solution about the answer choice',
      solutionSource: 'institute',
    })),
  }
  assert.deepEqual(mathpixPictureLinksOfPaper(paper), [picture])
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

/** The institute's answer for each card as printed (null: not in the file). */
const PRINTED_ANSWERS = ['(A)', '(B)', '(C)', '(D)', '(A,C)', '2.25', '(B)', '[0.50 - 0.60]', '3', '(A)', null, '(B)', '3']

/**
 * An institute file built from the paper's own cards, in the institute's order and numbering.
 * @param {{ order?: number[], straight?: boolean, subjectLines?: boolean, options?: Record<number, string[]>, answers?: Record<number, string>, solutions?: Record<number, string> }} how
 */
function instituteFile(how = {}) {
  const cards = paperCards()
  const order = how.order ?? cards.map((_, i) => i)
  const out = []
  let subject = ''
  let n = 0
  for (const i of order) {
    const q = cards[i]
    const answer = how.answers?.[i] ?? PRINTED_ANSWERS[i]
    if (answer == null) continue
    if (q.subject !== subject) {
      subject = q.subject
      if (how.subjectLines !== false) out.push(`\\section*{${subject.toUpperCase()}}`)
      if (!how.straight) n = 0
    }
    n += 1
    const options = how.options?.[i] ?? q.options
    out.push(`${n}. ${q.text}`)
    options.forEach((o, k) => out.push(`(${'ABCD'[k]}) ${o}`))
    out.push(`Ans. ${answer}`)
    out.push(`Sol. ${how.solutions?.[i] ?? `Working for ${q.id}.`}`)
    out.push('')
  }
  return out.join('\n')
}

/** The cards come out as the per-subject Allen file gives them. */
function assertSameAsAllen(q, result) {
  assert.equal(q[0].correctIndex, 0)
  assert.equal(q[0].answerSource, 'institute')
  assert.equal(q[0].solution, 'Working for inst-q1.')
  assert.equal(q[2].correctIndex, 1, 'official B kept')
  assert.equal(q[2].instituteAnswerDisagrees, 'C')
  assert.deepEqual(q[4].correctIndices, [0, 2])
  assert.equal(q[5].correctNumerical, 2.25)
  assert.equal(q[6].solution, 'Printed on the paper: $n=22 / 44=0.5$')
  assert.equal(q[7].correctNumerical, 0.55)
  assert.equal(q[8].correctNumerical, 3)
  assert.equal(q[8].solution, 'Working for inst-q9.')
  assert.equal(q[9].answerSource, 'admin_edit')
  assert.equal(q[10].answerSource, undefined)
  assert.equal(q[11].correctIndex, 1)
  assert.equal(q[11].solution, 'Working for inst-q12.')
  assert.equal(q[12].correctNumerical, 3)
  assert.equal(q[12].solution, 'Working for inst-q13.')
  assert.deepEqual(result.disagreements.map((d) => d.n), [3])
  assert.deepEqual(result.notFound, [11])
  assert.equal(result.byContent, 12)
  assert.deepEqual(result.unsure, [])
  assert.deepEqual(result.unmatched, [])
}

await test('numbering 1–12 straight through (no subject lines) on a paper that restarts per subject', () => {
  resetAll()
  const id = newPaper().id
  const text = instituteFile({ straight: true, subjectLines: false })
  assert.match(text, /^7\. The number of moles/m, 'chemistry goes on from 7')
  const result = applyInstituteSolutionsToOfficialPyqPaper(id, text, { institute: 'Allen' })
  assert.equal(result.ok, true, result.error)
  assertSameAsAllen(getOfficialPyqPendingPaper(id).questions, result)
  assert.equal(result.byNumber, 0)
})

await test('Chemistry printed first, numbered straight on: matched by wording, not by number', () => {
  resetAll()
  const id = newPaper().id
  const text = instituteFile({ order: [6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 11, 12], straight: true })
  assert.match(text, /^\\section\*\{CHEMISTRY\}\n1\. The number of moles/)
  assert.match(text, /^5\. A block of mass/m)
  const result = applyInstituteSolutionsToOfficialPyqPaper(id, text, { institute: 'Allen' })
  assert.equal(result.ok, true, result.error)
  assertSameAsAllen(getOfficialPyqPendingPaper(id).questions, result)
  const note = instituteResultNote(result, { institute: 'Allen' })
  assert.match(note, /Matched 12 question\(s\) by wording and 0 by number; 0 institute question\(s\) not matched; 0 not sure\./)
})

await test('options in another order: the answer follows the option text; options that do not line up are flagged', () => {
  resetAll()
  const id = newPaper().id
  const cards = paperCards()
  const text = instituteFile({
    options: {
      0: [cards[0].options[1], cards[0].options[3], cards[0].options[0], cards[0].options[2]],
      6: ['0.5', '2', '0.25', '1'],
      11: ['12', '3', '8', '10'],
    },
    answers: { 0: '(C)', 6: '(A)', 11: '(A)' },
    solutions: { 0: 'Friction is 8 N, so $a=1 \\mathrm{~m} / \\mathrm{s}^{2}$, option (C).', 6: 'Moles are 0.5.' },
  })
  const result = applyInstituteSolutionsToOfficialPyqPaper(id, text, { institute: 'Resonance' })
  assert.equal(result.ok, true, result.error)
  const q = getOfficialPyqPendingPaper(id).questions
  assert.equal(q[0].correctIndex, 0, 'institute (C) is the official (A) option')
  assert.equal(q[0].answerSource, 'institute')
  assert.equal(q[0].solution, undefined, 'a solution naming the institute letter is not used')
  assert.equal(q[6].correctIndex, 1)
  assert.equal(q[6].instituteAnswerDisagrees, undefined, 'institute (A) = 0.5 = official (B)')
  assert.deepEqual(result.reordered, [1, 7])
  assert.equal(q[11].correctIndex, undefined, 'options do not line up: no answer')
  assert.equal(q[11].instituteOptionsUnmatched, 'A')
  assert.ok(String(q[11].solution || '').trim(), 'solution is still filled when only the letter answer is blocked')
  assert.equal(q[11].solutionSource, 'institute')
  assert.deepEqual(result.optionsUnmatched, [12])
  assert.deepEqual(result.disagreements, [{ n: 3, institute: 'C', official: 'B' }])
  const lines = localOfficialPyqQualityCheck(getOfficialPyqPendingPaper(id)).lines
  assert.ok(
    lines.includes("Go to Q 12. The institute's options could not be matched to this question's options — its answer (A) was not used; check."),
    lines.join(' | '),
  )
  assert.deepEqual(instituteCardNotes(q[11]).options, { said: 'A' })
  const note = instituteResultNote(result, { institute: 'Resonance' })
  assert.match(note, /options in another order on Q 1, 7; its answers were moved/)
  assert.match(note, /options could not be matched on Q 12 — those answers were not used/)
})

await test('an answer-key-only file is matched by number, per subject segment', () => {
  resetAll()
  const id = newPaper().id
  const result = applyInstituteSolutionsToOfficialPyqPaper(id, 'ANSWER KEY\n1. (A) 2. (B) 3. (B) 4. (D)', { institute: 'FIITJEE' })
  assert.equal(result.ok, true, result.error)
  assert.equal(result.layout, 'answers_only')
  assert.equal(result.byContent, 0)
  assert.equal(result.byNumber, 4)
  const q = getOfficialPyqPendingPaper(id).questions
  assert.equal(q[0].correctIndex, 0)
  assert.equal(q[0].answerSource, 'institute')
  assert.equal(q[2].instituteAnswerDisagrees, undefined)
  assert.equal(q[3].correctIndex, 3)
  assert.equal(q[6].answerSource, 'from_paper', 'chemistry Q1 is not the file\'s Q1')
  assert.match(instituteResultNote(result, { institute: 'FIITJEE' }), /Matched 0 question\(s\) by wording and 4 by number/)
})

await test('wording look-alikes: printed number decides so the institute solution is kept', () => {
  resetAll()
  const lines = (eq) =>
    `The value of the constant $k$ for which the two given straight lines ${eq} are parallel to each other is`
  const paper = addOfficialPyqPendingPaper({
    exam: 'jee-main',
    year: 2024,
    session: 'Shift 1',
    paperLabel: 'JEE Main 2024 (ambiguous fixture)',
    paperId: `jee-main-2024-ambiguous-${Math.random().toString(36).slice(2, 8)}`,
    questions: [
      {
        text: 'A particle moves in a circle of radius $5 \\mathrm{~m}$ with constant speed $10 \\mathrm{~m} / \\mathrm{s}$. Its centripetal acceleration in $\\mathrm{m} / \\mathrm{s}^{2}$ is',
        options: ['10', '20', '30', '40'],
      },
      { text: lines('$2 x+k y=3$ and $4 x+6 y=5$'), options: [], questionType: 'numerical' },
      { text: lines('$k x+2 y=1$ and $3 x+6 y=7$'), options: [], questionType: 'numerical' },
    ].map((q, i) => ({ ...q, id: `amb-${i + 1}`, subject: MATH, printedNumber: i + 1, pyqSlot: i + 1, questionType: q.questionType || 'single' })),
  })
  const text = [
    '1. A particle moves in a circle of radius 5 m with constant speed 10 m/s. Its centripetal acceleration in m/s^2 is',
    '(A) 10 (B) 20 (C) 30 (D) 40',
    'Ans. (B)',
    'Sol. $a=v^{2} / r=100 / 5=20$',
    '2. The value of the constant k for which the two given straight lines are parallel to each other is',
    'Ans. 3',
    'Sol. Equal slopes give $k=3$.',
  ].join('\n')
  const result = applyInstituteSolutionsToOfficialPyqPaper(paper.id, text, { institute: 'Allen' })
  assert.equal(result.ok, true, result.error)
  const q = getOfficialPyqPendingPaper(paper.id).questions
  assert.equal(q[0].correctIndex, 1)
  assert.equal(q[0].solutionSource, 'institute')
  // Printed Q.2 + institute Q.2 agree → keep the institute solution even if Q.3 looks similar.
  assert.equal(q[1].correctNumerical, 3)
  assert.equal(q[1].solutionSource, 'institute')
  assert.match(String(q[1].solution || ''), /Equal slopes|k=3/)
  assert.equal(q[2].correctNumerical, undefined, 'look-alike Q.3 does not steal Q.2')
  assert.equal(q[2].solution, undefined)
  assert.equal(result.unsure.length, 0)
  assert.ok(result.byContent >= 2)
  const note = instituteResultNote(result, { institute: 'Allen' })
  assert.match(note, /Matched \d+ question\(s\) by wording/)
  assert.doesNotMatch(note, /1 not sure/)
})

await test('true unsure (no number agreement) still skips the answer', () => {
  resetAll()
  const paper = addOfficialPyqPendingPaper({
    exam: 'jee-main',
    year: 2024,
    session: 'Shift 2',
    paperLabel: 'JEE Main 2024 (true unsure fixture)',
    paperId: `jee-main-2024-true-unsure-${Math.random().toString(36).slice(2, 8)}`,
    questions: [
      {
        id: 'tu-1',
        pyqSlot: 1,
        printedNumber: 10,
        subject: MATH,
        questionType: 'numerical',
        text: 'The value of the constant $k$ for which the two given straight lines $2 x+k y=3$ and $4 x+6 y=5$ are parallel to each other is',
      },
      {
        id: 'tu-2',
        pyqSlot: 2,
        printedNumber: 11,
        subject: MATH,
        questionType: 'numerical',
        text: 'The value of the constant $k$ for which the two given straight lines $k x+2 y=1$ and $3 x+6 y=7$ are parallel to each other is',
      },
    ],
  })
  const text = [
    'Mathematics',
    'Q.2 The value of the constant k for which the two given straight lines are parallel to each other is',
    'Ans. 3',
    'Sol. Equal slopes give $k=3$.',
  ].join('\n')
  const result = applyInstituteSolutionsToOfficialPyqPaper(paper.id, text, { institute: 'Allen' })
  assert.equal(result.ok, true, result.error)
  const q = getOfficialPyqPendingPaper(paper.id).questions
  // Institute Q.2 does not share a printed number with either card (10 / 11) → unsure, no answers.
  assert.equal(q[0].correctNumerical, undefined)
  assert.equal(q[1].correctNumerical, undefined)
  assert.ok(result.unsure.length >= 1)
})

await test('the matcher on its own: entries without text follow the numbers only while the numbers agree', async () => {
  const { matchInstituteEntries, instituteOptionsOf, instituteOptionOrder, mapInstituteAnswerLetters } = await import(
    '../src/utils/instituteSolutionsMatch.js'
  )
  assert.deepEqual(instituteOptionsOf('Which one?\n(A) sp (B) $\\mathrm{sp}^{2}$\n(C) $\\mathrm{sp}^{3}$\n(D) dsp'), ['sp', '$\\mathrm{sp}^{2}$', '$\\mathrm{sp}^{3}$', 'dsp'])
  assert.deepEqual(instituteOptionsOf('Pick\n\\begin{enumerate}\n\\item 1\n\\item 2\n\\end{enumerate}'), ['1', '2'])
  assert.equal(instituteOptionsOf('No options here'), null)
  assert.deepEqual(instituteOptionOrder('Q\n(A) $\\mathrm{sp}^{3}$ (B) sp (C) dsp (D) $\\mathrm{sp}^{2}$', ['sp', '$sp^{2}$', '$sp^{3}$', 'dsp']), { order: [2, 0, 3, 1] })
  assert.deepEqual(instituteOptionOrder('Q with pictures only\n(A) ![](https://cdn.mathpix.com/a) (B) ![](https://cdn.mathpix.com/b)', ['x', 'y']), { same: true })
  assert.equal(mapInstituteAnswerLetters('A, D', [2, 0, 3, 1]), 'B, C')
  assert.equal(mapInstituteAnswerLetters('3', [2, 0, 3, 1]), 'D')

  const cards = paperCards()
  const straight = readInstituteSolutions(`${instituteFile({ straight: true, subjectLines: false, order: [6, 7, 8, 9, 0, 1, 2, 3, 4, 5] })}\n11. Ans. (B)\n12. Ans. 3`)
  const plan = matchInstituteEntries(cards, straight)
  assert.equal(plan.byContent, 10)
  assert.equal(plan.numbersAgree, false)
  assert.equal(plan.byNumber, 0, 'the numbers are the institute\'s own: answer-only entries are not guessed')
  assert.deepEqual(plan.unmatched, ['Q.11', 'Q.12'])
})

await test('FIITJEE layout: *Q.3, Ans.. then Sol. (A), *Q8., and a lowercase "answer." in the stem stay questions', () => {
  const read = readInstituteSolutions(FIITJEE, { institute: 'FIITJEE' })
  assert.ok(read)
  assert.equal(read.layout, 'repeated_questions')
  assert.deepEqual(read.subjects, [MATH, PHYS, CHEM])
  assert.deepEqual([...read.entries.keys()], [
    'mathematics:1',
    'mathematics:2',
    'mathematics:3',
    'mathematics:4',
    'mathematics:5',
    'mathematics:6',
    'mathematics:7',
    'mathematics:8',
    'physics:1',
    'physics:2',
    'chemistry:1',
    'chemistry:2',
    'chemistry:3',
    'chemistry:4',
  ])
  const e = (k) => read.entries.get(k)
  assert.equal(e('mathematics:2').answer, 'C')
  assert.match(e('mathematics:2').question, /true-false type questions/)
  assert.doesNotMatch(e('mathematics:2').question, /^answer\./i, 'the stem keeps its own "answer." words')
  assert.doesNotMatch(e('mathematics:2').solution, /\*Q\.3|cot x/, 'starred Q.3 is not swallowed by Q.2')
  assert.equal(e('mathematics:3').answer, 'B')
  assert.match(e('mathematics:3').question, /^Let \$x/)
  assert.equal(e('mathematics:5').answer, 'A, C, D', 'Ans.. then Sol. (A, C, D) is the answer')
  assert.equal(e('mathematics:6').answer, 'B, C, D')
  assert.equal(e('mathematics:7').answer, 'A, B, C, D', 'Q.7 is not blocked by a "6." line in Q.6\'s solution')
  assert.equal(e('mathematics:8').answer, '18', '*Q8. without a dot after Q')
  assert.equal(e('physics:2').answer, '18')
  assert.equal(e('chemistry:2').answer, '8120')
  assert.equal(e('chemistry:3').answer, '7')
  assert.equal(e('chemistry:4').answer, '9')
  assert.doesNotMatch(e('mathematics:1').solution, /Answer to each question/, 'section instructions are not the answer')
})

await test('when Mathpix is thin, the PDF text with more answers is preferred', () => {
  const thin = 'Mathematics\nQ.1 A short one?\nAns.\n2\nSol.\nTwo.\n'
  const picked = pickInstituteSolutionsText(thin, FIITJEE, { institute: 'FIITJEE' })
  assert.ok(picked.source === 'pdf' || picked.source === 'merged', picked.source)
  assert.ok(picked.read.entries.size >= 10, `expected many FIITJEE entries, got ${picked.read.entries.size}`)
  const rich = pickInstituteSolutionsText(FIITJEE, thin, { institute: 'FIITJEE' })
  assert.ok(rich.source === 'mathpix' || rich.source === 'mathpix-only' || rich.source === 'merged')
  assert.equal(pickInstituteSolutionsText('', '', { institute: 'FIITJEE' }).source, 'empty')
  const note = instituteResultNote(
    { answers: 1, solutions: 1, disagreements: [], notFound: [], textDiffers: [], byContent: 1, byNumber: 0, unmatched: [], unsure: [] },
    { institute: 'FIITJEE', fileName: 'JA2024P1.pdf', textSource: 'pdf' },
  )
  assert.match(note, /PDF's own text|PDF’s own text/)
})

await test('FIITJEE Sol. with smashed Delta and SECTION marking scheme drops chrome and draws triangle', () => {
  const messy = [
    'Mathematics',
    '*Q.4 Consider the ellipse.',
    '(A) q=2 (B) p=3 (C) area (D) none',
    'Ans. A, C',
    'Sol.',
    'Let T be $(3 \\cos \\theta, 2 \\sin \\theta)$\\begin{aligned}',
    '& \\Rightarrow \\operatorname{Ar}( \\\\ Delta \\mathrm{ORT})=\\frac{3}{2} \\\\',
    '& \\Rightarrow p=3 \\sqrt{3}, q=2',
    '\\end{aligned}$$',
    ' SECTION^1 (Maximum Marks: 12)',
    '',
    '(B),',
    '(C) and',
    '(D). ONE OR MORE THAN ONE of these four option(s) is(are) correct answer(s).',
    '\\item[-] For each question, choose the option(s).',
  ].join('\n')
  const sol = readInstituteSolutions(messy, { institute: 'FIITJEE' }).entries.get('mathematics:4').solution
  assert.ok(sol, 'Q.4 solution is kept (not replaced by a marking-scheme answer-key read)')
  assert.doesNotMatch(sol, /SECTION|Maximum Marks|ONE OR MORE|For each question/i)
  assert.doesNotMatch(sol, /(?<![\\A-Za-z])Delta(?![A-Za-z])/)
  assert.match(sol, /\\triangle\\mathrm\{ORT\}/)
  assert.match(sol, /p=3 \\sqrt\{3\}/)
  const healed = cleanInstituteSolutionBody(
    'done.$$\n SECTION^1 (Maximum Marks: 12)\n\n(B),\n(C) and\n(D). ONE OR MORE THAN ONE of these four',
  )
  assert.equal(healed, 'done.')
  const swallowed = cleanInstituteSolutionBody('Area is 3/2.\n*Q^7. Next stem starts here\nAns. A')
  assert.equal(swallowed, 'Area is 3/2.')
  assert.match(
    instituteSolutionDirtyReason('done.\n SECTION^1 (Maximum Marks: 12)\nFor each question, choose the option'),
    /section instructions|marking scheme/i,
  )
  assert.equal(instituteSolutionDirtyReason('Clean solution with \\triangle ORT only.'), '')
  const midLine = cleanInstituteSolutionBody(
    'x=L/18\n\\end{aligned} \\section*{SECTION^4 (Maximum Marks: 12)}\n\n(B),\n(C) and\n(D). ONLY ONE of these four',
  )
  assert.equal(midLine, 'x=L/18\n\\end{aligned}')
  assert.doesNotMatch(midLine, /SECTION|Maximum Marks|ONLY ONE/i)
  const subjectTail = cleanInstituteSolutionBody('V_0=200 volts\n\\end{aligned}\n\n \\section*{Chemistry} \\section*{SECTION^1 (Maximum Marks: 12)}')
  assert.equal(subjectTail, 'V_0=200 volts\n\\end{aligned}')
  assert.doesNotMatch(subjectTail, /Chemistry|SECTION/i)
})

await test('Mathpix glued "\\item[] *Q. 4" onto Q.2 is split; Q.2 solution does not keep Q.3/Q.4', () => {
  const glued = [
    'Mathematics',
    'Q.2 A student appears for a quiz of true-false questions. The probability is',
    '(A) 1/12 (B) 1/7 (C) 1/6 (D) 5/7',
    'Ans. C',
    'Sol. Let $E_1$ be that he knows the answer. Then $P=5/7$.',
    '$$ \\item[] *Q. 3 Let $x$ be such that $\\cot x = 5/11$. Then the value is',
    '(A) 1 (B) 2 (C) 3 (D) 4',
    'Ans. B \\item[] Sol. From $\\cot x$ we get option (B).',
    '\\item[] *Q. 4 Consider the ellipse $x^2/9+y^2/4=1$. Then',
    '(A) q=2 (B) p=3 (C) area=3/2 (D) none',
    'Ans. A, C',
    'Sol. The area condition gives $q=2$.',
  ].join('\n')
  const read = readInstituteSolutions(glued, { institute: 'FIITJEE' })
  assert.deepEqual([...read.entries.keys()], ['mathematics:2', 'mathematics:3', 'mathematics:4'])
  assert.equal(read.entries.get('mathematics:2').answer, 'C')
  assert.doesNotMatch(read.entries.get('mathematics:2').solution, /\*?Q\.?\s*[34]\b|ellipse|\\item/i)
  assert.doesNotMatch(read.entries.get('mathematics:3').solution, /\\item|\*?Q\.?\s*4\b|ellipse/i)
  assert.equal(read.entries.get('mathematics:3').answer, 'B')
  assert.match(read.entries.get('mathematics:3').question, /cot x/)
  assert.equal(read.entries.get('mathematics:4').answer, 'A, C')
  assert.match(read.entries.get('mathematics:4').question, /ellipse/)
  const merged = pickInstituteSolutionsText(glued.replace(/\n(?=\\item|\$\$|Ans\. B)/g, ' '), FIITJEE, { institute: 'FIITJEE' })
  assert.ok(merged.source === 'pdf' || merged.read.entries.get('mathematics:2') && !/\*?Q\.?\s*4\b/.test(merged.read.entries.get('mathematics:2').solution || ''))
})

await test('page and helper wiring', () => {
  const page = fs.readFileSync(new URL('../src/pages/OfficialPyqPending.jsx', import.meta.url), 'utf8')
  assert.match(page, /Add institute solutions \(1–3 PDFs\)|Add institute solutions \(PDF\)/)
  assert.match(page, /data-testid="official-pyq-institute-name"/)
  assert.match(page, /data-testid="official-pyq-institute-file-input"/)
  assert.match(page, /multiple/, 'institute solutions input accepts subject-wise parts')
  assert.match(page, /official-pyq-institute-mathpix-reread|Re-read institute with Mathpix/)
  assert.match(page, /!isOtherPaper\(selected\) &&/)
  const tools = fs.readFileSync(new URL('../src/components/OfficialPyqCardAdminTools.jsx', import.meta.url), 'utf8')
  assert.match(tools, /Use institute wording/)
  const vite = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')
  assert.match(vite, /'\/api\/official-pyq\/original': hybridFastApiProxy\(\)/)
  const main = fs.readFileSync(new URL('../main.py', import.meta.url), 'utf8')
  assert.match(main, /@app\.post\("\/api\/official-pyq\/original\/\{paper_id\}\/institute"/)
  assert.match(main, /@app\.get\("\/api\/official-pyq\/original\/\{paper_id\}\/institute\/text"/)
  assert.match(main, /@app\.get\("\/api\/official-pyq\/original\/\{paper_id\}\/institute\/file"/)
  assert.match(main, /@app\.post\("\/api\/official-pyq\/original\/\{paper_id\}\/institute\/mathpix-crops"/)
  assert.match(main, /@app\.post\("\/api\/official-pyq\/original\/\{paper_id\}\/institute\/solution-figures"/)
  assert.match(String(fs.readFileSync(new URL('../official_pyq_compare.py', import.meta.url), 'utf8')), /def crop_institute_solution_figures/)
  const comparePy = fs.readFileSync(new URL('../official_pyq_compare.py', import.meta.url), 'utf8')
  assert.match(comparePy, /def institute_pdf_text/)
  assert.match(comparePy, /def institute_pdf_bytes/)
})

await test('PDF private-use letters score worse than Mathpix LaTeX; merge keeps drawn maths', () => {
  const pua = `Sol.\n${'\uF028\uF029'.repeat(6)}\n10\n9\nt\nx\nf x t\n8\n7\n6`
  const latex = 'Sol. $$\\begin{aligned}& x=3\\\\ & y=4\\end{aligned}$$'
  assert.equal(instituteSolutionLooksLikeRawPdf(pua), true)
  assert.equal(instituteSolutionLooksLikeRawPdf(latex), false)
  assert.match(instituteSolutionDirtyReason(pua), /raw PDF letters|re-add the institute PDF|PDF font junk/i)
  assert.equal(salvageInstituteSolutionBody(pua), '')
  assert.equal(instituteSolutionIsUsable(latex), true)
  const mixed = `${'\uF028'.repeat(4)} Hence the answer is 3.\nArea is positive.`
  assert.match(salvageInstituteSolutionBody(mixed), /Hence the answer is 3/)
  const readMp = readInstituteSolutions(`Mathematics\nQ.1 Stem A\nAns. B\n${latex}`, { institute: 'FIITJEE' })
  const readPdf = readInstituteSolutions(`Mathematics\nQ.1 Stem A longer wording here\nAns. B\n${pua}\nQ.2 Stem B only in PDF\nAns. A\nSol. plain words only answer.`, {
    institute: 'FIITJEE',
  })
  const merged = mergeInstituteSolutionReads(readMp, readPdf)
  assert.match(merged.entries.get('mathematics:1').solution, /begin\{aligned\}/)
  assert.ok(merged.entries.get('mathematics:2')?.answer || merged.entries.get('mathematics:2')?.solution)
  assert.match(String(merged.entries.get('mathematics:2')?.solution || ''), /plain words/i)
  const latexStem = 'Let $e_1$ be the eccentricity of $\\frac{x^{2}}{16}-\\frac{y^{2}}{9}=1$'
  const junkStem = `Let e1 be\n2\n2\nx\ny\n1\n16\n9\n${'\uF028'.repeat(10)}`
  assert.match(preferredInstituteQuestion(latexStem, junkStem), /\\frac\{x\^\{2\}\}/)
  assert.match(
    String(mergeInstituteSolutionReads(
      readInstituteSolutions(`Mathematics\nQ.1 ${latexStem}\nAns. D\n${latex}`, { institute: 'FIITJEE' }),
      readInstituteSolutions(`Mathematics\nQ.1 ${junkStem} longer stacked digits soup here\nAns. D\n${pua}`, {
        institute: 'FIITJEE',
      }),
    ).entries.get('mathematics:1')?.question || ''),
    /\\frac\{x\^\{2\}\}/,
  )
  const picked = pickInstituteSolutionsText(
    `Mathematics\nQ.1 Stem A\nAns. B\n${latex}`,
    `Mathematics\nQ.1 Stem A longer\nAns. B\n${pua}\nQ.2 Stem B\nAns. A\nSol. ok.`,
    { institute: 'FIITJEE' },
  )
  assert.equal(picked.source, 'merged')
  assert.match(picked.read.entries.get('mathematics:1').solution, /aligned/)
})

const { instituteOptionsOf } = await import('../src/utils/instituteSolutionsMatch.js')

await test('Assertion (A) / Reason (R) stem is not cut at the (A) label', () => {
  clearOfficialPyqPendingPapers()
  const fillers = Array.from({ length: 7 }, (_, i) => {
    const n = i + 2
    return `*${n}. Filler stem number ${n} with enough words.\n(1) A\n(2) B\n(3) C\n(4) D\nAns. (1)\nSol. Done.`
  })
  const ocr = [
    'Physics',
    '*1. Given below are two statements: one is labelled as Assertion (A) and the other is labelled as Reason (R).',
    'Assertion (A): In Vernier calliper if positive zero error exists, then while taking measurements, the reading taken will be more than the actual reading.',
    'Reason (R): The zero error in Vernier Calliper might have happened due to manufacturing defect or due to rough handling.',
    'In the light of the above statements, choose the correct answer from the options given below :',
    'Options.',
    '(1) Both (A) and (R) are correct but (R) is not the correct explanation of (A)',
    '(2) (A) is false but (R) is true',
    '(3) (A) is true but (R) is false',
    '(4) Both (A) and (R) are correct and (R) is the correct explanation of (A)',
    'Ans. (1)',
    'Sol. For positive error measured reading is more than true reading.',
    ...fillers,
  ].join('\n')
  const paper = addOfficialPyqPendingPaper({
    exam: 'jee-main',
    year: 2024,
    status: 'pending_review',
    preparedText: ocr,
    questions: [{ id: 't-q1', text: 'placeholder', printedNumber: 1 }],
  })
  const rebuilt = rebuildOfficialPyqFromInstituteSolutionsOcr(paper.id, { institute: 'FIITJEE', ocrText: ocr })
  assert.equal(rebuilt.ok, true, rebuilt.error || 'rebuild ok')
  const q1 = (rebuilt.paper?.questions || []).find((q) => Number(q.printedNumber || q.pyqSlot) === 1)
  assert.ok(q1, 'Q1 built')
  assert.match(String(q1.text), /Assertion\s*\(\s*A\s*\)/i)
  assert.match(String(q1.text), /Reason\s*\(\s*R\s*\)/i)
  assert.doesNotMatch(String(q1.text), /Options\./i)
  assert.doesNotMatch(String(q1.text), /\n\s*Assertion\s*\(\s*A\s*\)/i, 'Assertion stays on same paragraph')
  assert.doesNotMatch(String(q1.text), /\n\s*Reason\s*\(\s*R\s*\)/i, 'Reason stays on same paragraph')
  assert.doesNotMatch(String(q1.text), /\\begin\{itemize\}|\\item\s*\[/i)
  assert.equal((q1.options || []).filter(Boolean).length, 4)
})

await test('repeated identical <smiles> option lines are kept (not dropped as furniture)', () => {
  const smiles = '<smiles>N#CC(O)C#N</smiles>'
  const raw = [
    'Chemistry',
    '*75. Bond line formula of $\\mathrm{HOCH}(\\mathrm{CN})_{2}$ is',
    '(1)',
    smiles,
    '(2)',
    smiles,
    '(3)',
    smiles,
    '(4)',
    smiles,
    'Ans. (3)',
    'Sol. Correct representation.',
  ].join('\n')
  const read = readInstituteSolutions(raw, { institute: 'FIITJEE' })
  const entry = read.entries.get('chemistry:75') || read.entries.get('#0:75')
  assert.ok(entry, 'Q75 entry present')
  assert.equal((String(entry.question).match(/<smiles>/gi) || []).length, 4)
  const opts = instituteOptionsOf(entry.question)
  assert.equal(opts?.filter(Boolean).length, 4)
})

await test('FIITJEE PDF font junk is never kept as a solution when Mathpix is missing', () => {
  const pua = `Sol.\n${'\uF028\uF029'.repeat(8)}\n10\n9\nt\nx\nf x t`
  const readPdf = readInstituteSolutions(
    `Mathematics\nQ.1 Stem only in PDF\nAns. A\n${pua}\nQ.2 Stem two\nAns. B\nSol. Hence the answer is two.`,
    { institute: 'FIITJEE' },
  )
  const merged = mergeInstituteSolutionReads(
    { entries: new Map(), subjects: [], layout: 'repeated_questions', sectionText: '' },
    readPdf,
  )
  assert.equal(String(merged.entries.get('mathematics:1')?.solution || ''), '')
  assert.equal(merged.entries.get('mathematics:1')?.answer, 'A')
  assert.match(String(merged.entries.get('mathematics:2')?.solution || ''), /Hence the answer is two/)
  assert.equal(instituteSolutionLooksPoorForStudents(pua), true)
  assert.equal(instituteSolutionLooksPoorForStudents('Hence the area equals three halves clearly.'), false)
  const junkLayer = `${'FIITJEE header page text\n'.repeat(10)}${'\uF028'.repeat(120)}${'Ans. B Sol. stacked\n'.repeat(30)}`
  assert.equal(pdfTextIsMathFontJunk(junkLayer), true)
  // Thin Mathpix + high-PUA PDF: Mathpix Sol. wins; PDF contributes Ans. only (never PUA Sol.).
  const thinMp = [
    'Mathematics',
    'Q.1 A short one?',
    'Ans. A',
    'Sol. Use $\\det(kA)=k^3\\det A$. Answer is (A).',
    'Q.2 Another?',
    'Ans. B',
    'Sol. Plain readable working for option (B).',
  ].join('\n')
  const junkPdf = [
    `${'FIITJEE Solutions page header text for length. '.repeat(8)}`,
    'Mathematics',
    'Q.1 Stem from PDF layer with enough surrounding text for the junk detector',
    'Ans. A',
    `Sol.\n${'\uF028\uF029'.repeat(80)}`,
    'Q.2 Stem two from PDF also padded with ordinary words around the private-use maths',
    'Ans. B',
    `Sol.\n${'\uF030'.repeat(120)}`,
    'Q.3 Extra PDF-only question that Mathpix missed entirely this time',
    'Ans. C',
    `Sol.\n${'\uF031'.repeat(160)}`,
  ].join('\n')
  assert.equal(pdfTextIsMathFontJunk(junkPdf), true)
  const forced = pickInstituteSolutionsText(thinMp, junkPdf, { institute: 'FIITJEE' })
  assert.equal(forced.source, 'merged')
  assert.match(String(forced.read.entries.get('mathematics:1')?.solution || ''), /det/)
  assert.doesNotMatch(String(forced.read.entries.get('mathematics:1')?.solution || ''), /\uF028/)
  assert.equal(String(forced.read.entries.get('mathematics:3')?.answer || ''), 'C', 'PDF Ans. still fills Mathpix gaps')
  assert.equal(String(forced.read.entries.get('mathematics:3')?.solution || ''), '', 'PUA Sol. never kept')
  assert.doesNotMatch(
    [...forced.read.entries.values()].map((e) => e.solution || '').join('\n'),
    /[\uE000-\uF8FF]/,
    'no private-use glyphs in any kept Sol.',
  )
})

await test('institute upload replaces Hybrid AI when Mathpix has a usable solution', () => {
  resetAll()
  const MATH = 'Mathematics'
  const paper = addOfficialPyqPendingPaper({
    exam: 'jee-advanced',
    year: 2024,
    session: 'Paper 1',
    paperLabel: 'maximize institute sols',
    paperId: `jee-advanced-2024-p1-max-inst-${Math.random().toString(36).slice(2, 8)}`,
    sourceLabel: 'Official (test)',
    status: 'approved',
    questions: [
      {
        id: 'max-inst-1',
        pyqSlot: 1,
        printedNumber: 1,
        subject: MATH,
        questionType: 'single',
        text: 'A particle moves on the parabola y equals x squared under gravity alone',
        options: ['1', '2', '3', '4'],
        correctIndex: 1,
        answerSource: 'from_paper',
        solution: 'AI wrote this temporary solution.',
        solutionSource: 'hybrid_ai',
      },
      {
        id: 'max-inst-2',
        pyqSlot: 2,
        printedNumber: 2,
        subject: MATH,
        questionType: 'single',
        text: 'The ellipse x squared over nine plus y squared over four equals one has eccentricity',
        options: ['1', '2', '3', '4'],
        correctIndex: 0,
        answerSource: 'from_paper',
        solution: 'AI second.',
        solutionSource: 'hybrid_ai',
      },
    ],
  })
  const text = [
    'Mathematics',
    'Q.1 A particle moves on the parabola y equals x squared under gravity alone',
    '(A) 1 (B) 2 (C) 3 (D) 4',
    'Ans. B',
    'Sol. $$\\begin{aligned}& x=3\\end{aligned}$$',
    'Q.2 The ellipse x squared over nine plus y squared over four equals one has eccentricity',
    '(A) 1 (B) 2 (C) 3 (D) 4',
    'Ans. A',
    'Sol. Hence the area equals three halves.',
  ].join('\n')
  const result = applyInstituteSolutionsToOfficialPyqPaper(paper.id, text, { institute: 'FIITJEE' })
  assert.equal(result.ok, true, result.error)
  const saved = getOfficialPyqPendingPaper(paper.id)
  assert.equal(saved.questions[0].solutionSource, 'institute')
  assert.match(saved.questions[0].solution, /aligned|x=3/)
  assert.equal(saved.questions[1].solutionSource, 'institute')
  assert.match(saved.questions[1].solution, /area equals three halves/i)
  assert.ok(result.solutions >= 2)
})

await test('broken integrating-factor $$ / e^{- }} in a solution is healed for display', () => {
  const broken = [
    '$$\\begin{aligned}',
    '& f^{\\prime}(x)-\\frac{10}{x} f(x)=-\\frac{9}{x^{2}}',
    '\\end{aligned}',
    'Integrating factor $\\mathrm{e}^{- }}=\\frac{1}{\\mathrm{x}^{10}}$$\\Rightarrow \\frac{f(x)}{x^{10}}=\\frac{9}{11 x^{11}}+c$$',
    '$$\\begin{aligned}',
    '& c=\\frac{13}{11}',
    '\\end{aligned}$',
  ].join('\n')
  const healed = healInstituteSolutionMath(broken)
  assert.doesNotMatch(healed, /\\mathrm\{e\}\^\{-\s*\}\}/)
  assert.match(healed, /\\end\{aligned\}\$\$\s*\n\s*Integrating/)
  assert.match(healed, /\\end\{aligned\}\$\$\s*$/)
  assert.match(healed, /\$\$\\mathrm\{e\}\^\{-\}=\\frac\{1\}\{\\mathrm\{x\}\^\{10\}\}\\Rightarrow/)
  assert.doesNotMatch(healed, /\\mathrm\{e\}\^\{\s*-\s*\}\}/)
  const cleaned = cleanInstituteSolutionBody(broken)
  assert.match(cleaned, /\\end\{aligned\}\$\$/)
  assert.doesNotMatch(cleaned, /\\mathrm\{e\}\^\{\s*-\s*\}\}/)
})

await test('S1 Q37 truncated $$…MeV and Q66 $$\\xrightarrow…$ heal for display', async () => {
  const { wrapBareLatexRuns } = await import('../src/utils/wrapBareLatexRuns.js')
  const { visibleLatexSourceHits } = await import('../src/utils/visibleLatexSource.js')
  const heal = (s) =>
    healInstituteSolutionMath(wrapBareLatexRuns(healInstituteSolutionMath(cleanInstituteSolutionBody(s) || s)))
  const q37 =
    '$\\mathrm{Q}=(\\Delta \\mathrm{M}) \\mathrm{c}^{2}$\n' +
    '$$\\mathrm{Q}=\\left[\\mathrm{M}(\\mathrm{Li})+\\mathrm{M}\\left({ }_{1} \\mathrm{H}^{2}\\right)-2 \\mathrm{M}\\left({ }_{2} \\mathrm{H}^{4}\\right)\\right] \\times 931.5 \\mathrm{MeV}'
  const q66 =
    'Proteins $$\\xrightarrow{\\text { Hydrolysis }}$ Peptides $\\xrightarrow{\\text { Hydrolysis }} \\alpha-$ amino acids'
  const h37 = heal(q37)
  const h66 = heal(q66)
  assert.equal(visibleLatexSourceHits(q37).length > 0, true)
  assert.equal(visibleLatexSourceHits(q66).length > 0, true)
  assert.deepEqual(visibleLatexSourceHits(h37), [])
  assert.deepEqual(visibleLatexSourceHits(h66), [])
  assert.ok(h37.endsWith('$$'), h37.slice(-40))
  assert.ok(h37.includes('\\mathrm{MeV}$$'), h37.slice(-40))
  assert.ok(h66.includes('$$\\xrightarrow{\\text { Hydrolysis }}$$'), h66)
})
resetAll()
if (failed) {
  console.error(`\n${failed} institute solutions test(s) failed`)
  process.exit(1)
}
console.log('\nAll institute solutions tests passed')
